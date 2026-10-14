-- Online trial only: use fictional or de-identified crew records.
-- Apply after 001_operations.sql. Training grants do not inherit Operations grants.
CREATE TABLE IF NOT EXISTS training_grants (
  login text PRIMARY KEY CHECK (login ~ '^[a-z0-9-]{1,39}$'),
  role text NOT NULL CHECK (role IN ('viewer','coordinator','approver','officer')),
  granted_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS training_vessels (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  vessel_type text NOT NULL DEFAULT '',
  operation_job_id uuid REFERENCES operation_jobs(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE TABLE IF NOT EXISTS training_vessel_assignments (
  id uuid PRIMARY KEY,
  vessel_id uuid NOT NULL REFERENCES training_vessels(id),
  officer_login text NOT NULL CHECK (officer_login ~ '^[a-z0-9-]{1,39}$'),
  assigned_by text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS training_officer_vessel_active
  ON training_vessel_assignments(vessel_id, officer_login) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS training_crew (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  rank text NOT NULL,
  department text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE TABLE IF NOT EXISTS training_crew_assignments (
  id uuid PRIMARY KEY,
  crew_id uuid NOT NULL REFERENCES training_crew(id),
  vessel_id uuid NOT NULL REFERENCES training_vessels(id),
  joins_on date,
  leaves_on date,
  rank text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CHECK (leaves_on IS NULL OR joins_on IS NULL OR leaves_on >= joins_on)
);
CREATE INDEX IF NOT EXISTS training_crew_assignments_vessel
  ON training_crew_assignments(vessel_id, crew_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS training_crew_job_links (
  id uuid PRIMARY KEY,
  crew_id uuid NOT NULL REFERENCES training_crew(id),
  operation_person_id uuid NOT NULL REFERENCES operation_people(id),
  reviewed_by text NOT NULL,
  review_reason text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS training_person_one_active_link
  ON training_crew_job_links(operation_person_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS training_courses (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  mode text NOT NULL CHECK (mode IN ('shore','onboard','online')),
  prerequisites jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT '',
  pass_criteria text NOT NULL DEFAULT '',
  refresh_months integer CHECK (refresh_months > 0),
  owner_login text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE TABLE IF NOT EXISTS training_matrix_rules (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES training_courses(id),
  rank text,
  vessel_type text,
  vessel_id uuid REFERENCES training_vessels(id),
  effective_from date NOT NULL,
  effective_until date,
  recurrence_months integer CHECK (recurrence_months > 0),
  due_days_before_join integer NOT NULL DEFAULT 0 CHECK (due_days_before_join >= 0),
  source text NOT NULL,
  owner_login text NOT NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','approved','retired')),
  approved_by text,
  approved_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);
CREATE INDEX IF NOT EXISTS training_matrix_effective
  ON training_matrix_rules(effective_from, effective_until, state);

CREATE TABLE IF NOT EXISTS training_waivers (
  id uuid PRIMARY KEY,
  crew_id uuid NOT NULL REFERENCES training_crew(id),
  rule_id uuid NOT NULL REFERENCES training_matrix_rules(id),
  reason text NOT NULL,
  expires_on date NOT NULL,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES training_courses(id),
  vessel_id uuid REFERENCES training_vessels(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  display_zone text NOT NULL,
  instructor text NOT NULL DEFAULT '',
  venue text NOT NULL DEFAULT '',
  capacity integer NOT NULL CHECK (capacity > 0),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','proposed','confirmed','completed','cancelled')),
  proposed_change jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS training_sessions_calendar ON training_sessions(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS training_enrollments (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES training_sessions(id),
  crew_id uuid NOT NULL REFERENCES training_crew(id),
  idempotency_key text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (session_id, crew_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS training_enrollment_idempotency
  ON training_enrollments(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS training_outcomes (
  id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL REFERENCES training_enrollments(id),
  attendance text NOT NULL CHECK (attendance IN ('pending','present','absent')),
  assessment text NOT NULL CHECK (assessment IN ('pending','passed','failed')),
  assessor text NOT NULL,
  evidence_note text NOT NULL DEFAULT '',
  correction_of uuid REFERENCES training_outcomes(id),
  correction_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, version)
);

CREATE TABLE IF NOT EXISTS training_certificates (
  id uuid PRIMARY KEY,
  crew_id uuid NOT NULL REFERENCES training_crew(id),
  course_id uuid NOT NULL REFERENCES training_courses(id),
  outcome_id uuid REFERENCES training_outcomes(id),
  issuer text NOT NULL,
  issued_on date NOT NULL,
  expires_on date,
  file_path text NOT NULL,
  file_sha text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  review_state text NOT NULL DEFAULT 'pending'
    CHECK (review_state IN ('pending','verified','rejected','replaced')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_reason text,
  replaces_id uuid REFERENCES training_certificates(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_certificates_crew
  ON training_certificates(crew_id, course_id, review_state);

CREATE TABLE IF NOT EXISTS training_availability (
  id uuid PRIMARY KEY,
  crew_id uuid NOT NULL REFERENCES training_crew(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('duty','travel','leave','available')),
  source text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS training_availability_crew
  ON training_availability(crew_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS training_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  actor text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_events_record ON training_events(scope, record_id, id DESC);

