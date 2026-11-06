import test from 'node:test';
import assert from 'node:assert/strict';
import {locateTemplateValue} from '../reader-template.mjs';
const mapping={heading:'GIVEN NAMES',label:{x:.1,y:.2,width:.2,height:.05},value:{x:.1,y:.27,width:.3,height:.06}};
test('locates a value relative to a unique recognized heading',()=>{
 const words=[{text:'GIVEN',bbox:{x0:200,y0:200,x1:250,y1:220}},{text:'NAMES',bbox:{x0:260,y0:200,x1:310,y1:220}}];
 const box=locateTemplateValue(mapping,words,1000,1000);assert.ok(box);assert.equal(box.x,.2);assert.ok(Math.abs(box.y-.27)<1e-9);
});
test('does not choose when a heading appears twice or the box is outside the page',()=>{
 const pair=[{text:'GIVEN',bbox:{x0:200,y0:200,x1:250,y1:220}},{text:'NAMES',bbox:{x0:260,y0:200,x1:310,y1:220}}];
 assert.equal(locateTemplateValue(mapping,[...pair,...pair],1000,1000),null);
 assert.equal(locateTemplateValue({...mapping,value:{...mapping.value,x:.95}},pair,1000,1000),null);
});
