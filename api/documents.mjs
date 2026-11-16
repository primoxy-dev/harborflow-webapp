import { nodeHandler, json, sameOrigin, sessionLogin } from '../lib/harborflow.mjs';
import { canPeople, db, permission, uuid } from '../lib/operations.mjs';
import { buildDocumentPreview, documentTypes } from '../lib/document-preview.mjs';
import { crewDocumentSettings, parseReferralContact, readSettings, saveSettings } from '../lib/document-settings.mjs';
import {readPermitDefaults,savePermitDefaults,configuredPermitSeed} from '../lib/permit-defaults.mjs';
import {documentRecordRoute} from '../lib/document-records-api.mjs';
import {loadPermitMailTemplates,savePermitMailTemplates} from '../lib/permit-mail-templates.mjs';

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
      const url = new URL(request.url);
      const action = url.searchParams.get('action');
      if (action === 'referralContact') {
        if (request.method === 'GET') {
          const {referralContact = ''} = await readSettings(sql, login);
          const defaults = parseReferralContact(deps.referralContactDefaults ?? process.env.HARBORFLOW_REFERRAL_CONTACT_DEFAULTS);
          return json({login, contact:parseReferralContact(referralContact) || defaults, base:referralContact});
        }
        if (!['owner','editor'].includes(grant.role)) return fail('Operations editing permission required',403);
        const raw = await request.text();
        if (raw.length > 5000) return fail('Request too large',413);
        let input;
        try { input = JSON.parse(raw); } catch { return fail('Invalid JSON',400); }
        if (input?.login !== login) return fail('Account changed; reopen the document',409);
        if (typeof input.base !== 'string' || input.base.length > 1200) return fail('Original contact details are required',400);
        const contact = JSON.stringify(input.contact);
        const result = await saveSettings(sql,login,{referralContact:contact},{referralContact:input.base});
        return result.status === 200 ? json({login, base:result.preferences.referralContact}) : fail(result.error,result.status);
      }
      if (action === 'referralSignature') {
        if (!['owner','editor'].includes(grant.role)) return fail('Operations editing permission required', 403);
        if (request.method === 'GET') {
          const {referralSignature = ''} = await readSettings(sql, login);
          return json({login, signature:referralSignature});
        }
        const raw = await request.text();
        if (raw.length > 1410000) return fail('Request too large', 413);
        let input;
        try { input = JSON.parse(raw); } catch { return fail('Invalid JSON', 400); }
        if (input?.login !== login) return fail('Account changed; reopen the document', 409);
        if (typeof input.base !== 'string' || input.base.length > 700000) return fail('Original signature is required', 400);
        const result = await saveSettings(sql, login, {referralSignature:input.signature}, {referralSignature:input.base});
        return result.status === 200 ? json({login, signature:result.preferences.referralSignature}) : fail(result.error,result.status);
      }
      if (!crew && !visitor) return fail('Separate Crew or Visitor view permission required', 403);
      if (request.method === 'POST') {
        const raw = await request.text();
        if (raw.length > 710000) return fail('Request too large', 413);
        let input;
        try { input = JSON.parse(raw); } catch { return fail('Invalid JSON', 400); }
        if(input.action==='saveDocumentSection')return documentRecordRoute(request,input,{sql,grant,login,previewRoute:createDocumentsRoute(deps)});
        if(input.action==='savePermitMailTemplates'){
          if(grant.role!=='owner')return fail('Owner permission required',403);
          if(input.login!==login)return fail('Account changed; reopen the document',409);
          const {status,...body}=await savePermitMailTemplates(input.templates,input.revision,deps.permitMailStore);return json(body,status);
        }
        if(input.action==='savePermitDefaults'){
          if(!visitor||grant.role!=='owner')return fail('Owner and separate Visitor view required',403);
          if(input.login!==login)return fail('Account changed; reopen the document',409);
          const {status,...body}=await savePermitDefaults(sql,login,input.defaults,input.version);return json(body,status);
        }
        if (!crew || !['owner','editor'].includes(grant.role)) return fail('Crew view and Operations editing permission required', 403);
        if (input.action !== 'savePreferences') return fail('Unknown action', 404);
        if (input.login !== login) return fail('Account changed; reopen the document', 409);
        if (Object.keys(input.patch || {}).some(key => key.startsWith('referral'))) return fail('Use the Referral Letter settings',400);
        const result = await saveSettings(sql, login, input.patch, input.base);
        if (result.preferences) result.preferences=crewDocumentSettings(result.preferences);
        const { status, ...body } = result;
        return json(body, status);
      }
      if(action==='permitMailTemplates')return json({login,...await loadPermitMailTemplates(deps.permitMailStore),canSave:grant.role==='owner'});
      if(action==='documentState')return documentRecordRoute(request,Object.fromEntries(url.searchParams),{sql,grant,login,previewRoute:createDocumentsRoute(deps)});
      if(action==='permitDefaults'){
        if(!visitor)return fail('Separate Visitor view permission required',403);
        const seed=grant.role==='owner'?configuredPermitSeed(deps.permitSeed||process.env.HARBORFLOW_PERMIT_DEFAULTS_JSON):null;
        return json({login,...await readPermitDefaults(sql,login,seed),canSave:grant.role==='owner'});
      }
      if (action === 'preferences') {
        if (!crew) return fail('Separate Crew view permission required', 403);
        const preferences = crewDocumentSettings(await readSettings(sql, login));
        return json({ login, preferences, canSave: ['owner','editor'].includes(grant.role) });
      }
      if (action === 'jobs') {
        const jobs = await sql.query('SELECT id,data FROM operation_jobs ORDER BY updated_at DESC LIMIT 100');
        return json({ jobs: jobs.map(job => ({ id: job.id, vessel: job.data.vessel || '', port: job.data.port || '', eta: job.data.eta || '', jobNo: job.data.jobNo || '' })), types: documentTypes(), trial: true });
      }
      if (action !== 'preview') return fail('Unknown action', 404);
      const type = url.searchParams.get('type'), jobId = url.searchParams.get('jobId'), serviceId = url.searchParams.get('serviceId');
      if (!Object.hasOwn(documentTypes(), type)) return fail('Unknown document type', 400);
      if (['oktb','loi'].includes(type) && !crew) return fail('Separate Crew view permission required', 403);
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
        (!['oktb','loi'].includes(type) || person.kind === 'crew') && (type === 'permit' || !serviceId || person.data.serviceIds?.includes(serviceId)));
      // Travel contains passengers from both categories; require both to include it.
      const trips = crew && visitor ? await sql.query("SELECT data FROM operation_trips WHERE job_id=$1 AND removed_at IS NULL AND data->>'kind' IN ('car','boat') ORDER BY created_at", [jobId]) : [];
      return json({ login, preview: buildDocumentPreview(type, job, allowedPeople, trips, { crewDetails: crew, visitorDetails: visitor }) });
    } catch {
      return fail('Document service temporarily unavailable. Please retry.', 503);
    }
  };
}

export default nodeHandler(createDocumentsRoute());
