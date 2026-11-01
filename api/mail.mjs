import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookie, json, nodeHandler, origin, sameOrigin, sessionLogin } from '../lib/harborflow.mjs';

const graph = 'https://graph.microsoft.com/v1.0';
const scopes = 'openid profile User.Read Mail.Read';
const configured = () => Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.HARBORFLOW_SESSION_SECRET);
const key = () => createHash('sha256').update('harborflow-mail-v1:' + process.env.HARBORFLOW_SESSION_SECRET).digest();
const seal = data => { const iv=randomBytes(12), c=createCipheriv('aes-256-gcm',key(),iv); const body=Buffer.concat([c.update(JSON.stringify(data)),c.final()]); return Buffer.concat([iv,c.getAuthTag(),body]).toString('base64url'); };
const unseal = value => { try { const b=Buffer.from(value,'base64url'); if (b.length < 29) return null; const d=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12)); d.setAuthTag(b.subarray(12,28)); return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString()); } catch { return null; } };
const setCookie = (name,value,age) => `${name}=${value}; Path=/api/mail; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const redirect = (url,cookies=[]) => { const headers=new Headers({'Location':url,'Cache-Control':'no-store'}); for(const c of cookies) headers.append('Set-Cookie',c); return new Response(null,{status:302,headers}); };
const fail = (message,status=400) => json({error:message},status);
const tenant = () => /^[a-z0-9.-]+$/i.test(process.env.MICROSOFT_TENANT_ID || '') ? process.env.MICROSOFT_TENANT_ID : 'organizations';
const loginUrl = () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`;
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 1024 && /^[a-zA-Z0-9_+=/-]+$/.test(id);

export function createMailRoute({ loginFromRequest=sessionLogin, fetcher=fetch } = {}) {
 return async function route(request) {
  const user=loginFromRequest(request); if(!user) return fail('กรุณาลงชื่อเข้าใช้ HarborFlow ก่อน',401);
  const u=new URL(request.url), action=u.searchParams.get('action') || 'status';
  if(action==='status') { const ticket=unseal(cookie(request,'hf_mail')); return json({configured:configured(),connected:!!(ticket && ticket.user===user && ticket.exp>Date.now())}); }
  if(!configured()) return fail('ยังไม่ได้ตั้งค่าการเชื่อมต่อ Microsoft 365',503);
  if(action==='start' && request.method==='GET') {
   const state=randomBytes(24).toString('base64url'), verifier=randomBytes(32).toString('base64url');
   const challenge=createHash('sha256').update(verifier).digest('base64url');
   const url=new URL(`${loginUrl()}/authorize`); for(const [k,v] of Object.entries({client_id:process.env.MICROSOFT_CLIENT_ID,response_type:'code',redirect_uri:`${origin(request)}/api/mail?action=callback`,response_mode:'query',scope:scopes,state,code_challenge:challenge,code_challenge_method:'S256'})) url.searchParams.set(k,v);
   return redirect(url.toString(),[setCookie('hf_mail_state',seal({state,verifier,user,exp:Date.now()+600000}),600)]);
  }
  if(action==='callback' && request.method==='GET') {
   const state=unseal(cookie(request,'hf_mail_state')), supplied=u.searchParams.get('state')||'', code=u.searchParams.get('code');
   if(!state || state.user!==user || state.exp<Date.now() || !code || !/^[A-Za-z0-9_-]+$/.test(supplied) || supplied.length!==state.state.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(state.state))) return fail('ไม่สามารถยืนยันการเชื่อมต่อ Outlook ได้',403);
   const params=new URLSearchParams({client_id:process.env.MICROSOFT_CLIENT_ID,client_secret:process.env.MICROSOFT_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:`${origin(request)}/api/mail?action=callback`,scope:scopes,code_verifier:state.verifier});
   const res=await fetcher(`${loginUrl()}/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params}); const token=await res.json();
   if(!res.ok || !token.access_token) return fail('Microsoft ไม่อนุญาตการเชื่อมต่อ กรุณาตรวจสอบสิทธิ์ขององค์กร',403);
   const seconds=Math.min(Number(token.expires_in)||3600,3600); const ticket=seal({user,token:token.access_token,exp:Date.now()+seconds*1000});
   if(ticket.length>3700) return fail('การเชื่อมต่อ Outlook ไม่สำเร็จ: ข้อมูลยืนยันตัวตนมีขนาดเกินที่รองรับ',502);
   return redirect('/?workspace=email',[setCookie('hf_mail',ticket,seconds)]);
  }
  if(action==='disconnect' && request.method==='POST') { if(!sameOrigin(request)) return fail('Invalid origin',403); return json({connected:false},200,{'Set-Cookie':setCookie('hf_mail','',0)}); }
  if(request.method!=='GET') return fail('Unsupported action',405);
  const ticket=unseal(cookie(request,'hf_mail')); if(!ticket || ticket.user!==user || ticket.exp<Date.now()) return fail('กรุณาเชื่อมต่อ Outlook อีกครั้ง',401);
  let path;
  if(action==='messages') { const folder=u.searchParams.get('folder')||'inbox'; if(!['inbox','sentitems','drafts'].includes(folder)) return fail('Invalid folder'); path=`/me/mailFolders/${folder}/messages?$select=id,subject,from,receivedDateTime,sentDateTime,bodyPreview,isRead,hasAttachments&$top=30&$orderby=${folder==='sentitems'?'sentDateTime':'receivedDateTime'}%20desc`; }
  else if(action==='message') { const id=u.searchParams.get('id'); if(!validId(id)) return fail('Invalid message'); path=`/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,receivedDateTime,sentDateTime,body`; }
  else return fail('Unsupported action',405);
  const res=await fetcher(graph+path,{headers:{Authorization:`Bearer ${ticket.token}`,Prefer:'outlook.body-content-type="text"'},cache:'no-store'});
  if(!res.ok) return fail(res.status===401?'การเชื่อมต่อหมดอายุ กรุณาเชื่อมต่อใหม่':'โหลดอีเมลไม่สำเร็จ',res.status===401?401:502);
  return json(await res.json());
 };
}
export default nodeHandler(createMailRoute());
