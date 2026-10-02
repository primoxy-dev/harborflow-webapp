import { nodeHandler, json, sessionLogin } from '../lib/harborflow.mjs';

const cache = new Map();
const ttl = 5 * 60 * 1000;
const addressOf = p => [p.housenumber, p.street, p.district, p.city, p.state, p.postcode, p.country]
  .filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(', ');

export async function searchHotels(request) {
  if (request.method !== 'GET') return json({ error: 'Unsupported method' }, 405);
  if (!sessionLogin(request)) return json({ error: 'Sign in required' }, 401);
  const query = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (query.length < 3 || query.length > 100) return json({ error: 'Enter at least 3 characters' }, 400);
  const key = query.toLocaleLowerCase();
  const found = cache.get(key);
  if (found && found.expires > Date.now()) return json({ hotels: found.hotels });
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('osm_tag', 'tourism:hotel');
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return json({ error: 'Hotel search is temporarily unavailable' }, 502);
    const data = await response.json();
    const hotels = (Array.isArray(data.features) ? data.features : []).map(feature => {
      const p = feature.properties || {};
      return { name: String(p.name || '').slice(0, 300), address: addressOf(p).slice(0, 300) };
    }).filter(hotel => hotel.name);
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { hotels, expires: Date.now() + ttl });
    return json({ hotels });
  } catch {
    return json({ error: 'Hotel search is temporarily unavailable' }, 502);
  }
}

export default nodeHandler(searchHotels);
