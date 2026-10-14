import { nodeHandler, json, sameOrigin, sessionLogin } from '../lib/harborflow.mjs';
import { TRAINING_OWNER, trainingAccess } from '../lib/training/access.mjs';
import { validateCrewProfile, validateCrewLink } from '../lib/training/crew.mjs';
import { randomUUID } from 'node:crypto';

const error = (message, status) => json({ error: message }, status);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

async function defaultDatabase() {
  if (!process.env.DATABASE_URL) throw Error('Training database is not configured');
  const { neon } = await import('@neondatabase/serverless');
  return neon(process.env.DATABASE_URL);
}

async function defaultTrainingGrant(login, sql) {
  if (login === TRAINING_OWNER) return { role: 'owner', vesselIds: [] };
  const [grant] = await sql.query(
    'SELECT role FROM training_grants WHERE login=$1 AND revoked_at IS NULL', [login]
  );
  if (!grant) return null;
  const assignments = await sql.query(
    'SELECT vessel_id FROM training_vessel_assignments WHERE officer_login=$1 AND removed_at IS NULL',
    [login]
  );
  return { role: grant.role, vesselIds: assignments.map(row => row.vessel_id) };
}

async function handleCrew({ action, input, vesselId, login, sql }) {
  if (action === 'crew.list') {
    const rows = vesselId
      ? await sql.query(`SELECT DISTINCT c.* FROM training_crew c
          JOIN training_crew_assignments a ON a.crew_id=c.id
          WHERE a.vessel_id=$1 AND a.removed_at IS NULL AND c.removed_at IS NULL
          ORDER BY c.display_name LIMIT 200`, [vesselId])
      : await sql.query('SELECT * FROM training_crew WHERE removed_at IS NULL ORDER BY display_name LIMIT 200');
    return json({ crew: rows });
  }
  if (action === 'crew.create') {
    const { value, error: invalid } = validateCrewProfile(input.data);
    if (invalid) return error(invalid, 400);
    const id = randomUUID();
    const [row] = await sql.query(`WITH created AS (
      INSERT INTO training_crew(id,display_name,rank,department,active,created_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'crew',id,'create',$6,to_jsonb(created) FROM created
    ) SELECT * FROM created`,
    [id, value.displayName, value.rank, value.department, value.active, login]);
    return json({ crew: row }, 201);
  }
  if (action === 'crew.update') {
    if (!uuid(input.id) || !Number.isInteger(input.version) || input.version < 1) return error('Invalid crew ID or version', 400);
    const { value, error: invalid } = validateCrewProfile(input.data);
    if (invalid) return error(invalid, 400);
    const [row] = await sql.query(`WITH updated AS (
      UPDATE training_crew SET display_name=$1,rank=$2,department=$3,active=$4,
        version=version+1,updated_at=now()
      WHERE id=$5 AND version=$6 AND removed_at IS NULL RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'crew',id,'update',$7,to_jsonb(updated) FROM updated
    ) SELECT * FROM updated`,
    [value.displayName, value.rank, value.department, value.active, input.id, input.version, login]);
    return row ? json({ crew: row }) : error('Concurrent change; reload crew profile', 409);
  }
  if (action === 'crew.link') {
    if (!uuid(input.crewId) || !uuid(input.operationPersonId)) return error('Invalid crew or person ID', 400);
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : '';
    if (!reason) return error('Review reason is required', 400);
    const [person] = await sql.query(
      'SELECT id,kind,removed_at FROM operation_people WHERE id=$1', [input.operationPersonId]
    );
    if (!person || person.removed_at) return error('Operation person not found', 404);
    const links = await sql.query(
      'SELECT crew_id AS "crewId",operation_person_id AS "operationPersonId",removed_at AS "removedAt" FROM training_crew_job_links WHERE operation_person_id=$1 AND removed_at IS NULL',
      [input.operationPersonId]
    );
    const invalid = validateCrewLink({
      crewId: input.crewId, operationPersonId: input.operationPersonId,
      personKind: person.kind, existingLinks: links
    });
    if (invalid) return error(invalid, 409);
    const id = randomUUID();
    try {
      const [row] = await sql.query(`WITH linked AS (
        INSERT INTO training_crew_job_links(id,crew_id,operation_person_id,reviewed_by,review_reason)
        VALUES($1,$2,$3,$4,$5) RETURNING *
      ), event AS (
        INSERT INTO training_events(scope,record_id,action,actor,after_data,reason)
        SELECT 'crew-link',id,'link',$4,to_jsonb(linked),$5 FROM linked
      ) SELECT * FROM linked`, [id, input.crewId, input.operationPersonId, login, reason]);
      return json({ link: row }, 201);
    } catch (e) {
      if (e.code === '23505') return error('Operation person is already linked', 409);
      throw e;
    }
  }
  if (action === 'crew.unlink') {
    if (!uuid(input.id) || !Number.isInteger(input.version) || input.version < 1) return error('Invalid link ID or version', 400);
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : '';
    if (!reason) return error('Unlink reason is required', 400);
    const [row] = await sql.query(`WITH unlinked AS (
      UPDATE training_crew_job_links SET removed_at=now(),version=version+1,updated_at=now()
      WHERE id=$1 AND version=$2 AND removed_at IS NULL RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data,reason)
      SELECT 'crew-link',id,'unlink',$3,to_jsonb(unlinked),$4 FROM unlinked
    ) SELECT * FROM unlinked`, [input.id, input.version, login, reason]);
    return row ? json({ link: row }) : error('Concurrent change; reload link', 409);
  }
  return error('Training action is not implemented', 501);
}

export function createTrainingRoute({
  database = defaultDatabase,
  loginFromRequest = sessionLogin,
  readTrainingGrant = defaultTrainingGrant
} = {}) {
  return async function route(request) {
    const login = loginFromRequest(request);
    if (!login) return error('Sign in required', 401);
    if (request.method !== 'GET' && request.method !== 'POST') return error('Method not allowed', 405);
    if (request.method === 'POST' && !sameOrigin(request)) return error('Invalid origin', 403);
    const url = new URL(request.url);
    let input = {};
    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 24000) return error('Request too large', 413);
      try { input = JSON.parse(raw || '{}'); }
      catch { return error('Invalid JSON', 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return error('Invalid request', 400);
    }
    const action = request.method === 'GET' ? url.searchParams.get('action') : input.action;
    const targetVesselId = request.method === 'GET' ? url.searchParams.get('vesselId') : input.vesselId;
    const grant = login === TRAINING_OWNER ? { role: 'owner' } :
      await readTrainingGrant(login, await database());
    if (!trainingAccess({ login, grant, vesselIds: grant?.vesselIds, action, targetVesselId })) {
      return error('Training permission denied', 403);
    }
    if (action?.startsWith('crew.')) {
      if (request.method === 'GET' && action !== 'crew.list') return error('Method not allowed', 405);
      if (request.method === 'POST' && action === 'crew.list') return error('Method not allowed', 405);
      return handleCrew({ action, input, vesselId: targetVesselId, login, sql: await database() });
    }
    return error('Training action is not implemented', 501);
  };
}

export default nodeHandler(createTrainingRoute());

