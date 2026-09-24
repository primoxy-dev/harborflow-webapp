import { randomUUID } from 'node:crypto';
import { nodeHandler, gh, jobPath, json, readJson, safeName, sameOrigin, sessionLogin } from '../lib/harborflow.mjs';
import { OWNER, TRIP_KINDS, canEditJob, canEditService, canPeople, db, fieldConflicts, permission, textField, uuid, validateJob, validateService } from '../lib/operations.mjs';

const jobFields = ['jobNo', 'vessel', 'imo', 'port', 'principal', 'eta', 'etd', 'status', 'pic', 'notes', 'terminalStays', 'completionReason'];
const serviceFields = ['type', 'status', 'description', 'pic', 'supplier', 'plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'planConfirmed', 'supplierConfirmed', 'terminalCondition', 'terminalConfirmation', 'restrictionReason', 'details', 'checklist', 'sopVersion', 'baselineDue', 'deadlineReason', 'notes'];
const personFields = ['kind', 'category', 'name', 'nationality', 'rank', 'dob', 'passport', 'passportExpiry', 'seamanBook', 'immigration', 'flights', 'serviceIds', 'notes'];
const tripFields = ['kind', 'origin', 'destination', 'plannedDeparture', 'plannedArrival', 'actualDeparture', 'actualArrival', 'provider', 'vehicle', 'purpose', 'status', 'personIds', 'cargo', 'notes'];
const parse = async request => {
  const raw = await request.text();
  if (raw.length > 24000) throw Error('Request too large');
  return JSON.parse(raw || '{}');
};
const clean = (value, keys) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => keys.includes(key)));
const error = (message, code = 400, extra = {}) => json({ error: message, ...extra }, code);
const personScope = kind => kind === 'crew' ? 'crew' : 'visitor';
const rows = (sql, query, params = []) => sql.query(query, params);
const documentsFolder = data => jobPath({ name: data.vessel, jobNo: data.jobNo, eta: data.eta }, 'General').replace(/\/General$/, '');
async function createJobFolder(data, id) {
  const folder = documentsFolder(data);
  const path = folder + '/General/job.json';
  const old = await readJson(path);
  if (old) {
    if (old.data?.operationJobId !== id) throw Error('GitHub folder is already linked to another Job');
    return { folder, path, createdSha: null };
  }
  const marker = JSON.stringify({ version: 1, operationJobId: id, note: 'Port Call data is stored in HarborFlow Operations.' }, null, 2) + '\n';
  const result = await gh('PUT', path, { message: 'Create General folder for Port Call ' + id, content: Buffer.from(marker).toString('base64') });
  return { folder, path, createdSha: result.content?.sha };
}
async function createServiceFolder(folder, type) {
  const servicePath = folder + '/' + safeName(type);
  if (await gh('GET', servicePath)) return { path: servicePath, createdSha: null };
  const marker = 'Files for this HarborFlow Service.\n';
  const result = await gh('PUT', servicePath + '/README.md', { message: 'Create Service folder ' + type, content: Buffer.from(marker).toString('base64') });
  return { path: servicePath + '/README.md', createdSha: result.content?.sha };
}
async function undoCreatedFile(path, sha) {
  if (sha) await gh('DELETE', path, { message: 'Undo incomplete HarborFlow folder creation', sha });
}

