import { neon } from '@neondatabase/serverless';

export const OWNER = 'primoxy-dev';
export const JOB_STATUSES = ['Draft', 'Planned', 'Confirmed', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
export const SERVICE_STATUSES = ['Not Started', 'In Progress', 'Waiting', 'Completed', 'Cancelled'];
export const SERVICE_TYPES = ['Port Clearance', 'Crew Change', 'Fresh Water', 'Garbage', 'CTM', 'Provisions', 'Launch Boat', 'Transport', 'Spare Parts/Customs', 'Medical', 'Inspection/Technical Visit', 'Other'];
export const PERSON_KINDS = ['crew', 'visitor'];
export const TRIP_KINDS = ['car', 'boat'];
export const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
export const textField = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const isDate = value => !value || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value)));
export function db() {
  if (!process.env.DATABASE_URL) throw Error('Operations database is not configured');
  return neon(process.env.DATABASE_URL);
}
export async function permission(login, sql = db()) {
  if (!login) return null;
  if (login === OWNER) return { role: 'owner', crewView: true, crewEdit: true, visitorView: true, visitorEdit: true };
  const [row] = await sql.query('SELECT role, crew_view, crew_edit, visitor_view, visitor_edit FROM operation_grants WHERE login=$1', [login]);
  if (!row) return null;
  return { role: row.role, crewView: row.crew_view || row.crew_edit, crewEdit: row.crew_edit, visitorView: row.visitor_view || row.visitor_edit, visitorEdit: row.visitor_edit };
}
export function validateJob(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Invalid Job';
  if (!JOB_STATUSES.includes(data.status)) return 'Invalid Job status';
  if (data.status !== 'Draft' && (!textField(data.vessel) || !textField(data.port) || !data.eta)) return 'Vessel, port and ETA are required';
  if (['Confirmed', 'In Progress', 'On Hold', 'Completed'].includes(data.status) &&
    (!textField(data.jobNo) || !textField(data.principal) || !textField(data.pic))) return 'Job No., principal and Job PIC are required';
  if (!isDate(data.eta) || !isDate(data.etd)) return 'Invalid date/time';
  if (data.eta && data.etd && Date.parse(data.etd) < Date.parse(data.eta)) return 'ETD must not precede ETA';
  if (data.jobNo && !/^[A-Za-z0-9][A-Za-z0-9 _./-]{0,79}$/.test(data.jobNo)) return 'Invalid Job No.';
  return null;
}
export function validateService(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Invalid Service';
  if (!SERVICE_TYPES.includes(data.type)) return 'Invalid Service type';
  if (!SERVICE_STATUSES.includes(data.status)) return 'Invalid Service status';
  if (!isDate(data.plannedStart) || !isDate(data.plannedEnd) || !isDate(data.actualStart) || !isDate(data.actualEnd)) return 'Invalid date/time';
  if (data.planConfirmed && data.terminalCondition !== 'Allowed' && !textField(data.terminalConfirmation) && !textField(data.restrictionReason)) return 'Terminal confirmation or reason required before plan confirmation';
  if (data.actualStart && data.terminalCondition !== 'Allowed' && !textField(data.terminalConfirmation) && !textField(data.restrictionReason)) return 'Terminal confirmation or reason required before work starts';
  return null;
}
export function fieldConflicts(current, base, patch) {
  return Object.keys(patch).flatMap(key => {
    if (key === 'details' && patch.details && typeof patch.details === 'object' && !Array.isArray(patch.details)) {
      return Object.keys(patch.details).filter(name => JSON.stringify(current.details?.[name] ?? null) !== JSON.stringify(base.details?.[name] ?? null))
        .map(name => ({ field: `details.${name}`, original: base.details?.[name] ?? null, shared: current.details?.[name] ?? null, local: patch.details[name] ?? null }));
    }
    return JSON.stringify(current[key] ?? null) === JSON.stringify(base[key] ?? null) ? [] :
      [{ field: key, original: base[key] ?? null, shared: current[key] ?? null, local: patch[key] ?? null }];
  });
}
export function canEditJob(grant, login, job) {
  return grant?.role === 'owner' || grant?.role === 'editor' && job?.data.pic === login;
}
export function canEditService(grant, login, job, service) {
  return canEditJob(grant, login, job) || grant?.role === 'editor' && service.data.pic === login;
}
export function canPeople(grant, kind, edit = false) {
  return Boolean(kind === 'crew' ? (edit ? grant?.crewEdit : grant?.crewView) : (edit ? grant?.visitorEdit : grant?.visitorView));
}

