import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDocumentStore } from '../api/training.mjs';
import { certificatePath, validateCertificateFile } from '../lib/training/documents.mjs';
import { createTrainingRoute } from '../api/training.mjs';

const crewId = '3bf79fc8-30f0-43ac-93fb-d635da1a43a6';
const certificateId = '8f25a70d-50cf-48a4-9383-88a1d1adfd2d';

test('certificate path is cross-Job and strips unsafe filename', () => {
  const path = certificatePath(crewId, certificateId, '../Passport: Test.pdf');
  assert.equal(path, `Training/Crew/${crewId}/Certificates/${certificateId}/Passport Test.pdf`);
  assert.ok(!path.includes('Jobs/'));
});

test('certificate accepts only PDF/JPEG/PNG up to 3 MB', () => {
  assert.equal(validateCertificateFile({ name: 'Test.pdf', type: 'application/pdf', size: 1024 }), null);
  assert.equal(validateCertificateFile({ name: 'Test.exe', type: 'application/octet-stream', size: 10 }), 'Unsupported certificate type');
  assert.equal(validateCertificateFile({ name: 'Test.pdf', type: 'application/pdf', size: 3_000_001 }), 'Certificate exceeds 3 MB');
});

test('officer cannot download vessel B certificate', async () => {
  let queries = 0;
  const route = createTrainingRoute({
    database: () => ({ query: () => { queries++; throw Error('No record query allowed'); } }),
    loginFromRequest: () => 'officer',
    readTrainingGrant: async () => ({ role: 'officer', vesselIds: ['vessel-a'] })
  });
  const response = await route(new Request(`https://example.test/api/training?action=certificates.download&vesselId=vessel-b&id=${certificateId}`));
  assert.equal(response.status, 403);
  assert.equal(queries, 0);
});

test('officer cannot download vessel B file while claiming vessel A', async () => {
  let downloads = 0;
  const route = createTrainingRoute({
    database: () => ({ query: async () => [] }),
    loginFromRequest: () => 'officer',
    readTrainingGrant: async () => ({ role: 'officer', vesselIds: ['vessel-a'] }),
    documentStore: { get: async () => { downloads++; throw Error('must not download'); } }
  });
  const response = await route(new Request(`https://example.test/api/training?action=certificates.download&vesselId=vessel-a&id=${certificateId}`));
  assert.equal(response.status, 404);
  assert.equal(downloads, 0);
});

test('document store downloads a 1.5 MB certificate by Git blob SHA', async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.GITHUB_DOCUMENTS_TOKEN;
  const sha = 'a'.repeat(40);
  const bytes = Buffer.alloc(1_500_000, 65);
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return new Response(JSON.stringify({ content: bytes.toString('base64'), encoding: 'base64' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  process.env.GITHUB_DOCUMENTS_TOKEN = 'fictional-test-token';
  try {
    const downloaded = await defaultDocumentStore.get('Training/Crew/example/Certificates/example/test.pdf', sha);
    assert.equal(downloaded.length, bytes.length);
    assert.equal(urls[0], `https://api.github.com/repos/primoxy-dev/harborflow-job-documents/git/blobs/${sha}`);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.GITHUB_DOCUMENTS_TOKEN;
    else process.env.GITHUB_DOCUMENTS_TOKEN = oldToken;
  }
});

