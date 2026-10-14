import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainingRoute } from '../api/training.mjs';
import { detectTrainingConflicts } from '../lib/training/schedule.mjs';

const vesselId = '13f6ce1c-4316-41c7-aa2f-4194a7bc65a6';
const crewId = '3bf79fc8-30f0-43ac-93fb-d635da1a43a6';
const request = (body) => new Request('https://example.test/api/training', {
  method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

test('owner can create a fictional vessel', async () => {
  const calls = [];
  const route = createTrainingRoute({
    database: () => ({ query: async (statement, params) => {
      calls.push([statement, params]);
      return [{ id: vesselId, name: 'MT Fictional' }];
    } }),
    loginFromRequest: () => 'primoxy-dev'
  });
  const response = await route(request({ action: 'vessels.create', data: { name: 'MT Fictional', vesselType: 'Tanker' } }));
  assert.equal(response.status, 201);
  assert.ok(calls.some(([statement]) => statement.includes('INSERT INTO training_vessels')));
});

test('an explicit available block removes unknown availability', () => {
  const result = detectTrainingConflicts({
    session: { startsAt: '2026-10-15T09:00:00+07:00', endsAt: '2026-10-15T12:00:00+07:00',
      displayZone: 'Asia/Bangkok', capacity: 5 },
    crewIds: [crewId],
    availability: [{ crewId, kind: 'available', startsAt: '2026-10-15T00:00:00+07:00',
      endsAt: '2026-10-16T00:00:00+07:00' }],
    assignments: [{ crewId, joinsOn: '2026-10-20' }]
  });
  assert.equal(result.hard.length, 0);
  assert.equal(result.unknown.length, 0);
});

test('a duty block outside the session does not prove free time', () => {
  const result = detectTrainingConflicts({
    session: { startsAt: '2026-10-15T09:00:00+07:00', endsAt: '2026-10-15T12:00:00+07:00',
      displayZone: 'Asia/Bangkok', capacity: 5 },
    crewIds: [crewId],
    availability: [{ crewId, kind: 'duty', startsAt: '2026-10-14T09:00:00+07:00',
      endsAt: '2026-10-14T12:00:00+07:00' }],
    assignments: [{ crewId, joinsOn: '2026-10-20' }]
  });
  assert.ok(result.unknown.some(item => item.type === 'availability'));
});

test('officer cannot set availability for an unassigned crew', async () => {
  const route = createTrainingRoute({
    database: () => ({ query: async () => [] }),
    loginFromRequest: () => 'officer',
    readTrainingGrant: async () => ({ role: 'officer', vesselIds: [vesselId] })
  });
  const response = await route(request({ action: 'availability.set', vesselId,
    crewId, data: { kind: 'available', startsAt: '2026-10-15T00:00:00+07:00',
      endsAt: '2026-10-16T00:00:00+07:00', source: 'Officer verified' } }));
  assert.equal(response.status, 403);
});

