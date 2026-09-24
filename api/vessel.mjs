import { nodeHandler, json } from '../lib/harborflow.mjs';

const endpoint = 'https://www.wikidata.org/w/api.php';
const headers = {
  Accept: 'application/json',
  'User-Agent': 'HarborFlow/1.0 (https://github.com/primoxy-dev/harborflow-webapp)'
};
const validImo = value => {
  if (!/^\d{7}$/.test(value)) return false;
  const sum = [...value.slice(0, 6)].reduce((total, digit, index) => total + Number(digit) * (7 - index), 0);
  return sum % 10 === Number(value[6]);
};
async function wikidata(params) {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries({ format: 'json', ...params })) url.searchParams.set(key, value);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw Error('Wikidata unavailable');
  const body = await response.json();
  if (body.error) throw Error('Wikidata unavailable');
  return body;
}
async function route(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const name = (new URL(request.url).searchParams.get('name') || '').trim();
  if (name.length < 3 || name.length > 80) return json({ error: 'Enter at least 3 letters of the vessel name' }, 400);
  try {
    const search = await wikidata({ action: 'wbsearchentities', search: name, language: 'en', type: 'item', limit: '20' });
    const candidates = (search.search || []).filter(item => /^Q\d+$/.test(item.id));
    if (!candidates.length) return json({ matches: [], source: 'Wikidata' });
    const details = await wikidata({ action: 'wbgetentities', ids: candidates.map(item => item.id).join('|'), props: 'claims' });
    const matches = candidates.flatMap(item => {
      const claims = details.entities?.[item.id]?.claims?.P458 || [];
      const imo = claims.map(claim => String(claim.mainsnak?.datavalue?.value || '')).find(validImo);
      return imo ? [{ name: item.label, description: item.description || '', imo, url: 'https://www.wikidata.org/wiki/' + item.id }] : [];
    }).slice(0, 5);
    return json({ matches, source: 'Wikidata' });
  } catch {
    return json({ error: 'IMO lookup is temporarily unavailable. You can enter the IMO manually.' }, 502);
  }
}
export default nodeHandler(route);
