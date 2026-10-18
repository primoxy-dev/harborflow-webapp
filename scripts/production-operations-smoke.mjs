import assert from 'node:assert/strict';
import vm from 'node:vm';

const baseUrl = process.argv[2] || 'https://harborflow-webapp.vercel.app';
const response = await fetch(new URL('/operations.js', baseUrl), { cache: 'no-store' });
assert.equal(response.ok, true, `operations.js returned ${response.status}`);

const source = await response.text();
assert.match(source, /^\s*(?:\/\*|\(\(\)\s*=>)/, 'operations.js contains unexpected text before the program');
new vm.Script(source, { filename: 'operations.js' });

console.log(`PASS Production Operations JavaScript parses: ${baseUrl}`);
