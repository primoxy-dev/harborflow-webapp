import { nodeHandler, json, sameOrigin, sessionLogin, gh, putFile } from '../lib/harborflow.mjs';
import { TRAINING_OWNER, trainingAccess } from '../lib/training/access.mjs';
import { validateCrewProfile, validateCrewLink } from '../lib/training/crew.mjs';
import { validateCourse, validateRule, deriveRequirements } from '../lib/training/matrix.mjs';
import { detectTrainingConflicts, validateSessionTime, validateSessionTransition } from '../lib/training/schedule.mjs';
import { validateOutcome, validateCorrection } from '../lib/training/outcomes.mjs';
import { certificatePath, validateCertificateFile, validateCertificateBytes } from '../lib/training/documents.mjs';
import { calculateReadiness } from '../lib/training/readiness.mjs';
import { randomUUID } from 'node:crypto';

const error = (message, status) => json({ error: message }, status);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const dateString = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
const defaultDocumentStore = {
  async put(path, bytes) {
    const result = await putFile(path, bytes, 'Upload fictional training certificate');
    return result.content?.sha;
  },
  async get(path) {
    const file = await gh('GET', path);
    return file?.content ? Buffer.from(file.content.replace(/\s/g, ''), 'base64') : null;
  },
  async remove(path, sha) {
    if (sha) await gh('DELETE', path, { message: 'Undo incomplete training certificate upload', sha });
  }
};

async function defaultDatabase() {
  if (!process.env.DATABASE_URL) throw Error('Training database is not configured');
  const { neon } = await import('@neondatabase/serverless');
  return neon(process.env.DATABASE_URL);
}

async function defaultTrainingGrant(login, sql) {
  if (login === TRAINING_OWNER) return { role: 'owner', vesselIds: [] };
  const [grant] = await sql.query(
    'SELECT role FROM training_grants WHERE login=$1 AND revoked_at IS NULL', [login]
  );
  if (!grant) return null;
  const assignments = await sql.query(
    'SELECT vessel_id FROM training_vessel_assignments WHERE officer_login=$1 AND removed_at IS NULL',
    [login]
  );
  return { role: grant.role, vesselIds: assignments.map(row => row.vessel_id) };
}

async function handleCrew({ action, input, vesselId, login, sql }) {
  if (action === 'crew.list') {
    const rows = vesselId
      ? await sql.query(`SELECT DISTINCT c.* FROM training_crew c
          JOIN training_crew_assignments a ON a.crew_id=c.id
          WHERE a.vessel_id=$1 AND a.removed_at IS NULL AND c.removed_at IS NULL
          ORDER BY c.display_name LIMIT 200`, [vesselId])
      : await sql.query('SELECT * FROM training_crew WHERE removed_at IS NULL ORDER BY display_name LIMIT 200');
    return json({ crew: rows });
  }
  if (action === 'crew.create') {
    const { value, error: invalid } = validateCrewProfile(input.data);
    if (invalid) return error(invalid, 400);
    const id = randomUUID();
    const [row] = await sql.query(`WITH created AS (
      INSERT INTO training_crew(id,display_name,rank,department,active,created_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'crew',id,'create',$6,to_jsonb(created) FROM created
    ) SELECT * FROM created`,
    [id, value.displayName, value.rank, value.department, value.active, login]);
    return json({ crew: row }, 201);
  }
  if (action === 'crew.update') {
    if (!uuid(input.id) || !Number.isInteger(input.version) || input.version < 1) return error('Invalid crew ID or version', 400);
    const { value, error: invalid } = validateCrewProfile(input.data);
    if (invalid) return error(invalid, 400);
    const [row] = await sql.query(`WITH updated AS (
      UPDATE training_crew SET display_name=$1,rank=$2,department=$3,active=$4,
        version=version+1,updated_at=now()
      WHERE id=$5 AND version=$6 AND removed_at IS NULL RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'crew',id,'update',$7,to_jsonb(updated) FROM updated
    ) SELECT * FROM updated`,
    [value.displayName, value.rank, value.department, value.active, input.id, input.version, login]);
    return row ? json({ crew: row }) : error('Concurrent change; reload crew profile', 409);
  }
  if (action === 'crew.link') {
    if (!uuid(input.crewId) || !uuid(input.operationPersonId)) return error('Invalid crew or person ID', 400);
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : '';
    if (!reason) return error('Review reason is required', 400);
    const [person] = await sql.query(
      'SELECT id,kind,removed_at FROM operation_people WHERE id=$1', [input.operationPersonId]
    );
    if (!person || person.removed_at) return error('Operation person not found', 404);
    const links = await sql.query(
      'SELECT crew_id AS "crewId",operation_person_id AS "operationPersonId",removed_at AS "removedAt" FROM training_crew_job_links WHERE operation_person_id=$1 AND removed_at IS NULL',
      [input.operationPersonId]
    );
    const invalid = validateCrewLink({
      crewId: input.crewId, operationPersonId: input.operationPersonId,
      personKind: person.kind, existingLinks: links
    });
    if (invalid) return error(invalid, 409);
    const id = randomUUID();
    try {
      const [row] = await sql.query(`WITH linked AS (
        INSERT INTO training_crew_job_links(id,crew_id,operation_person_id,reviewed_by,review_reason)
        VALUES($1,$2,$3,$4,$5) RETURNING *
      ), event AS (
        INSERT INTO training_events(scope,record_id,action,actor,after_data,reason)
        SELECT 'crew-link',id,'link',$4,to_jsonb(linked),$5 FROM linked
      ) SELECT * FROM linked`, [id, input.crewId, input.operationPersonId, login, reason]);
      return json({ link: row }, 201);
    } catch (e) {
      if (e.code === '23505') return error('Operation person is already linked', 409);
      throw e;
    }
  }
  if (action === 'crew.unlink') {
    if (!uuid(input.id) || !Number.isInteger(input.version) || input.version < 1) return error('Invalid link ID or version', 400);
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : '';
    if (!reason) return error('Unlink reason is required', 400);
    const [row] = await sql.query(`WITH unlinked AS (
      UPDATE training_crew_job_links SET removed_at=now(),version=version+1,updated_at=now()
      WHERE id=$1 AND version=$2 AND removed_at IS NULL RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data,reason)
      SELECT 'crew-link',id,'unlink',$3,to_jsonb(unlinked),$4 FROM unlinked
    ) SELECT * FROM unlinked`, [input.id, input.version, login, reason]);
    return row ? json({ link: row }) : error('Concurrent change; reload link', 409);
  }
  return error('Training action is not implemented', 501);
}

