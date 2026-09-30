-- Private account defaults for OKTB. No crew records or public document copies.
CREATE TABLE IF NOT EXISTS document_preferences (
  login text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

