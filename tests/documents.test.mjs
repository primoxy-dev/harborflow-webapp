import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentPreview } from '../lib/document-preview.mjs';

const job = { id: 'job-1', data: { jobNo: 'DEMO-001', vessel: 'Demo Vessel', port: 'Demo Port', eta: '2026-09-30T08:00', principal: 'Demo Principal' } };
const people = [{ kind: 'crew', data: { name: 'Sensitive Name', passport: 'Sensitive Passport', category: 'Sensitive Category', flights: [{ number: 'Sensitive Flight' }] } }, { kind: 'visitor', data: { name: 'Visitor Name', passport: 'Visitor Passport', category: 'Surveyors' } }];
const trips = [{ data: { kind: 'car', origin: 'Sensitive Hotel', destination: 'Sensitive Terminal', personIds: ['person-1'] } }];

for (const type of ['oktb','permit','loi']) test(`${type} derives a masked draft from the shared Job, people and travel`, () => {
  const preview = buildDocumentPreview(type, job, people, trips);
  assert.equal(preview.job.jobNo, 'DEMO-001');
  assert.deepEqual(preview.counts, { crew: 1, visitors: 1, car: 1, boat: 0 });
  assert.equal(preview.downloadAllowed, false);
  const serialized = JSON.stringify(preview);
  for (const secret of ['Sensitive Name','Sensitive Passport','Sensitive Flight','Sensitive Hotel','Sensitive Terminal','Sensitive Category','Visitor Name','Visitor Passport']) assert.ok(!serialized.includes(secret), `${type} leaked ${secret}`);
});

test('unknown document type is rejected', () => assert.throws(() => buildDocumentPreview('other', job), /Unknown document type/));

