import test from 'node:test';
import assert from 'node:assert/strict';
import {fillPermitMail,outlookComposeUrl,permitTablesPlainText,sharePreparedPermit} from '../permit-mail.mjs';
import {validatePermitMailTemplates,loadPermitMailTemplates,savePermitMailTemplates} from '../lib/permit-mail-templates.mjs';
import {createDocumentsRoute} from '../api/documents.mjs';
import {buildDocumentPreview} from '../lib/document-preview.mjs';

const template={id:'demo',name:'Terminal A',terminals:['A','B'],to:['a@example.com'],cc:['b@example.com'],subject:'Permit {{vessel}}',body:'Job {{jobNo}}'};
test('shares the prepared file only when supported and not expired',async()=>{
 const file={name:'test.pdf'},ready={file,createdAt:1000};let sent;
 const device={canShare:({files})=>files[0]===file,share:async value=>{sent=value;}};
 await sharePreparedPermit(ready,device,2000);assert.equal(sent.files[0],file);
 assert.throws(()=>sharePreparedPermit(ready,device,121001),/expired/);
 assert.throws(()=>sharePreparedPermit(ready,{share(){},canShare:()=>false},2000),/unavailable/);
});
test('plain text keeps table borders, blank cells, and all rows',()=>{
 const rows=[['Name','Rank'],['TEST PERSON','MASTER'],['ANOTHER','']].map(cells=>({querySelectorAll:()=>cells.map(textContent=>({textContent}))}));
 const section={querySelector:s=>s==='table'?{querySelectorAll:()=>rows}:{textContent:'On-signers'}};
 const text=permitTablesPlainText({querySelectorAll:()=>[section]});
 assert.match(text,/\| TEST PERSON \| MASTER \|/);assert.match(text,/\| ANOTHER\s+\|\s+\|/);assert.match(text,/\+[-+]+\+/);
});
test('substitutes job values and builds an encoded Outlook compose URL',()=>{
 assert.equal(fillPermitMail(template.subject,{vessel:'TEST VESSEL'},{}),'Permit TEST VESSEL');
 const draft={to:'a@example.com; b@example.com',cc:'c@example.com',subject:'A & B + Permit',body:'\nLine 1\n\nอนุญาต + crew'};
 const link=outlookComposeUrl(draft);
 const url=new URL(link);
 assert.equal(url.hostname,'outlook.office.com');
 assert.equal(url.searchParams.get('to'),'a@example.com;b@example.com');
 assert.equal(url.searchParams.get('cc'),draft.cc);
 assert.equal(url.searchParams.get('subject'),draft.subject);
 assert.equal(url.searchParams.get('body'),draft.body);
 assert.ok(link.includes('%20'));
 assert.ok(!link.includes('+'));
 assert.equal(new URL(outlookComposeUrl({...draft,body:''})).searchParams.has('body'),false);
 assert.throws(()=>outlookComposeUrl({...draft,body:'ท'.repeat(1000)}),RangeError);
 assert.throws(()=>outlookComposeUrl({to:'bad address'}),/Check the To and CC/);
});
test('permit preview exposes ETD for email templates',()=>{
 const preview=buildDocumentPreview('permit',{id:'demo',data:{vessel:'TEST',etd:'2026-11-09T12:00'}},[],[],{crewDetails:true});
 assert.equal(preview.job.etd,'2026-11-09T12:00');
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
