-- Private online documents only; apply to the Operations Neon database, never public GitHub storage.
CREATE TABLE IF NOT EXISTS document_records (
 record_key text PRIMARY KEY, job_id uuid NOT NULL REFERENCES operation_jobs(id), service_key text NOT NULL,
 type text NOT NULL CHECK(type IN ('oktb','permit','loi')), section text NOT NULL CHECK(section IN ('common','crew','visitor')),
 data jsonb NOT NULL DEFAULT '{}'::jsonb, version integer NOT NULL DEFAULT 1, source_fingerprint text NOT NULL,
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS document_record_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_key text NOT NULL REFERENCES document_records(record_key),
 version integer NOT NULL, actor text NOT NULL, before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
