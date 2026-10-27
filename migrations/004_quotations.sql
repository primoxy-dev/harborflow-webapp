-- Private commercial records. Apply in the Operations database; never publish supplier rates as static assets.
CREATE TABLE IF NOT EXISTS quotation_grants (
 login text PRIMARY KEY REFERENCES operation_grants(login) ON DELETE CASCADE,
 quote_view boolean NOT NULL DEFAULT false, quote_edit boolean NOT NULL DEFAULT false,
 cost_view boolean NOT NULL DEFAULT false, cost_manage boolean NOT NULL DEFAULT false,
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotation_rates (
 id uuid PRIMARY KEY, data jsonb NOT NULL, status text NOT NULL CHECK(status IN ('pending','approved')),
 version integer NOT NULL DEFAULT 1, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotation_rate_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, rate_id uuid NOT NULL, version integer NOT NULL,
 actor text NOT NULL, data jsonb NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotations (
 id uuid PRIMARY KEY, job_id uuid REFERENCES operation_jobs(id), created_by text NOT NULL,
 shared_with text[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent')),
 revision integer NOT NULL DEFAULT 1, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotation_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, quotation_id uuid NOT NULL REFERENCES quotations(id),
 revision integer NOT NULL, data jsonb NOT NULL, job_id uuid, actor text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(), UNIQUE(quotation_id,revision)
);
