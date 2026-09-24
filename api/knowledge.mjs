import { authorized, configReady, gh, json, knowledgeAccessPath, knowledgePath, knowledgeRole, nodeHandler, readJson, sameOrigin, sessionLogin } from '../lib/harborflow.mjs';

const services = new Set(['crew', 'supt', 'sire', 'class', 'engineer', 'spare', 'stores', 'medical', 'water', 'garbage', 'courier', 'offlandSmall', 'offlandHeavy']);
const text = (value, limit = 200) => {
  if (typeof value !== 'string' || value.length > limit) throw Error('Invalid or oversized field');
  return value.trim();
};
function validateTable(input) {
  if (!input || !Array.isArray(input.terminals) || !Array.isArray(input.contacts) || input.terminals.length > 500 || input.contacts.length > 500) throw Error('Invalid table');
  const seenIds = new Set(), seenTerminals = new Set();
  const terminals = input.terminals.map(row => {
    if (!row || typeof row !== 'object') throw Error('Invalid terminal');
    const id = text(row.id, 80), port = text(row.port, 100), terminal = text(row.terminal, 100);
    if (!id || !port || !terminal || seenIds.has(id)) throw Error('Missing or duplicate terminal');
    seenIds.add(id);
    const key = `${port.toLowerCase()}|${terminal.toLowerCase()}`;
    if (seenTerminals.has(key)) throw Error('Duplicate terminal');
    seenTerminals.add(key);
    const restrictions = {};
    if (!row.restrictions || typeof row.restrictions !== 'object' || Array.isArray(row.restrictions)) throw Error('Invalid restrictions');
    for (const [service, status] of Object.entries(row.restrictions)) {
      if (!services.has(service) || !['unknown', 'yes', 'no'].includes(status)) throw Error('Invalid service status');
      restrictions[service] = status;
    }
    const verified = text(row.verified || '', 10);
    if (verified && !/^\d{4}-\d{2}-\d{2}$/.test(verified)) throw Error('Invalid verification date');
    return { id, port, terminal, restrictions, source: text(row.source || '', 300), note: text(row.note || '', 1000), verified };
  });
  const contacts = input.contacts.map(row => {
    if (!row || typeof row !== 'object') throw Error('Invalid contact');
    const id = text(row.id, 80), port = text(row.port, 100), name = text(row.name, 100);
    if (!id || !port || !name || seenIds.has(id)) throw Error('Missing or duplicate contact');
    seenIds.add(id);
    return { id, port, name, terminal: text(row.terminal || '', 100), role: text(row.role || '', 100), phone: text(row.phone || '', 100), email: text(row.email || '', 200), note: text(row.note || '', 1000) };
  });
  return { version: 1, terminals, contacts, updated: new Date().toISOString() };
}
function validateAccess(input) {
  if (!Array.isArray(input.users) || input.users.length > 50) throw Error('Invalid access list');
  const seen = new Set();
  return { version: 1, users: input.users.map(item => {
    const login = text(item?.login, 39).toLowerCase();
    if (!/^[a-z0-9-]{1,39}$/.test(login) || login === 'primoxy-dev' || seen.has(login) || !['viewer', 'editor'].includes(item.role)) throw Error('Invalid GitHub username or role');
    seen.add(login);
    return { login, role: item.role };
  }) };
}
async function write(path, body, validate, message) {
  if (typeof body.revision !== 'string' && body.revision !== null) return json({ error: 'Revision is required' }, 400);
  const current = await readJson(path);
  if ((current?.sha || null) !== body.revision) return json({ error: 'This table changed on another device. Reload before saving.' }, 409);
  const data = validate(body);
  try {
    const result = await gh('PUT', path, { message, content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64'), ...(current?.sha ? { sha: current.sha } : {}) });
    return json({ saved: true, revision: result.content?.sha, updated: data.updated || new Date().toISOString() });
  } catch (error) {
    if (/GitHub PUT failed \((409|422)\)/.test(error.message)) return json({ error: 'This table changed on another device. Reload before saving.' }, 409);
    throw error;
  }
}
async function route(request) {
  if (!configReady()) return json({ error: 'Private shared storage is not configured' }, 503);
  const login = sessionLogin(request);
  if (!login) return json({ error: 'Sign in with GitHub to use the shared Knowledge base' }, 401);
  try {
    const accessMode = new URL(request.url).searchParams.get('mode') === 'access';
    if (accessMode) {
      if (!authorized(request)) return json({ error: 'Only primoxy-dev can manage sharing' }, 403);
      if (request.method === 'GET') {
        const file = await readJson(knowledgeAccessPath);
        return json({ users: file?.data?.users || [], revision: file?.sha || null });
      }
      if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
      if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
      const raw = await request.text();
      if (raw.length > 20000) return json({ error: 'Access list is too large' }, 413);
      return await write(knowledgeAccessPath, JSON.parse(raw), validateAccess, 'Update Knowledge base access');
    }
    const role = await knowledgeRole(login);
    if (!role) return json({ error: 'Your GitHub account has not been granted Knowledge base access' }, 403);
    if (request.method === 'GET') {
      const file = await readJson(knowledgePath);
      return json({ role, login, data: file?.data || null, revision: file?.sha || null });
    }
    if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    if (role !== 'editor') return json({ error: 'View-only access cannot edit this table' }, 403);
    if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
    const raw = await request.text();
    if (raw.length > 600000) return json({ error: 'Table is too large' }, 413);
    return await write(knowledgePath, JSON.parse(raw), validateTable, 'Save terminal restrictions and contacts');
  } catch (error) {
    return json({ error: error instanceof SyntaxError ? 'Invalid JSON' : error.message || 'Shared storage failed' }, error instanceof SyntaxError ? 400 : /Invalid|Missing|Duplicate/.test(error.message || '') ? 400 : 503);
  }
}

export default nodeHandler(route);

