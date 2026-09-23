import { authorized, categoryName, configReady, jobPath, json, putFile, safeName, sameOrigin } from '../lib/harborflow.mjs';

const folders = { passport: 'Passport', seamanBook: 'Seaman Book', flight: 'Flight', visa: 'Visa - permission' };
const mime = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
export default async function handler(request) {
  if (!configReady()) return json({ error: 'Private GitHub storage is not configured' }, 503);
  if (!authorized(request)) return json({ error: 'Sign in as primoxy-dev to attach documents' }, 401);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 4000000) return json({ error: 'File is too large; limit is 3 MB' }, 413);
    const body = JSON.parse(raw);
    const folder = folders[body.type];
    const extension = mime[body.mimeType];
    const name = safeName(body.filename, 100);
    const personId = safeName(body.personId, 80);
    const recordId = safeName(body.recordId, 80);
    if (!folder || !extension || !name.toLowerCase().endsWith(extension) || !personId || !recordId) return json({ error: 'Attach a PDF, JPEG or PNG file with a valid name' }, 400);
    if (typeof body.contentBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.contentBase64)) return json({ error: 'Invalid file content' }, 400);
    const bytes = Buffer.from(body.contentBase64, 'base64');
    if (!bytes.length || bytes.length > 3 * 1024 * 1024) return json({ error: 'File must be smaller than 3 MB' }, 413);
    const validBytes = body.mimeType === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : body.mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) : bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
    if (!validBytes) return json({ error: 'File content does not match its type' }, 400);
    const base = jobPath(body.job, body.service);
    const category = categoryName(body.person);
    const path = `${base}/${category}/${folder}/${personId}/${body.type === 'flight' ? `${recordId}/` : ''}${name}`;
    await putFile(path, bytes, `Attach ${folder} file ${name}`);
    return json({ attachment: { name, path, type: body.mimeType, size: bytes.length } });
  } catch (error) {
    return json({ error: error.message || 'Could not attach file' }, error instanceof SyntaxError ? 400 : 500);
  }
}
