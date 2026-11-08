import test from 'node:test';
import assert from 'node:assert/strict';
import {fillPermitMail,outlookComposeUrl} from '../permit-mail.mjs';
import {validatePermitMailTemplates,loadPermitMailTemplates,savePermitMailTemplates} from '../lib/permit-mail-templates.mjs';
import {createDocumentsRoute} from '../api/documents.mjs';

const template={id:'demo',name:'Terminal A',terminals:['A','B'],to:['a@example.com'],cc:['b@example.com'],subject:'Permit {{vessel}}',body:'Job {{jobNo}}'};
test('substitutes job values and builds an encoded Outlook compose URL',()=>{
 assert.equal(fillPermitMail(template.subject,{vessel:'TEST VESSEL'},{}),'Permit TEST VESSEL');
 const url=new URL(outlookComposeUrl({to:'a@example.com; b@example.com',cc:'c@example.com',subject:'A & B',body:'Line 1\nLine 2'}));
 assert.equal(url.hostname,'outlook.office.com');assert.equal(url.searchParams.get('to'),'a@example.com;b@example.com');assert.equal(url.searchParams.get('body'),'Line 1\nLine 2');
 assert.throws(()=>outlookComposeUrl({to:'bad address'}));
});
test('validates templates and rejects stale revisions',async()=>{
 assert.equal(validatePermitMailTemplates([template]),null);
 assert.ok(validatePermitMailTemplates([{...template,to:['invalid']}]));
 assert.deepEqual(await loadPermitMailTemplates({read:async()=>({sha:'rev1',data:{templates:[template]}})}),{templates:[template],revision:'rev1'});
 let wrote=false;const result=await savePermitMailTemplates([template],'old',{read:async()=>({sha:'new'}),write:async()=>{wrote=true;}});
 assert.equal(result.status,409);assert.equal(wrote,false);
});
test('only owner can modify shared templates and requests must be same-origin',async()=>{
 const store={read:async()=>null,write:async()=>({content:{sha:'rev1'}})},make=role=>createDocumentsRoute({db:()=>({}),sessionLogin:()=>role,permission:async()=>({role,crewView:true}),permitMailStore:store});
 const request=(role,origin='https://example.test')=>new Request('https://example.test/api/documents',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'savePermitMailTemplates',login:role,templates:[template],revision:null})});
 assert.equal((await make('editor')(request('editor'))).status,403);
 assert.equal((await make('owner')(request('owner','https://other.test'))).status,403);
 assert.equal((await make('owner')(request('owner'))).status,200);
});
