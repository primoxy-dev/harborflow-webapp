import test from 'node:test';
import assert from 'node:assert/strict';
import { createVectorPdf } from '../pdf-export-source/renderer.mjs';
const drawing = {width:595,height:842,commands:[{name:'font',property:true,args:'12px Arial'},{name:'fillText',args:['TEST VECTOR',30,30]},{name:'strokeRect',args:[30,50,200,50]}]};
test('exports drawn text and lines without embedding a page image',async()=>{
 const blob=createVectorPdf([drawing]);
 assert.equal(blob.type,'application/pdf');
 const source=Buffer.from(await blob.arrayBuffer()).toString('latin1');
 assert.match(source,/^%PDF-/); assert.doesNotMatch(source,/\/Subtype\s*\/Image/);
 assert.match(source,/\/BaseFont\s*\/Helvetica/);
});
test('keeps separate pages and fails explicitly for an unsupported drawing operation',async()=>{
 const source=Buffer.from(await createVectorPdf([drawing,drawing]).arrayBuffer()).toString('latin1');
 assert.match(source,/\/Count 2\b/);
 assert.throws(()=>createVectorPdf([{...drawing,commands:[{name:'unsupported',args:[]}]}]),/Unsupported/);
});
