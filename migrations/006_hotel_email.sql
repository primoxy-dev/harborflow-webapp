CREATE TABLE IF NOT EXISTS hotel_email_templates (
  branch_key text NOT NULL,
  id uuid NOT NULL,
  name text NOT NULL,
  data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (branch_key, id)
);

CREATE TABLE IF NOT EXISTS hotel_email_drafts (
  booking_id uuid NOT NULL REFERENCES operation_trips(id) ON DELETE CASCADE,
  login text NOT NULL,
  data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (booking_id, login)
);
