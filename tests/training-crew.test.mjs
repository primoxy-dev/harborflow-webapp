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
  assert.ok(queries.some(([statement]) => statement.includes('WHERE id=$') && statement.includes('version=')));
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

