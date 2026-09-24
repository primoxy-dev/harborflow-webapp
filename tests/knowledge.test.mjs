import test from 'node:test';
import assert from 'node:assert/strict';
import knowledgeHandler from '../api/knowledge.mjs';
import authHandler from '../api/auth.mjs';
import { authorized, knowledgeAccessPath, knowledgeContactsPath, knowledgePath, sign } from '../lib/harborflow.mjs';

process.env.GITHUB_OAUTH_CLIENT_ID = 'test-client';
process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-secret';
process.env.GITHUB_DOCUMENTS_TOKEN = 'test-token';
process.env.HARBORFLOW_SESSION_SECRET = 'test-session-secret';

const files = new Map();
let serial = 1;
const prefix = 'https://api.github.com/repos/primoxy-dev/harborflow-job-documents/contents/';
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('https://api.github.com/users/')) {
    const login = String(url).split('/').at(-1);
    return Response.json({ id: login === 'captain' ? 101 : login === 'agent' ? 102 : login === 'admin' ? 103 : 999, login, avatar_url: 'https://github.example/avatar', html_url: `https://github.com/${login}` });
  }
  assert.ok(String(url).startsWith(prefix), `Unexpected fetch URL: ${url}`);
  const path = String(url).slice(prefix.length).split('/').map(decodeURIComponent).join('/');
  const method = options.method || 'GET';
  if (method === 'GET') {
    const file = files.get(path);
    return file ? Response.json({ type: 'file', sha: file.sha, content: Buffer.from(file.content).toString('base64') }) : Response.json({ message: 'Not Found' }, { status: 404 });
  }
  if (method === 'PUT') {
    const body = JSON.parse(options.body);
    const previous = files.get(path);
    if ((previous?.sha || null) !== (body.sha || null)) return Response.json({ message: 'Conflict' }, { status: 409 });
    const sha = `test-sha-${serial++}`;
    files.set(path, { sha, content: Buffer.from(body.content, 'base64').toString('utf8'), message: body.message });
    return Response.json({ content: { sha } });
  }
  throw Error(`Unexpected method: ${method}`);
};

const session = login => {
  const payload = `${login}.${Date.now() + 3600000}`;
  return `hf_session=${payload}.${sign(payload)}`;
};
async function call(handler, method, path, login, body, origin = 'https://harborflow.example') {
  const headers = { host: 'harborflow.example', origin };
  if (login) headers.cookie = session(login);
  const request = { method, url: path, headers, body: body === undefined ? undefined : JSON.stringify(body) };
  const response = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(value) { this.body = value; } };
  await handler(request, response);
  return { status: response.statusCode, body: JSON.parse(String(response.body || '{}')) };
}

test('public response never contains legacy or private contacts', async () => {
  files.set(knowledgePath, { sha: 'legacy-sha', content: JSON.stringify({ terminals: [{ id: 'one', port: 'Map Ta Phut', terminal: 'LMPT1', restrictions: { crew: 'yes' }, source: '', note: '', verified: '' }], contacts: [{ id: 'secret', port: 'Map Ta Phut', name: 'Private Person', phone: '123' }] }) });
  const publicView = await call(knowledgeHandler, 'GET', '/api/knowledge');
  assert.equal(publicView.status, 200);
  assert.equal(publicView.body.role, 'viewer');
  assert.equal(publicView.body.data.terminals[0].terminal, 'LMPT1');
  assert.equal(JSON.stringify(publicView.body).includes('Private Person'), false);
  assert.equal(Object.hasOwn(publicView.body.data, 'contacts'), false);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts')).status, 401);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?mode=access')).status, 401);
  assert.equal((await call(knowledgeHandler, 'PUT', '/api/knowledge', null, { revision: 'legacy-sha', terminals: [] })).status, 401);
});

test('owner can write separated data and stale revisions are rejected', async () => {
  const contact = { id: 'one', port: 'Map Ta Phut', terminal: 'LMPT1', name: 'Example', role: 'Operations', phone: '999', email: '', note: '' };
  const saved = await call(knowledgeHandler, 'PUT', '/api/knowledge?area=contacts', 'primoxy-dev', { revision: null, contacts: [contact] });
  assert.equal(saved.status, 200);
  assert.ok(files.has(knowledgeContactsPath));
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'primoxy-dev')).body.data.contacts[0].name, 'Example');
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge')).body.data.contacts, undefined);
  assert.equal((await call(knowledgeHandler, 'PUT', '/api/knowledge?area=contacts', 'primoxy-dev', { revision: null, contacts: [] })).status, 409);
  assert.match(files.get(knowledgeContactsPath).message, /primoxy-dev/);
});

