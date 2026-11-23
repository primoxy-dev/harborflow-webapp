import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationsRoute } from '../api/operations.mjs';

const catalog = {
  version: 1,
  id: 'test-handover',
  title: 'Operations Handover',
  account: 'Test customer',
  archive: { name: 'test.zip', from: '2026-08-01', to: '2026-08-30', note: 'Test archive' },
  roles: { outgoing: 'Previous owner', lead: 'Lead', assistant: 'Assistant', both: 'Lead and Assistant' },
  categories: [{ id: 'travel', title: 'Travel' }],
  contacts: [{ id: 'agent', name: 'Travel agent', email: 'agent@example.com', note: '' }],
  sources: [{ id: 'M001', label: 'Flight quote', sender: 'Operations', date: '2026-08-02', direction: 'outgoing', duplicateOf: '' }],
  workflows: [{
    id: 'flight', category: 'travel', title: 'Flight booking', owner: 'lead', summary: 'Request options',
    start: 'Receive itinerary', done: 'Ticket issued', related: [], notes: [], sources: ['M001'],
    steps: [{ id: 'request', title: 'Request fare', detail: 'Send itinerary to travel agent', owner: 'assistant' }],
    templates: [{
      id: 'request', title: 'Request fare', direction: 'outgoing', when: 'New request',
      from: [], to: ['agent'], cc: [], subject: 'Flight options', body: 'Please quote {{ITINERARY}}.',
      attachments: [], notes: [], sources: ['M001']
    }]
  }],
  followups: []
};

test('Handover imports and repeatable checklists stay private to the authorized Operations account', async t => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'fixture-only';
  t.after(() => {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  const records = new Map();
  const sql = { async query(statement, params = []) {
    if (statement.startsWith('CREATE TABLE IF NOT EXISTS')) return [];
    const [login, dataOrRevision, caseOrRevision, workflow, step, checked] = params;
    const record = records.get(login);
    if (statement.startsWith('INSERT INTO')) {
      assert.match(statement, /operation_handover\(login,catalog,revision\)/);
      if (record) return [];
      const saved = { catalog: JSON.parse(dataOrRevision), revision: caseOrRevision, progress: {} };
      records.set(login, saved);
      return [saved];
    }
    assert.match(statement, /WHERE login=\$1/);
    if (statement.startsWith('SELECT catalog,revision,progress')) return record ? [record] : [];
    assert.match(statement, /AND revision=\$2/);
    if (!record || record.revision !== dataOrRevision) return [];
    if (statement.startsWith('SELECT catalog')) return [record];
    assert.match(statement, /UPDATE operation_handover\s+SET progress=jsonb_set/);
    const steps = ((record.progress[caseOrRevision] ??= {})[workflow] ??= {});
    if (checked) steps[step] = true;
    else delete steps[step];
    return [{ progress: record.progress }];
  } };
  const route = createOperationsRoute({
    database: () => sql,
    loginFromRequest: request => request.headers.get('x-test-login'),
    readPermission: async login => login === 'outside' ? null : { role: 'editor' }
  });
  const call = (login, body, origin = 'https://harborflow.test') => {
    const headers = { Origin: origin, 'Content-Type': 'application/json' };
    if (login) headers['x-test-login'] = login;
    return route(new Request('https://harborflow.test/api/operations' + (body ? '' : '?action=handover'), {
      headers, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined
    }));
  };
  const importRequest = { action: 'importHandover', revision: null, catalog };

  assert.equal((await call(null)).status, 401);
  assert.equal((await call('outside', importRequest)).status, 403);
  assert.equal((await call('lead', importRequest, 'https://other.example')).status, 403);
  assert.equal(records.size, 0);

  const imported = await call('lead', importRequest);
  assert.equal(imported.status, 200);
  const { revision } = await imported.json();
  assert.equal((await call('lead', importRequest)).status, 409);
  const read = await call('lead');
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await read.json()).catalog, catalog);
  assert.deepEqual(await (await call('assistant')).json(), { catalog: null, revision: null, progress: {} });

  const check = { action: 'checkHandoverStep', revision, caseRef: 'TEST-123', workflow: 'flight', step: 'request', checked: true };
  assert.equal((await call('assistant', check)).status, 409);
  assert.equal((await call('lead', { ...check, step: 'unknown' })).status, 404);
  assert.equal((await call('lead', { ...check, caseRef: '__proto__' })).status, 400);
  assert.deepEqual(await (await call('lead', check)).json(), { progress: { 'TEST-123': { flight: { request: true } } } });
  assert.deepEqual(await (await call('lead', { ...check, checked: false })).json(), { progress: { 'TEST-123': { flight: {} } } });
});
