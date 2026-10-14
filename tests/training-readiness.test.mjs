import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReadiness, verifiedDayAvailability } from '../lib/training/readiness.mjs';
import { createTrainingRoute } from '../api/training.mjs';

const base = {
  requirements: [{ crewId: 'crew-a', courseId: 'course-a', ruleId: 'rule-a', dueOn: '2026-10-20' }],
  results: [], certificates: [], waivers: [],
  availability: { verified: true }, onDate: '2026-10-15'
};
const passed = { crewId: 'crew-a', courseId: 'course-a', attendance: 'present', assessment: 'passed' };
const verified = { crewId: 'crew-a', courseId: 'course-a', reviewState: 'verified', expiresOn: '2026-12-31' };

test('booking, attendance-only, failed and pending evidence never produce ready', () => {
  assert.equal(calculateReadiness(base).status, 'not ready');
  assert.equal(calculateReadiness({ ...base, results: [{ ...passed, assessment: 'pending' }] }).status, 'not ready');
  assert.equal(calculateReadiness({ ...base, results: [{ ...passed, assessment: 'failed' }] }).status, 'not ready');
  assert.equal(calculateReadiness({ ...base, results: [passed], certificates: [{ ...verified, reviewState: 'pending' }] }).status, 'not ready');
  assert.equal(calculateReadiness({ ...base, results: [passed], certificates: [{ ...verified, expiresOn: '2026-10-14' }] }).status, 'not ready');
});

test('missing matrix or availability is cannot verify', () => {
  assert.equal(calculateReadiness({ ...base, requirements: [] }).status, 'cannot verify');
  assert.equal(calculateReadiness({ ...base, results: [passed], certificates: [verified], availability: { verified: false } }).status, 'cannot verify');
});

test('verified pass and certificate produce ready; waiver remains explicit', () => {
  assert.equal(calculateReadiness({ ...base, results: [passed], certificates: [verified] }).status, 'ready');
  const waiver = { crewId: 'crew-a', ruleId: 'rule-a', approvedBy: 'approver', expiresOn: '2026-10-15', reason: 'Trial' };
  const waived = calculateReadiness({ ...base, waivers: [waiver] });
  assert.equal(waived.status, 'ready');
  assert.ok(waived.reasons.some(r => r.type === 'waiver'));
  assert.equal(calculateReadiness({ ...base, waivers: [{ ...waiver, expiresOn: '2026-10-14' }] }).status, 'not ready');
});

test('a later failed correction supersedes an earlier pass', () => {
  const result = calculateReadiness({
    ...base,
    results: [
      { ...passed, enrollmentId: 'enrollment-a', version: 1 },
      { ...passed, enrollmentId: 'enrollment-a', version: 2, assessment: 'failed' }
    ],
    certificates: [verified]
  });
  assert.equal(result.status, 'not ready');
});

test('a one-hour availability block or overlapping duty cannot verify a full day', () => {
  const day = '2026-10-15';
  assert.equal(verifiedDayAvailability(day, [{ kind: 'available', starts_at: '2026-10-15T09:00:00Z',
    ends_at: '2026-10-15T10:00:00Z' }]), false);
  assert.equal(verifiedDayAvailability(day, [
    { kind: 'available', starts_at: '2026-10-15T00:00:00Z', ends_at: '2026-10-16T00:00:00Z' },
    { kind: 'duty', starts_at: '2026-10-15T08:00:00Z', ends_at: '2026-10-15T12:00:00Z' }
  ]), false);
  assert.equal(verifiedDayAvailability(day, [{ kind: 'available', starts_at: '2026-10-15T00:00:00Z',
    ends_at: '2026-10-16T00:00:00Z' }]), true);
});

test('recurrent training expires after the required number of calendar months', () => {
  const recurring = { ...base.requirements[0], recurrenceMonths: 6 };
  const oldPass = { ...passed, completedOn: '2026-03-31' };
  assert.equal(calculateReadiness({ ...base, requirements: [recurring], results: [oldPass],
    certificates: [verified] }).status, 'not ready');
  const recentPass = { ...passed, completedOn: '2026-04-30' };
  assert.equal(calculateReadiness({ ...base, requirements: [recurring], results: [recentPass],
    certificates: [verified] }).status, 'ready');
});

test('readiness query excludes cancelled sessions and removed enrollments', async () => {
  const crewId = '3bf79fc8-30f0-43ac-93fb-d635da1a43a6';
  const vesselId = '549b297e-03f6-4115-97dc-22b24af04ba1';
  const statements = [];
  const route = createTrainingRoute({
    database: () => ({ query: async statement => {
      statements.push(statement);
      if (statement.startsWith('SELECT id,rank FROM training_crew')) return [{ id: crewId, rank: 'Master' }];
      if (statement.startsWith('SELECT a.*,v.vessel_type'))
        return [{ crew_id: crewId, vessel_id: vesselId, joins_on: '2026-10-20', vessel_type: 'Tanker' }];
      return [];
    } }),
    loginFromRequest: () => 'primoxy-dev'
  });
  const response = await route(new Request(`https://example.test/api/training?action=readiness.get&crewId=${crewId}&vesselId=${vesselId}&onDate=2026-10-15`));
  assert.equal(response.status, 200);
  const outcomesSql = statements.find(statement => statement.includes('FROM training_outcomes o'));
  assert.match(outcomesSql, /e\.removed_at IS NULL/);
  assert.match(outcomesSql, /s\.removed_at IS NULL/);
  assert.match(outcomesSql, /s\.state IN \('confirmed','completed'\)/);
});

