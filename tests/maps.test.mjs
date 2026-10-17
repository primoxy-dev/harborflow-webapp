import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapsRoute } from '../api/maps.mjs';

const request = path => new Request('https://harborflow.test/api/maps?' + path);

test('map search is private, user-triggered and returns compact place results', async () => {
  const denied = createMapsRoute({ loginFromRequest: () => null, requestJson: async () => [] });
  assert.equal((await denied(request('action=search&q=Bangkok'))).status, 401);

  let called = '';
  const route = createMapsRoute({ loginFromRequest: () => 'owner', requestJson: async url => {
    called = url;
    return { features: [{ properties: { name: 'Suvarnabhumi Airport', city: 'Bang Phli', state: 'Samut Prakan', country: 'Thailand' }, geometry: { coordinates: [100.7501, 13.69] } }] };
  } });
  const response = await route(request('action=search&q=Suvarnabhumi%20Airport'));
  assert.equal(response.status, 200);
  assert.match(called, /photon\.komoot\.io\/api/);
  assert.deepEqual((await response.json()).results, [{ name: 'Suvarnabhumi Airport', address: 'Bang Phli, Samut Prakan, Thailand', label: 'Suvarnabhumi Airport, Bang Phli, Samut Prakan, Thailand', lat: 13.69, lon: 100.7501 }]);
});

test('route endpoint returns distance, duration and geometry for two map pins', async () => {
  const route = createMapsRoute({ loginFromRequest: () => 'owner', requestJson: async url => {
    assert.match(url, /route\/v1\/driving\/100\.75,13\.69;100\.92,13\.16/);
    return { routes: [{ distance: 98765.4, duration: 5432.1, geometry: { type: 'LineString', coordinates: [[100.75,13.69],[100.92,13.16]] } }] };
  } });
  const response = await route(request('action=route&originLat=13.69&originLon=100.75&destinationLat=13.16&destinationLon=100.92'));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).route, { distanceMeters: 98765, durationSeconds: 5432, geometry: { type: 'LineString', coordinates: [[100.75,13.69],[100.92,13.16]] } });
});

test('map endpoint rejects incomplete pins and short searches', async () => {
  const route = createMapsRoute({ loginFromRequest: () => 'owner', requestJson: async () => { throw Error('should not fetch'); } });
  assert.equal((await route(request('action=search&q=AB'))).status, 400);
  assert.equal((await route(request('action=route&originLat=13'))).status, 400);
});
