import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentsRoute} from '../api/documents.mjs';
import {buildDocumentPreview} from '../lib/document-preview.mjs';
import {DEFAULT_SUBJECT,newPermitDraft,tablePeople,choosePerson,revalidateDraft,blankRow,permitLocation,visiblePermitTables} from '../permit-draft.mjs';
const jid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const job={id:jid,data:{vessel:'DEMO VESSEL',port:'MAP TA PHUT / LMPT1',eta:'2026-10-04T08:00'}};
const crew={id:'33333333-3333-4333-8333-333333333333',kind:'crew',data:{name:'DEMO CREW',category:'On-signers',dob:'1990-01-01',passport:'DEMO-PASSPORT',serviceIds:[sid]}};
const visitor={id:'44444444-4444-4444-8444-444444444444',kind:'visitor',data:{name:'DEMO MEDICAL',category:'Medical visitors',passport:'DEMO-VISITOR-PASSPORT',serviceIds:[sid]}};
const makeRoute=grant=>createDocumentsRoute({sessionLogin:()=> 'demo',permission:async()=>grant,db:()=>({query:async query=>query.includes('operation_jobs')?[job]:query.includes('operation_services')?[{job_id:jid,data:{type:'Crew Change'}}]:query.includes('operation_people')?[crew,visitor]:[]})});
const url='https://harborflow.test/api/documents?action=preview&type=permit&jobId='+jid+'&serviceId='+sid;
test('Document omits empty groups and unnamed rows but retains entered staff and vehicles',()=>{
 const draft=newPermitDraft();assert.equal(visiblePermitTables(draft).length,0);
 const on=draft.tables.find(t=>t.key==='on');on.rows[0].cells[2]='THAI';assert.equal(visiblePermitTables(draft).length,0);
 on.rows[0].cells[1]='DEMO CREW';on.rows.push(blankRow(on,1));
 const car=draft.tables.find(t=>t.key==='car');car.rows[0].cells[1]='DEMO PLATE';
 const shown=visiblePermitTables(draft);assert.deepEqual(shown.map(t=>t.key),['on','car']);assert.equal(shown[0].rows.length,1);assert.equal(on.rows.length,2);
});
test('Permit details follow independent Crew/Visitor permissions',async()=>{
 for(const [grant,names] of [[{role:'viewer',crewView:true},['DEMO CREW']],[{role:'viewer',visitorView:true},['DEMO MEDICAL']],[{role:'editor',crewView:true,visitorView:true},['DEMO CREW','DEMO MEDICAL']]]){
  const res=await makeRoute(grant)(new Request(url));assert.equal(res.status,200);const {preview}=await res.json();assert.deepEqual(preview.people.map(p=>p.name),names);assert.equal(preview.job.terminal,'LMPT1');assert.equal(preview.downloadAllowed,true);assert(!JSON.stringify(preview).includes('flights'));assert.equal(res.headers.get('Cache-Control'),'no-store');
 }
});
test('Permit Operations-only access denied; revocation rechecked',async()=>{
 assert.equal((await makeRoute({role:'editor'})(new Request(url))).status,403);assert.equal((await makeRoute(null)(new Request(url))).status,403);
});
test('Pure preview does not reveal Visitors without their separate scope',()=>{
 const p=buildDocumentPreview('permit',job,[crew,visitor],[],{crewDetails:true});assert(p.people[0].id);assert(!p.people[1].id);assert(!JSON.stringify(p).includes('DEMO-VISITOR-PASSPORT'));assert.equal(p.scope.visitorView,false);
});
test('Template subject, headings, blank staff/cars and editable independent rows',()=>{
 const draft=newPermitDraft();assert.equal(draft.subject,DEFAULT_SUBJECT);assert.equal(draft.tables.length,7);const on=draft.tables[0];on.headers[1]='Edited heading';on.rows.push(blankRow(on,1));on.rows[0].cells[1]='Manual name';assert.equal(on.rows[1].cells[1],'');assert.equal(draft.tables.find(t=>t.key==='staff').rows[0].cells[1],'');assert(!JSON.stringify(draft).includes('WATCHARAPONG'));
});
test('Person selection copies fields into draft only and scope removal clears linked rows',()=>{
 const draft=newPermitDraft(),table=draft.tables[0];const p={...crew.data,id:crew.id,kind:'crew'};choosePerson(table,table.rows[0],p);assert.equal(table.rows[0].cells[1],'DEMO CREW');assert.equal(table.rows[0].cells[4],'01-Jan-90');table.rows[0].cells[1]='Edited in document';assert.equal(crew.data.name,'DEMO CREW');assert.equal(tablePeople(table,[p,{...visitor.data,id:visitor.id,kind:'visitor'}]).length,1);revalidateDraft(draft,[]);assert.equal(table.rows[0].cells[1],'');
});
test('Port/Terminal is derived rather than guessed',()=>{
 assert.equal(permitLocation({port:'MAP TA PHUT / LMPT1',terminal:'LMPT1'}),'MAP TA PHUT / LMPT1');assert.match(permitLocation({port:'RAYONG'}),/TERMINAL NOT SET/);
});
