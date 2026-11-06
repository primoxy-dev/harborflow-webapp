import {gh,gitData,json,sameOrigin} from './harborflow.mjs';
const BASE='ReaderDatabase', MAX_BYTES=2097152, MAX_RAW=2900000;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS=new Set(['given','middle','surname','name','nationality','dob','passport','passportExpiry','seamanBook','seamanBookExpiry']);
const MIMES=new Set(['image/png','image/jpeg','image/webp','application/pdf']);
const pathFor=id=>BASE+'/'+id+'.json';
const validBox=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=1.000001;
function valid(r){
 if(!r||!ID.test(r.id||'')||!['passport','seamanBook'].includes(r.type)||typeof r.nationality!=='string'||r.nationality.trim().length<2||r.nationality.length>80||typeof r.title!=='string'||!r.title.trim()||r.title.length>120||!Number.isInteger(r.page)||r.page<1||r.page>1000||!MIMES.has(r.mime)||!Array.isArray(r.mappings)||!r.mappings.length||r.mappings.length>100)return false;
 if(!r.mappings.every(m=>FIELDS.has(m.field)&&typeof m.heading==='string'&&m.heading.trim()&&m.heading.length<=120&&validBox(m.label)&&validBox(m.value)))return false;
 if(typeof r.contentBase64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(r.contentBase64))return false;
 const b=Buffer.from(r.contentBase64,'base64');if(!b.length||b.length>MAX_BYTES)return false;
 if(r.mime==='application/pdf')return b.subarray(0,5).toString()==='%PDF-';
 if(r.mime==='image/png')return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(r.mime==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255;
 return b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';
}
export function createReaderDatabaseRoute({github=gh,git=gitData}={}){
 async function read(id){
  const f=await github('GET',pathFor(id));if(!f)return null;if(f.type!=='file'||!f.sha)throw Error('Invalid file');
  const blob=f.content?f:await git('GET','blobs/'+f.sha);if(blob.encoding!=='base64'||typeof blob.content!=='string')throw Error('Cannot load example');
  return {data:JSON.parse(Buffer.from(blob.content.replace(/\s/g,''),'base64').toString('utf8')),revision:f.sha};
 }
 return async request=>{const url=new URL(request.url),id=url.searchParams.get('id');try{
  if(request.method==='GET'){
   if(id){if(!ID.test(id))return json({error:'Invalid example ID'},400);const file=await read(id);return file?json(file):json({error:'Example not found'},404);}
   const listing=await github('GET',BASE);if(!listing)return json({examples:[]});if(!Array.isArray(listing))throw Error('Invalid directory');
   const entries=listing.filter(x=>x.type==='file'&&/^[0-9a-f-]{36}\.json$/i.test(x.name)).slice(0,500),examples=[];
   for(const item of entries){const file=await read(item.name.slice(0,-5));if(!file)continue;const {contentBase64,...metadata}=file.data;examples.push({...metadata,revision:file.revision});}
   return json({examples});
  }
  if(!sameOrigin(request))return json({error:'Invalid origin'},403);
  if(request.method==='PUT'){
   const raw=await request.text();if(raw.length>MAX_RAW)return json({error:'Example exceeds 2 MB'},413);
   const body=JSON.parse(raw),record=body.record;if(!valid(record))return json({error:'Invalid example or file; maximum size is 2 MB'},400);
   const old=await github('GET',pathFor(record.id));if((old?.sha||null)!==(body.revision||null))return json({error:'Example changed on another device; reload first'},409);
   const result=await github('PUT',pathFor(record.id),{message:'Save reader example',content:Buffer.from(JSON.stringify(record)).toString('base64'),...(old?.sha?{sha:old.sha}:{})});return json({saved:true,revision:result.content.sha});
  }
  if(request.method==='DELETE'){
   if(!id||!ID.test(id))return json({error:'Invalid example ID'},400);const body=await request.json(),old=await github('GET',pathFor(id));if(!old)return json({error:'Example not found'},404);
   if(!body.revision||old.sha!==body.revision)return json({error:'Example changed on another device; reload first'},409);
   await github('DELETE',pathFor(id),{message:'Delete reader example',sha:old.sha});return json({deleted:true});
  }
  return json({error:'Method not allowed'},405);
 }catch(error){return json({error:error instanceof SyntaxError?'Invalid JSON':'Reader data base is unavailable'},error instanceof SyntaxError?400:503);}};
}
export const readerDatabaseRoute=createReaderDatabaseRoute();