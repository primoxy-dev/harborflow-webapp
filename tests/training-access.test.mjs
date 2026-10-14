import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingAccess } from '../lib/training/access.mjs';
import { createTrainingRoute } from '../api/training.mjs';

test('owner has access, viewer is read-only and cannot download', () => {
  assert.equal(trainingAccess({ login: 'primoxy-dev', action: 'crew.list' }), true);
  assert.equal(trainingAccess({ login: 'primoxy-dev', action: 'grants.set' }), true);
  assert.equal(trainingAccess({ login: 'reader', grant: { role: 'viewer' }, action: 'crew.list' }), true);
  assert.equal(trainingAccess({ login: 'reader', grant: { role: 'viewer' }, action: 'grants.set' }), false);
  assert.equal(trainingAccess({ login: 'reader', grant: { role: 'viewer' }, action: 'crew.create' }), false);
  assert.equal(trainingAccess({ login: 'reader', grant: { role: 'viewer' }, action: 'certificates.download' }), false);
});

test('owner can issue a separate training grant', async () => {
  const calls = [];
  const route = createTrainingRoute({
    database: () => ({ query: async (statement, params) => {
      calls.push([statement, params]);
      return [{ login: 'training-user', role: 'officer' }];
    } }),
    loginFromRequest: () => 'primoxy-dev'
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test' },
    body: JSON.stringify({ action: 'grants.set', login: 'training-user', role: 'officer' })
  }));
  assert.equal(response.status, 200);
  assert.ok(calls.some(([statement]) => statement.includes('INSERT INTO training_grants')));
});

test('shore coordinator can edit, unrelated Operations grants confer no access', () => {
  assert.equal(trainingAccess({ login: 'shore', grant: { role: 'coordinator' }, action: 'crew.create' }), true);
  assert.equal(trainingAccess({ login: 'operations', grant: { crewEdit: true, role: 'editor', pic: 'operations' }, action: 'crew.list' }), false);
});

test('officer is scoped to assigned vessel for writes and downloads', () => {
  const input = { login: 'officer', grant: { role: 'officer' }, vesselIds: ['vessel-a'] };
  assert.equal(trainingAccess({ ...input, action: 'outcomes.record', targetVesselId: 'vessel-a' }), true);
  assert.equal(trainingAccess({ ...input, action: 'outcomes.record', targetVesselId: 'vessel-b' }), false);
  assert.equal(trainingAccess({ ...input, action: 'certificates.download', targetVesselId: 'vessel-b' }), false);
  assert.equal(trainingAccess({ ...input, action: 'crew.list' }), false);
  assert.equal(trainingAccess({ ...input, action: 'vessels.list' }), true);
  assert.equal(trainingAccess({ ...input, action: 'not.real', targetVesselId: 'vessel-a' }), false);
});

test('route denies anonymous reads and writes before touching database', async () => {
  let queries = 0;
  const route = createTrainingRoute({
    database: () => { queries++; throw Error('database must not be opened'); },
    loginFromRequest: () => null,
    readTrainingGrant: () => { throw Error('grant must not be read'); }
  });
  const get = await route(new Request('https://example.test/api/training?action=crew.list'));
  const post = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'crew.create', data: { name: 'Fictional Crew' } })
  }));
  assert.equal(get.status, 401);
  assert.equal(post.status, 401);
  assert.equal(queries, 0);
});

test('route denies officer vessel B before querying records', async () => {
  let queries = 0;
  const route = createTrainingRoute({
    database: () => ({ query: () => { queries++; throw Error('record must not be queried'); } }),
    loginFromRequest: () => 'officer',
    readTrainingGrant: async () => ({ role: 'officer', vesselIds: ['vessel-a'] })
  });
  const response = await route(new Request('https://example.test/api/training?action=certificates.download&vesselId=vessel-b'));
  assert.equal(response.status, 403);
  assert.equal(queries, 0);
});