test('granular grants, administrator isolation, and immediate revocation', async () => {
  const users = [
    { login: 'captain', githubId: 101, grants: { restrictionEdit: true, contactView: false, contactEdit: false }, administrator: false },
    { login: 'agent', githubId: 102, grants: { restrictionEdit: false, contactView: true, contactEdit: false }, administrator: false },
    { login: 'admin', githubId: 103, grants: { restrictionEdit: false, contactView: false, contactEdit: false }, administrator: true }
  ];
  const access = await call(knowledgeHandler, 'PUT', '/api/knowledge?mode=access', 'primoxy-dev', { revision: null, users });
  assert.equal(access.status, 200);
  assert.ok(files.has(knowledgeAccessPath));
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'captain')).status, 403);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'agent')).status, 200);
  assert.equal((await call(knowledgeHandler, 'PUT', '/api/knowledge?area=contacts', 'agent', { revision: files.get(knowledgeContactsPath).sha, contacts: [] })).status, 403);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?mode=access', 'admin')).status, 200);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'admin')).status, 403);
  assert.equal(authorized(new Request('https://harborflow.example', { headers: { cookie: session('admin') } })), false);
  const ownerStatus = await call(authHandler, 'GET', '/api/auth?mode=status', 'primoxy-dev');
  assert.equal(ownerStatus.body.authenticated, true);
  const forbiddenEscalation = await call(knowledgeHandler, 'PUT', '/api/knowledge?mode=access', 'admin', { revision: access.body.revision, users: users.map(u => u.login === 'admin' ? { ...u, grants: { ...u.grants, contactView: true } } : u) });
  assert.equal(forbiddenEscalation.status, 403);
  const revoked = await call(knowledgeHandler, 'PUT', '/api/knowledge?mode=access', 'primoxy-dev', { revision: access.body.revision, users: users.filter(u => u.login !== 'agent') });
  assert.equal(revoked.status, 200);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'agent')).status, 403);
});

test('profile lookup requires administrator and validates origin on writes', async () => {
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?mode=profile&login=captain')).status, 401);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?mode=profile&login=captain', 'primoxy-dev')).body.id, 101);
  const current = await call(knowledgeHandler, 'GET', '/api/knowledge', 'primoxy-dev');
  assert.equal((await call(knowledgeHandler, 'PUT', '/api/knowledge', 'primoxy-dev', { revision: current.body.revision, terminals: [] }, 'https://evil.example')).status, 403);
});

test('history hides contact content from administrators without contact grant and restore is owner-only', async () => {
  const current = await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'primoxy-dev');
  const changed = await call(knowledgeHandler, 'PUT', '/api/knowledge?area=contacts', 'primoxy-dev', {
    revision: current.body.revision,
    contacts: [{ id: 'one', port: 'Map Ta Phut', terminal: 'LMPT1', name: 'Changed Name', role: 'Operations', phone: '999', email: '', note: '' }]
  });
  assert.equal(changed.status, 200);
  const adminHistory = await call(knowledgeHandler, 'GET', '/api/knowledge?mode=history&area=contacts', 'admin');
  assert.equal(adminHistory.status, 200);
  assert.equal(adminHistory.body.history[0].actor, 'primoxy-dev');
  assert.equal(Object.hasOwn(adminHistory.body.history[0], 'changes'), false);
  const ownerHistory = await call(knowledgeHandler, 'GET', '/api/knowledge?mode=history&area=contacts', 'primoxy-dev');
  assert.equal(ownerHistory.body.history[0].changes[0].after.name, 'Changed Name');
  assert.equal((await call(knowledgeHandler, 'POST', '/api/knowledge?mode=restore&area=contacts', 'admin', { revision: changed.body.revision, changeId: ownerHistory.body.history[0].id })).status, 403);
  const restored = await call(knowledgeHandler, 'POST', '/api/knowledge?mode=restore&area=contacts', 'primoxy-dev', { revision: changed.body.revision, changeId: ownerHistory.body.history[0].id });
  assert.equal(restored.status, 200);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'primoxy-dev')).body.data.contacts[0].name, 'Example');
});