async function handleMatrix({ action, input, vesselId, login, sql }) {
  if (action === 'courses.list') {
    const courses = await sql.query('SELECT * FROM training_courses WHERE removed_at IS NULL ORDER BY code LIMIT 300');
    return json({ courses });
  }
  if (action === 'courses.create') {
    const { value, error: invalid } = validateCourse(input.data);
    if (invalid) return error(invalid, 400);
    const id = randomUUID();
    const [course] = await sql.query(`WITH created AS (
      INSERT INTO training_courses(id,code,name,duration_minutes,mode,prerequisites,source,owner_login,created_by)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'course',id,'create',$8,to_jsonb(created) FROM created
    ) SELECT * FROM created`,
    [id, value.code, value.name, value.durationMinutes, value.mode, JSON.stringify(value.prerequisites), value.source, login]);
    return json({ course }, 201);
  }
  if (action === 'courses.update') {
    if (!uuid(input.id) || !Number.isInteger(input.version)) return error('Invalid course ID or version', 400);
    const { value, error: invalid } = validateCourse(input.data);
    if (invalid) return error(invalid, 400);
    const [course] = await sql.query(`WITH updated AS (
      UPDATE training_courses SET code=$1,name=$2,duration_minutes=$3,mode=$4,
        prerequisites=$5::jsonb,source=$6,version=version+1,updated_at=now()
      WHERE id=$7 AND version=$8 AND removed_at IS NULL RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'course',id,'update',$9,to_jsonb(updated) FROM updated
    ) SELECT * FROM updated`,
    [value.code, value.name, value.durationMinutes, value.mode, JSON.stringify(value.prerequisites), value.source, input.id, input.version, login]);
    return course ? json({ course }) : error('Concurrent change; reload course', 409);
  }
  if (action === 'matrix.list') {
    const rules = vesselId
      ? await sql.query('SELECT * FROM training_matrix_rules WHERE vessel_id IS NULL OR vessel_id=$1 ORDER BY effective_from DESC LIMIT 300', [vesselId])
      : await sql.query('SELECT * FROM training_matrix_rules ORDER BY effective_from DESC LIMIT 300');
    return json({ rules });
  }
  if (action === 'matrix.draft') {
    const { value, error: invalid } = validateRule({ ...input.data, ownerLogin: login });
    if (invalid) return error(invalid, 400);
    const id = randomUUID();
    const [rule] = await sql.query(`WITH created AS (
      INSERT INTO training_matrix_rules(id,course_id,rank,vessel_type,vessel_id,effective_from,
        effective_until,recurrence_months,due_days_before_join,source,owner_login,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'matrix',id,'draft',$12,to_jsonb(created) FROM created
    ) SELECT * FROM created`,
    [id, value.courseId, value.rank, value.vesselType, value.vesselId, value.effectiveFrom,
      value.effectiveUntil, value.recurrenceMonths, value.dueDaysBeforeJoin, value.source, value.ownerLogin, login]);
    return json({ rule }, 201);
  }
  if (action === 'matrix.approve') {
    if (!uuid(input.id) || !Number.isInteger(input.version)) return error('Invalid rule ID or version', 400);
    const [rule] = await sql.query(`WITH approved AS (
      UPDATE training_matrix_rules SET state='approved',approved_by=$1,approved_at=now(),
        version=version+1,updated_at=now()
      WHERE id=$2 AND version=$3 AND state='draft' RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'matrix',id,'approve',$1,to_jsonb(approved) FROM approved
    ) SELECT * FROM approved`, [login, input.id, input.version]);
    return rule ? json({ rule }) : error('Rule changed or is no longer a draft', 409);
  }
  if (action === 'requirements.list') {
    if (!uuid(input.crewId) || !uuid(vesselId)) return error('Crew and vessel are required', 400);
    const onDate = input.onDate || new Date().toISOString().slice(0, 10);
    const [crewRows, assignmentRows, ruleRows, courseRows, waiverRows] = await Promise.all([
      sql.query('SELECT * FROM training_crew WHERE id=$1 AND removed_at IS NULL', [input.crewId]),
      sql.query(`SELECT a.*,v.vessel_type FROM training_crew_assignments a
        JOIN training_vessels v ON v.id=a.vessel_id
        WHERE a.crew_id=$1 AND a.vessel_id=$2 AND a.removed_at IS NULL
        ORDER BY a.created_at DESC LIMIT 1`, [input.crewId, vesselId]),
      sql.query(`SELECT * FROM training_matrix_rules WHERE state='approved'
        AND (vessel_id IS NULL OR vessel_id=$1)`, [vesselId]),
      sql.query('SELECT * FROM training_courses WHERE removed_at IS NULL'),
      sql.query('SELECT * FROM training_waivers WHERE crew_id=$1 AND revoked_at IS NULL', [input.crewId])
    ]);
    if (!crewRows[0] || !assignmentRows[0]) return error('Crew assignment not found', 404);
    const crew = { id: crewRows[0].id, rank: crewRows[0].rank };
    const a = assignmentRows[0];
    const assignment = { vesselId, vesselType: a.vessel_type, rank: a.rank, joinsOn: a.joins_on?.toISOString?.().slice(0,10) || a.joins_on };
    const rules = ruleRows.map(r => ({
      id: r.id, courseId: r.course_id, rank: r.rank, vesselType: r.vessel_type,
      vesselId: r.vessel_id, effectiveFrom: String(r.effective_from).slice(0,10),
      effectiveUntil: r.effective_until && String(r.effective_until).slice(0,10),
      recurrenceMonths: r.recurrence_months, dueDaysBeforeJoin: r.due_days_before_join,
      state: r.state, source: r.source, version: r.version, approvedBy: r.approved_by
    }));
    const courses = courseRows.map(c => ({ id: c.id, code: c.code, name: c.name, prerequisites: c.prerequisites }));
    const waivers = waiverRows.map(w => ({
      crewId: w.crew_id, ruleId: w.rule_id, expiresOn: String(w.expires_on).slice(0,10),
      approvedBy: w.approved_by, reason: w.reason, revokedAt: w.revoked_at
    }));
    try { return json({ requirements: deriveRequirements({ crew, assignment, rules, courses, onDate, waivers }) }); }
    catch { return error('Invalid selected date', 400); }
  }
  return error('Training action is not implemented', 501);
}

