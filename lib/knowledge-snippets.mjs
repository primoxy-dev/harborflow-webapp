import { randomUUID } from 'node:crypto';
import { configReady, gh, json, knowledgeGrants, readJson, sameOrigin, sessionLogin } from './harborflow.mjs';

const path='Knowledge/text-library.json';
export function createSnippetsRoute(deps={}) {
 const getLogin=deps.getLogin||sessionLogin, getGrants=deps.getGrants||knowledgeGrants, read=deps.read||readJson, write=deps.write||gh, ready=deps.ready||configReady;
 return async request=>{
  if(!ready()) return json({error:'Shared storage is not configured'},503);
  const login=getLogin(request); if(!login) return json({error:'Sign in to access saved text'},401);
  try {
   const grants=await getGrants(login); const canEdit=!!(grants.administrator||grants.restrictionEdit); if(!canEdit&&!grants.contactView) return json({error:'Knowledge base access required'},403);
   const imageId=new URL(request.url).searchParams.get('image');
   if(imageId && request.method==='GET') {
    if(!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(imageId)) return json({error:'Invalid image'},400);
    const file=await write('GET',`Knowledge/text-images/${imageId}`); if(!file?.content) return json({error:'Image not found'},404);
    const types={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
    return new Response(Buffer.from(file.content.replace(/\s/g,''),'base64'),{headers:{'Content-Type':types[imageId.split('.').pop()],'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(request.method==='POST') {
    if(!canEdit) return json({error:'Edit access required'},403);
    if(!sameOrigin(request)) return json({error:'Invalid origin'},403);
    const raw=await request.text(); if(raw.length>1050000) return json({error:'รูปภาพมีขนาดใหญ่เกิน 750 KB'},413);
    const body=JSON.parse(raw); const match=typeof body.image==='string'&&/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.image);
    if(!match) return json({error:'รองรับรูป PNG, JPEG และ WebP'},400);
    const bytes=Buffer.from(match[2],'base64');if(bytes.length>750000 || bytes.length<12) return json({error:'รูปภาพมีขนาดใหญ่เกิน 750 KB'},413);
    const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!valid)return json({error:'ไฟล์รูปภาพไม่ถูกต้อง'},400);
    const id=`${randomUUID()}.${match[1]==='jpeg'?'jpg':match[1]}`;
    await write('PUT',`Knowledge/text-images/${id}`,{message:`Add Knowledge image by ${login}`,content:bytes.toString('base64')}); return json({id});
   }
   if(request.method==='GET') {const file=await read(path);return json({items:file?.data?.items||[],revision:file?.sha||null,canEdit});}
   if(request.method!=='PUT') return json({error:'Method not allowed'},405);
   if(!canEdit) return json({error:'Edit access required'},403);
   if(!sameOrigin(request)) return json({error:'Invalid origin'},403);
   const raw=await request.text(); if(raw.length>600000) return json({error:'Information is too large'},413);
   const body=JSON.parse(raw); if(!Object.hasOwn(body,'revision') || !(body.revision===null || typeof body.revision==='string') || !Array.isArray(body.items) || body.items.length>300) return json({error:'Invalid data'},400);
   const ids=new Set(); const items=body.items.map(row=>{if(!row||typeof row.id!=='string'||!/^[\w-]{1,80}$/.test(row.id)||ids.has(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>160||typeof row.text!=='string'||row.text.length>20000||!Array.isArray(row.images||[])||(row.images||[]).length>10||(row.images||[]).some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(id))) throw Error('Invalid item');ids.add(row.id);return {id:row.id,title:row.title.trim(),text:row.text,images:row.images||[]};});
   const current=await read(path); if((current?.sha||null)!==body.revision) return json({error:'รายการถูกแก้ไขจากอุปกรณ์อื่น กรุณาโหลดข้อมูลใหม่ก่อนบันทึก'},409);
   const data={version:1,items,updated:new Date().toISOString()};
   const saved=await write('PUT',path,{message:`Update Knowledge text library by ${login}`,content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64'),...(current?.sha?{sha:current.sha}:{})});
   return json({revision:saved.content.sha,items});
  } catch(error) {if(/GitHub PUT failed \((409|422)\)/.test(error.message||'')) return json({error:'รายการถูกแก้ไขจากอุปกรณ์อื่น กรุณาโหลดข้อมูลใหม่ก่อนบันทึก'},409);return json({error:error instanceof SyntaxError||error.message==='Invalid item'?'Invalid data':'บันทึกข้อมูลไม่สำเร็จ'},error instanceof SyntaxError||error.message==='Invalid item'?400:503);}
 };
}
