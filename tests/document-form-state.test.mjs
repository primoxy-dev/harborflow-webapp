import test from 'node:test';import assert from 'node:assert/strict';
const m=await import('../document-form-state.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('form serialization never copies private account defaults to shared sections',()=>{
 assert.equal(typeof m.encodeDocumentContext,'function');
 const result=m.encodeDocumentContext({issueDate:'',selected:new Set(),contact:'SECRET',signature:'SECRET'},'oktb');
 assert.deepEqual(result,{common:{issueDate:''},crew:{selected:[]}});
});
test('restoring sections preserves empty selections and LOI details keyed by person',()=>{
 assert.equal(typeof m.applyDocumentSections,'function');const ctx={selected:new Set(['old'])};
 m.applyDocumentSections(ctx,'loi',[{section:'common',data:{issueDate:''}},{section:'crew',data:{loiPersonId:'',loiDetails:{a:{surname:'ONE'},b:{surname:'TWO'}}}}]);
 assert.equal(ctx.issueDate,'');assert.equal(ctx.loiPersonId,'');assert.equal(ctx.loiDetails.a.surname,'ONE');assert.equal(ctx.loiDetails.b.surname,'TWO');
});
