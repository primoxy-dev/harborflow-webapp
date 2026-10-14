import { nodeHandler, json, sameOrigin, sessionLogin } from '../lib/harborflow.mjs';
import { TRAINING_OWNER, trainingAccess } from '../lib/training/access.mjs';

const error = (message, status) => json({ error: message }, status);

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
    return error('Training action is not implemented', 501);
  };
}

export default nodeHandler(createTrainingRoute());

