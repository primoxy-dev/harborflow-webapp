-- Trial data only. Do not import real crew or visitor identity records.
CREATE TABLE IF NOT EXISTS operation_grants (
  login text PRIMARY KEY CHECK (login ~ '^[a-z0-9-]{1,39}$'),
  role text NOT NULL CHECK (role IN ('viewer', 'editor')),
  crew_view boolean NOT NULL DEFAULT false,
  crew_edit boolean NOT NULL DEFAULT false,
  visitor_view boolean NOT NULL DEFAULT false,
  visitor_edit boolean NOT NULL DEFAULT false,
  granted_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operation_jobs (
  id uuid PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  next_service_seq integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS operation_job_no_unique
  ON operation_jobs (lower(nullif(btrim(data->>'jobNo'), '')));
CREATE INDEX IF NOT EXISTS operation_jobs_eta ON operation_jobs ((data->>'eta'));

CREATE TABLE IF NOT EXISTS operation_services (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES operation_jobs(id),
  seq integer NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  removed_at timestamptz,
  removed_by text,
  removed_reason text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, seq)
);
CREATE INDEX IF NOT EXISTS operation_services_job ON operation_services (job_id);

CREATE TABLE IF NOT EXISTS operation_people (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES operation_jobs(id),
  kind text NOT NULL CHECK (kind IN ('crew', 'visitor')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  removed_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operation_people_job ON operation_people (job_id);

CREATE TABLE IF NOT EXISTS operation_trips (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES operation_jobs(id),
  service_id uuid REFERENCES operation_services(id),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  removed_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operation_trips_job ON operation_trips (job_id);

CREATE TABLE IF NOT EXISTS operation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('job', 'service', 'crew', 'visitor', 'trip', 'grant')),
  record_id text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operation_events_record ON operation_events (scope, record_id, id DESC);

