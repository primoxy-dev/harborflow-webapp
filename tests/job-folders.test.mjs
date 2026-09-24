import test from 'node:test';
import assert from 'node:assert/strict';
import { documentsFolder, folderMoveEntries } from '../lib/job-folders.mjs';

const source = 'Jobs/2026/09. SEP/24. SHION - 20136548';
const target = 'Jobs/2026/09. SEP/25. SHION - 20136548 cancelled';

test('Job folder follows ETA, Job No. and Cancelled status', () => {
  const job = { vessel: 'SHION', jobNo: '20136548', eta: '2026-09-24T22:50', status: 'Confirmed' };
  assert.equal(documentsFolder(job), source);
  assert.equal(documentsFolder({ ...job, eta: '2026-09-25T08:00', status: 'Cancelled' }), target);
  assert.equal(documentsFolder({ ...job, jobNo: '20136549' }), 'Jobs/2026/09. SEP/24. SHION - 20136549');
});

test('folder move preserves every file blob under General and Service folders', () => {
  const tree = [
    { path: source, type: 'tree', mode: '040000', sha: 'tree-sha' },
    { path: source + '/General/job.json', type: 'blob', mode: '100644', sha: 'job-sha' },
    { path: source + '/Crew Change/Passport/scan.pdf', type: 'blob', mode: '100644', sha: 'file-sha' },
    { path: 'Jobs/README.md', type: 'blob', mode: '100644', sha: 'other-sha' }
  ];
  assert.deepEqual(folderMoveEntries(tree, source, target), [
    { path: target + '/General/job.json', type: 'blob', mode: '100644', sha: 'job-sha' },
    { path: source + '/General/job.json', type: 'blob', mode: '100644', sha: null },
    { path: target + '/Crew Change/Passport/scan.pdf', type: 'blob', mode: '100644', sha: 'file-sha' },
    { path: source + '/Crew Change/Passport/scan.pdf', type: 'blob', mode: '100644', sha: null }
  ]);
});

test('folder move refuses an occupied destination', () => {
  assert.throws(() => folderMoveEntries([
    { path: source + '/General/job.json', type: 'blob', mode: '100644', sha: 'job-sha' },
    { path: target + '/General/job.json', type: 'blob', mode: '100644', sha: 'another-job' }
  ], source, target), /already exists/);
});
