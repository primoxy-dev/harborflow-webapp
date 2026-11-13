import { randomUUID } from 'node:crypto';
import { json } from './harborflow.mjs';
import { uuid } from './operations.mjs';

export function hotelBranchKey({hotel, address}) {
  const normalize = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const name = normalize(hotel), location = normalize(address);
  return name && location ? JSON.stringify([name, location]) : null;
}

export function validHotelEmail(data) {
  return Boolean(data && ['to','cc'].every(key => typeof data[key] === 'string' && data[key].length <= 2000)
    && typeof data.subject === 'string' && data.subject.length <= 500
    && typeof data.body === 'string' && data.body.length <= 40000);
}

export async function hotelEmailRoute({sql, grant, login, input, service, job, editable}) {
  const fail = (error, status = 400) => json({error}, status);
  if (!editable) return fail('Assigned Service and person edit permission required', 403);
  if (!uuid(input.bookingId)) return fail('Invalid booking');
  const [booking] = await sql.query("SELECT * FROM operation_trips WHERE id=$1 AND service_id=$2 AND data->>'kind'='hotel' AND removed_at IS NULL", [input.bookingId, service.id]);
  if (!booking) return fail('Hotel booking not found', 404);

  const branch = hotelBranchKey(booking.data), canManage = grant.role === 'owner';
  if (input.action === 'hotelEmail') {
    const [templates, drafts] = await Promise.all([
      branch ? sql.query('SELECT id,name,data,version FROM hotel_email_templates WHERE branch_key=$1 ORDER BY lower(name),id', [branch]) : [],
      sql.query('SELECT data,version FROM hotel_email_drafts WHERE booking_id=$1 AND login=$2', [booking.id, login])
    ]);
    return json({booking:booking.data, vessel:job.data.vessel, templates, draft:drafts[0] ?? null, canManage, branch});
  }

  if (input.action !== 'saveHotelEmailDraft') {
    if (!canManage) return fail('Only Operations owners can manage hotel email templates', 403);
    if (!branch || input.branch !== branch) return fail('Hotel name or address changed. Reopen Compose Email.', 409);
    if (input.action === 'removeHotelEmailTemplate') {
      if (!uuid(input.id) || !Number.isInteger(input.version)) return fail('Invalid template version');
      const removed = await sql.query('DELETE FROM hotel_email_templates WHERE branch_key=$1 AND id=$2 AND version=$3 RETURNING id', [branch, input.id, input.version]);
      return removed.length ? json({removed:removed[0].id}) : fail('Template changed elsewhere. Reopen Compose Email.', 409);
    }
  }

  if (!validHotelEmail(input.data)) return fail('Email fields are invalid or too long');
  const data = JSON.stringify(Object.fromEntries(['to','cc','subject','body'].map(key => [key,input.data[key]])));
  if (!Number.isInteger(input.version) || input.version < 0) return fail('Invalid email version');
  if (input.action === 'saveHotelEmailDraft') {
    const [saved] = input.version === 0
      ? await sql.query('INSERT INTO hotel_email_drafts(booking_id,login,data) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING version', [booking.id,login,data])
      : await sql.query('UPDATE hotel_email_drafts SET data=$3::jsonb,version=version+1 WHERE booking_id=$1 AND login=$2 AND version=$4 RETURNING version', [booking.id,login,data,input.version]);
    return saved ? json(saved) : fail('Draft changed on another device. Copy your edits before reopening.',409);
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120) return fail('Enter a template name of up to 120 characters');
  if (input.id && (!uuid(input.id) || !input.version)) return fail('Invalid template version');
  const [saved] = input.id
    ? await sql.query('UPDATE hotel_email_templates SET name=$3,data=$4::jsonb,version=version+1 WHERE branch_key=$1 AND id=$2 AND version=$5 RETURNING id,name,data,version', [branch,input.id,name,data,input.version])
    : await sql.query('INSERT INTO hotel_email_templates(branch_key,id,name,data) VALUES($1,$2,$3,$4::jsonb) RETURNING id,name,data,version', [branch,randomUUID(),name,data]);
  return saved ? json({template:saved}) : fail('Template changed elsewhere. Reopen Compose Email.',409);
}
