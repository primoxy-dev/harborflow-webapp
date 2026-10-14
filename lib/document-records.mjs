import {uuid,fieldConflicts} from './operations.mjs';
import {PERMIT_TABLES} from '../permit-draft.mjs';
export const recordSchema=`CREATE TABLE IF NOT EXISTS document_records (
 record_key text PRIMARY KEY, job_id uuid NOT NULL REFERENCES operation_jobs(id), service_key text NOT NULL,
 type text NOT NULL CHECK(type IN ('oktb','permit','loi')), section text NOT NULL CHECK(section IN ('common','crew','visitor')),
 data jsonb NOT NULL DEFAULT '{}'::jsonb, version integer NOT NULL DEFAULT 1, source_fingerprint text NOT NULL,
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
)`;
export const revisionSchema=`CREATE TABLE IF NOT EXISTS document_record_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_key text NOT NULL REFERENCES document_records(record_key),
 version integer NOT NULL, actor text NOT NULL, before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
)`;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const has=(v,k)=>Object.hasOwn(v,k);
const date=v=>v===''||/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const tableScope=key=>['on','off'].includes(key)?'crew':'visitor';
const string=(v,max)=>typeof v==='string'&&v.length<=max;
const commonKeys={oktb:['issueDate','arrivalDate','airline'],permit:['issueDate','permitDate','subject'],loi:['issueDate','embassy','customEmbassy','embassySnapshot','loiTitle']};
export function validateDocumentSection(type,section,data,allowedPeople=[]){
 try {
  if(!has(commonKeys,type)||!['common','crew','visitor'].includes(section)||!plain(data))throw Error('Invalid document section');
  if(section==='visitor'&&type!=='permit')throw Error('Invalid document scope');
  const allowed=new Map(allowedPeople.map(p=>[p.id,p]));
  const keys=section==='common'?commonKeys[type]:section==='visitor'?['tables']:type==='oktb'?['selected']:type==='loi'?['loiPersonId','loiDetails']:['tables'];
  if(Object.keys(data).some(k=>!keys.includes(k)))throw Error('Unknown document field');
  for(const [key,v] of Object.entries(data)){
   if(['issueDate','arrivalDate','permitDate'].includes(key)){if(!string(v,10)||!date(v))throw Error('Invalid document date');}
   else if(key==='selected'){if(!Array.isArray(v)||v.length>400||v.some(id=>!uuid(id)||allowed.get(id)?.kind!=='crew')||new Set(v).size!==v.length)throw Error('Invalid crew selection');}
   else if(key==='loiPersonId'){if(v!==''&&(!uuid(v)||allowed.get(v)?.kind!=='crew'))throw Error('Invalid LOI person');}
   else if(key==='loiDetails'){
    if(!plain(v)||Object.keys(v).length>400)throw Error('Invalid LOI details');
    for(const [id,details] of Object.entries(v)){
     if(!uuid(id)||allowed.get(id)?.kind!=='crew'||!plain(details))throw Error('Unknown LOI person');
     const fields=['name','surname','givenName','dob','placeOfBirth','nationality','passport','passportIssued','passportExpiry','seamanBook','seamanBookIssued'];
     if(Object.entries(details).some(([k,value])=>!fields.includes(k)||!string(value,200)))throw Error('Invalid LOI field');
    }
   }else if(key==='tables'){
    if(type!=='permit'||!Array.isArray(v)||v.length>7)throw Error('Invalid tables');
    const seen=new Set();
    for(const t of v){
     const definition=PERMIT_TABLES.find(item=>item.key===t?.key);
     if(!definition||tableScope(t.key)!==section||seen.has(t.key)||Object.keys(t).some(k=>!['key','title','headers','rows'].includes(k)))throw Error('Invalid table scope');seen.add(t.key);
     if(!string(t.title,120)||!Array.isArray(t.headers)||t.headers.length!==definition.fields.length||t.headers.some(h=>!string(h,80))||!Array.isArray(t.rows)||t.rows.length>100)throw Error('Invalid table shape');
     const ids=new Set();for(const r of t.rows){
      if(!plain(r)||Object.keys(r).some(k=>!['id','personId','cells'].includes(k))||!uuid(r.id)||ids.has(r.id)||typeof r.personId!=='string'||!Array.isArray(r.cells)||r.cells.length!==definition.fields.length||r.cells.some(c=>!string(c,300)))throw Error('Invalid table row');ids.add(r.id);
      if(r.personId&&(!uuid(r.personId)||allowed.get(r.personId)?.kind!==section))throw Error('Unknown or out-of-scope person');
     }
    }
   }else if(key==='embassySnapshot'){
    if(v===null)continue;
    if(!plain(v)||JSON.stringify(v).length>8000||Object.keys(v).some(k=>!['id','kind','name','address','phone','fax','emails','sourceUrl','verifiedAt','status'].includes(k)))throw Error('Invalid mission');
    for(const k of ['id','kind','name','address','phone','fax','sourceUrl','verifiedAt','status'])if(has(v,k)&&!string(v[k],2000))throw Error('Invalid mission contact');
    if(has(v,'emails')&&(!plain(v.emails)||Object.keys(v.emails).some(k=>!['general','visa'].includes(k))||Object.values(v.emails).some(a=>!Array.isArray(a)||a.length>10||a.some(s=>!string(s,300)))))throw Error('Invalid mission emails');
   }else if(!string(v,key==='subject'?500:250))throw Error('Invalid text');
  }
  return {data:structuredClone(data)};
 }catch(e){return {error:e.message};}
}
export function filterDocumentSection(section,data,people){
 const copy=structuredClone(data),ids=new Set(people.filter(p=>p.kind===section).map(p=>p.id));
 if(section==='crew'){
  if(copy.selected)copy.selected=copy.selected.filter(id=>ids.has(id));
  if(copy.loiPersonId&&!ids.has(copy.loiPersonId))copy.loiPersonId='';
  if(copy.loiDetails)copy.loiDetails=Object.fromEntries(Object.entries(copy.loiDetails).filter(([id])=>ids.has(id)));
 }
 if(copy.tables)for(const t of copy.tables)t.rows=t.rows.filter(r=>!r.personId||ids.has(r.personId));
 return copy;
}
const serviceKey=key=>key.serviceId||'job';
const recordKey=(key,section)=>`${key.jobId}/${serviceKey(key)}/${key.type}/${section}`;
async function ensure(sql){await sql.query(recordSchema);await sql.query(revisionSchema);}
export async function readDocumentSections(sql,key,scope){
 await ensure(sql);
 const rows=await sql.query('SELECT * FROM document_records WHERE job_id=$1 AND service_key=$2 AND type=$3 ORDER BY section',[key.jobId,serviceKey(key),key.type]);
 return rows.filter(r=>r.section==='common'||(r.section==='crew'?scope.crewView:scope.visitorView)).map(r=>({section:r.section,data:r.data,version:r.version,sourceFingerprint:r.source_fingerprint,updatedAt:r.updated_at,updatedBy:r.updated_by}));
}
export async function saveDocumentSection(sql,key,section,input,actor,project=data=>data){
 const {patch,base,version,sourceFingerprint}=input;
 if(!plain(patch)||!plain(base)||!Number.isInteger(version)||version<0)return {status:400,error:'Original values and revision required'};
 const rows=await readDocumentSections(sql,key,{crewView:true,visitorView:true});let current=rows.find(r=>r.section===section);
 if(current)current={...current,data:project(current.data)};
 const conflicts=fieldConflicts(current?.data||{},base,patch);
 if((current?.version||0)!==version||conflicts.length)return {status:409,error:'Document changed; review differences',record:current||null,conflicts:conflicts.length?conflicts:Object.keys(patch).map(field=>({field,original:base[field]??null,shared:current?.data[field]??null,local:patch[field]??null}))};
 const merged={...current?.data,...patch};
 const result=await sql.query(`WITH saved AS (
  INSERT INTO document_records(record_key,job_id,service_key,type,section,data,source_fingerprint,updated_by)
  SELECT $1,$2,$3,$4,$5,$7::jsonb,$8,$9 WHERE $6=0 ON CONFLICT(record_key) DO NOTHING RETURNING *
 ), updated AS (
  UPDATE document_records SET data=$7::jsonb,version=version+1,source_fingerprint=$8,updated_by=$9,updated_at=now()
  WHERE record_key=$1 AND version=$6 AND $6>0 RETURNING *
 ), result AS (SELECT * FROM saved UNION ALL SELECT * FROM updated), logged AS (
  INSERT INTO document_record_revisions(record_key,version,actor,before_data,after_data)
  SELECT record_key,version,$9,$10::jsonb,data FROM result RETURNING id
 ) SELECT * FROM result`,[recordKey(key,section),key.jobId,serviceKey(key),key.type,section,version,JSON.stringify(merged),sourceFingerprint,actor,current?JSON.stringify(current.data):null]);
 if(!result.length)return {status:409,error:'Concurrent change; review differences'};
 const r=result[0];return {status:200,record:{section:r.section,data:r.data,version:r.version,sourceFingerprint:r.source_fingerprint,updatedAt:r.updated_at,updatedBy:r.updated_by}};
}
