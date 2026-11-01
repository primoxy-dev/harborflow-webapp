import { configReady, gh, json, knowledgeGrants, readJson, sameOrigin, sessionLogin } from './harborflow.mjs';

const path='Knowledge/text-library.json';
export function createSnippetsRoute(deps={}) {
 const getLogin=deps.getLogin||sessionLogin, getGrants=deps.getGrants||knowledgeGrants, read=deps.read||readJson, write=deps.write||gh, ready=deps.ready||configReady;
 return async request=>{
  if(!ready()) return json({error:'Shared storage is not configured'},503);
  const login=getLogin(request); if(!login) return json({error:'Sign in to access saved text'},401);
  try {
   const grants=await getGrants(login); const canEdit=!!(grants.administrator||grants.restrictionEdit); if(!canEdit&&!grants.contactView) return json({error:'Knowledge base access required'},403);
   if(request.method==='GET') {const file=await read(path);return json({items:file?.data?.items||[],revision:file?.sha||null,canEdit});}
   if(request.method!=='PUT') return json({error:'Method not allowed'},405);
   if(!canEdit) return json({error:'Edit access required'},403);
   if(!sameOrigin(request)) return json({error:'Invalid origin'},403);
   const raw=await request.text(); if(raw.length>600000) return json({error:'Information is too large'},413);
   const body=JSON.parse(raw); if(!Object.hasOwn(body,'revision') || !(body.revision===null || typeof body.revision==='string') || !Array.isArray(body.items) || body.items.length>300) return json({error:'Invalid data'},400);
   const ids=new Set(); const items=body.items.map(row=>{if(!row||typeof row.id!=='string'||!/^[\w-]{1,80}$/.test(row.id)||ids.has(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>160||typeof row.text!=='string'||row.text.length>20000) throw Error('Invalid item');ids.add(row.id);return {id:row.id,title:row.title.trim(),text:row.text};});
   const current=await read(path); if((current?.sha||null)!==body.revision) return json({error:'รายการถูกแก้ไขจากอุปกรณ์อื่น กรุณาโหลดข้อมูลใหม่ก่อนบันทึก'},409);
   const data={version:1,items,updated:new Date().toISOString()};
   const saved=await write('PUT',path,{message:`Update Knowledge text library by ${login}`,content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64'),...(current?.sha?{sha:current.sha}:{})});
   return json({revision:saved.content.sha,items});
  } catch(error) {if(/GitHub PUT failed \((409|422)\)/.test(error.message||'')) return json({error:'รายการถูกแก้ไขจากอุปกรณ์อื่น กรุณาโหลดข้อมูลใหม่ก่อนบันทึก'},409);return json({error:error instanceof SyntaxError||error.message==='Invalid item'?'Invalid data':'บันทึกข้อมูลไม่สำเร็จ'},error instanceof SyntaxError||error.message==='Invalid item'?400:503);}
 };
}
