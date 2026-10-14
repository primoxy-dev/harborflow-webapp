import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCourse, validateRule, deriveRequirements } from '../lib/training/matrix.mjs';
import { createTrainingRoute } from '../api/training.mjs';

test('course and rule require source fields and valid intervals', () => {
  assert.equal(validateCourse({ code: '', name: 'Safety', durationMinutes: 60, mode: 'onboard' }).error, 'Course code is required');
  assert.equal(validateCourse({ code: 'SAF-1', name: 'Safety', durationMinutes: 60, mode: 'onboard' }).error, null);
  assert.match(validateRule({
    courseId: 'course-1', effectiveFrom: '2026-10-15', effectiveUntil: '2026-10-15',
    source: 'Manual', ownerLogin: 'shore'
  }).error, /end/i);
});

test('approved rule applies at start and not at exclusive end, with rank and vessel scope', () => {
  const rules = [{
    id: 'rule-1', courseId: 'course-1', rank: 'Master', vesselType: 'Tanker',
    vesselId: 'vessel-a', effectiveFrom: '2026-10-01', effectiveUntil: '2026-11-01',
    state: 'approved', source: 'SMS 4', approvedBy: 'approver', version: 2,
    recurrenceMonths: 12
  }];
  const args = { crew: { id: 'crew-1', rank: 'Master' }, assignment: { vesselId: 'vessel-a', vesselType: 'Tanker' }, rules,
    courses: [{ id: 'course-1', code: 'SAF-1', name: 'Safety', prerequisites: ['INTRO'] }], waivers: [] };
  const start = deriveRequirements({ ...args, onDate: '2026-10-01' });
  assert.equal(start.length, 1);
  assert.equal(start[0].ruleId, 'rule-1');
  assert.equal(start[0].ruleVersion, 2);
  assert.equal(start[0].source, 'SMS 4');
  assert.deepEqual(start[0].prerequisites, ['INTRO']);
  assert.equal(deriveRequirements({ ...args, onDate: '2026-11-01' }).length, 0);
  assert.equal(deriveRequirements({ ...args, assignment: { vesselId: 'vessel-b', vesselType: 'Tanker' }, onDate: '2026-10-15' }).length, 0);
  assert.equal(deriveRequirements({ ...args, crew: { id: 'crew-1', rank: 'Officer' }, onDate: '2026-10-15' }).length, 0);
});

test('draft rules are excluded and approved waiver expires after its date', () => {
  const base = {
    crew: { id: 'crew-1', rank: 'Master' },
    assignment: { vesselId: 'vessel-a', vesselType: 'Tanker' },
    rules: [
      { id: 'draft', courseId: 'course-1', state: 'draft', effectiveFrom: '2026-01-01', source: 'Draft' },
      { id: 'approved', courseId: 'course-1', state: 'approved', effectiveFrom: '2026-01-01', source: 'SMS', version: 1 }
    ],
    courses: [{ id: 'course-1', code: 'SAF-1', name: 'Safety' }],
    waivers: [{ crewId: 'crew-1', ruleId: 'approved', expiresOn: '2026-10-15', approvedBy: 'approver', reason: 'Trial' }]
  };
  const current = deriveRequirements({ ...base, onDate: '2026-10-15' });
  assert.equal(current.length, 1);
  assert.equal(current[0].waiver?.reason, 'Trial');
  const expired = deriveRequirements({ ...base, onDate: '2026-10-16' });
  assert.equal(expired[0].waiver, null);
});

test('approver records source and version while approving a draft', async () => {
  const calls = [];
  const route = createTrainingRoute({
    database: () => ({ query: async (statement, params) => {
      calls.push([statement, params]);
      return [{ id: 'rule-1', state: 'approved', version: 2, source: 'SMS', approved_by: 'primoxy-dev' }];
    } }),
    loginFromRequest: () => 'primoxy-dev'
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'matrix.approve', id: '3bf79fc8-30f0-43ac-93fb-d635da1a43a6', version: 1 })
  }));
  assert.equal(response.status, 200);
  assert.ok(calls.some(([statement]) => statement.includes("state='approved'") && statement.includes('version=$')));
});

test('scoped coordinator cannot publish a global matrix draft', async () => {
  const route = createTrainingRoute({
    database: () => ({ query: () => { throw Error('No matrix write allowed'); } }),
    loginFromRequest: () => 'shore',
    readTrainingGrant: async () => ({ role: 'coordinator', vesselIds: ['vessel-a'] })
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test' },
    body: JSON.stringify({ action: 'matrix.draft', vesselId: 'vessel-a', data: {
      courseId: 'course-1', effectiveFrom: '2026-10-01', source: 'Trial SMS'
    } })
  }));
  assert.equal(response.status, 403);
});

