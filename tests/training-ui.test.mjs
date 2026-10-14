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

test('session listings render times in each session display zone', () => {
  const ui = readFileSync(new URL('../training.js', import.meta.url), 'utf8');
  assert.match(ui, /stamp\(s\.starts_at, s\.display_zone\)/);
  assert.match(ui, /stamp\(e\.starts_at, e\.display_zone\)/);
});