test('imports stay private until the owner approves each row', async () => {
  const proposedContact = { id: 'legacy-two', port: 'Sriracha', terminal: 'PTT', name: 'Fictional Agent', role: 'Operations', phone: '', email: '', note: '' };
  assert.equal((await call(knowledgeHandler, 'POST', '/api/knowledge?mode=proposals', 'captain', { area: 'contacts', rows: [proposedContact] })).status, 403);
  const submitted = await call(knowledgeHandler, 'POST', '/api/knowledge?mode=proposals', 'primoxy-dev', { area: 'contacts', rows: [proposedContact] });
  assert.equal(submitted.status, 200);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'primoxy-dev')).body.data.contacts.some(row => row.name === 'Fictional Agent'), false);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?mode=proposals')).status, 401);
  const queue = await call(knowledgeHandler, 'GET', '/api/knowledge?mode=proposals', 'primoxy-dev');
  const proposal = queue.body.proposals.find(item => item.id === submitted.body.proposalId);
  const current = await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'primoxy-dev');
  assert.equal((await call(knowledgeHandler, 'POST', '/api/knowledge?mode=decide', 'admin', { proposalId: proposal.id, rowId: proposal.rows[0].id, action: 'add', proposalRevision: queue.body.revision, dataRevision: current.body.revision })).status, 403);
  const approved = await call(knowledgeHandler, 'POST', '/api/knowledge?mode=decide', 'primoxy-dev', { proposalId: proposal.id, rowId: proposal.rows[0].id, action: 'add', proposalRevision: queue.body.revision, dataRevision: current.body.revision });
  assert.equal(approved.status, 200);
  const contacts = await call(knowledgeHandler, 'GET', '/api/knowledge?area=contacts', 'primoxy-dev');
  assert.equal(contacts.body.data.contacts.some(row => row.name === 'Fictional Agent'), true);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge')).body.data.contacts, undefined);
});

test('a named contact viewer may propose but loses proposal visibility after revocation', async () => {
  const currentAccess = await call(knowledgeHandler, 'GET', '/api/knowledge?mode=access', 'primoxy-dev');
  const agent = { login: 'agent', githubId: 102, grants: { restrictionEdit: false, contactView: true, contactEdit: false }, administrator: false };
  const granted = await call(knowledgeHandler, 'PUT', '/api/knowledge?mode=access', 'primoxy-dev', { revision: currentAccess.body.revision, users: [...currentAccess.body.users, agent] });
  assert.equal(granted.status, 200);
  const submitted = await call(knowledgeHandler, 'POST', '/api/knowledge?mode=proposals', 'agent', { area: 'contacts', rows: [{ id: 'legacy-three', port: 'Sriracha', terminal: '', name: 'Imaginary Contact', role: '', phone: '', email: '', note: '' }] });
  assert.equal(submitted.status, 200);
  const own = await call(knowledgeHandler, 'GET', '/api/knowledge?mode=proposals', 'agent');
  assert.equal(own.body.proposals.some(item => item.id === submitted.body.proposalId), true);
  const revoked = await call(knowledgeHandler, 'PUT', '/api/knowledge?mode=access', 'primoxy-dev', { revision: granted.body.revision, users: currentAccess.body.users });
  assert.equal(revoked.status, 200);
  const after = await call(knowledgeHandler, 'GET', '/api/knowledge?mode=proposals', 'agent');
  assert.equal(after.status, 403);
});

test('normal edits cannot forge import approval references', async () => {
  const current = await call(knowledgeHandler, 'GET', '/api/knowledge', 'primoxy-dev');
  const row = current.body.data.terminals[0];
  const saved = await call(knowledgeHandler, 'PUT', '/api/knowledge?area=restrictions', 'primoxy-dev', {
    revision: current.body.revision,
    terminals: [{ ...row, importRef: 'forged:approval', note: 'Trial note' }]
  });
  assert.equal(saved.status, 200);
  const publicView = await call(knowledgeHandler, 'GET', '/api/knowledge');
  assert.equal(publicView.body.data.terminals[0].importRef, undefined);
  assert.equal(publicView.body.data.terminals[0].note, 'Trial note');
  assert.equal((await call(knowledgeHandler, 'PUT', '/api/knowledge?area=restrictions', 'primoxy-dev', null)).status, 400);
});

