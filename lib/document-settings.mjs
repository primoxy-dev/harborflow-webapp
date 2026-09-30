// Private defaults belong to the authenticated account, never to the public Job.
const keys = new Set(['contact', 'phone', 'signer', 'signature']);
export const settingsSchema = `CREATE TABLE IF NOT EXISTS document_preferences (
  login text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
)`;

export function validateSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) return 'Invalid preferences';
  for (const [key, value] of Object.entries(patch)) {
    if (!keys.has(key) || typeof value !== 'string') return 'Invalid preference field';
    if (key !== 'signature' && value.length > 200) return 'Contact fields must not exceed 200 characters';
    if (key === 'signature' && value !== '') {
      if (value.length > 700000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return 'Use a PNG/JPEG signature below 500 KB';
      const [, format, encoded] = value.match(/^data:image\/(png|jpeg);base64,(.*)$/);
      const bytes = Buffer.from(encoded, 'base64');
      if (format === 'png' ? !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return 'Invalid signature image';
    }
  }
  return null;
}

export async function readSettings(sql, login) {
  await sql.query(settingsSchema);
  const [row] = await sql.query('SELECT data FROM document_preferences WHERE login=$1', [login]);
  return row?.data || {};
}

export async function saveSettings(sql, login, patch, base) {
  const invalid = validateSettingsPatch(patch);
  if (invalid) return { status: 400, error: invalid };
  if (!base || typeof base !== 'object' || Array.isArray(base)) return { status: 400, error: 'Original values are required' };
  await sql.query(settingsSchema);
  await sql.query('INSERT INTO document_preferences(login) VALUES($1) ON CONFLICT(login) DO NOTHING', [login]);
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await sql.query('SELECT data,version FROM document_preferences WHERE login=$1', [login]);
    const conflicts = Object.keys(patch).filter(key => (row.data[key] || '') !== (base[key] || ''));
    if (conflicts.length) return { status: 409, error: 'ข้อมูลล่าสุดเปลี่ยนจากอีกเครื่อง กรุณาเปิดแท็บใหม่เพื่อตรวจความต่างก่อนบันทึก', conflicts, preferences: row.data };
    const [saved] = await sql.query(`UPDATE document_preferences SET data=data || $2::jsonb,version=version+1,updated_at=now() WHERE login=$1 AND version=$3 RETURNING data`, [login, JSON.stringify(patch), row.version]);
    if (saved) return { status: 200, preferences: saved.data };
  }
  return { status: 409, error: 'Concurrent change; reopen and review preferences' };
}

