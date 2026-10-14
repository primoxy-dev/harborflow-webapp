import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOutcome, outcomePassed, validateCorrection } from '../lib/training/outcomes.mjs';
import { createTrainingRoute } from '../api/training.mjs';

test('attendance and assessment are separate facts', () => {
  assert.equal(outcomePassed({ attendance: 'present', assessment: 'pending' }), false);
  assert.equal(outcomePassed({ attendance: 'absent', assessment: 'passed' }), false);
  assert.equal(outcomePassed({ attendance: 'present', assessment: 'failed' }), false);
  assert.equal(outcomePassed({ attendance: 'present', assessment: 'passed' }), true);
});

test('recorded assessment requires assessor and evidence note', () => {
  assert.equal(validateOutcome({ attendance: 'present', assessment: 'passed', assessor: '' }).error, 'Assessor is required');
  assert.equal(validateOutcome({ attendance: 'present', assessment: 'passed', assessor: 'Officer', evidence: '' }).error, 'Evidence note is required');
  assert.equal(validateOutcome({ attendance: 'present', assessment: 'pending', assessor: 'Officer' }).error, null);
});

test('correction requires reason and a newer version', () => {
  assert.match(validateCorrection({ version: 1, reason: '', currentVersion: 1 }), /reason/i);
  assert.match(validateCorrection({ version: 1, reason: 'Correct typo', currentVersion: 2 }), /version/i);
  assert.equal(validateCorrection({ version: 2, reason: 'Correct typo', currentVersion: 2 }), null);
});

test('officer cannot record outcome for unrelated vessel', async () => {
  const route = createTrainingRoute({
    database: () => ({ query: () => { throw Error('records must not be queried'); } }),
    loginFromRequest: () => 'officer',
    readTrainingGrant: async () => ({ role: 'officer', vesselIds: ['vessel-a'] })
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test' },
    body: JSON.stringify({ action: 'outcomes.record', vesselId: 'vessel-b' })
  }));
  assert.equal(response.status, 403);
});

test('cancelled session cannot receive an outcome', async () => {
  const sessionId = '3bf79fc8-30f0-43ac-93fb-d635da1a43a6';
  const enrollmentId = '8f25a70d-50cf-48a4-9383-88a1d1adfd2d';
  const route = createTrainingRoute({
    database: () => ({ query: async statement => {
      if (statement.includes('FROM training_enrollments e')) return [{
        id: enrollmentId, session_id: sessionId, vessel_id: null, state: 'cancelled'
      }];
      throw Error('Must not insert outcome');
    } }),
    loginFromRequest: () => 'primoxy-dev'
  });
  const response = await route(new Request('https://example.test/api/training', {
    method: 'POST', headers: { origin: 'https://example.test' },
    body: JSON.stringify({ action: 'outcomes.record', enrollmentId,
      data: { attendance: 'present', assessment: 'passed', assessor: 'Officer', evidence: 'Trial record' } })
  }));
  assert.equal(response.status, 409);
});

