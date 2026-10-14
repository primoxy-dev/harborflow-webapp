const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function validateCrewProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, error: 'Invalid crew profile' };
  const displayName = clean(raw.displayName, 160);
  const rank = clean(raw.rank, 100);
  if (!displayName) return { value: null, error: 'Display name is required' };
  if (!rank) return { value: null, error: 'Rank is required' };
  return {
    value: { displayName, rank, department: clean(raw.department, 100), active: raw.active !== false },
    error: null
  };
}

export function validateCrewLink({ crewId, operationPersonId, personKind, existingLinks = [] }) {
  if (!crewId || !operationPersonId) return 'Crew and Operation person are required';
  if (personKind !== 'crew') return 'Only an Operation crew person can be linked';
  if (existingLinks.some(link =>
    (link.operationPersonId ?? link.operation_person_id) === operationPersonId &&
    !(link.removedAt ?? link.removed_at)
  )) return 'Operation person is already linked to a training crew profile';
  return null;
}

export function crewVisibleToVessel(crewId, vesselId, assignments = []) {
  return Boolean(vesselId && assignments.some(item =>
    (item.crewId ?? item.crew_id) === crewId &&
    (item.vesselId ?? item.vessel_id) === vesselId &&
    !(item.removedAt ?? item.removed_at)
  ));
}

