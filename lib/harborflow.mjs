import { createHmac, timingSafeEqual } from 'node:crypto';

export const repo = 'primoxy-dev/harborflow-job-documents';
export const knowledgePath = 'Knowledge/terminal-restrictions.json';
export const knowledgeContactsPath = 'Knowledge/terminal-contacts.json';
export const knowledgeAccessPath = 'Knowledge/terminal-access.json';
export const knowledgeProposalsPath = 'Knowledge/import-proposals.json';
const githubApi = 'https://api.github.com';
const headers = token => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' });
export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
export function configReady() {
  return Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET && process.env.GITHUB_DOCUMENTS_TOKEN && process.env.HARBORFLOW_SESSION_SECRET);
}
export function origin(request) {
  const url = new URL(request.url);
  return url.origin;
}
export function sameOrigin(request) {
  const supplied = request.headers.get('origin');
  return supplied === origin(request);
}
export function cookie(request, name) {
  return request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
export function sign(value) {
  return createHmac('sha256', process.env.HARBORFLOW_SESSION_SECRET).update(value).digest('hex');
}
export function validSigned(value, signature) {
  if (!value || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  return timingSafeEqual(Buffer.from(sign(value), 'hex'), Buffer.from(signature, 'hex'));
}
export function authorized(request) {
  return sessionLogin(request) === 'primoxy-dev';
}
export function sessionLogin(request) {
  if (!configReady()) return null;
  const [login, expiry, signature] = cookie(request, 'hf_session').split('.');
  const payload = `${login}.${expiry}`;
  return /^[a-z0-9-]{1,39}$/.test(login || '') && /^\d+$/.test(expiry || '') && Number(expiry) > Date.now() && validSigned(payload, signature) ? login : null;
}
export async function knowledgeRole(login) {
  const grants = await knowledgeGrants(login);
  return grants.administrator ? 'administrator' : grants.restrictionEdit || grants.contactEdit ? 'editor' : grants.contactView ? 'viewer' : null;
}
export async function knowledgeGrants(login) {
  const empty = { restrictionEdit: false, contactView: false, contactEdit: false, administrator: false };
  if (!configReady() || !login) return empty;
  if (login === 'primoxy-dev') return { restrictionEdit: true, contactView: true, contactEdit: true, administrator: true };
  const file = await readJson(knowledgeAccessPath);
  const user = Array.isArray(file?.data?.users) ? file.data.users.find(item => item.login === login) : null;
  if (!user) return empty;
  if (user.grants && typeof user.grants === 'object') return {
    restrictionEdit: user.grants.restrictionEdit === true,
    contactView: user.grants.contactView === true || user.grants.contactEdit === true,
    contactEdit: user.grants.contactEdit === true,
    administrator: user.administrator === true
  };
  return user.role === 'editor' ? { ...empty, restrictionEdit: true, contactView: true, contactEdit: true }
    : user.role === 'viewer' ? { ...empty, contactView: true } : empty;
}
export const sessionCookie = (value, maxAge) => `hf_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const stateCookie = (value, maxAge) => `hf_oauth_state=${value}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export function safeName(value, max = 80) {
  return String(value || '').trim().replace(/[\\/<>:"|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').replace(/^\.+|\.+$/g, '').slice(0, max);
}
export function jobPath(job, service) {
  if (!job || !/^\d{4}-\d{2}-\d{2}/.test(job.eta || '')) throw Error('A valid ETA is required');
  const [year, month, day] = job.eta.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw Error('Invalid ETA');
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const vessel = safeName(job.name), jobNo = safeName(job.jobNo), serviceName = safeName(service);
  if (!vessel || !jobNo || !serviceName) throw Error('Vessel, Job No. and service are required');
  return `Jobs/${year}/${String(month).padStart(2,'0')}. ${months[month-1]}/${String(day).padStart(2,'0')}. ${vessel} - ${jobNo}/${serviceName}`;
}
export function categoryName(person) {
  if (!['On-signers','Off-signers','Medical visitors','SIRE Inspectors','Surveyors','Service Engineers','Other'].includes(person.change)) throw Error('Invalid category');
  const name = person.change === 'Other' ? safeName(person.otherCategory || 'Other') : person.change;
  if (!name) throw Error('Other category is required');
  return name;
}
export async function gh(method, path, body) {
  const response = await fetch(`${githubApi}/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method, headers: { ...headers(process.env.GITHUB_DOCUMENTS_TOKEN), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (response.status === 404 && method === 'GET') return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(`GitHub ${method} failed (${response.status}): ${data.message || 'Unknown error'}`);
  return data;
}
export async function readJson(path) {
  const file = await gh('GET', path);
  if (!file || file.type !== 'file') return null;
  return { sha: file.sha, data: JSON.parse(Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8')) };
}
export async function putFile(path, bytes, message) {
  const old = await gh('GET', path);
  return gh('PUT', path, { message, content: Buffer.from(bytes).toString('base64'), ...(old?.sha ? { sha: old.sha } : {}) });
}

// Vercel passes Node request/response objects to the default function export.
export function nodeHandler(route) {
  return async (req, res) => {
    try {
      const host = req.headers.host;
      if (!host || !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host)) { res.statusCode = 400; res.end('Invalid host'); return; }
      const url = new URL(req.url, `https://${host}`);
      const method = req.method || 'GET';
      const raw = req.body == null ? undefined : Buffer.isBuffer(req.body) ? req.body : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const request = new Request(url, { method, headers: req.headers, ...(raw !== undefined && method !== 'GET' && method !== 'HEAD' ? { body: raw } : {}) });
      const response = await route(request);
      res.statusCode = response.status;
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Server request failed' }));
    }
  };
}

