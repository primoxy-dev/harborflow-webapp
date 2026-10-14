export const TRAINING_OWNER = 'primoxy-dev';

const READ = new Set([
  'overview.get', 'crew.list', 'crew.get', 'vessels.list', 'courses.list',
  'matrix.list', 'requirements.list', 'sessions.list', 'enrollments.list',
  'outcomes.list', 'certificates.list', 'readiness.get', 'availability.list'
]);
const DOWNLOAD = new Set(['certificates.download']);
const COORDINATE = new Set([
  'crew.create', 'crew.update', 'crew.link', 'crew.unlink',
  'vessels.create', 'vessels.update', 'assignments.create', 'assignments.update',
  'courses.create', 'courses.update', 'matrix.draft',
  'sessions.create', 'sessions.update', 'sessions.propose', 'sessions.cancel',
  'enrollments.add', 'enrollments.remove', 'availability.set',
  'outcomes.record', 'outcomes.correct', 'certificates.upload'
]);
const APPROVE = new Set([
  'matrix.approve', 'waivers.approve', 'sessions.confirm', 'certificates.review'
]);
const OFFICER_WRITE = new Set([
  'sessions.create', 'sessions.propose', 'outcomes.record',
  'outcomes.correct', 'certificates.upload', 'availability.set'
]);
const OWNER_ONLY = new Set(['grants.list','grants.set','grants.revoke','officers.assign','officers.remove']);

export function trainingAccess({ login, grant, vesselIds = [], action, targetVesselId } = {}) {
  if (!login || typeof action !== 'string') return false;
  const known = READ.has(action) || DOWNLOAD.has(action) || COORDINATE.has(action) || APPROVE.has(action) || OWNER_ONLY.has(action);
  if (!known) return false;
  if (login === TRAINING_OWNER) return true;
  const role = grant?.role;
  if (!['viewer', 'coordinator', 'approver', 'officer'].includes(role)) return false;
  const scope = targetVesselId || null;
  const assignments = Array.isArray(vesselIds) ? vesselIds : grant?.vesselIds || [];
  if (role === 'officer') {
    if (action === 'vessels.list' && !scope) return true;
    if (!scope || !assignments.includes(scope)) return false;
    return READ.has(action) || DOWNLOAD.has(action) || OFFICER_WRITE.has(action);
  }
  if (role === 'viewer') {
    if (action === 'vessels.list' && !scope) return true;
    return Boolean(scope && assignments.includes(scope) && READ.has(action));
  }
  if (grant?.vesselIds?.length && (!scope || !grant.vesselIds.includes(scope))) return false;
  if (role === 'coordinator') return READ.has(action) || DOWNLOAD.has(action) || COORDINATE.has(action);
  return READ.has(action) || DOWNLOAD.has(action) || APPROVE.has(action);
}

