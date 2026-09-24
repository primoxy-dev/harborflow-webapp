import test from 'node:test';
import assert from 'node:assert/strict';
import knowledgeHandler from '../api/knowledge.mjs';
import authHandler from '../api/auth.mjs';
import { authorized, sign } from '../lib/harborflow.mjs';

process.env.GITHUB_OAUTH_CLIENT_ID = 'test-client';
process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-secret';
process.env.GITHUB_DOCUMENTS_TOKEN = 'test-token';
process.env.HARBORFLOW_SESSION_SECRET = 'test-session-secret';

const files = new Map();
let serial = 1;
const prefix = 'https://api.github.com/repos/primoxy-dev/harborflow-job-documents/contents/';
globalThis.fetch = async (url, options = {}) => {
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
    files.set(path, { sha, content: Buffer.from(body.content, 'base64').toString('utf8') });
    return Response.json({ content: { sha } });
  }
  throw Error(`Unexpected method: ${method}`);
};

const session = login => {
  const payload = `${login}.${Date.now() + 3600000}`;
  return `hf_session=${payload}.${sign(payload)}`;
};
async function call(handler, method, path, login, body) {
  const headers = { host: 'harborflow.example', origin: 'https://harborflow.example' };
  if (login) headers.cookie = session(login);
  const request = { method, url: path, headers, body: body === undefined ? undefined : JSON.stringify(body) };
  const response = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(value) { this.body = value; } };
  await handler(request, response);
  return { status: response.statusCode, body: JSON.parse(String(response.body || '{}')) };
}

test('Knowledge base can be viewed anonymously but only editors can save', async () => {
  const publicView = await call(knowledgeHandler, 'GET', '/api/knowledge');
  assert.equal(publicView.status, 200);
  assert.equal(publicView.body.role, 'viewer');
  assert.equal(publicView.body.login, null);
  assert.equal((await call(knowledgeHandler, 'PUT', '/api/knowledge', null, { revision: null, terminals: [], contacts: [] })).status, 401);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?mode=access')).status, 403);
  const owner = await call(knowledgeHandler, 'GET', '/api/knowledge', 'primoxy-dev');
  assert.equal(owner.status, 200);
  assert.equal(owner.body.role, 'editor');
  assert.equal(owner.body.revision, null);
  const saved = await call(knowledgeHandler, 'PUT', '/api/knowledge', 'primoxy-dev', {
    revision: null, terminals: [{ id: 'one', port: 'Map Ta Phut', terminal: 'LMPT1', restrictions: { crew: 'yes' }, source: '', note: '', verified: '' }], contacts: []
  });
  assert.equal(saved.status, 200);
  assert.ok(saved.body.revision);
  const publicAfterSave = await call(knowledgeHandler, 'GET', '/api/knowledge');
  assert.equal(publicAfterSave.body.data.terminals[0].terminal, 'LMPT1');
  const stale = await call(knowledgeHandler, 'PUT', '/api/knowledge', 'primoxy-dev', { revision: null, terminals: [], contacts: [] });
  assert.equal(stale.status, 409);
});

test('Owner can share read-only and editor roles without opening crew documents', async () => {
  const access = await call(knowledgeHandler, 'PUT', '/api/knowledge?mode=access', 'primoxy-dev', {
    revision: null, users: [{ login: 'reader-example', role: 'viewer' }, { login: 'editor-example', role: 'editor' }]
  });
  assert.equal(access.status, 200);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge', 'reader-example')).body.role, 'viewer');
  const table = await call(knowledgeHandler, 'GET', '/api/knowledge', 'reader-example');
  assert.equal((await call(knowledgeHandler, 'PUT', '/api/knowledge', 'reader-example', { revision: table.body.revision, terminals: [], contacts: [] })).status, 403);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge', 'editor-example')).body.role, 'editor');
  assert.equal(authorized(new Request('https://harborflow.example', { headers: { cookie: session('editor-example') } })), false);
  const status = await call(authHandler, 'GET', '/api/auth?mode=status', 'reader-example');
  assert.equal(status.body.authenticated, false);
  assert.equal(status.body.knowledgeRole, 'viewer');
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge', 'unlisted-example')).body.role, 'viewer');
  assert.equal((await call(knowledgeHandler, 'PUT', '/api/knowledge', 'unlisted-example', { revision: table.body.revision, terminals: [], contacts: [] })).status, 403);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge?mode=access', 'editor-example')).status, 403);
  const update = await call(knowledgeHandler, 'PUT', '/api/knowledge?mode=access', 'primoxy-dev', {
    revision: access.body.revision, users: [{ login: 'reader-example', role: 'editor' }]
  });
  assert.equal(update.status, 200);
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge', 'reader-example')).body.role, 'editor');
  assert.equal((await call(knowledgeHandler, 'GET', '/api/knowledge', 'editor-example')).body.role, 'viewer');
});

test('Invalid table changes and stale revisions are rejected', async () => {
  const current = await call(knowledgeHandler, 'GET', '/api/knowledge', 'primoxy-dev');
  const duplicate = await call(knowledgeHandler, 'PUT', '/api/knowledge', 'primoxy-dev', {
    revision: current.body.revision,
    terminals: [
      { id: 'a', port: 'Map Ta Phut', terminal: 'LMPT1', restrictions: {}, source: '', note: '', verified: '' },
      { id: 'b', port: 'Map Ta Phut', terminal: 'LMPT1', restrictions: {}, source: '', note: '', verified: '' }
    ], contacts: []
  });
  assert.equal(duplicate.status, 400);
  const badStatus = await call(knowledgeHandler, 'PUT', '/api/knowledge', 'primoxy-dev', {
    revision: current.body.revision,
    terminals: [{ id: 'a', port: 'Map Ta Phut', terminal: 'LMPT1', restrictions: { crew: 'maybe' }, source: '', note: '', verified: '' }], contacts: []
  });
  assert.equal(badStatus.status, 400);
});

