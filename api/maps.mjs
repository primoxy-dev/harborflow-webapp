import { nodeHandler, json, sessionLogin } from '../lib/harborflow.mjs';

const cache = new Map();
const APP_ID = 'HarborFlow/0.1 (+https://harborflow-webapp.vercel.app/)';
const number = value => value !== null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const cached = (key, ttl, load) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttl) return Promise.resolve(hit.value);
  return load().then(value => { cache.set(key, { time: Date.now(), value }); return value; });
};
const fetchJson = async url => {
  const response = await fetch(url, { headers: { 'User-Agent': APP_ID, Accept: 'application/json' } });
  if (!response.ok) throw Error('Map provider request failed');
  return response.json();
};

export function createMapsRoute({ loginFromRequest = sessionLogin, requestJson = fetchJson } = {}) {
  return async request => {
    if (!loginFromRequest(request)) return json({ error: 'Sign in required' }, 401);
    if (request.method !== 'GET') return json({ error: 'Unsupported method' }, 405);
    const url = new URL(request.url), action = url.searchParams.get('action');
    try {
      if (action === 'search') {
        const query = String(url.searchParams.get('q') || '').trim().slice(0, 160);
        if (query.length < 3) return json({ error: 'Enter at least 3 characters' }, 400);
        const key = 'search:' + query.toLowerCase();
        const source = `https://photon.komoot.io/api/?limit=6&lang=en&q=${encodeURIComponent(query)}`;
        const body = await cached(key, 48 * 60 * 60 * 1000, () => requestJson(source));
        const results = (body.features || []).slice(0, 6).map(feature => {
          const properties = feature.properties || {}, coordinates = feature.geometry?.coordinates || [];
          const name = properties.name || properties.street || properties.city || properties.country || query;
          const address = [properties.housenumber, properties.street, properties.district, properties.city, properties.county, properties.state, properties.postcode, properties.country]
            .filter((value, index, list) => value && value !== name && list.indexOf(value) === index).join(', ');
          return { name, address, label: [name, address].filter(Boolean).join(', '), lat: Number(coordinates[1]), lon: Number(coordinates[0]) };
        }).filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lon));
        return json({ results });
      }
      if (action === 'reverse') {
        const lat = number(url.searchParams.get('lat')), lon = number(url.searchParams.get('lon'));
        if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'Invalid map pin' }, 400);
        const key = `reverse:${lat.toFixed(5)},${lon.toFixed(5)}`;
        const source = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en,th&lat=${lat}&lon=${lon}`;
        const row = await cached(key, 7 * 24 * 60 * 60 * 1000, () => requestJson(source));
        return json({ result: { label: row.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon } });
      }
      if (action === 'route') {
        const values = ['originLat','originLon','destinationLat','destinationLon'].map(key => number(url.searchParams.get(key)));
        if (values.some(value => value === null)) return json({ error: 'Both map pins are required' }, 400);
        const [originLat, originLon, destinationLat, destinationLon] = values;
        const key = `route:${values.map(value => value.toFixed(5)).join(',')}`;
        const source = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destinationLon},${destinationLat}?overview=full&geometries=geojson&steps=false`;
        const body = await cached(key, 24 * 60 * 60 * 1000, () => requestJson(source));
        const route = body.routes?.[0];
        if (!route) return json({ error: 'No driving route found between these pins' }, 404);
        return json({ route: { distanceMeters: Math.round(route.distance), durationSeconds: Math.round(route.duration), geometry: route.geometry } });
      }
      return json({ error: 'Unknown map action' }, 404);
    } catch (error) {
      return json({ error: error.message || 'Map service unavailable' }, 502);
    }
  };
}

export default nodeHandler(createMapsRoute());
