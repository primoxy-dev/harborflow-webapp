// The existing Operations database is private; no commercial data is written to GitHub.
const schemas = [
  `CREATE TABLE IF NOT EXISTS quotation_grants (login text PRIMARY KEY REFERENCES operation_grants(login) ON DELETE CASCADE, quote_view boolean NOT NULL DEFAULT false, quote_edit boolean NOT NULL DEFAULT false, cost_view boolean NOT NULL DEFAULT false, cost_manage boolean NOT NULL DEFAULT false, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS quotation_rates (id uuid PRIMARY KEY, data jsonb NOT NULL, status text NOT NULL CHECK(status IN ('pending','approved')), version integer NOT NULL DEFAULT 1, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS quotation_rate_history (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, rate_id uuid NOT NULL, version integer NOT NULL, actor text NOT NULL, data jsonb NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS quotations (id uuid PRIMARY KEY, job_id uuid REFERENCES operation_jobs(id), created_by text NOT NULL, shared_with text[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent')), revision integer NOT NULL DEFAULT 1, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS quotation_revisions (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, quotation_id uuid NOT NULL REFERENCES quotations(id), revision integer NOT NULL, data jsonb NOT NULL, job_id uuid, actor text NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(), UNIQUE(quotation_id,revision))`
];
export async function ensureQuotationSchema(sql){
  const [check]=await sql.query(`SELECT to_regclass('public.quotation_revisions') AS ready,
    to_regclass('public.quotation_categories') AS categories_ready,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotation_rates' AND column_name='removed_at') AS removal_ready,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotation_rate_history' AND column_name='action') AS action_ready`);
  if(check?.ready&&check?.categories_ready&&check?.removal_ready&&check?.action_ready)return;
  if(!check?.ready)for(const schema of schemas)await sql.query(schema);
  await sql.query('ALTER TABLE quotation_rates ADD COLUMN IF NOT EXISTS removed_at timestamptz');
  await sql.query("ALTER TABLE quotation_rate_history ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'save'");
  await sql.query('CREATE TABLE IF NOT EXISTS quotation_categories (port text NOT NULL,name text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(port,name))');
  await sql.query('CREATE UNIQUE INDEX IF NOT EXISTS quotation_categories_name ON quotation_categories(lower(btrim(port)),lower(btrim(name)))');
  await sql.query(`INSERT INTO quotation_categories(port,name,created_by)
    SELECT DISTINCT btrim(data->>'port'),CASE WHEN lower(btrim(data->>'category'))='crew change' THEN 'Crew Change' ELSE btrim(data->>'category') END,'migration'
    FROM quotation_rates WHERE removed_at IS NULL AND btrim(coalesce(data->>'port',''))<>'' AND btrim(coalesce(data->>'category',''))<>'' ON CONFLICT DO NOTHING`);
}
