import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCrewProfile, validateCrewLink, crewVisibleToVessel } from '../lib/training/crew.mjs';
import { createTrainingRoute } from '../api/training.mjs';

test('requires fictional display name and rank; strips passport fields', () => {
  assert.equal(validateCrewProfile({ displayName: '', rank: 'Master' }).error, 'Display name is required');
  assert.equal(validateCrewProfile({ displayName: 'Test Crew', rank: '' }).error, 'Rank is required');
  const { value, error } = validateCrewProfile({
    displayName: '  Fictional A  ', rank: ' Master ', department: ' Deck ',
    passport: 'SECRET', passportExpiry: '2030-01-01'
  });
  assert.equal(error, null);
  assert.deepEqual(value, { displayName: 'Fictional A', rank: 'Master', department: 'Deck', active: true });
});

test('reviewed job-person link rejects cross-profile duplicate and non-crew', () => {
  const existingLinks = [{ crewId: 'crew-a', operationPersonId: 'person-a', removedAt: null }];
  assert.match(validateCrewLink({
    crewId: 'crew-b', operationPersonId: 'person-a', personKind: 'crew', existingLinks
  }), /already linked/i);
  assert.match(validateCrewLink({
    crewId: 'crew-b', operationPersonId: 'person-b', personKind: 'visitor', existingLinks
  }), /crew/i);
  assert.equal(validateCrewLink({
    crewId: 'crew-b', operationPersonId: 'person-b', personKind: 'crew', existingLinks
  }), null);
});

test('crew listing for vessel A omits vessel B profiles', () => {
  const assignments = [
    { crewId: 'crew-a', vesselId: 'vessel-a', removedAt: null },
    { crewId: 'crew-b', vesselId: 'vessel-b', removedAt: null }
  ];
  assert.equal(crewVisibleToVessel('crew-a', 'vessel-a', assignments), true);
  assert.equal(crewVisibleToVessel('crew-b', 'vessel-a', assignments), false);
});

test('stale crew update returns conflict without an unguarded write', async () => {
  const queries = [];
  const route = createTrainingRoute({
    database: () => ({ query: async (statement, params) => {
      queries.push([statement, params]);
      if (statement.startsWith('UPDATE training_crew')) return [];
      return [];
    } }),
    loginFromRequest: () => 'primoxy-dev'
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'crew.update', id: '3bf79fc8-30f0-43ac-93fb-d635da1a43a6', version: 1,
      data: { displayName: 'Fictional B', rank: 'Master' }
    })
  }));
  assert.equal(response.status, 409);
  assert.ok(queries.some(([statement]) => /WHERE c\.id=\$5 AND c\.version=\$6/.test(statement)));
});

test('officer crew listing uses vessel filter', async () => {
  const calls = [];
  const route = createTrainingRoute({
    database: () => ({ query: async (statement, params) => {
      calls.push([statement, params]);
      return [];
    } }),
    loginFromRequest: () => 'officer',
    readTrainingGrant: async () => ({ role: 'officer', vesselIds: ['vessel-a'] })
  });
  const response = await route(new Request('https://example.test/api/training?action=crew.list&vesselId=vessel-a'));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1][0], 'vessel-a');
  assert.match(calls[0][0], /training_crew_assignments/);
});

test('crew detail requires an assignment in the requested vessel', async () => {
  const crewId = '3bf79fc8-30f0-43ac-93fb-d635da1a43a6';
  const calls = [];
  const route = createTrainingRoute({
    database: () => ({ query: async (statement, params) => {
      calls.push([statement, params]);
      return [];
    } }),
    loginFromRequest: () => 'officer',
    readTrainingGrant: async () => ({ role: 'officer', vesselIds: ['vessel-a'] })
  });
  const response = await route(new Request(`https://example.test/api/training?action=crew.get&vesselId=vessel-a&id=${crewId}`));
  assert.equal(response.status, 404);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /training_crew_assignments/);
  assert.deepEqual(calls[0][1], [crewId, 'vessel-a']);
});

test('scoped coordinator update checks crew membership in the vessel', async () => {
  const calls = [];
  const route = createTrainingRoute({
    database: () => ({ query: async (statement, params) => { calls.push([statement, params]); return []; } }),
    loginFromRequest: () => 'shore',
    readTrainingGrant: async () => ({ role: 'coordinator', vesselIds: ['vessel-a'] })
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test' },
    body: JSON.stringify({ action: 'crew.update', vesselId: 'vessel-a',
      id: '3bf79fc8-30f0-43ac-93fb-d635da1a43a6', version: 1,
      data: { displayName: 'Fictional B', rank: 'Master' } })
  }));
  assert.equal(response.status, 409);
  assert.match(calls[0][0], /training_crew_assignments/);
  assert.ok(calls[0][1].includes('vessel-a'));
});

test('scoped coordinator cannot link or unlink crew outside the vessel', async () => {
  const statements = [];
  const route = createTrainingRoute({
    database: () => ({ query: async (statement, params) => {
      statements.push([statement, params]);
      return [];
    } }),
    loginFromRequest: () => 'shore',
    readTrainingGrant: async () => ({ role: 'coordinator', vesselIds: ['vessel-a'] })
  });
  const send = body => route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test' }, body: JSON.stringify(body)
  }));
  const link = await send({ action: 'crew.link', vesselId: 'vessel-a',
    crewId: '3bf79fc8-30f0-43ac-93fb-d635da1a43a6',
    operationPersonId: '549b297e-03f6-4115-97dc-22b24af04ba1', reason: 'Reviewed' });
  assert.equal(link.status, 403);
  assert.equal(statements.some(([sql]) => sql.includes('INSERT INTO training_crew_job_links')), false);
  statements.length = 0;
  const unlink = await send({ action: 'crew.unlink', vesselId: 'vessel-a',
    id: '61aa8484-1454-4ca4-abfc-dc9e9116a492', version: 1, reason: 'Correction' });
  assert.equal(unlink.status, 409);
  assert.match(statements[0][0], /training_crew_assignments/);
  assert.equal(statements[0][1].includes('vessel-a'), true);
});

