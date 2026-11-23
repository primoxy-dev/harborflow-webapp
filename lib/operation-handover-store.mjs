import { randomUUID } from 'node:crypto';
import { json } from './harborflow.mjs';
import { uuid } from './operations.mjs';
import { validHandoverCase, validateHandover } from './handover-catalog.mjs';

const table = "CREATE TABLE IF NOT EXISTS operation_handover (login text PRIMARY KEY, catalog jsonb NOT NULL, revision uuid NOT NULL, progress jsonb NOT NULL DEFAULT '{}'::jsonb)";
const conflict = () => json({ error: 'ข้อมูล Handover เปลี่ยนจากอีกเครื่อง กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง' }, 409);

export async function handoverRoute({ sql, login, input }) {
  await sql.query(table);
  if (input.action === 'handover') {
    const [saved] = await sql.query('SELECT catalog,revision,progress FROM operation_handover WHERE login=$1', [login]);
    return json(saved || { catalog: null, revision: null, progress: {} });
  }
  if (input.action === 'importHandover') {
    let catalog;
    try { catalog = validateHandover(input.catalog); }
    catch (error) { return json({ error: error.message }, 400); }
    if (input.revision !== null && !uuid(input.revision)) return json({ error: 'Invalid catalog revision' }, 400);
    const revision = randomUUID();
    const data = JSON.stringify(catalog);
    const [saved] = input.revision === null
      ? await sql.query('INSERT INTO operation_handover(login,catalog,revision) VALUES($1,$2::jsonb,$3) ON CONFLICT(login) DO NOTHING RETURNING catalog,revision,progress', [login, data, revision])
      : await sql.query(
        "UPDATE operation_handover SET catalog=$2::jsonb,revision=$3,progress=CASE WHEN catalog->>'id'=$5 THEN progress ELSE '{}'::jsonb END WHERE login=$1 AND revision=$4 RETURNING catalog,revision,progress",
        [login, data, revision, input.revision, catalog.id]);
    return saved ? json(saved) : conflict();
  }

  const { revision, workflow, step, checked } = input;
  const caseRef = typeof input.caseRef === 'string' ? input.caseRef.trim() : '';
  if (!uuid(revision) || !validHandoverCase(caseRef) || typeof workflow !== 'string' || typeof step !== 'string' ||
    typeof checked !== 'boolean') return json({ error: 'Invalid checklist entry' }, 400);
  const [current] = await sql.query('SELECT catalog FROM operation_handover WHERE login=$1 AND revision=$2', [login, revision]);
  if (!current) return conflict();
  const work = current.catalog.workflows.find(item => item.id === workflow);
  if (!work?.steps.some(item => item.id === step)) return json({ error: 'Checklist entry not found' }, 404);

  const [saved] = await sql.query(
    `UPDATE operation_handover
      SET progress=jsonb_set(progress, ARRAY[$3::text],
        jsonb_set(COALESCE(progress -> $3::text, '{}'::jsonb), ARRAY[$4::text],
          CASE WHEN $6::boolean
            THEN COALESCE(progress #> ARRAY[$3::text, $4::text], '{}'::jsonb) || jsonb_build_object($5::text, true)
            ELSE COALESCE(progress #> ARRAY[$3::text, $4::text], '{}'::jsonb) - $5::text
          END, true), true)
      WHERE login=$1 AND revision=$2 RETURNING progress`,
    [login, revision, caseRef, workflow, step, checked]);
  return saved ? json(saved) : conflict();
}
