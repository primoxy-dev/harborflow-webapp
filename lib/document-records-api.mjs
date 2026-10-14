import {createHash} from 'node:crypto';
import {json} from './harborflow.mjs';
import {uuid,canEditJob,canEditService,canPeople} from './operations.mjs';
import {readDocumentSections,saveDocumentSection,validateDocumentSection,filterDocumentSection} from './document-records.mjs';
const fail=(error,status)=>json({error},status);
export async function documentRecordRoute(request,input,{sql,grant,login,previewRoute}){
 const {jobId,type}=input,serviceId=input.serviceId||null;
 if(!['oktb','permit','loi'].includes(type)||!uuid(jobId)||(serviceId&&!uuid(serviceId)))return fail('Invalid document',400);
 const crewView=canPeople(grant,'crew'),visitorView=type==='permit'&&canPeople(grant,'visitor');
 if((type!=='permit'&&!crewView)||(!crewView&&!visitorView))return fail('Separate document person permission required',403);
 const [job]=await sql.query('SELECT id,data FROM operation_jobs WHERE id=$1',[jobId]);if(!job)return fail('Job not found',404);
 let service=null;
 if(serviceId){[service]=await sql.query('SELECT job_id,data,removed_at FROM operation_services WHERE id=$1',[serviceId]);if(!service||service.job_id!==jobId||service.removed_at||service.data.type!=='Crew Change')return fail('Crew Change Service not found for this Job',404);}
 const assigned=service?canEditService(grant,login,job,service):canEditJob(grant,login,job);
 const crewEdit=assigned&&canPeople(grant,'crew',true),visitorEdit=type==='permit'&&assigned&&canPeople(grant,'visitor',true);
 const canEdit={common:Boolean(crewEdit||visitorEdit),crew:Boolean(crewEdit),visitor:Boolean(visitorEdit)};
 if(request.method==='POST'&&(!canEdit[input.section]||input.login!==login))return fail('No document edit permission for this account/section',403);
 const previewUrl=new URL(request.url);previewUrl.search='';Object.entries({action:'preview',jobId,type,...(serviceId?{serviceId}:{})}).forEach(([k,v])=>previewUrl.searchParams.set(k,v));
 const response=await previewRoute(new Request(previewUrl,{headers:request.headers}));if(!response.ok)return response;
 const fresh=await response.json();if(fresh.login!==login)return fail('Account changed',409);
 const sourceFingerprint=createHash('sha256').update(JSON.stringify({job:fresh.preview.job,people:[...fresh.preview.people].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex');
 const key={jobId,serviceId,type},sections=(await readDocumentSections(sql,key,{crewView,visitorView})).map(r=>({...r,data:filterDocumentSection(r.section,r.data,fresh.preview.people)}));
 if(request.method==='GET')return json({login,preview:fresh.preview,sections,canEdit,sourceFingerprint});
 if(input.sourceFingerprint!==sourceFingerprint)return json({error:'Job or people changed. Review source differences.',code:'sourceConflict',sourceFingerprint,preview:fresh.preview},409);
 const current=sections.find(r=>r.section===input.section);
 const validated=validateDocumentSection(type,input.section,{...current?.data,...input.patch},fresh.preview.people);if(validated.error)return fail(validated.error,400);
 const validPatch=validateDocumentSection(type,input.section,input.patch,fresh.preview.people);if(validPatch.error)return fail(validPatch.error,400);
 const result=await saveDocumentSection(sql,key,input.section,input,login,data=>filterDocumentSection(input.section,data,fresh.preview.people));
 if(result.record)result.record={...result.record,data:filterDocumentSection(result.record.section,result.record.data,fresh.preview.people)};
 // A deleted person may still appear in a stale base/row payload. Do not leak its copied fields via conflicts.
 if(result.conflicts)result.conflicts=result.conflicts.map(c=>['tables','selected','loiDetails','loiPersonId'].includes(c.field)?{field:c.field,original:'Review roster',shared:result.record?.data[c.field]??null,local:validPatch.data[c.field]??null}:c);
 const {status,...body}=result;return json(body,status);
}
