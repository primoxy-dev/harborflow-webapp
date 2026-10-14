import test from 'node:test';import assert from 'node:assert/strict';
import {createDocumentsRoute} from '../api/documents.mjs';
const jobId='11111111-1111-4111-8111-111111111111',serviceId='22222222-2222-4222-8222-222222222222';
const personId='33333333-3333-4333-8333-333333333333';
const owner={role:'owner',crewView:true,visitorView:true,crewEdit:true,visitorEdit:true};
function fixture({grant=owner,login='demo',assigned=true,mismatch=false}={}){
 const rows=new Map(),people=[{id:personId,kind:'crew',data:{name:'DEMO CREW',passport:'DEMO',serviceIds:[serviceId]}}];const sql={async query(q,p=[]){
  if(q.startsWith('CREATE TABLE'))return [];
  if(q.includes('SELECT')&&q.includes('operation_jobs'))return [{id:jobId,data:{vessel:'DEMO',port:'DEMO PORT',pic:assigned?'demo':'other'}}];
  if(q.includes('SELECT')&&q.includes('operation_services'))return [{job_id:mismatch?serviceId:jobId,data:{type:'Crew Change',pic:assigned?'demo':'other'}}];
  if(q.includes('operation_people'))return people;
  if(q.includes('operation_trips'))return [];
  if(q.startsWith('SELECT * FROM document_records'))return [...rows.values()].filter(r=>r.job_id===p[0]&&r.service_key===p[1]&&r.type===p[2]).map(r=>structuredClone(r));
  if(q.startsWith('WITH saved')){if((rows.get(p[0])?.version||0)!==p[5])return [];const r={job_id:p[1],service_key:p[2],type:p[3],section:p[4],data:JSON.parse(p[6]),version:p[5]+1,source_fingerprint:p[7]};rows.set(p[0],r);return [r];}
  throw Error('Unexpected query');
 }};
 return {rows,people,route:createDocumentsRoute({db:()=>sql,sessionLogin:()=>login,permission:async()=>grant})};
}
const url=`https://harbor.test/api/documents?action=documentState&type=oktb&jobId=${jobId}&serviceId=${serviceId}`;
const post=(body,origin='https://harbor.test')=>new Request('https://harbor.test/api/documents',{method:'POST',headers:{origin},body:JSON.stringify(body)});
const input={action:'saveDocumentSection',login:'demo',jobId,serviceId,type:'oktb',section:'common',patch:{airline:'TEST AIR'},base:{},version:0};
test('owner can persist document sections and reload, not just preferences',async()=>{
 const f=fixture(),r=await f.route(new Request(url));assert.equal(r.status,200);const state=await r.json();
 const save=await f.route(post({...input,sourceFingerprint:state.sourceFingerprint}));assert.equal(save.status,200);const fresh=await (await f.route(new Request(url))).json();assert.equal(fresh.sections[0].data.airline,'TEST AIR');
});

test('removed person projection can be saved without a permanent same-version conflict',async()=>{
 const f=fixture(),k=jobId+'/'+serviceId+'/oktb/crew';
 f.rows.set(k,{job_id:jobId,service_key:serviceId,type:'oktb',section:'crew',version:1,data:{selected:[personId]}});
 f.people.length=0;const fresh=await(await f.route(new Request(url))).json();assert.deepEqual(fresh.sections[0].data.selected,[]);
 const response=await f.route(post({...input,section:'crew',patch:{selected:[]},base:{selected:[]},version:1,sourceFingerprint:fresh.sourceFingerprint}));
 assert.equal(response.status,200);assert.deepEqual(f.rows.get(k).data.selected,[]);
});
test('Viewer reads but cannot autosave and PIC does not grant Editor access',async()=>{
 for(const grant of [{role:'viewer',crewView:true},{role:'editor',crewView:true,crewEdit:true}]){
  const f=fixture({grant,assigned:false});const read=await f.route(new Request(url));assert.equal(read.status,200);
  assert.equal((await f.route(post({...input,sourceFingerprint:(await read.json()).sourceFingerprint}))).status,403);
 }
});
test('document save rejects mismatched service, stale sources and foreign origins',async()=>{
 assert.equal((await fixture({mismatch:true}).route(new Request(url))).status,404);
 const f=fixture();assert.equal((await f.route(post({...input,sourceFingerprint:'0'.repeat(64)}))).status,409);
 assert.equal((await f.route(post(input,'https://evil.test'))).status,403);
});
test('Crew-only account cannot return or patch the Visitor document section',async()=>{
 const f=fixture({grant:{role:'owner',crewView:true,crewEdit:true,visitorView:false,visitorEdit:false}});
 f.rows.set('private',{job_id:jobId,service_key:serviceId,type:'permit',section:'visitor',version:1,data:{tables:[{private:'VISITOR SECRET'}]}});
 const r=await f.route(new Request(url.replace('type=oktb','type=permit')));assert.equal(r.status,200);const state=await r.json();assert.ok(!JSON.stringify(state).includes('VISITOR SECRET'));
 assert.equal((await f.route(post({...input,type:'permit',section:'visitor',patch:{tables:[]},sourceFingerprint:state.sourceFingerprint}))).status,403);
});
