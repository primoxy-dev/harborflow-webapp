import { nodeHandler, json, sameOrigin, sessionLogin } from '../lib/harborflow.mjs';
import { canPeople, db, permission, uuid } from '../lib/operations.mjs';
import { buildDocumentPreview, documentTypes } from '../lib/document-preview.mjs';
import { readSettings, saveSettings } from '../lib/document-settings.mjs';

const fail = (message, status) => json({ error: message }, status);

export function createDocumentsRoute(deps = {}) {
  const getLogin = deps.sessionLogin || sessionLogin;
  const getDb = deps.db || db;
  const getPermission = deps.permission || permission;
  return async function route(request) {
    if (!['GET', 'POST'].includes(request.method)) return fail('Unsupported method', 405);
    if (request.method === 'POST' && !sameOrigin(request)) return fail('Invalid origin', 403);
    const login = getLogin(request);
    if (!login) return fail('Sign in required', 401);
    if (!deps.db && !process.env.DATABASE_URL) return fail('Operations database is not configured', 503);
    try {
      const sql = getDb();
      const grant = await getPermission(login, sql);
      if (!grant) return fail('Operations access required', 403);
      const crew = canPeople(grant, 'crew'), visitor = canPeople(grant, 'visitor');
      if (!crew && !visitor) return fail('Separate Crew or Visitor view permission required', 403);
      const url = new URL(request.url);
      if (request.method === 'POST') {
        if (!crew || !['owner','editor'].includes(grant.role)) return fail('Crew view and Operations editing permission required', 403);
        const raw = await request.text();
        if (raw.length > 710000) return fail('Request too large', 413);
        let input;
        try { input = JSON.parse(raw); } catch { return fail('Invalid JSON', 400); }
        if (input.action !== 'savePreferences') return fail('Unknown action', 404);
        if (input.login !== login) return fail('Account changed; reopen the document', 409);
        const result = await saveSettings(sql, login, input.patch, input.base);
        const { status, ...body } = result;
        return json(body, status);
      }
      const action = url.searchParams.get('action');
      if (action === 'preferences') {
        if (!crew) return fail('Separate Crew view permission required', 403);
        return json({ login, preferences: await readSettings(sql, login), canSave: ['owner','editor'].includes(grant.role) });
      }
      if (action === 'jobs') {
        const jobs = await sql.query('SELECT id,data FROM operation_jobs ORDER BY updated_at DESC LIMIT 100');
        return json({ jobs: jobs.map(job => ({ id: job.id, vessel: job.data.vessel || '', port: job.data.port || '', eta: job.data.eta || '', jobNo: job.data.jobNo || '' })), types: documentTypes(), trial: true });
      }
      if (action !== 'preview') return fail('Unknown action', 404);
      const type = url.searchParams.get('type'), jobId = url.searchParams.get('jobId'), serviceId = url.searchParams.get('serviceId');
      if (!Object.hasOwn(documentTypes(), type)) return fail('Unknown document type', 400);
      if (type === 'oktb' && !crew) return fail('Separate Crew view permission required', 403);
      if (!uuid(jobId)) return fail('Invalid Job', 400);
      const [job] = await sql.query('SELECT id,data FROM operation_jobs WHERE id=$1', [jobId]);
      if (!job) return fail('Job not found', 404);
      if (serviceId) {
        if (!uuid(serviceId)) return fail('Invalid Service', 400);
        const [service] = await sql.query('SELECT job_id,data,removed_at FROM operation_services WHERE id=$1', [serviceId]);
        if (!service || service.job_id !== jobId || service.removed_at || service.data.type !== 'Crew Change') return fail('Crew Change Service not found for this Job', 404);
      }
      const people = await sql.query('SELECT id,kind,data FROM operation_people WHERE job_id=$1 AND removed_at IS NULL ORDER BY created_at', [jobId]);
      const allowedPeople = people.filter(person => (person.kind === 'crew' ? crew : visitor) &&
        (type !== 'oktb' || person.kind === 'crew') && (!serviceId || person.data.serviceIds?.includes(serviceId)));
      // Travel contains passengers from both categories; require both to include it.
      const trips = crew && visitor ? await sql.query("SELECT data FROM operation_trips WHERE job_id=$1 AND removed_at IS NULL AND data->>'kind' IN ('car','boat') ORDER BY created_at", [jobId]) : [];
      return json({ login, preview: buildDocumentPreview(type, job, allowedPeople, trips, { crewDetails: crew }) });
    } catch {
      return fail('Document service temporarily unavailable. Please retry.', 503);
    }
  };
}

export default nodeHandler(createDocumentsRoute());


