const instant = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value || '') &&
  !Number.isNaN(Date.parse(value));

function localTime(value, zone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value));
  const item = key => parts.find(p => p.type === key)?.value;
  return `${item('year')}-${item('month')}-${item('day')}T${item('hour')}:${item('minute')}`;
}

export function validateSessionTime(session) {
  if (!instant(session?.startsAt) || !instant(session?.endsAt)) return 'Start and end need ISO 8601 offsets';
  if (Date.parse(session.endsAt) <= Date.parse(session.startsAt)) return 'Session end must follow start';
  if (!session.displayZone) return 'IANA display time zone is required';
  try {
    if (localTime(session.startsAt, session.displayZone) !== session.startsAt.slice(0, 16) ||
        localTime(session.endsAt, session.displayZone) !== session.endsAt.slice(0, 16))
      return 'Local time does not exist in the display zone or offset is incorrect';
  } catch { return 'Invalid display time zone'; }
  return null;
}

const transitions = {
  draft: new Set(['proposed', 'cancelled']),
  proposed: new Set(['draft', 'confirmed', 'cancelled']),
  confirmed: new Set(['proposed', 'completed', 'cancelled']),
  completed: new Set([]), cancelled: new Set([])
};
export function validateSessionTransition(from, to) {
  return Boolean(transitions[from]?.has(to));
}

const overlaps = (a, b) => Date.parse(a.startsAt) < Date.parse(b.endsAt) &&
  Date.parse(b.startsAt) < Date.parse(a.endsAt);
const day = value => String(value || '').slice(0, 10);

export function detectTrainingConflicts({
  session, crewIds = [], otherSessions = [], availability = [], prerequisites = [],
  assignments = [], enrolledCount = 0, capacity
}) {
  const invalid = validateSessionTime(session);
  if (invalid) return { hard: [{ type: 'time', detail: invalid }], unknown: [] };
  const hard = [], unknown = [];
  const limit = capacity ?? session.capacity;
  if (Number.isInteger(limit) && enrolledCount + crewIds.length > limit)
    hard.push({ type: 'capacity', detail: 'Session is full' });
  for (const crewId of new Set(crewIds)) {
    if (otherSessions.some(s => s.crewId === crewId && s.state !== 'cancelled' && overlaps(session, s)))
      hard.push({ type: 'overlap', crewId, detail: 'Another session overlaps' });
    const blocks = availability.filter(a => a.crewId === crewId);
    const verifiedFree = blocks.some(a => a.kind === 'available' &&
      Date.parse(a.startsAt) <= Date.parse(session.startsAt) &&
      Date.parse(a.endsAt) >= Date.parse(session.endsAt));
    if (!verifiedFree) unknown.push({ type: 'availability', crewId, detail: 'Duty and travel have not been verified for this session' });
    if (blocks.some(a => ['duty','travel','leave'].includes(a.kind) && overlaps(session, a)))
      hard.push({ type: 'availability', crewId, detail: 'Known duty, travel or leave overlaps' });
    if (prerequisites.some(p => p.crewId === crewId && p.satisfied === false))
      hard.push({ type: 'prerequisite', crewId, detail: 'Prerequisite is not satisfied' });
    const assignment = assignments.find(a => a.crewId === crewId);
    if (!assignment?.joinsOn) unknown.push({ type: 'joining', crewId, detail: 'Joining date has not been verified' });
    else if (day(assignment.joinsOn) === day(session.startsAt))
      hard.push({ type: 'joining', crewId, detail: 'Session falls on joining date' });
  }
  return { hard, unknown };
}

