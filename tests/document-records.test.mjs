import test from 'node:test';
import assert from 'node:assert/strict';
const records=await import('../lib/document-records.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const key={jobId:'11111111-1111-4111-8111-111111111111',serviceId:null,type:'permit'};
const crew={id:'22222222-2222-4222-8222-222222222222',kind:'crew'};
test('document sections preserve explicitly cleared subject and roster',()=>{
 assert.equal(typeof records.validateDocumentSection,'function');
 assert.deepEqual(records.validateDocumentSection('permit','common',{subject:''},[]),{data:{subject:''}});
 assert.deepEqual(records.validateDocumentSection('oktb','crew',{selected:[]},[]),{data:{selected:[]}});
});
test('document section validator rejects forged shapes and unknown people',()=>{
 assert.equal(typeof records.validateDocumentSection,'function');
 for(const data of [{selected:['unknown']},{selected:[crew.id],passport:'secret'},{tables:[{key:'staff',fields:['name'],headers:[],rows:[]}]}]){
  assert.ok(records.validateDocumentSection('permit','crew',data,[crew]).error);
 }
 assert.ok(records.validateDocumentSection('permit','common',{issueDate:'2026-02-30'},[]).error);
});
function fixture(){
 const rows=new Map(),logs=[];
 return {rows,logs,async query(sql,p=[]){
  if(sql.startsWith('CREATE TABLE'))return [];
  if(sql.startsWith('SELECT'))return [...rows.values()].filter(r=>r.job_id===p[0]&&r.service_key===p[1]&&r.type===p[2]).map(row=>structuredClone(row));
  if(sql.startsWith('WITH saved')){
   const old=rows.get(p[0]);if((old?.version||0)!==p[5])return [];
   const row={record_key:p[0],job_id:p[1],service_key:p[2],type:p[3],section:p[4],version:p[5]+1,data:JSON.parse(p[6]),source_fingerprint:p[7],updated_by:p[8]};
   rows.set(p[0],row);logs.push(structuredClone(row));return [structuredClone(row)];
  }
  throw Error('Unexpected fixture query');
 }};
}
test('storage reloads cleared fields and stale revisions do not overwrite',async()=>{
 assert.equal(typeof records.saveDocumentSection,'function');
 const sql=fixture();let r=await records.saveDocumentSection(sql,key,'common',{patch:{subject:'A'},base:{},version:0,sourceFingerprint:'one'},'demo');
 assert.equal(r.status,200);
 r=await records.saveDocumentSection(sql,key,'common',{patch:{subject:''},base:{subject:'A'},version:1,sourceFingerprint:'one'},'demo');assert.equal(r.status,200);
 const read=await records.readDocumentSections(sql,key,{crewView:true,visitorView:false});assert.equal(read[0].data.subject,'');
 r=await records.saveDocumentSection(sql,key,'common',{patch:{subject:'stale'},base:{subject:'A'},version:1,sourceFingerprint:'one'},'demo');assert.equal(r.status,409);
 assert.equal([...sql.rows.values()][0].data.subject,'');assert.equal(sql.logs.length,2);
});
test('hidden visitor sections never enter a crew-only read model',async()=>{
 assert.equal(typeof records.readDocumentSections,'function');const sql=fixture();
 sql.rows.set('private',{job_id:key.jobId,service_key:'job',type:'permit',section:'visitor',data:{secret:'PRIVATE'}});
 const rows=await records.readDocumentSections(sql,key,{crewView:true,visitorView:false});assert.deepEqual(rows,[]);
});
