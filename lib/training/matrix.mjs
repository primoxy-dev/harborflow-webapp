const clean = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

export function validateCourse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, error: 'Invalid course' };
  const code = clean(raw.code, 40).toUpperCase();
  const name = clean(raw.name, 160);
  if (!code) return { value: null, error: 'Course code is required' };
  if (!name) return { value: null, error: 'Course name is required' };
  if (!Number.isInteger(raw.durationMinutes) || raw.durationMinutes < 1 || raw.durationMinutes > 100000)
    return { value: null, error: 'Valid duration is required' };
  if (!['shore', 'onboard', 'online'].includes(raw.mode)) return { value: null, error: 'Invalid delivery mode' };
  const prerequisites = Array.isArray(raw.prerequisites)
    ? raw.prerequisites.filter(x => typeof x === 'string').map(x => clean(x, 40).toUpperCase()).filter(Boolean)
    : [];
  return { value: { code, name, durationMinutes: raw.durationMinutes, mode: raw.mode,
    prerequisites: [...new Set(prerequisites)], source: clean(raw.source, 300) }, error: null };
}

export function validateRule(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, error: 'Invalid matrix rule' };
  if (!clean(raw.courseId)) return { value: null, error: 'Course is required' };
  if (!date(raw.effectiveFrom)) return { value: null, error: 'Valid start date is required' };
  if (raw.effectiveUntil && (!date(raw.effectiveUntil) || raw.effectiveUntil <= raw.effectiveFrom))
    return { value: null, error: 'End date must follow start date' };
  if (!clean(raw.source)) return { value: null, error: 'Rule source is required' };
  if (!clean(raw.ownerLogin)) return { value: null, error: 'Rule owner is required' };
  if (raw.recurrenceMonths != null && (!Number.isInteger(raw.recurrenceMonths) || raw.recurrenceMonths < 1))
    return { value: null, error: 'Invalid recurrence' };
  const days = raw.dueDaysBeforeJoin ?? 0;
  if (!Number.isInteger(days) || days < 0 || days > 3650) return { value: null, error: 'Invalid due interval' };
  return { value: {
    courseId: raw.courseId, rank: clean(raw.rank, 100) || null,
    vesselType: clean(raw.vesselType, 100) || null, vesselId: clean(raw.vesselId) || null,
    effectiveFrom: raw.effectiveFrom, effectiveUntil: raw.effectiveUntil || null,
    recurrenceMonths: raw.recurrenceMonths ?? null, dueDaysBeforeJoin: days,
    source: clean(raw.source, 300), ownerLogin: clean(raw.ownerLogin, 39)
  }, error: null };
}

function dueDate(joinDate, daysBefore) {
  if (!date(joinDate)) return null;
  const d = new Date(joinDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - daysBefore);
  return d.toISOString().slice(0, 10);
}

export function deriveRequirements({ crew, assignment, rules = [], courses = [], onDate, waivers = [] }) {
  if (!date(onDate)) throw Error('Valid selected date is required');
  const catalog = new Map(courses.map(course => [course.id, course]));
  return rules.filter(rule =>
    rule.state === 'approved' &&
    rule.effectiveFrom <= onDate && (!rule.effectiveUntil || onDate < rule.effectiveUntil) &&
    (!rule.rank || rule.rank.toLowerCase() === String(assignment?.rank || crew?.rank || '').toLowerCase()) &&
    (!rule.vesselType || rule.vesselType.toLowerCase() === String(assignment?.vesselType || '').toLowerCase()) &&
    (!rule.vesselId || rule.vesselId === assignment?.vesselId) &&
    catalog.has(rule.courseId)
  ).map(rule => {
    const course = catalog.get(rule.courseId);
    const waiver = waivers.find(item =>
      item.crewId === crew?.id && item.ruleId === rule.id && item.approvedBy &&
      !item.revokedAt && item.expiresOn >= onDate
    ) || null;
    return {
      crewId: crew?.id, courseId: course.id, courseCode: course.code,
      courseName: course.name, prerequisites: course.prerequisites || [],
      ruleId: rule.id, ruleVersion: rule.version, source: rule.source,
      approvedBy: rule.approvedBy, recurrenceMonths: rule.recurrenceMonths ?? null,
      dueOn: dueDate(assignment?.joinsOn, rule.dueDaysBeforeJoin || 0), waiver
    };
  });
}

