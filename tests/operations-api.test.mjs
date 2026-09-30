import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../lib/harborflow.mjs';
import * as operations from '../lib/operations.mjs';
import { createOperationsRoute } from '../api/operations.mjs';

const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = 'fixture-only';
after(() => { if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl; });

const jobId = '11111111-1111-4111-8111-111111111111';
const serviceId = '22222222-2222-4222-8222-222222222222';
const job = { id: jobId, data: { pic: 'assigned-editor' } };
const service = { id: serviceId, job_id: jobId, data: { pic: 'assigned-editor' } };

async function fixture({ login = operations.OWNER, grant, assigned = true } = {}) {
  const queries = [];
  const sql = { async query(query, params = []) {
    queries.push(query);
    if (query.includes('SELECT * FROM operation_jobs')) return [{ ...job, data: { pic: assigned ? 'assigned-editor' : 'other-editor' } }];
    if (query.includes('SELECT * FROM operation_services')) return [{ ...service, data: { pic: assigned ? 'assigned-editor' : 'other-editor' } }];
    if (query.includes('INSERT INTO operation_people')) return [{ id: params[0], job_id: params[1], kind: params[2], data: JSON.parse(params[3]) }];
    if (query.includes('INSERT INTO operation_trips')) return [{ id: params[0], job_id: params[1], service_id: params[2], data: JSON.parse(params[3]) }];
    throw Error('Unexpected query in Operations API regression fixture');
  } };
  const handler = shared.nodeHandler(createOperationsRoute({ database: () => sql, loginFromRequest: () => login,
    readPermission: async account => grant === undefined ? operations.permission(account, sql) : grant }));
  return { queries, async request(body) {
    let result;
    const response = { setHeader() {}, end(bytes) { result = { status: this.statusCode, body: JSON.parse(String(bytes)) }; } };
    await handler({ method: 'POST', url: '/api/operations', headers: { host: 'harborflow.test', origin: 'https://harborflow.test', 'content-type': 'application/json' }, body }, response);
    return result;
  } };
}

const newPerson = (kind = 'crew', category = 'On-signers') => ({ action: 'createPerson', jobId, kind, data: { category, name: 'TEST ON-SIGNER', flights: [], serviceIds: [serviceId] } });

test('the actual Node API can save an owner On-signer instead of Server request failed', async () => {
  const api = await fixture();
  const response = await api.request(newPerson());
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.person.data.category, 'On-signers');
  assert.equal(response.body.person.data.name, 'TEST ON-SIGNER');
  assert.ok(api.queries.some(query => query.includes('INSERT INTO operation_events')));
});

test('an assigned Editor with separate Crew Edit can save an On-signer', async () => {
  const api = await fixture({ login: 'assigned-editor', grant: { role: 'editor', crewView: true, crewEdit: true } });
  assert.equal((await api.request(newPerson())).status, 201);
});

test('the owner can also add Off-signers and Visitors through the same permission guard', async () => {
  for (const [kind, category] of [['crew', 'Off-signers'], ['visitor', 'Surveyors']]) {
    const api = await fixture();
    const response = await api.request(newPerson(kind, category));
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.person.kind, kind);
    assert.equal(response.body.person.data.category, category);
  }
});

test('the same guard also works for Travel, while Viewers remain blocked', async () => {
  const input = { action: 'createTrip', jobId, serviceId, data: { kind: 'car', origin: 'DEMO AIRPORT', destination: 'DEMO PORT' } };
  const owner = await fixture();
  assert.equal((await owner.request(input)).status, 201);
  const viewer = await fixture({ login: 'viewer', grant: { role: 'viewer', crewEdit: true, visitorEdit: true } });
  assert.equal((await viewer.request(input)).status, 403);
  assert.ok(!viewer.queries.some(query => query.includes('INSERT')));
});

test('viewers and Editors without the separate person grant cannot create crew or visitors', async () => {
  for (const grant of [{ role: 'viewer', crewView: true, crewEdit: true, visitorEdit: true }, { role: 'editor', crewView: true, visitorView: true }]) {
    for (const kind of ['crew', 'visitor']) {
      const api = await fixture({ login: 'assigned-editor', grant });
      const response = await api.request(newPerson(kind));
      assert.equal(response.status, 403, JSON.stringify(response.body));
      assert.ok(!api.queries.some(query => query.includes('INSERT')));
    }
  }
});

test('unassigned Editors cannot save crew even with Crew Edit', async () => {
  const api = await fixture({ login: 'assigned-editor', grant: { role: 'editor', crewEdit: true }, assigned: false });
  assert.equal((await api.request(newPerson())).status, 403);
  assert.ok(!api.queries.some(query => query.includes('INSERT')));
});