async function loadJob(sql, id) {
  if (!uuid(id)) return null;
  const [job] = await rows(sql, 'SELECT * FROM operation_jobs WHERE id=$1', [id]);
  return job || null;
}
async function loadService(sql, id) {
  if (!uuid(id)) return null;
  const [service] = await rows(sql, 'SELECT * FROM operation_services WHERE id=$1', [id]);
  return service || null;
}
async function patchRow(sql, table, id, scope, base, patch, actor, validate, reason = '') {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [current] = await rows(sql, `SELECT * FROM ${table} WHERE id=$1`, [id]);
    if (!current) return error('Record not found', 404);
    const conflicts = fieldConflicts(current.data, base, patch);
    if (conflicts.length) return error('Field conflict. Review each value before saving.', 409, { conflicts, current });
    const merged = { ...current.data, ...patch, ...(patch.details ? { details: { ...current.data.details, ...patch.details } } : {}) };
    const invalid = validate?.(merged);
    if (invalid) return error(invalid);
    const [saved] = await rows(sql,
      `WITH updated AS (UPDATE ${table} SET data=$1::jsonb, version=version+1, updated_at=now() WHERE id=$2 AND version=$3 RETURNING *),
      history AS (INSERT INTO operation_events(scope,record_id,action,actor,before_data,after_data,reason)
      SELECT $4,id::text,'update',$5,$6::jsonb,data,$7 FROM updated) SELECT * FROM updated`,
      [JSON.stringify(merged), id, current.version, scope, actor, JSON.stringify(current.data), reason]);
    if (saved) return json({ record: saved });
  }
  return error('Concurrent change; reload and review', 409);
}
function validatePerson(data) {
  if (!['crew', 'visitor'].includes(data.kind)) return 'Invalid person category';
  if (!textField(data.name)) return 'Name is required';
  if (JSON.stringify(data).length > 12000) return 'Person record is too large';
  return null;
}
function validateTrip(data) {
  if (!TRIP_KINDS.includes(data.kind)) return 'Invalid travel type';
  if (!textField(data.origin) || !textField(data.destination)) return 'Origin and destination are required';
  if (JSON.stringify(data).length > 6000) return 'Travel record is too large';
  return null;
}
async function route(request) {
  if (!process.env.DATABASE_URL) return error('Operations database is not configured', 503);
  const login = sessionLogin(request);
  if (!login) return error('Sign in required', 401);
  const sql = db();
  let grant;
  try { grant = await permission(login, sql); }
  catch { return error('Current authorization could not be verified', 503); }
  if (!grant) return error('Operations permission required', 403);
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const action = url.searchParams.get('action') || 'state';
    if (action === 'state') {
      const [jobs, services] = await Promise.all([
        rows(sql, 'SELECT * FROM operation_jobs ORDER BY updated_at DESC LIMIT 100'),
        rows(sql, 'SELECT * FROM operation_services ORDER BY job_id, seq')
      ]);
      return json({ login, grant, jobs, services, trial: true });
    }
    if (action === 'people') {
      const jobId = url.searchParams.get('jobId');
      if (!await loadJob(sql, jobId)) return error('Job not found', 404);
      const kinds = ['crew', 'visitor'].filter(kind => canPeople(grant, kind));
      if (!kinds.length) return error('Separate Crew or Visitor permission required', 403);
      const people = await rows(sql, 'SELECT * FROM operation_people WHERE job_id=$1 AND kind=ANY($2::text[]) AND removed_at IS NULL ORDER BY created_at', [jobId, kinds]);
      return json({ people, kinds });
    }
    if (action === 'trips') {
      if (!grant.crewView || !grant.visitorView) return error('Crew and Visitor view permissions required for linked travel', 403);
      const jobId = url.searchParams.get('jobId');
      if (!await loadJob(sql, jobId)) return error('Job not found', 404);
      return json({ trips: await rows(sql, 'SELECT * FROM operation_trips WHERE job_id=$1 AND removed_at IS NULL ORDER BY created_at', [jobId]) });
    }
    if (action === 'history') {
      const scope = url.searchParams.get('scope'), id = url.searchParams.get('id');
      if (!['job', 'service', 'crew', 'visitor', 'trip', 'grant'].includes(scope) || !id) return error('Invalid history request');
      if (scope === 'grant' && grant.role !== 'owner') return error('Owner permission required', 403);
      if (['crew', 'visitor'].includes(scope) && !canPeople(grant, scope)) return error('Person permission required', 403);
      if (grant.role === 'viewer') return error('History permission required', 403);
      if (grant.role === 'editor' && scope === 'job' && !canEditJob(grant, login, await loadJob(sql, id))) return error('Assigned Job required', 403);
      if (grant.role === 'editor' && scope === 'service') {
        const service = await loadService(sql, id), job = service && await loadJob(sql, service.job_id);
        if (!service || !canEditService(grant, login, job, service)) return error('Assigned Service required', 403);
      }
      if (grant.role === 'editor' && ['crew', 'visitor', 'trip'].includes(scope)) return error('Owner history access required in trial', 403);
      return json({ events: await rows(sql, 'SELECT * FROM operation_events WHERE scope=$1 AND record_id=$2 ORDER BY id DESC LIMIT 100', [scope, id]) });
    }
    if (action === 'grants') {
      if (grant.role !== 'owner') return error('Owner permission required', 403);
      return json({ grants: await rows(sql, 'SELECT login,role,crew_view,crew_edit,visitor_view,visitor_edit,granted_by,updated_at FROM operation_grants ORDER BY login') });
    }
    return error('Unknown action', 404);
  }
  if (request.method !== 'POST') return error('Unsupported method', 405);
  if (!sameOrigin(request)) return error('Invalid origin', 403);
  let input;
  try { input = await parse(request); } catch { return error('Invalid or oversized JSON'); }
  const action = input.action;

  if (action === 'grant') {
    if (grant.role !== 'owner') return error('Owner permission required', 403);
    const target = textField(input.login, 39).toLowerCase();
    if (!/^[a-z0-9-]{1,39}$/.test(target) || target === OWNER || !['viewer', 'editor'].includes(input.role)) return error('Invalid GitHub account or role');
    if (input.confirmLogin !== target) return error('Re-enter the exact GitHub login to confirm access');
    const [existing] = await rows(sql, 'SELECT login FROM operation_grants WHERE login=$1', [target]);
    if (!existing) {
      const [count] = await rows(sql, 'SELECT count(*)::int AS total FROM operation_grants');
      if (count.total >= 9) return error('Trial limit: 10 named users including the owner', 409);
    }
    const profileResponse = await fetch('https://api.github.com/users/' + encodeURIComponent(target), { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!profileResponse.ok) return error('GitHub login could not be verified; no access granted', 409);
    const profile = await profileResponse.json();
    if (String(profile.login || '').toLowerCase() !== target) return error('GitHub login mismatch; no access granted', 409);
    const flags = ['crewView','crewEdit','visitorView','visitorEdit'].map(key => input[key] === true);
    await rows(sql, `WITH old AS (SELECT to_jsonb(g) AS before_data FROM operation_grants g WHERE login=$1),
      changed AS (INSERT INTO operation_grants(login,role,crew_view,crew_edit,visitor_view,visitor_edit,granted_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(login) DO UPDATE SET role=EXCLUDED.role,crew_view=EXCLUDED.crew_view,crew_edit=EXCLUDED.crew_edit,visitor_view=EXCLUDED.visitor_view,visitor_edit=EXCLUDED.visitor_edit,granted_by=EXCLUDED.granted_by,updated_at=now() RETURNING *),
      history AS (INSERT INTO operation_events(scope,record_id,action,actor,before_data,after_data)
      SELECT 'grant',$1,'set',$7,(SELECT before_data FROM old),to_jsonb(changed) FROM changed) SELECT * FROM changed`,
      [target, input.role, ...flags, login]);
    return json({ ok: true });
  }
  if (action === 'revoke') {
    if (grant.role !== 'owner') return error('Owner permission required', 403);
    const target = textField(input.login, 39).toLowerCase();
    if (target === OWNER || !/^[a-z0-9-]{1,39}$/.test(target)) return error('Invalid GitHub account');
    await rows(sql, `WITH deleted AS (DELETE FROM operation_grants WHERE login=$1 RETURNING *),
      history AS (INSERT INTO operation_events(scope,record_id,action,actor,before_data) SELECT 'grant',$1,'revoke',$2,to_jsonb(deleted) FROM deleted) SELECT * FROM deleted`, [target, login]);
    return json({ ok: true });
  }
  if (action === 'createJob') {
    if (grant.role !== 'owner') return error('Only owner can create and assign a new Job during this trial', 403);
    const [count] = await rows(sql, 'SELECT count(*)::int AS total FROM operation_jobs');
    if (count.total >= 80) return error('Trial limit: 80 Port Calls', 409);
    const data = { jobNo: '', vessel: '', port: '', principal: '', eta: '', etd: '', status: 'Draft', pic: '', ...clean(input.data, jobFields) };
    const invalid = validateJob(data);
    if (invalid) return error(invalid);
    if (!textField(data.vessel) || !textField(data.jobNo) || !data.eta) return error('Vessel, Job No. and ETA are required to create the GitHub folder');
    if (!process.env.GITHUB_DOCUMENTS_TOKEN) return error('Private GitHub storage is not configured', 503);
    const id = randomUUID();
    let created;
    try {
      created = await createJobFolder(data, id);
    } catch (e) { return error(e.message || 'GitHub folder could not be created', 502); }
    data.documentsPath = created.folder;
    try {
      const [job] = await rows(sql, `WITH inserted AS (INSERT INTO operation_jobs(id,data,created_by) VALUES($1,$2::jsonb,$3) RETURNING *),
        history AS (INSERT INTO operation_events(scope,record_id,action,actor,after_data) SELECT 'job',id::text,'create',$3,data FROM inserted) SELECT * FROM inserted`, [id, JSON.stringify(data), login]);
      return json({ job }, 201);
    } catch (e) {
      try { await undoCreatedFile(created.path, created.createdSha); } catch {}
      return e.code === '23505' ? error('Job No. is already used', 409) : error('Job could not be created', 500);
    }
  }
  if (action === 'syncJobFolder') {
    if (grant.role !== 'owner') return error('Only owner can create the GitHub folder', 403);
    const job = await loadJob(sql, input.id);
    if (!job) return error('Job not found', 404);
    if (!job.data.documentsPath && (!textField(job.data.vessel) || !textField(job.data.jobNo) || !job.data.eta)) return error('Vessel, Job No. and ETA are required');
    if (!process.env.GITHUB_DOCUMENTS_TOKEN) return error('Private GitHub storage is not configured', 503);
    let created;
    const newServiceFiles = [];
    try {
      if (!job.data.documentsPath) created = await createJobFolder(job.data, job.id);
      const folder = job.data.documentsPath || created.folder;
      const services = await rows(sql, "SELECT DISTINCT data->>'type' AS type FROM operation_services WHERE job_id=$1 AND removed_at IS NULL", [job.id]);
      for (const service of services) {
        const serviceFile = await createServiceFolder(folder, service.type);
        if (serviceFile.createdSha) newServiceFiles.push(serviceFile);
      }
      if (job.data.documentsPath) return json({ record: job, foldersSynced: true });
      const saved = await patchRow(sql, 'operation_jobs', job.id, 'job', { documentsPath: null }, { documentsPath: folder }, login, validateJob);
      if (!saved.ok) throw Error('Job changed while creating its GitHub folder. Try again.');
      return saved;
    } catch (e) {
      for (const file of newServiceFiles.reverse()) {
        try { await undoCreatedFile(file.path, file.createdSha); } catch {}
      }
      try { if (created) await undoCreatedFile(created.path, created.createdSha); } catch {}
      return error(e.message || 'GitHub folder could not be created', 502);
    }
  }
  if (action === 'updateJob') {
    const job = await loadJob(sql, input.id);
    if (!job) return error('Job not found', 404);
    if (!canEditJob(grant, login, job)) return error('Assigned Job required', 403);
    const patch = clean(input.patch, jobFields);
    if (!Object.keys(patch).length) return error('No fields to update');
    if ('pic' in patch && grant.role !== 'owner') return error('Only owner can assign Job PIC', 403);
    if (patch.status === 'Completed') {
      const [unfinished] = await rows(sql, `SELECT count(*)::int AS total FROM operation_services WHERE job_id=$1 AND removed_at IS NULL AND data->>'status' NOT IN ('Completed','Cancelled')`, [job.id]);
      if (unfinished.total && (grant.role !== 'owner' || !textField(input.reason))) return error('Unfinished Services require owner exception and reason');
    }
    try { return await patchRow(sql, 'operation_jobs', job.id, 'job', input.base || {}, patch, login, validateJob, textField(input.reason, 500)); }
    catch (e) { return e.code === '23505' ? error('Job No. is already used', 409) : error('Job could not be saved', 500); }
  }
  if (action === 'addService') {
    const job = await loadJob(sql, input.jobId);
    if (!job) return error('Job not found', 404);
    if (!canEditJob(grant, login, job)) return error('Assigned Job required to add Services', 403);
    const data = { type: 'Other', status: 'Not Started', checklist: [], ...clean(input.data, serviceFields) };
    const invalid = validateService(data);
    if (invalid) return error(invalid);
    if (!job.data.documentsPath) return error('Create the GitHub Job folder before adding a Service', 409);
    let serviceFolder;
    try { serviceFolder = await createServiceFolder(job.data.documentsPath, data.type); }
    catch (e) { return error(e.message || 'GitHub Service folder could not be created', 502); }
    const id = randomUUID();
    try {
      const [service] = await rows(sql, `WITH counter AS (UPDATE operation_jobs SET next_service_seq=next_service_seq+1 WHERE id=$1 RETURNING next_service_seq-1 AS seq),
        inserted AS (INSERT INTO operation_services(id,job_id,seq,data,created_by) SELECT $2,$1,seq,$3::jsonb,$4 FROM counter RETURNING *),
        history AS (INSERT INTO operation_events(scope,record_id,action,actor,after_data) SELECT 'service',id::text,'create',$4,data FROM inserted)
        SELECT * FROM inserted`, [job.id, id, JSON.stringify(data), login]);
      return json({ service }, 201);
    } catch {
      try { await undoCreatedFile(serviceFolder.path, serviceFolder.createdSha); } catch {}
      return error('Service could not be created', 500);
    }
  }
  if (action === 'updateService') {
    const service = await loadService(sql, input.id);
    if (!service || service.removed_at) return error('Service not found', 404);
    const job = await loadJob(sql, service.job_id);
    if (!canEditService(grant, login, job, service)) return error('Assigned Service required', 403);
    const patch = clean(input.patch, serviceFields);
    if (!Object.keys(patch).length) return error('No fields to update');
    if ('pic' in patch && grant.role !== 'owner' && !canEditJob(grant, login, job)) return error('Only Job PIC or owner can assign Service PIC', 403);
    if ('plannedEnd' in patch && service.data.baselineDue && patch.plannedEnd !== service.data.plannedEnd && !textField(input.reason)) return error('Deadline change reason required');
    if (patch.status === 'Cancelled' && !textField(input.reason)) return error('Cancellation reason required');
    if (!service.data.baselineDue && (patch.planConfirmed || patch.actualStart)) patch.baselineDue = patch.plannedEnd || service.data.plannedEnd || '';
    try { return await patchRow(sql, 'operation_services', service.id, 'service', input.base || {}, patch, login, validateService, textField(input.reason, 500)); }
    catch { return error('Service could not be saved', 500); }
  }
  if (action === 'removeService' || action === 'restoreService') {
    const service = await loadService(sql, input.id);
    if (!service) return error('Service not found', 404);
    const job = await loadJob(sql, service.job_id);
    if (action === 'restoreService' && grant.role !== 'owner') return error('Only owner can restore', 403);
    if (action === 'removeService' && !canEditService(grant, login, job, service)) return error('Assigned Service required', 403);
    const reason = textField(input.reason, 500);
    if (!reason) return error('Reason required');
    const [changed] = await rows(sql, `WITH changed AS (UPDATE operation_services SET removed_at=CASE WHEN $2='removeService' THEN now() ELSE NULL END,removed_by=CASE WHEN $2='removeService' THEN $3 ELSE NULL END,removed_reason=CASE WHEN $2='removeService' THEN $4 ELSE NULL END,updated_at=now(),version=version+1 WHERE id=$1 AND (($2='removeService' AND removed_at IS NULL) OR ($2='restoreService' AND removed_at IS NOT NULL)) RETURNING *),
      history AS (INSERT INTO operation_events(scope,record_id,action,actor,before_data,after_data,reason) SELECT 'service',id::text,$2,$3,$5::jsonb,data,$4 FROM changed) SELECT * FROM changed`,
      [service.id, action, login, reason, JSON.stringify(service.data)]);
    return changed ? json({ service: changed }) : error('Service state changed; reload', 409);
  }
  if (action === 'createPerson' || action === 'updatePerson' || action === 'removePerson') {
    const kind = input.kind;
    if (!['crew', 'visitor'].includes(kind) || !canPeople(grant, kind, true)) return error('Separate person edit permission required', 403);
    if (action === 'createPerson') {
      if (!await loadJob(sql, input.jobId)) return error('Job not found', 404);
      const data = { kind, ...clean(input.data, personFields), kind };
      const invalid = validatePerson(data);
      if (invalid) return error(invalid);
      const id = randomUUID();
      const [person] = await rows(sql, `WITH inserted AS (INSERT INTO operation_people(id,job_id,kind,data,created_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *),
        history AS (INSERT INTO operation_events(scope,record_id,action,actor,after_data) SELECT $3,id::text,'create',$5,data FROM inserted) SELECT * FROM inserted`, [id, input.jobId, kind, JSON.stringify(data), login]);
      return json({ person }, 201);
    }
    const [person] = await rows(sql, 'SELECT * FROM operation_people WHERE id=$1 AND kind=$2', [input.id, kind]);
    if (!person || person.removed_at) return error('Person not found', 404);
    if (action === 'updatePerson') return patchRow(sql, 'operation_people', person.id, kind, input.base || {}, clean(input.patch, personFields), login, validatePerson);
    const reason = textField(input.reason, 500);
    if (!reason) return error('Reason required');
    const [removed] = await rows(sql, `WITH changed AS (UPDATE operation_people SET removed_at=now(),version=version+1 WHERE id=$1 AND removed_at IS NULL RETURNING *),
      history AS (INSERT INTO operation_events(scope,record_id,action,actor,before_data,reason) SELECT $2,id::text,'remove',$3,data,$4 FROM changed) SELECT * FROM changed`, [person.id, kind, login, reason]);
    return removed ? json({ person: removed }) : error('Person state changed', 409);
  }
  if (action === 'createTrip' || action === 'updateTrip' || action === 'removeTrip') {
    if (!grant.crewEdit || !grant.visitorEdit || !isEditor(grant)) return error('Travel edit requires Operations and separate Crew/Visitor grants', 403);
    if (action === 'createTrip') {
      const job = await loadJob(sql, input.jobId);
      if (!job) return error('Job not found', 404);
      if (!canEditJob(grant, login, job)) return error('Assigned Job required', 403);
      const data = clean(input.data, tripFields);
      const invalid = validateTrip(data);
      if (invalid) return error(invalid);
      const id = randomUUID();
      const [trip] = await rows(sql, `WITH inserted AS (INSERT INTO operation_trips(id,job_id,service_id,data,created_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *),
        history AS (INSERT INTO operation_events(scope,record_id,action,actor,after_data) SELECT 'trip',id::text,'create',$5,data FROM inserted) SELECT * FROM inserted`, [id, job.id, uuid(input.serviceId) ? input.serviceId : null, JSON.stringify(data), login]);
      return json({ trip }, 201);
    }
    const [trip] = await rows(sql, 'SELECT * FROM operation_trips WHERE id=$1', [input.id]);
    if (!trip || trip.removed_at) return error('Trip not found', 404);
    const job = await loadJob(sql, trip.job_id), service = trip.service_id && await loadService(sql, trip.service_id);
    if (!(service ? canEditService(grant, login, job, service) : canEditJob(grant, login, job))) return error('Assigned work required', 403);
    if (action === 'updateTrip') return patchRow(sql, 'operation_trips', trip.id, 'trip', input.base || {}, clean(input.patch, tripFields), login, validateTrip);
    const reason = textField(input.reason, 500);
    if (!reason) return error('Reason required');
    const [removed] = await rows(sql, `WITH changed AS (UPDATE operation_trips SET removed_at=now(),version=version+1 WHERE id=$1 AND removed_at IS NULL RETURNING *),
      history AS (INSERT INTO operation_events(scope,record_id,action,actor,before_data,reason) SELECT 'trip',id::text,'remove',$2,data,$3 FROM changed) SELECT * FROM changed`, [trip.id, login, reason]);
    return removed ? json({ trip: removed }) : error('Trip state changed', 409);
  }
  return error('Unknown action', 404);
}

export default nodeHandler(route);

