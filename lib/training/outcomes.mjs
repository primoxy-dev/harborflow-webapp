const clean = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function outcomePassed(value) {
  return value?.attendance === 'present' && value?.assessment === 'passed';
}

export function validateOutcome(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: null, error: 'Invalid outcome' };
  if (!['pending','present','absent'].includes(raw.attendance)) return { value: null, error: 'Invalid attendance' };
  if (!['pending','passed','failed'].includes(raw.assessment)) return { value: null, error: 'Invalid assessment' };
  if (raw.assessment === 'passed' && raw.attendance !== 'present')
    return { value: null, error: 'Passing requires attendance' };
  const assessor = clean(raw.assessor, 100);
  if (!assessor) return { value: null, error: 'Assessor is required' };
  const evidence = clean(raw.evidence, 1000);
  if (raw.assessment !== 'pending' && !evidence) return { value: null, error: 'Evidence note is required' };
  return { value: { attendance: raw.attendance, assessment: raw.assessment, assessor, evidence }, error: null };
}

export function validateCorrection({ version, currentVersion, reason }) {
  if (!clean(reason)) return 'Correction reason is required';
  if (!Number.isInteger(version) || version !== currentVersion) return 'Outcome version changed; reload';
  return null;
}

