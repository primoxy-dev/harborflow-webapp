CREATE TABLE IF NOT EXISTS operation_provision_items (
  id uuid PRIMARY KEY,
  service_id uuid NOT NULL REFERENCES operation_services(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  email_name text,
  email_data bytea,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((email_name IS NULL) = (email_data IS NULL))
);
CREATE INDEX IF NOT EXISTS operation_provision_items_service ON operation_provision_items(service_id, created_at);
