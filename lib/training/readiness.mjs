import { outcomePassed } from './outcomes.mjs';

const isoDay = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
const field = (row, camel, snake) => row?.[camel] ?? row?.[snake];

export function calculateReadiness({
  requirements = [], results = [], certificates = [], waivers = [],
  availability, onDate
}) {
  const reasons = [];
  const latestResults = [...results].filter(result => {
    const enrollmentId = field(result, 'enrollmentId', 'enrollment_id');
    if (!enrollmentId) return true;
    return !results.some(other =>
      other !== result && field(other, 'enrollmentId', 'enrollment_id') === enrollmentId &&
      Number(other.version || 1) > Number(result.version || 1)
    );
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate || '')) throw Error('Selected date is required');
  if (!requirements.length) reasons.push({ type: 'matrix', detail: 'No approved training matrix coverage' });
  if (availability?.verified !== true) reasons.push({ type: 'availability', detail: 'Duty and joining availability must be verified' });
  for (const requirement of requirements) {
    const crewId = field(requirement, 'crewId', 'crew_id');
    const courseId = field(requirement, 'courseId', 'course_id');
    const ruleId = field(requirement, 'ruleId', 'rule_id');
    const waiver = waivers.find(item =>
      field(item, 'crewId', 'crew_id') === crewId &&
      field(item, 'ruleId', 'rule_id') === ruleId &&
      field(item, 'approvedBy', 'approved_by') &&
      !field(item, 'revokedAt', 'revoked_at') &&
      isoDay(field(item, 'expiresOn', 'expires_on')) >= onDate
    ) || requirement.waiver;
    if (waiver && isoDay(field(waiver, 'expiresOn', 'expires_on')) >= onDate) {
      reasons.push({ type: 'waiver', ruleId, courseId, detail: 'Approved temporary waiver',
        expiresOn: isoDay(field(waiver, 'expiresOn', 'expires_on')) });
      continue;
    }
    const pass = latestResults.some(result =>
      field(result, 'crewId', 'crew_id') === crewId &&
      field(result, 'courseId', 'course_id') === courseId && outcomePassed(result)
    );
    if (!pass) reasons.push({ type: 'result', ruleId, courseId, detail: 'Passing assessment is missing' });
    const certificate = certificates.some(item =>
      field(item, 'crewId', 'crew_id') === crewId &&
      field(item, 'courseId', 'course_id') === courseId &&
      field(item, 'reviewState', 'review_state') === 'verified' &&
      !['replaced','rejected'].includes(field(item, 'reviewState', 'review_state')) &&
      (!field(item, 'expiresOn', 'expires_on') || isoDay(field(item, 'expiresOn', 'expires_on')) >= onDate)
    );
    if (!certificate) reasons.push({ type: 'certificate', ruleId, courseId, detail: 'Verified current certificate is missing' });
    if (requirement.dueOn && requirement.dueOn < onDate && (!pass || !certificate))
      reasons.push({ type: 'overdue', ruleId, courseId, detail: 'Requirement is overdue' });
  }
  const unknown = reasons.some(reason => ['matrix','availability'].includes(reason.type));
  return { status: unknown ? 'cannot verify' : reasons.some(reason => reason.type !== 'waiver') ? 'not ready' : 'ready', reasons };
}