const utc = value => new Date(value).toISOString();
async function loadSession(sql, id, vesselId) {
  if (!uuid(id)) return null;
  const [row] = await sql.query('SELECT * FROM training_sessions WHERE id=$1 AND removed_at IS NULL', [id]);
  if (!row) return null;
  if (vesselId && row.vessel_id !== vesselId) return null;
  return row;
}

async function sessionConflicts(sql, row, proposed) {
  const enrollmentRows = await sql.query(
    'SELECT crew_id FROM training_enrollments WHERE session_id=$1 AND removed_at IS NULL', [row.id]);
  const crewIds = enrollmentRows.map(x => x.crew_id);
  if (!crewIds.length) return { hard: [], unknown: [] };
  const [otherRows, availabilityRows, assignmentRows] = await Promise.all([
    sql.query(`SELECT e.crew_id,s.starts_at,s.ends_at,s.state FROM training_enrollments e
      JOIN training_sessions s ON s.id=e.session_id
      WHERE e.crew_id=ANY($1::uuid[]) AND e.session_id<>$2 AND e.removed_at IS NULL
      AND s.removed_at IS NULL AND s.state<>'cancelled'`, [crewIds, row.id]),
    sql.query(`SELECT crew_id,kind,starts_at,ends_at FROM training_availability
      WHERE crew_id=ANY($1::uuid[]) AND removed_at IS NULL`, [crewIds]),
    sql.query(`SELECT crew_id,joins_on FROM training_crew_assignments
      WHERE crew_id=ANY($1::uuid[]) AND vessel_id=$2 AND removed_at IS NULL`, [crewIds, row.vessel_id])
  ]);
  return detectTrainingConflicts({
    session: { startsAt: proposed.startsAt, endsAt: proposed.endsAt,
      displayZone: proposed.displayZone, capacity: row.capacity },
    crewIds, enrolledCount: 0,
    otherSessions: otherRows.map(x => ({ crewId: x.crew_id, startsAt: x.starts_at, endsAt: x.ends_at, state: x.state })),
    availability: availabilityRows.map(x => ({ crewId: x.crew_id, kind: x.kind, startsAt: x.starts_at, endsAt: x.ends_at })),
    assignments: assignmentRows.map(x => ({ crewId: x.crew_id, joinsOn: x.joins_on }))
  });
}

