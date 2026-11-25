import { randomUUID } from 'node:crypto';
import { json } from './harborflow.mjs';
import { canPeople, uuid } from './operations.mjs';

export const crewDetailsByteLimit = 250_000;

function readRoster(value) {
  if (value?.version !== 1 || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 150 ||
      typeof value.year !== 'string' || !/^\d{4}$/.test(value.year) ||
      typeof value.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.updated) ||
      !Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > 500) return null;
  const date = new Date(value.updated);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.updated) return null;
  if (!value.rows.every(row => Array.isArray(row) && row.length === 11 &&
      row.every(cell => typeof cell === 'string' && cell.length <= 500))) return null;
  return { version: 1, title: value.title, year: value.year, updated: value.updated, rows: value.rows };
}

export async function crewDetailsRoute({ sql, login, grant, input }) {
  const editable = ['owner', 'editor'].includes(grant?.role) && canPeople(grant, 'crew', true);
  if (!canPeople(grant, 'crew') || input.action === 'saveCrewDetails' && !editable) {
    return json({ error: 'Crew permission required' }, 403);
  }
  const select = 'SELECT roster, revision FROM operation_crew_rosters WHERE login=$1';
  const returning = ' RETURNING roster, revision';
  await sql.query('CREATE TABLE IF NOT EXISTS operation_crew_rosters (login text PRIMARY KEY, roster jsonb NOT NULL, revision uuid NOT NULL)');
  if (input.action === 'crewDetails') {
    const [record] = await sql.query(select, [login]);
    return json({ roster: record?.roster ?? null, revision: record?.revision ?? null, editable });
  }

  const roster = readRoster(input.roster);
  if (!roster || (input.revision !== null && !uuid(input.revision))) return json({ error: 'Invalid crew details' }, 400);
  const args = [login, JSON.stringify(roster), randomUUID()];
  const [saved] = input.revision === null
    ? await sql.query('INSERT INTO operation_crew_rosters(login, roster, revision) VALUES ($1, $2::jsonb, $3) ON CONFLICT(login) DO NOTHING' + returning, args)
    : await sql.query('UPDATE operation_crew_rosters SET roster=$2::jsonb, revision=$3 WHERE login=$1 AND revision=$4' + returning, [...args, input.revision]);
  return saved
    ? json({ ...saved, editable })
    : json({ error: 'รายการเปลี่ยนจากอีกเครื่อง กรุณาเปิดเมนูใหม่แล้วลองอีกครั้ง' }, 409);
}
