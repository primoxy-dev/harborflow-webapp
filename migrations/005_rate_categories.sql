-- Active cost rates are removable without changing historical quotation snapshots.
ALTER TABLE quotation_rates ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE quotation_rate_history ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'save';
CREATE TABLE IF NOT EXISTS quotation_categories (
 port text NOT NULL, name text NOT NULL, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(port,name)
);
CREATE UNIQUE INDEX IF NOT EXISTS quotation_categories_name
 ON quotation_categories(lower(btrim(port)),lower(btrim(name)));
INSERT INTO quotation_categories(port,name,created_by)
 SELECT DISTINCT btrim(data->>'port'),
 CASE WHEN lower(btrim(data->>'category'))='crew change' THEN 'Crew Change'
 ELSE btrim(data->>'category') END,'migration'
 FROM quotation_rates WHERE removed_at IS NULL
 AND btrim(coalesce(data->>'port',''))<>'' AND btrim(coalesce(data->>'category',''))<>''
 ON CONFLICT DO NOTHING;