async function handleSessions({ action, input, vesselId, login, sql }) {
  if (action === 'sessions.list') {
    const sessions = vesselId
      ? await sql.query('SELECT * FROM training_sessions WHERE vessel_id=$1 AND removed_at IS NULL ORDER BY starts_at DESC LIMIT 300', [vesselId])
      : await sql.query('SELECT * FROM training_sessions WHERE removed_at IS NULL ORDER BY starts_at DESC LIMIT 300');
    return json({ sessions });
  }
  if (action === 'enrollments.list') {
    const enrollments = vesselId
      ? await sql.query(`SELECT e.*,s.course_id,s.vessel_id,s.starts_at,c.display_name
          FROM training_enrollments e JOIN training_sessions s ON s.id=e.session_id
          JOIN training_crew c ON c.id=e.crew_id
          WHERE s.vessel_id=$1 AND e.removed_at IS NULL AND s.removed_at IS NULL
          ORDER BY s.starts_at DESC LIMIT 300`, [vesselId])
      : await sql.query(`SELECT e.*,s.course_id,s.vessel_id,s.starts_at,c.display_name
          FROM training_enrollments e JOIN training_sessions s ON s.id=e.session_id
          JOIN training_crew c ON c.id=e.crew_id
          WHERE e.removed_at IS NULL AND s.removed_at IS NULL
          ORDER BY s.starts_at DESC LIMIT 300`);
    return json({ enrollments });
  }
  if (action === 'sessions.create') {
    const data = input.data || {};
    if (!uuid(data.courseId) || (data.vesselId && !uuid(data.vesselId)) ||
        (vesselId && data.vesselId !== vesselId)) return error('Invalid course or vessel', 400);
    const invalid = validateSessionTime(data);
    if (invalid) return error(invalid, 400);
    if (!Number.isInteger(data.capacity) || data.capacity < 1) return error('Capacity is required', 400);
    const id = randomUUID();
    const [row] = await sql.query(`WITH created AS (
      INSERT INTO training_sessions(id,course_id,vessel_id,starts_at,ends_at,display_zone,
        instructor,venue,capacity,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'session',id,'create',$10,to_jsonb(created) FROM created
    ) SELECT * FROM created`,
    [id, data.courseId, data.vesselId || null, utc(data.startsAt), utc(data.endsAt),
      data.displayZone, String(data.instructor || '').slice(0,160),
      String(data.venue || '').slice(0,160), data.capacity, login]);
    return json({ session: row }, 201);
  }
  if (['sessions.propose','sessions.confirm','sessions.cancel'].includes(action)) {
    if (!uuid(input.id) || !Number.isInteger(input.version)) return error('Invalid session ID or version', 400);
    const current = await loadSession(sql, input.id, vesselId);
    if (!current) return error('Session not found', 404);
    if (current.version !== input.version) return error('Concurrent change; reload session', 409);
    if (action === 'sessions.propose') {
      if (!validateSessionTransition(current.state, 'proposed')) return error('Cannot propose this session', 409);
      const data = input.data || {};
      const invalid = validateSessionTime(data);
      if (invalid) return error(invalid, 400);
      const participants = await sql.query(
        'SELECT crew_id FROM training_enrollments WHERE session_id=$1 AND removed_at IS NULL', [input.id]);
      const proposal = {
        old: { startsAt: current.starts_at, endsAt: current.ends_at,
          displayZone: current.display_zone, instructor: current.instructor, venue: current.venue },
        next: { startsAt: data.startsAt, endsAt: data.endsAt,
          displayZone: data.displayZone, instructor: String(data.instructor ?? current.instructor).slice(0,160),
          venue: String(data.venue ?? current.venue).slice(0,160) },
        affectedCrewIds: participants.map(x => x.crew_id), proposedBy: login
      };
      const [row] = await sql.query(`WITH updated AS (
        UPDATE training_sessions SET state='proposed',proposed_change=$1::jsonb,
          version=version+1,updated_at=now()
        WHERE id=$2 AND version=$3 AND state IN ('draft','confirmed') RETURNING *
      ), event AS (
        INSERT INTO training_events(scope,record_id,action,actor,after_data)
        SELECT 'session',id,'propose',$4,to_jsonb(updated) FROM updated
      ) SELECT * FROM updated`, [JSON.stringify(proposal), input.id, input.version, login]);
      return row ? json({ session: row, proposal }) : error('Concurrent change; reload session', 409);
    }
    if (action === 'sessions.cancel') {
      if (!validateSessionTransition(current.state, 'cancelled')) return error('Cannot cancel this session', 409);
      const reason = String(input.reason || '').trim().slice(0,500);
      if (!reason) return error('Cancellation reason is required', 400);
      const [row] = await sql.query(`WITH updated AS (
        UPDATE training_sessions SET state='cancelled',version=version+1,updated_at=now()
        WHERE id=$1 AND version=$2 AND state IN ('draft','proposed','confirmed') RETURNING *
      ), event AS (
        INSERT INTO training_events(scope,record_id,action,actor,after_data,reason)
        SELECT 'session',id,'cancel',$3,to_jsonb(updated),$4 FROM updated
      ) SELECT * FROM updated`, [input.id, input.version, login, reason]);
      return row ? json({ session: row }) : error('Concurrent change; reload session', 409);
    }
    if (!validateSessionTransition(current.state, 'confirmed')) return error('Only a proposed session may be confirmed', 409);
    const next = current.proposed_change?.next;
    if (!next) return error('Missing proposed change', 409);
    const conflicts = await sessionConflicts(sql, current, next);
    if (conflicts.hard.length || conflicts.unknown.length) return json({ error: 'Resolve conflicts and unknown availability before confirmation', conflicts }, 409);
    const [row] = await sql.query(`WITH updated AS (
      UPDATE training_sessions SET starts_at=$1,ends_at=$2,display_zone=$3,instructor=$4,
        venue=$5,state='confirmed',proposed_change=NULL,version=version+1,updated_at=now()
      WHERE id=$6 AND version=$7 AND state='proposed' RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'session',id,'confirm',$8,to_jsonb(updated) FROM updated
    ) SELECT * FROM updated`,
    [utc(next.startsAt), utc(next.endsAt), next.displayZone, next.instructor, next.venue, input.id, input.version, login]);
    return row ? json({ session: row }) : error('Concurrent change; reload session', 409);
  }
  if (action === 'enrollments.add') {
    if (!uuid(input.sessionId) || !uuid(input.crewId) ||
        typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8)
      return error('Session, crew and idempotency key are required', 400);
    const session = await loadSession(sql, input.sessionId, vesselId);
    if (!session) return error('Session not found', 404);
    if (['completed','cancelled'].includes(session.state)) return error('Session is closed', 409);
    const [assignment] = await sql.query(
      'SELECT id FROM training_crew_assignments WHERE crew_id=$1 AND vessel_id=$2 AND removed_at IS NULL',
      [input.crewId, session.vessel_id]);
    if (session.vessel_id && !assignment) return error('Crew is not assigned to this vessel', 403);
    const [row] = await sql.query(`INSERT INTO training_enrollments(id,session_id,crew_id,idempotency_key,created_by)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(session_id,crew_id) DO UPDATE SET updated_at=training_enrollments.updated_at
      RETURNING *`,
    [randomUUID(), input.sessionId, input.crewId, input.idempotencyKey.slice(0,100), login]);
    return json({ enrollment: row });
  }
  if (action === 'enrollments.remove') {
    if (!uuid(input.id) || !Number.isInteger(input.version)) return error('Invalid enrollment ID or version', 400);
    const [row] = await sql.query(`WITH removed AS (
      UPDATE training_enrollments e SET removed_at=now(),version=version+1,updated_at=now()
      FROM training_sessions s
      WHERE e.id=$1 AND e.version=$2 AND e.session_id=s.id
        AND ($3::uuid IS NULL OR s.vessel_id=$3) AND e.removed_at IS NULL
      RETURNING e.*
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'enrollment',id,'remove',$4,to_jsonb(removed) FROM removed
    ) SELECT * FROM removed`, [input.id, input.version, vesselId || null, login]);
    return row ? json({ enrollment: row }) : error('Enrollment changed or not in vessel', 409);
  }
  return error('Training action is not implemented', 501);
}

async function loadEnrollment(sql, enrollmentId, vesselId) {
  if (!uuid(enrollmentId)) return null;
  const [row] = await sql.query(`SELECT e.*,s.vessel_id,s.state,s.removed_at AS session_removed_at
    FROM training_enrollments e JOIN training_sessions s ON s.id=e.session_id
    WHERE e.id=$1 AND e.removed_at IS NULL`, [enrollmentId]);
  if (!row || (vesselId && row.vessel_id !== vesselId)) return null;
  return row;
}

