import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCrewProfile } from '../lib/training/crew.mjs';
import { validateCourse, validateRule, deriveRequirements } from '../lib/training/matrix.mjs';
import { detectTrainingConflicts } from '../lib/training/schedule.mjs';
import { validateOutcome } from '../lib/training/outcomes.mjs';
import { validateCertificateFile, certificatePath } from '../lib/training/documents.mjs';
import { calculateReadiness } from '../lib/training/readiness.mjs';
import { trainingAccess } from '../lib/training/access.mjs';

test('fictional shore-to-vessel flow reaches ready only after verified certificate', () => {
  const crewId = '3bf79fc8-30f0-43ac-93fb-d635da1a43a6';
  const vesselId = '13f6ce1c-4316-41c7-aa2f-4194a7bc65a6';
  const certificateId = '8f25a70d-50cf-48a4-9383-88a1d1adfd2d';
  const crew = validateCrewProfile({ displayName: 'Fictional Master', rank: 'Master' });
  const course = validateCourse({ code: 'SAF-1', name: 'Safety', durationMinutes: 120, mode: 'onboard' });
  const rule = validateRule({ courseId: 'course-1', rank: 'Master', vesselId,
    effectiveFrom: '2026-10-01', source: 'Trial SMS', ownerLogin: 'shore' });
  assert.equal(crew.error, null);
  assert.equal(course.error, null);
  assert.equal(rule.error, null);
  const requirements = deriveRequirements({
    crew: { id: crewId, rank: crew.value.rank },
    assignment: { vesselId, vesselType: 'Tanker', joinsOn: '2026-10-20' },
    rules: [{ ...rule.value, id: 'rule-1', state: 'approved', version: 2, approvedBy: 'approver' }],
    courses: [{ ...course.value, id: 'course-1' }], onDate: '2026-10-15'
  });
  assert.equal(requirements.length, 1);
  const conflicts = detectTrainingConflicts({
    session: { startsAt: '2026-10-15T09:00:00+07:00', endsAt: '2026-10-15T11:00:00+07:00',
      displayZone: 'Asia/Bangkok', capacity: 4 }, crewIds: [crewId],
    availability: [{ crewId, kind: 'available', startsAt: '2026-10-15T00:00:00+07:00',
      endsAt: '2026-10-16T00:00:00+07:00' }],
    assignments: [{ crewId, joinsOn: '2026-10-20' }]
  });
  assert.deepEqual(conflicts, { hard: [], unknown: [] });
  const recorded = validateOutcome({ attendance: 'present', assessment: 'passed',
    assessor: 'Fictional Officer', evidence: 'Onboard practical assessment' });
  assert.equal(recorded.error, null);
  assert.equal(validateCertificateFile({ name: 'Trial.pdf', type: 'application/pdf', size: 300 }), null);
  assert.match(certificatePath(crewId, certificateId, 'Trial.pdf'), /^Training\/Crew\//);
  const base = { requirements, results: [{ crewId, courseId: 'course-1', ...recorded.value }],
    availability: { verified: true }, onDate: '2026-10-15' };
  assert.equal(calculateReadiness({ ...base, certificates: [] }).status, 'not ready');
  assert.equal(calculateReadiness({ ...base, certificates: [{
    crewId, courseId: 'course-1', reviewState: 'verified', expiresOn: '2027-10-15'
  }] }).status, 'ready');
  assert.equal(trainingAccess({ login: 'officer', grant: { role: 'officer' },
    vesselIds: [vesselId], targetVesselId: 'vessel-b', action: 'readiness.get' }), false);
});

