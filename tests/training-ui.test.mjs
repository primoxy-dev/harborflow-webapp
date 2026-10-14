import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Operations navigation opens a dedicated Crew Training workspace', () => {
  const nav = readFileSync(new URL('../workspaces.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(nav, /\['training','Crew Training'/);
  assert.match(nav, /HarborFlowTraining\.mount/);
  assert.match(page, /training\.css/);
  assert.match(page, /training\.js/);
});