async function handleOutcomes({ action, input, vesselId, login, sql }) {
  if (action === 'outcomes.list') {
    if (!uuid(input.enrollmentId)) return error('Enrollment ID is required', 400);
    const enrollment = await loadEnrollment(sql, input.enrollmentId, vesselId);
    if (!enrollment) return error('Enrollment not found', 404);
    const outcomes = await sql.query(
      'SELECT * FROM training_outcomes WHERE enrollment_id=$1 ORDER BY created_at,id', [input.enrollmentId]);
    return json({ outcomes });
  }
  if (!['outcomes.record','outcomes.correct'].includes(action)) return error('Training action is not implemented', 501);
  const enrollment = await loadEnrollment(sql, input.enrollmentId, vesselId);
  if (!enrollment) return error('Enrollment not found', 404);
  if (enrollment.session_removed_at || enrollment.state === 'cancelled')
    return error('Session is cancelled or removed', 409);
  const { value, error: invalid } = validateOutcome(input.data);
  if (invalid) return error(invalid, 400);
  let correctionOf = null, version = 1, reason = null;
  const existing = await sql.query(
    'SELECT * FROM training_outcomes WHERE enrollment_id=$1 ORDER BY version DESC LIMIT 1', [input.enrollmentId]);
  if (action === 'outcomes.record') {
    if (existing.length) return error('Outcome exists; use a reasoned correction', 409);
  } else {
    if (!existing.length) return error('Outcome not found', 404);
    const current = existing[0];
    reason = String(input.reason || '').trim().slice(0,500);
    const problem = validateCorrection({ version: input.version, currentVersion: current.version, reason });
    if (problem) return error(problem, 409);
    correctionOf = current.id;
    version = current.version + 1;
  }
  const id = randomUUID();
  let outcome;
  try { [outcome] = await sql.query(`WITH created AS (
    INSERT INTO training_outcomes(id,enrollment_id,attendance,assessment,assessor,evidence_note,
      correction_of,correction_reason,version,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
  ), event AS (
    INSERT INTO training_events(scope,record_id,action,actor,after_data,reason)
    SELECT 'outcome',id,$11,$10,to_jsonb(created),$8 FROM created
  ) SELECT * FROM created`,
  [id, input.enrollmentId, value.attendance, value.assessment, value.assessor,
    value.evidence, correctionOf, reason, version, login,
    action === 'outcomes.correct' ? 'correct' : 'record']); }
  catch (e) {
    if (e.code === '23505') return error('Concurrent outcome change; reload', 409);
    throw e;
  }
  return json({ outcome }, 201);
}

async function scopedCertificate(sql, id, vesselId) {
  if (!uuid(id)) return null;
  const [row] = vesselId
    ? await sql.query(`SELECT c.* FROM training_certificates c
        JOIN training_crew_assignments a ON a.crew_id=c.crew_id
        WHERE c.id=$1 AND a.vessel_id=$2 AND a.removed_at IS NULL`, [id, vesselId])
    : await sql.query('SELECT * FROM training_certificates WHERE id=$1', [id]);
  return row || null;
}

