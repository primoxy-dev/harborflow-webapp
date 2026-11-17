import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { html, parseFragment, serialize } from 'parse5';
import { cookie, json, sign } from './harborflow.mjs';
import { uuid } from './operations.mjs';
import { mailRecipientAddresses } from './mail-recipients.mjs';

const routePath='/api/operations';
const callbackAction='voucherOutlookCallback';
const stateCookie='hf_voucher_outlook_state';
const connectionCookie='hf_voucher_outlook_';
const chunkSize=3000;
const chunkCount=3;
const scopes=['https://graph.microsoft.com/Mail.ReadWrite'];
const draftsUrl='https://outlook.office.com/mail/drafts';

export function voucherOutlookConfig(env=process.env) {
  const { HARBORFLOW_OUTLOOK_TENANT_ID:tenantId, HARBORFLOW_OUTLOOK_CLIENT_ID:clientId,
    HARBORFLOW_OUTLOOK_CLIENT_SECRET:clientSecret, HARBORFLOW_OUTLOOK_REDIRECT_URI:redirectUri }=env;
  if(!uuid(tenantId)||!uuid(clientId)||!clientSecret||!env.HARBORFLOW_SESSION_SECRET)return null;
  try{
    const url=new URL(redirectUri);
    if(url.protocol!=='https:'||url.username||url.password||url.hash||
      url.pathname!==routePath||url.search!=='?action='+callbackAction)return null;
    return {tenantId:tenantId.toLowerCase(),clientId:clientId.toLowerCase(),clientSecret,redirectUri:url.href,origin:url.origin};
  }catch{return null;}
}

function secretKey() {
  return Buffer.from(sign('harborflow-voucher-outlook-cookie-v1'),'hex');
}

function binding(request,config,purpose) {
  return Buffer.from(JSON.stringify([purpose,config.tenantId,config.clientId,config.clientSecret,config.origin,cookie(request,'hf_session')]));
}

function seal(request,config,purpose,value) {
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',secretKey(),iv);
  cipher.setAAD(binding(request,config,purpose));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}

function unseal(request,config,purpose,encoded) {
  if(!encoded)return null;
  try{
    const bytes=Buffer.from(encoded,'base64url');
    const decipher=createDecipheriv('aes-256-gcm',secretKey(),bytes.subarray(0,12));
    decipher.setAAD(binding(request,config,purpose));
    decipher.setAuthTag(bytes.subarray(12,28));
    const data=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
    return data.expires>Date.now()?data:null;
  }catch{return null;}
}

function scopedCookie(name,value,seconds) {
  return name+'='+value+'; Path='+routePath+'; Max-Age='+seconds+'; Secure; HttpOnly; SameSite=Lax';
}

function connectionCookies(value='',seconds=0) {
  return Array.from({length:chunkCount},(_,index)=>{
    const part=value.slice(index*chunkSize,(index+1)*chunkSize);
    return scopedCookie(connectionCookie+index,part,part?seconds:0);
  });
}

function readConnection(request,config) {
  const envelope=Array.from({length:chunkCount},(_,index)=>cookie(request,connectionCookie+index)).join('');
  return unseal(request,config,'connection',envelope);
}

