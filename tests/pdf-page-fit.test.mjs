import test from 'node:test';
import assert from 'node:assert/strict';
import {pageFit} from '../pdf-export-source/page-fit.mjs';
test('tall live documents have equal left and right space on A4',()=>{
  const fit=pageFit(2400,4200,595,842,true);
  assert.ok(fit.x>0);assert.equal(fit.y,0);
  assert.ok(Math.abs(fit.x-(595-(fit.x+2400*fit.sx)))<1e-8);
  assert.equal(fit.sx,fit.sy);
});
test('wide live documents have equal top and bottom space and are not stretched',()=>{
  const fit=pageFit(2400,2700,595,842,true);
  assert.equal(fit.x,0);assert.ok(fit.y>0);
  assert.ok(Math.abs(fit.y-(842-(fit.y+2700*fit.sy)))<1e-8);
  assert.equal(fit.sx,fit.sy);
});
test('existing report scaling stays unchanged',()=>{
  assert.deepEqual(pageFit(1200,1600,600,800,false),{sx:0.5,sy:0.5,x:0,y:0});
});
test('short Terminal Permit pages stay at the top while preserving horizontal fit',()=>{
  const centered=pageFit(2400,2700,595,842,true);
  const permit=pageFit(2400,2700,595,842,true,'top');
  assert.ok(centered.y>0);assert.equal(permit.y,0);
  assert.equal(permit.x,centered.x);assert.equal(permit.sx,centered.sx);assert.equal(permit.sy,centered.sy);
});
