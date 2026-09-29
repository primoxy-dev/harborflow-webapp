import { nodeHandler, json, sessionLogin } from '../lib/harborflow.mjs';
import { canPeople, db, permission, uuid } from '../lib/operations.mjs';
import { buildDocumentPreview, documentTypes } from '../lib/document-preview.mjs';

const fail = (message, status) => json({ error: message }, status);

async function route(request) {
  if (request.method !== 'GET') return fail('Unsupported method', 405);
  const login = sessionLogin(request);
  if (!login) return fail('Sign in required', 401);
  if (!process.env.DATABASE_URL) return fail('Operations database is not configured', 503);
  const sql = db();
  let grant;
  try { grant = await permission(login, sql); }
  catch { return fail('Current authorization could not be verified', 503); }
  if (!grant || !canPeople(grant, 'crew') || !canPeople(grant, 'visitor')) return fail('Separate Crew and Visitor view permissions required', 403);
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (action === 'jobs') {
    const jobs = await sql.query('SELECT id,data FROM operation_jobs ORDER BY updated_at DESC LIMIT 100');
    return json({ jobs: jobs.map(job => ({ id: job.id, vessel: job.data.vessel || '', port: job.data.port || '', eta: job.data.eta || '', jobNo: job.data.jobNo || '' })), types: documentTypes(), trial: true });
  }
  if (action !== 'preview') return fail('Unknown action', 404);
  const type = url.searchParams.get('type'), jobId = url.searchParams.get('jobId');
  if (!Object.hasOwn(documentTypes(), type)) return fail('Unknown document type', 400);
  if (!uuid(jobId)) return fail('Invalid Job', 400);
  const [job] = await sql.query('SELECT id,data FROM operation_jobs WHERE id=$1', [jobId]);
  if (!job) return fail('Job not found', 404);
  const [people, trips] = await Promise.all([
    sql.query('SELECT kind,data FROM operation_people WHERE job_id=$1 AND removed_at IS NULL ORDER BY created_at', [jobId]),
    sql.query('SELECT data FROM operation_trips WHERE job_id=$1 AND removed_at IS NULL ORDER BY created_at', [jobId])
  ]);
  return json({ preview: buildDocumentPreview(type, job, people, trips) });
}

export default nodeHandler(route);

