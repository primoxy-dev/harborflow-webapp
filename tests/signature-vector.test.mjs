import test from 'node:test';
import assert from 'node:assert/strict';
import { traceSignature } from '../lib/signature-vector.mjs';

test('traces dark and colored ink as vector paths without including the background', () => {
 const data = new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 0,0,100,255, 0,0,0,0]);
 const svg = traceSignature({width:4,height:1,data});
 assert.match(svg, /<path /); assert.match(svg, /M1 0h2v1h-2z/);
 assert.doesNotMatch(svg, /<image|base64|M0 0|M3 0/);
});
test('rejects blank, malformed, and excessively large images', () => {
 assert.throws(() => traceSignature({width:1,height:1,data:new Uint8ClampedArray([255,255,255,255])}), /No visible/);
 assert.throws(() => traceSignature({width:901,height:1,data:[]}), /Invalid/);
 assert.throws(() => traceSignature({width:1,height:1,data:[]}), /Invalid/);
});
