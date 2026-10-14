import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTrainingConflicts, validateSessionTransition, validateSessionTime } from '../lib/training/schedule.mjs';
import { createTrainingRoute } from '../api/training.mjs';

const session = {
  startsAt: '2026-10-15T09:00:00+07:00', endsAt: '2026-10-15T12:00:00+07:00',
  displayZone: 'Asia/Bangkok', courseId: 'course-1', capacity: 2
};

test('overlap, capacity, missing prerequisite and duty are hard conflicts', () => {
  const result = detectTrainingConflicts({
    session, crewIds: ['crew-a'], enrolledCount: 2,
    otherSessions: [{ crewId: 'crew-a', startsAt: '2026-10-15T10:00:00+07:00', endsAt: '2026-10-15T11:00:00+07:00' }],
    availability: [{ crewId: 'crew-a', kind: 'duty', startsAt: '2026-10-15T08:00:00+07:00', endsAt: '2026-10-15T10:00:00+07:00' }],
    prerequisites: [{ crewId: 'crew-a', courseId: 'intro', satisfied: false }],
    assignments: [{ crewId: 'crew-a', joinsOn: '2026-10-20' }]
  });
  assert.deepEqual(new Set(result.hard.map(c => c.type)), new Set(['capacity','overlap','availability','prerequisite']));
});

test('missing duty and joining information require verification', () => {
  const result = detectTrainingConflicts({
    session, crewIds: ['crew-a'], otherSessions: [],
    availability: [], prerequisites: [], assignments: []
  });
  assert.equal(result.hard.length, 0);
  assert.ok(result.unknown.some(c => c.type === 'availability'));
  assert.ok(result.unknown.some(c => c.type === 'joining'));
});

test('joining date and travel block collide with session', () => {
  const result = detectTrainingConflicts({
    session, crewIds: ['crew-a'],
    availability: [{ crewId: 'crew-a', kind: 'travel', startsAt: '2026-10-15T08:00:00+07:00', endsAt: '2026-10-15T10:00:00+07:00' }],
    assignments: [{ crewId: 'crew-a', joinsOn: '2026-10-15' }]
  });
  assert.ok(result.hard.some(c => c.type === 'joining'));
  assert.ok(result.hard.some(c => c.type === 'availability'));
});

test('session time validates zone round trip and rejects DST gap', () => {
  assert.equal(validateSessionTime(session), null);
  assert.match(validateSessionTime({
    startsAt: '2026-03-08T02:30:00-05:00', endsAt: '2026-03-08T04:00:00-04:00',
    displayZone: 'America/New_York'
  }), /local time/i);
});

test('confirmed session can propose change but not silently update', () => {
  assert.equal(validateSessionTransition('draft', 'proposed'), true);
  assert.equal(validateSessionTransition('proposed', 'confirmed'), true);
  assert.equal(validateSessionTransition('confirmed', 'proposed'), true);
  assert.equal(validateSessionTransition('confirmed', 'draft'), false);
  assert.equal(validateSessionTransition('cancelled', 'confirmed'), false);
});

test('proposal carries old times and affected crew with version guard', async () => {
  const calls = [];
  const sessionId = '3bf79fc8-30f0-43ac-93fb-d635da1a43a6';
  const vesselId = '13f6ce1c-4316-41c7-aa2f-4194a7bc65a6';
  const route = createTrainingRoute({
    database: () => ({ query: async (statement, params) => {
      calls.push([statement, params]);
      if (statement.startsWith('SELECT * FROM training_sessions')) return [{
        id: sessionId, vessel_id: vesselId, version: 4, state: 'confirmed',
        starts_at: '2026-10-15T02:00:00Z', ends_at: '2026-10-15T05:00:00Z',
        display_zone: 'Asia/Bangkok', instructor: 'Test Instructor', venue: 'Test Room'
      }];
      if (statement.includes('FROM training_enrollments')) return [{ crew_id: 'crew-a' }];
      if (statement.includes('UPDATE training_sessions')) return [{ id: sessionId, state: 'proposed', version: 5 }];
      return [];
    } }),
    loginFromRequest: () => 'primoxy-dev'
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'sessions.propose', id: sessionId, version: 4, vesselId,
      data: { ...session, startsAt: '2026-10-16T09:00:00+07:00', endsAt: '2026-10-16T12:00:00+07:00' } })
  }));
  assert.equal(response.status, 200);
  const update = calls.find(([statement]) => statement.includes('UPDATE training_sessions'));
  assert.ok(update);
  assert.ok(JSON.stringify(update[1]).includes('crew-a'));
  assert.ok(JSON.stringify(update[1]).includes('2026-10-15'));
  assert.ok(JSON.stringify(update[1]).includes('2026-10-16T09:00:00+07:00'));
  assert.ok(update[0].includes('version=$'));
});

test('confirm blocks when an enrolled crew lacks a course prerequisite', async () => {
  const sessionId = '3bf79fc8-30f0-43ac-93fb-d635da1a43a6';
  const vesselId = '13f6ce1c-4316-41c7-aa2f-4194a7bc65a6';
  const next = { startsAt: '2026-10-15T09:00:00+07:00', endsAt: '2026-10-15T12:00:00+07:00',
    displayZone: 'Asia/Bangkok', instructor: 'Officer', venue: 'Training Room' };
  const route = createTrainingRoute({
    database: () => ({ query: async statement => {
      if (statement.startsWith('SELECT * FROM training_sessions')) return [{
        id: sessionId, vessel_id: vesselId, course_id: 'course-1', version: 2,
        state: 'proposed', capacity: 4, proposed_change: { next }
      }];
      if (statement.includes('FROM training_enrollments WHERE session_id=')) return [{ crew_id: 'crew-a' }];
      if (statement.includes('FROM training_enrollments e')) return [];
      if (statement.includes('FROM training_availability')) return [{
        crew_id: 'crew-a', kind: 'available', starts_at: '2026-10-15T00:00:00+07:00',
        ends_at: '2026-10-16T00:00:00+07:00'
      }];
      if (statement.includes('FROM training_crew_assignments')) return [{ crew_id: 'crew-a', joins_on: '2026-10-20' }];
      if (statement.includes('SELECT prerequisites FROM training_courses')) return [{ prerequisites: ['INTRO'] }];
      if (statement.includes('FROM training_outcomes')) return [];
      throw Error('Session must not be confirmed');
    } }),
    loginFromRequest: () => 'primoxy-dev'
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test' },
    body: JSON.stringify({ action: 'sessions.confirm', id: sessionId, version: 2, vesselId })
  }));
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.ok(body.conflicts.hard.some(item => item.type === 'prerequisite'));
});

test('confirmed session cannot be edited directly', async () => {
  const sessionId = '3bf79fc8-30f0-43ac-93fb-d635da1a43a6';
  const route = createTrainingRoute({
    database: () => ({ query: async statement => {
      if (statement.startsWith('SELECT * FROM training_sessions')) return [{ id: sessionId, state: 'confirmed', version: 3 }];
      throw Error('Confirmed session must not be updated');
    } }),
    loginFromRequest: () => 'primoxy-dev'
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test' },
    body: JSON.stringify({ action: 'sessions.update', id: sessionId, version: 3,
      data: { ...session } })
  }));
  assert.equal(response.status, 409);
});

