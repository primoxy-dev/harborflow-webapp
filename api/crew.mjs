import { authorized, categoryName, configReady, gh, jobPath, json, putFile, readJson, sameOrigin } from '../lib/harborflow.mjs';

async function existing(base) {
  const listing = await gh('GET', base);
  if (!listing) return [];
  if (!Array.isArray(listing)) throw Error('Service path is a file');
  const groups = await Promise.all(listing.filter(item => item.type === 'dir').map(async item => ({
    category: item.name, file: await readJson(`${base}/${item.name}/crew.json`)
  })));
  return groups.filter(group => group.file);
}
function details(url, body) {
  const job = body ? body.job : { name: url.searchParams.get('vessel'), jobNo: url.searchParams.get('jobNo'), eta: url.searchParams.get('eta') };
  const service = body ? body.service : url.searchParams.get('service');
  return jobPath(job, service);
}
export default async function handler(request) {
  if (!configReady()) return json({ error: 'Private GitHub storage is not configured' }, 503);
  if (!authorized(request)) return json({ error: 'Sign in as primoxy-dev to access crew records' }, 401);
  try {
    if (request.method === 'GET') {
      const base = details(new URL(request.url));
      const groups = await existing(base);
      return json({ crew: groups.flatMap(group => Array.isArray(group.file.data?.crew) ? group.file.data.crew : []) });
    }
    if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
    const raw = await request.text();
    if (raw.length > 900000) return json({ error: 'Crew record is too large' }, 413);
    const body = JSON.parse(raw);
    const base = details(null, body);
    if (!Array.isArray(body.crew) || body.crew.length > 250) return json({ error: 'Invalid crew list' }, 400);
    const groups = new Map();
    for (const person of body.crew) {
      if (!person || typeof person !== 'object' || typeof person.id !== 'string' || typeof person.name !== 'string') return json({ error: 'Invalid crew member' }, 400);
      const category = categoryName(person);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(person);
    }
    const old = await existing(base);
    for (const [category, people] of groups) {
      const path = `${base}/${category}/crew.json`;
      await putFile(path, JSON.stringify({ version: 1, crew: people }, null, 2) + '\n', `Save crew records for ${category}`);
    }
    for (const group of old) {
      if (groups.has(group.category)) continue;
      await gh('DELETE', `${base}/${group.category}/crew.json`, { message: `Remove empty crew category ${group.category}`, sha: group.file.sha });
    }
    return json({ saved: true, path: base, categories: [...groups.keys()] });
  } catch (error) {
    return json({ error: error.message || 'Could not save crew records' }, error instanceof SyntaxError ? 400 : 500);
  }
}