async function handleCertificates({ action, input, vesselId, login, sql, documentStore }) {
  if (action === 'certificates.list') {
    if (input.crewId && !uuid(input.crewId)) return error('Invalid crew ID', 400);
    const certificates = vesselId
      ? await sql.query(`SELECT c.* FROM training_certificates c
          JOIN training_crew_assignments a ON a.crew_id=c.crew_id
          WHERE a.vessel_id=$1 AND a.removed_at IS NULL
            AND ($2::uuid IS NULL OR c.crew_id=$2)
          ORDER BY c.created_at DESC LIMIT 300`, [vesselId, input.crewId || null])
      : await sql.query(`SELECT * FROM training_certificates
          WHERE ($1::uuid IS NULL OR crew_id=$1)
          ORDER BY created_at DESC LIMIT 300`, [input.crewId || null]);
    return json({ certificates });
  }
  if (action === 'certificates.download') {
    const certificate = await scopedCertificate(sql, input.id, vesselId);
    if (!certificate) return error('Certificate not found', 404);
    const expected = `Training/Crew/${certificate.crew_id}/Certificates/${certificate.id}/`;
    if (!certificate.file_path?.startsWith(expected)) return error('Invalid certificate reference', 500);
    const bytes = await documentStore.get(certificate.file_path);
    if (!bytes) return error('Certificate file not found', 404);
    return new Response(bytes, { headers: {
      'Content-Type': certificate.mime_type,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(certificate.file_name)}`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
    } });
  }
  if (action === 'certificates.upload') {
    if (!uuid(input.crewId) || !uuid(input.courseId)) return error('Crew and course are required', 400);
    const file = input.file;
    const invalid = validateCertificateFile(file);
    if (invalid) return error(invalid, 400);
    if (!date(input.issuedOn) || (input.expiresOn && (!date(input.expiresOn) || input.expiresOn < input.issuedOn)))
      return error('Invalid issue or expiry date', 400);
    const issuer = String(input.issuer || '').trim().slice(0,160);
    if (!issuer) return error('Issuer is required', 400);
    if (vesselId) {
      const [assignment] = await sql.query(`SELECT id FROM training_crew_assignments
        WHERE crew_id=$1 AND vessel_id=$2 AND removed_at IS NULL`, [input.crewId, vesselId]);
      if (!assignment) return error('Crew is not assigned to this vessel', 403);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentError = validateCertificateBytes(bytes, file.type);
    if (contentError) return error(contentError, 400);
    const id = randomUUID();
    const path = certificatePath(input.crewId, id, file.name);
    const sha = await documentStore.put(path, bytes);
    try {
      const [certificate] = await sql.query(`WITH created AS (
        INSERT INTO training_certificates(id,crew_id,course_id,outcome_id,issuer,issued_on,
          expires_on,file_path,file_sha,file_name,mime_type,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
      ), event AS (
        INSERT INTO training_events(scope,record_id,action,actor,after_data)
        SELECT 'certificate',id,'upload',$12,to_jsonb(created) FROM created
      ) SELECT * FROM created`,
      [id, input.crewId, input.courseId, uuid(input.outcomeId) ? input.outcomeId : null,
        issuer, input.issuedOn, input.expiresOn || null, path, sha,
        file.name.slice(0,160), file.type, login]);
      return json({ certificate }, 201);
    } catch (e) {
      await documentStore.remove?.(path, sha).catch(() => {});
      throw e;
    }
  }
  if (action === 'certificates.review') {
    if (!uuid(input.id) || !Number.isInteger(input.version)) return error('Invalid certificate ID or version', 400);
    if (!['verified','rejected'].includes(input.decision)) return error('Invalid review decision', 400);
    const certificate = await scopedCertificate(sql, input.id, vesselId);
    if (!certificate) return error('Certificate not found', 404);
    if (certificate.version !== input.version || certificate.review_state !== 'pending')
      return error('Certificate changed; reload review queue', 409);
    const reason = String(input.reason || '').trim().slice(0,500);
    if (input.decision === 'rejected' && !reason) return error('Rejection reason is required', 400);
    const [row] = await sql.query(`WITH reviewed AS (
      UPDATE training_certificates SET review_state=$1,reviewed_by=$2,reviewed_at=now(),
        review_reason=$3,version=version+1,updated_at=now()
      WHERE id=$4 AND version=$5 AND review_state='pending' RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data,reason)
      SELECT 'certificate',id,'review',$2,to_jsonb(reviewed),$3 FROM reviewed
    ) SELECT * FROM reviewed`, [input.decision, login, reason, input.id, input.version]);
    return row ? json({ certificate: row }) : error('Concurrent review; reload queue', 409);
  }
  return error('Training action is not implemented', 501);
}

async function handleReadiness({ input, vesselId, sql }) {
  if (!uuid(input.crewId) || !uuid(vesselId)) return error('Crew and vessel are required', 400);
  const onDate = input.onDate || new Date().toISOString().slice(0,10);
  if (!date(onDate)) return error('Invalid selected date', 400);
  const [crew] = await sql.query('SELECT id,rank FROM training_crew WHERE id=$1 AND removed_at IS NULL', [input.crewId]);
  const [a] = await sql.query(`SELECT a.*,v.vessel_type FROM training_crew_assignments a
    JOIN training_vessels v ON v.id=a.vessel_id
    WHERE a.crew_id=$1 AND a.vessel_id=$2 AND a.removed_at IS NULL
    ORDER BY a.created_at DESC LIMIT 1`, [input.crewId, vesselId]);
  if (!crew || !a) return error('Crew assignment not found', 404);
  const [ruleRows, courseRows, waiverRows, resultRows, certificateRows, availabilityRows] = await Promise.all([
    sql.query(`SELECT * FROM training_matrix_rules WHERE state='approved'
      AND (vessel_id IS NULL OR vessel_id=$1)`, [vesselId]),
    sql.query('SELECT * FROM training_courses WHERE removed_at IS NULL'),
    sql.query('SELECT * FROM training_waivers WHERE crew_id=$1 AND revoked_at IS NULL', [input.crewId]),
    sql.query(`SELECT o.*,s.course_id FROM training_outcomes o
      JOIN training_enrollments e ON e.id=o.enrollment_id
      JOIN training_sessions s ON s.id=e.session_id
      WHERE e.crew_id=$1 ORDER BY o.version DESC`, [input.crewId]),
    sql.query('SELECT * FROM training_certificates WHERE crew_id=$1', [input.crewId]),
    sql.query('SELECT * FROM training_availability WHERE crew_id=$1 AND removed_at IS NULL', [input.crewId])
  ]);
  const requirements = deriveRequirements({
    crew: { id: crew.id, rank: crew.rank },
    assignment: { vesselId, vesselType: a.vessel_type, rank: a.rank, joinsOn: dateString(a.joins_on) },
    rules: ruleRows.map(r => ({ id: r.id, courseId: r.course_id, rank: r.rank, vesselType: r.vessel_type,
      vesselId: r.vessel_id, effectiveFrom: dateString(r.effective_from),
      effectiveUntil: r.effective_until && dateString(r.effective_until), state: r.state,
      source: r.source, version: r.version, approvedBy: r.approved_by,
      dueDaysBeforeJoin: r.due_days_before_join, recurrenceMonths: r.recurrence_months })),
    courses: courseRows.map(c => ({ id: c.id, code: c.code, name: c.name, prerequisites: c.prerequisites })),
    waivers: waiverRows.map(w => ({ crewId: w.crew_id, ruleId: w.rule_id, expiresOn: dateString(w.expires_on),
      approvedBy: w.approved_by, reason: w.reason })), onDate
  });
  const results = resultRows.map(o => ({ crewId: input.crewId, courseId: o.course_id,
    enrollmentId: o.enrollment_id, version: o.version,
    attendance: o.attendance, assessment: o.assessment }));
  const certificates = certificateRows.map(c => ({ crewId: c.crew_id, courseId: c.course_id,
    reviewState: c.review_state, expiresOn: c.expires_on && dateString(c.expires_on) }));
  const availability = { verified: Boolean(a.joins_on && availabilityRows.some(block =>
    block.kind === 'available' &&
    dateString(block.starts_at) <= onDate &&
    dateString(block.ends_at) >= onDate
  )) };
  return json({ readiness: calculateReadiness({ requirements, results, certificates,
    waivers: waiverRows.map(w => ({ crewId: w.crew_id, ruleId: w.rule_id,
      approvedBy: w.approved_by, expiresOn: dateString(w.expires_on), reason: w.reason })), availability, onDate }),
    requirements });
}

async function handleSetup({ action, input, vesselId, login, grant, sql }) {
  if (action === 'vessels.list') {
    const vessels = vesselId
      ? await sql.query('SELECT * FROM training_vessels WHERE id=$1 AND removed_at IS NULL', [vesselId])
      : grant?.role === 'officer'
        ? await sql.query(`SELECT v.* FROM training_vessels v
            JOIN training_vessel_assignments a ON a.vessel_id=v.id
            WHERE a.officer_login=$1 AND a.removed_at IS NULL AND v.removed_at IS NULL
            ORDER BY v.name LIMIT 200`, [login])
        : await sql.query('SELECT * FROM training_vessels WHERE removed_at IS NULL ORDER BY name LIMIT 200');
    return json({ vessels });
  }
  if (action === 'vessels.create') {
    const name = String(input.data?.name || '').trim().slice(0,160);
    const type = String(input.data?.vesselType || '').trim().slice(0,100);
    if (!name || !type) return error('Vessel name and type are required', 400);
    const id = randomUUID();
    const [vessel] = await sql.query(`WITH created AS (
      INSERT INTO training_vessels(id,name,vessel_type,created_by)
      VALUES($1,$2,$3,$4) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'vessel',id,'create',$4,to_jsonb(created) FROM created
    ) SELECT * FROM created`, [id, name, type, login]);
    return json({ vessel }, 201);
  }
  if (action === 'vessels.update') {
    if (!uuid(input.id) || !Number.isInteger(input.version)) return error('Invalid vessel ID or version', 400);
    const name = String(input.data?.name || '').trim().slice(0,160);
    const type = String(input.data?.vesselType || '').trim().slice(0,100);
    if (!name || !type) return error('Vessel name and type are required', 400);
    const [vessel] = await sql.query(`WITH updated AS (
      UPDATE training_vessels SET name=$1,vessel_type=$2,version=version+1,updated_at=now()
      WHERE id=$3 AND version=$4 AND removed_at IS NULL RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'vessel',id,'update',$5,to_jsonb(updated) FROM updated
    ) SELECT * FROM updated`, [name, type, input.id, input.version, login]);
    return vessel ? json({ vessel }) : error('Concurrent change; reload vessel', 409);
  }
  if (action === 'assignments.create') {
    const d = input.data || {};
    if (!uuid(d.crewId) || !uuid(d.vesselId) || (vesselId && vesselId !== d.vesselId))
      return error('Crew and vessel are required', 400);
    if (d.joinsOn && !date(d.joinsOn)) return error('Invalid joining date', 400);
    if (d.leavesOn && (!date(d.leavesOn) || (d.joinsOn && d.leavesOn < d.joinsOn)))
      return error('Invalid leaving date', 400);
    const id = randomUUID();
    const [assignment] = await sql.query(`WITH created AS (
      INSERT INTO training_crew_assignments(id,crew_id,vessel_id,joins_on,leaves_on,rank,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'assignment',id,'create',$7,to_jsonb(created) FROM created
    ) SELECT * FROM created`,
    [id, d.crewId, d.vesselId, d.joinsOn || null, d.leavesOn || null, String(d.rank || '').slice(0,100) || null, login]);
    return json({ assignment }, 201);
  }
  if (action === 'assignments.update') {
    if (!uuid(input.id) || !Number.isInteger(input.version)) return error('Invalid assignment ID or version', 400);
    const d = input.data || {};
    if (d.joinsOn && !date(d.joinsOn)) return error('Invalid joining date', 400);
    if (d.leavesOn && (!date(d.leavesOn) || (d.joinsOn && d.leavesOn < d.joinsOn)))
      return error('Invalid leaving date', 400);
    const [assignment] = await sql.query(`WITH updated AS (
      UPDATE training_crew_assignments SET joins_on=$1,leaves_on=$2,rank=$3,
        version=version+1,updated_at=now()
      WHERE id=$4 AND version=$5 AND removed_at IS NULL
        AND ($6::uuid IS NULL OR vessel_id=$6) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'assignment',id,'update',$7,to_jsonb(updated) FROM updated
    ) SELECT * FROM updated`,
    [d.joinsOn || null, d.leavesOn || null, String(d.rank || '').slice(0,100) || null,
      input.id, input.version, vesselId || null, login]);
    return assignment ? json({ assignment }) : error('Concurrent change; reload assignment', 409);
  }
  if (action === 'availability.list') {
    if (!uuid(input.crewId)) return error('Crew ID is required', 400);
    if (vesselId) {
      const [assigned] = await sql.query(`SELECT id FROM training_crew_assignments
        WHERE crew_id=$1 AND vessel_id=$2 AND removed_at IS NULL`, [input.crewId, vesselId]);
      if (!assigned) return error('Crew is not assigned to this vessel', 403);
    }
    const availability = await sql.query(
      'SELECT * FROM training_availability WHERE crew_id=$1 AND removed_at IS NULL ORDER BY starts_at DESC',
      [input.crewId]);
    return json({ availability });
  }
  if (action === 'availability.set') {
    if (!uuid(input.crewId) || !uuid(vesselId)) return error('Crew and vessel are required', 400);
    const [assigned] = await sql.query(`SELECT id FROM training_crew_assignments
      WHERE crew_id=$1 AND vessel_id=$2 AND removed_at IS NULL`, [input.crewId, vesselId]);
    if (!assigned) return error('Crew is not assigned to this vessel', 403);
    const d = input.data || {};
    if (!['duty','travel','leave','available'].includes(d.kind) ||
        !d.startsAt || !d.endsAt || Number.isNaN(Date.parse(d.startsAt)) ||
        Number.isNaN(Date.parse(d.endsAt)) || Date.parse(d.endsAt) <= Date.parse(d.startsAt))
      return error('Invalid availability interval', 400);
    const source = String(d.source || '').trim().slice(0,200);
    if (!source) return error('Availability source is required', 400);
    const id = randomUUID();
    const [block] = await sql.query(`WITH created AS (
      INSERT INTO training_availability(id,crew_id,starts_at,ends_at,kind,source,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data)
      SELECT 'availability',id,'set',$7,to_jsonb(created) FROM created
    ) SELECT * FROM created`,
    [id, input.crewId, utc(d.startsAt), utc(d.endsAt), d.kind, source, login]);
    return json({ block }, 201);
  }
  if (action === 'waivers.approve') {
    if (!uuid(input.crewId) || !uuid(input.ruleId) || !date(input.expiresOn))
      return error('Crew, rule and expiry are required', 400);
    const reason = String(input.reason || '').trim().slice(0,500);
    if (!reason) return error('Waiver reason is required', 400);
    if (vesselId) {
      const [assigned] = await sql.query(`SELECT id FROM training_crew_assignments
        WHERE crew_id=$1 AND vessel_id=$2 AND removed_at IS NULL`, [input.crewId, vesselId]);
      if (!assigned) return error('Crew is not assigned to this vessel', 403);
    }
    const id = randomUUID();
    const [waiver] = await sql.query(`WITH created AS (
      INSERT INTO training_waivers(id,crew_id,rule_id,reason,expires_on,approved_by,approved_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,now(),$6) RETURNING *
    ), event AS (
      INSERT INTO training_events(scope,record_id,action,actor,after_data,reason)
      SELECT 'waiver',id,'approve',$6,to_jsonb(created),$4 FROM created
    ) SELECT * FROM created`, [id, input.crewId, input.ruleId, reason, input.expiresOn, login]);
    return json({ waiver }, 201);
  }
  if (action === 'overview.get') {
    const [crew, sessions, certificates] = await Promise.all([
      vesselId ? sql.query(`SELECT COUNT(DISTINCT crew_id)::int AS count FROM training_crew_assignments
        WHERE vessel_id=$1 AND removed_at IS NULL`, [vesselId])
        : sql.query('SELECT COUNT(*)::int AS count FROM training_crew WHERE removed_at IS NULL'),
      vesselId ? sql.query(`SELECT COUNT(*)::int AS count FROM training_sessions
        WHERE vessel_id=$1 AND state IN ('draft','proposed','confirmed') AND removed_at IS NULL`, [vesselId])
        : sql.query(`SELECT COUNT(*)::int AS count FROM training_sessions
        WHERE state IN ('draft','proposed','confirmed') AND removed_at IS NULL`),
      vesselId ? sql.query(`SELECT COUNT(DISTINCT c.id)::int AS count FROM training_certificates c
        JOIN training_crew_assignments a ON a.crew_id=c.crew_id
        WHERE a.vessel_id=$1 AND a.removed_at IS NULL AND c.review_state='pending'`, [vesselId])
        : sql.query(`SELECT COUNT(*)::int AS count FROM training_certificates WHERE review_state='pending'`)
    ]);
    return json({ overview: { crew: crew[0]?.count || 0, sessions: sessions[0]?.count || 0,
      pendingCertificates: certificates[0]?.count || 0 } });
  }
  return error('Training action is not implemented', 501);
}

export function createTrainingRoute({
  database = defaultDatabase,
  loginFromRequest = sessionLogin,
  readTrainingGrant = defaultTrainingGrant,
  documentStore = defaultDocumentStore
} = {}) {
  return async function route(request) {
    const login = loginFromRequest(request);
    if (!login) return error('Sign in required', 401);
    if (request.method !== 'GET' && request.method !== 'POST') return error('Method not allowed', 405);
    if (request.method === 'POST' && !sameOrigin(request)) return error('Invalid origin', 403);
    const url = new URL(request.url);
    let input = {};
    if (request.method === 'POST') {
      if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
        if (Number(request.headers.get('content-length') || 0) > 3_500_000) return error('Request too large', 413);
        try { input = Object.fromEntries((await request.formData()).entries()); }
        catch { return error('Invalid file upload', 400); }
        if (input.action !== 'certificates.upload') return error('Invalid upload action', 400);
      } else {
        const raw = await request.text();
        if (raw.length > 24000) return error('Request too large', 413);
        try { input = JSON.parse(raw || '{}'); }
        catch { return error('Invalid JSON', 400); }
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return error('Invalid request', 400);
    }
    const action = request.method === 'GET' ? url.searchParams.get('action') : input.action;
    const targetVesselId = request.method === 'GET' ? url.searchParams.get('vesselId') : input.vesselId;
    const grant = login === TRAINING_OWNER ? { role: 'owner' } :
      await readTrainingGrant(login, await database());
    if (!trainingAccess({ login, grant, vesselIds: grant?.vesselIds, action, targetVesselId })) {
      return error('Training permission denied', 403);
    }
    if (action?.startsWith('crew.')) {
      if (request.method === 'GET' && action !== 'crew.list') return error('Method not allowed', 405);
      if (request.method === 'POST' && action === 'crew.list') return error('Method not allowed', 405);
      return handleCrew({ action, input, vesselId: targetVesselId, login, sql: await database() });
    }
    if (action?.startsWith('courses.') || action?.startsWith('matrix.') || action === 'requirements.list') {
      const readAction = ['courses.list', 'matrix.list', 'requirements.list'].includes(action);
      if ((request.method === 'GET') !== readAction) return error('Method not allowed', 405);
      return handleMatrix({ action, input: request.method === 'GET'
        ? Object.fromEntries(url.searchParams) : input, vesselId: targetVesselId, login, sql: await database() });
    }
    if (action?.startsWith('sessions.') || action?.startsWith('enrollments.')) {
      const readAction = ['sessions.list','enrollments.list'].includes(action);
      if ((request.method === 'GET') !== readAction) return error('Method not allowed', 405);
      return handleSessions({ action, input, vesselId: targetVesselId, login, sql: await database() });
    }
    if (action?.startsWith('outcomes.')) {
      if ((request.method === 'GET') !== (action === 'outcomes.list')) return error('Method not allowed', 405);
      return handleOutcomes({ action, input: request.method === 'GET'
        ? Object.fromEntries(url.searchParams) : input, vesselId: targetVesselId, login, sql: await database() });
    }
    if (action?.startsWith('certificates.')) {
      const readAction = ['certificates.list','certificates.download'].includes(action);
      if ((request.method === 'GET') !== readAction) return error('Method not allowed', 405);
      if (action === 'certificates.upload' && !(input.file instanceof File))
        return error('Multipart certificate file is required', 400);
      return handleCertificates({ action, input: request.method === 'GET'
        ? Object.fromEntries(url.searchParams) : input, vesselId: targetVesselId,
        login, sql: await database(), documentStore });
    }
    if (action === 'readiness.get') {
      if (request.method !== 'GET') return error('Method not allowed', 405);
      return handleReadiness({ input: Object.fromEntries(url.searchParams),
        vesselId: targetVesselId, sql: await database() });
    }
    if (action?.startsWith('vessels.') || action?.startsWith('assignments.') ||
        action?.startsWith('availability.') || action === 'waivers.approve' || action === 'overview.get') {
      const readAction = ['vessels.list','availability.list','overview.get'].includes(action);
      if ((request.method === 'GET') !== readAction) return error('Method not allowed', 405);
      return handleSetup({ action, input: request.method === 'GET'
        ? Object.fromEntries(url.searchParams) : input, vesselId: targetVesselId,
        login, grant, sql: await database() });
    }
    return error('Training action is not implemented', 501);
  };
}

export const config = { api: { bodyParser: false } };
const nodeRoute = nodeHandler(createTrainingRoute());
export default async function handler(req, res) {
  if (req.method !== 'POST') return nodeRoute(req, res);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 3_500_000) {
      res.statusCode = 413;
      res.end('Request too large');
      return;
    }
    chunks.push(chunk);
  }
  return nodeRoute({ url: req.url, method: req.method, headers: req.headers,
    body: Buffer.concat(chunks) }, res);
}

