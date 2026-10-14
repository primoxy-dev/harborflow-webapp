const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const types = new Set(['application/pdf','image/jpeg','image/png']);
const MAX_BYTES = 3_000_000;

export function certificatePath(crewId, certificateId, filename) {
  if (!uuid(crewId) || !uuid(certificateId)) throw Error('Invalid certificate path IDs');
  const safe = String(filename || '').replace(/[\\/<>:"|?*\x00-\x1f]/g, ' ')
    .replace(/\.\./g, ' ').replace(/\s+/g, ' ').replace(/^\.+|\.+$/g, '').trim().slice(0,100);
  if (!safe) throw Error('Certificate filename is required');
  return `Training/Crew/${crewId}/Certificates/${certificateId}/${safe}`;
}

export function validateCertificateFile(file) {
  if (!types.has(file?.type)) return 'Unsupported certificate type';
  if (!Number.isInteger(file?.size) || file.size < 1) return 'Certificate is empty';
  if (file.size > MAX_BYTES) return 'Certificate exceeds 3 MB';
  if (!file.name || String(file.name).length > 160) return 'Invalid certificate filename';
  return null;
}

export function validateCertificateBytes(bytes, type) {
  const b = Buffer.from(bytes);
  if (type === 'application/pdf') return b.subarray(0,5).toString('ascii') === '%PDF-' ? null : 'Invalid PDF content';
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? null : 'Invalid JPEG content';
  if (type === 'image/png') return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? null : 'Invalid PNG content';
  return 'Unsupported certificate type';
}