function oauthPage(message,status,cookies=[]) {
  const headers=new Headers({
    'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  });
  for(const value of cookies)headers.append('Set-Cookie',value);
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HarborFlow · Outlook</title><main><h1>'+message+'</h1><p>Close this tab and return to the Payment Voucher in HarborFlow.</p></main></html>',{status,headers});
}

function createClient(config) {
  return new ConfidentialClientApplication({auth:{
    clientId:config.clientId, clientSecret:config.clientSecret,
    authority:'https://login.microsoftonline.com/'+config.tenantId
  }});
}

export async function beginVoucherOutlook(request,config,{makeClient=createClient}={}) {
  if(!config||new URL(request.url).origin!==config.origin)return json({error:'Outlook draft creation is not configured on this site.'},503);
  const verifier=randomBytes(32).toString('base64url');
  const nonce=randomBytes(24).toString('base64url');
  const authUrl=new URL(await makeClient(config).getAuthCodeUrl({
    scopes,redirectUri:config.redirectUri,state:nonce,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),
    codeChallengeMethod:'S256',responseMode:'query',prompt:'select_account'
  }));
  const state=seal(request,config,'state',{state:authUrl.searchParams.get('state'),verifier,expires:Date.now()+600000});
  return new Response(null,{status:302,headers:{
    Location:authUrl.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
    'Set-Cookie':scopedCookie(stateCookie,state,600)
  }});
}

export async function finishVoucherOutlook(request,config,{makeClient=createClient}={}) {
  const clearState=scopedCookie(stateCookie,'',0);
  const url=new URL(request.url);
  if(!config||url.origin!==config.origin)return oauthPage('Outlook draft creation is not configured.',503,[clearState]);
  const saved=unseal(request,config,'state',cookie(request,stateCookie));
  if(!saved?.state||saved.state!==url.searchParams.get('state'))return oauthPage('The Outlook connection expired. Try connecting again.',403);
  const code=url.searchParams.get('code');
  if(!code)return oauthPage('The Outlook connection was not approved.',400,[clearState]);
  try{
    const tokens=await makeClient(config).acquireTokenByCode({code,codeVerifier:saved.verifier,scopes,redirectUri:config.redirectUri});
    const expires=Math.min(tokens.expiresOn?.getTime()-30000,Date.now()+3600000);
    if(!tokens.accessToken||tokens.tenantId!==config.tenantId||!(expires>Date.now()))throw Error('Invalid token session');
    const value=seal(request,config,'connection',{token:tokens.accessToken,expires});
    if(value.length>chunkSize*chunkCount)throw Error('Outlook session is too large');
    return oauthPage('Outlook connected',200,[clearState,...connectionCookies(value,Math.floor((expires-Date.now())/1000))]);
  }catch{return oauthPage('Could not connect Outlook. Try again or check your Microsoft 365 access.',502,[clearState]);}
}

const allowedTags=new Set(['p','div','section','h3','br','b','strong','i','em','u','ul','ol','li','table','thead','tbody','tfoot','tr','th','td','a','span']);
const allowedLinkProtocols=new Set(['http:','https:','mailto:']);
const allowedStyles={
    'background-color':[/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i,/^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/],
    color:[/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i,/^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/],
    border:[/^1px solid (?:#[0-9a-f]{3}(?:[0-9a-f]{3})?|rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\))$/i],
    padding:[/^\d{1,2}px(?: \d{1,2}px){0,3}$/],
    'border-collapse':[/^collapse$/],
    'font-weight':[/^(bold|[6-9]00)$/],
    'font-style':[/^italic$/],
    'text-decoration':[/^underline$/]
};

function permittedLink(value) {
  try{return allowedLinkProtocols.has(new URL(value).protocol);}
  catch{return false;}
}

function sanitizeMailHtml(body) {
  const fragment=parseFragment(body);
  const parents=[fragment];
  for(const parent of parents){
    parent.childNodes=parent.childNodes.filter(node=>{
      if(node.nodeName==='#text')return true;
      if(node.namespaceURI!==html.NS.HTML||!allowedTags.has(node.tagName))return false;
      node.attrs=node.attrs.flatMap(attr=>{
        if(attr.namespace||attr.prefix)return [];
        if(attr.name==='style'){
          const value=attr.value.split(';').map(declaration=>{
            const colon=declaration.indexOf(':');
            const name=declaration.slice(0,colon).trim().toLowerCase();
            const value=declaration.slice(colon+1).trim();
            return colon>0&&Object.hasOwn(allowedStyles,name)&&allowedStyles[name].some(pattern=>pattern.test(value))
              ?name+':'+value:'';
          }).filter(Boolean).join(';');
          return value?[{...attr,value}]:[];
        }
        if(attr.name==='href'&&node.tagName==='a'&&permittedLink(attr.value))return [attr];
        if((node.tagName==='td'||node.tagName==='th')&&['colspan','rowspan'].includes(attr.name)&&
          /^(?:[1-9]\d?|100)$/.test(attr.value))return [attr];
        return [];
      });
      if(node.childNodes.length)parents.push(node);
      return true;
    });
  }
  return serialize(fragment);
}

function draftPayload(input) {
  const {to,cc,subject,body}=input;
  if(typeof subject!=='string'||subject.length>500||typeof body!=='string'||body.length>30000)throw Error('Invalid voucher subject or body.');
  const recipients=value=>[...new Set(mailRecipientAddresses(value))].map(address=>({emailAddress:{address}}));
  const html=sanitizeMailHtml(body);
  if(!html.trim())throw Error('Enter the email body before creating a draft.');
  return {subject,body:{contentType:'HTML',content:html},toRecipients:recipients(to),ccRecipients:recipients(cc)};
}

function outlookMessageLink(value) {
  try{
    const url=new URL(value);
    if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
      ['outlook.office.com','outlook.office365.com','outlook.cloud.microsoft'].includes(url.hostname))return url.href;
  }catch{}
  return draftsUrl;
}

export async function createVoucherOutlookDraft(request,config,input,{sendRequest=fetch}={}) {
  if(!config||new URL(request.url).origin!==config.origin)return json({error:'Outlook draft creation is not configured on this site.'},503);
  const connection=readConnection(request,config);
  if(!connection)return json({error:'Connect your Microsoft 365 account first.',connectOutlook:true},428);
  let payload;
  try{payload=draftPayload(input);}catch(error){return json({error:error.message},400);}
  try{
    const response=await sendRequest('https://graph.microsoft.com/v1.0/me/messages',{
      method:'POST',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)
    });
    if(response.status===401){
      const reconnect=json({error:'Your Outlook connection expired. Reconnect and try again.',connectOutlook:true},428);
      for(const value of connectionCookies())reconnect.headers.append('Set-Cookie',value);
      return reconnect;
    }
    if(response.status===403)return json({error:'Microsoft 365 did not allow draft creation. Check Mail.ReadWrite with your administrator.'},403);
    if(response.status!==201)return json({error:'Outlook could not confirm the draft. Check Drafts before trying again.'},502);
    const message=await response.json();
    return json({created:true,url:outlookMessageLink(message.webLink),draftsUrl},201);
  }catch{return json({error:'Outlook could not confirm the draft. Check Drafts before trying again.'},502);}
}
