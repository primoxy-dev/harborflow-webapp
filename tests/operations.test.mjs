import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditJob, canEditService, canPeople, fieldConflicts, permission, validateJob, validateService } from '../lib/operations.mjs';

test('Draft may omit Job No.; Planned and Confirmed enforce milestones', () => {
  assert.equal(validateJob({ status: 'Draft' }), null);
  assert.match(validateJob({ status: 'Planned', vessel: 'Demo' }), /Vessel, port and ETA/);
  assert.match(validateJob({ status: 'Confirmed', vessel: 'Demo', port: 'Map Ta Phut', eta: '2026-09-24T08:00' }), /Job No./);
  assert.equal(validateJob({ status: 'Confirmed', vessel: 'Demo', port: 'Map Ta Phut', eta: '2026-09-24T08:00', jobNo: 'TEST-1', principal: 'Fictional', pic: 'primoxy-dev' }), null);
  assert.match(validateJob({ status: 'Draft', eta: 'not-a-date' }), /Invalid date/);
});

test('restricted or unverified service needs a reason or terminal confirmation before work', () => {
  const base = { type: 'Fresh Water', status: 'Not Started' };
  assert.equal(validateService(base), null);
  assert.match(validateService({ ...base, planConfirmed: true }), /Terminal confirmation/);
  assert.equal(validateService({ ...base, planConfirmed: true, restrictionReason: 'Trial exception' }), null);
  assert.match(validateService({ ...base, actualStart: '2026-09-24T08:00' }), /Terminal confirmation/);
});

test('field conflict lists original, shared and local; unrelated field does not conflict', () => {
  assert.deepEqual(fieldConflicts({ eta: 'B', etd: 'X' }, { eta: 'A' }, { eta: 'C' }), [{ field: 'eta', original: 'A', shared: 'B', local: 'C' }]);
  assert.deepEqual(fieldConflicts({ eta: 'B', etd: 'X' }, { etd: 'X' }, { etd: 'Y' }), []);
  assert.deepEqual(fieldConflicts({ details: { quantity: '20', unit: 'MT' } }, { details: { unit: 'MT' } }, { details: { unit: 'Tonnes' } }), []);
  assert.equal(fieldConflicts({ details: { quantity: '20' } }, { details: { quantity: '10' } }, { details: { quantity: '30' } })[0].field, 'details.quantity');
});

test('PIC alone never grants editing; Crew and Visitor grants are independent', () => {
  const job = { data: { pic: 'alice' } }, service = { data: { pic: 'bob' } };
  assert.equal(canEditJob({ role: 'viewer' }, 'alice', job), false);
  assert.equal(canEditJob({ role: 'editor' }, 'alice', job), true);
  assert.equal(canEditService({ role: 'editor' }, 'bob', job, service), true);
  assert.equal(canEditService({ role: 'viewer' }, 'bob', job, service), false);
  assert.equal(canPeople({ crewView: true, visitorView: false }, 'crew'), true);
  assert.equal(canPeople({ crewView: true, visitorView: false }, 'visitor'), false);
  assert.equal(canPeople({ crewView: true, crewEdit: false }, 'crew', true), false);
});

test('non-owner grant lookup uses Neon 1.x query API', async () => {
  const sql = Object.assign(() => { throw Error('Legacy call API must not be used'); }, {
    query: async (query, params) => {
      assert.match(query, /operation_grants/);
      assert.deepEqual(params, ['alice']);
      return [{ role: 'viewer', crew_view: false, crew_edit: false, visitor_view: true, visitor_edit: false }];
    }
  });
  assert.deepEqual(await permission('alice', sql), { role: 'viewer', crewView: false, crewEdit: false, visitorView: true, visitorEdit: false });
});

