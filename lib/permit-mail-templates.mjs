import {gh,readJson} from './harborflow.mjs';
export const permitMailPath='Settings/terminal-permit-email-templates.json';
export function validatePermitMailTemplates(items){
 if(!Array.isArray(items)||items.length>100)return 'Invalid templates';
 const ids=new Set();
 for(const item of items){
  if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(item.id)||ids.has(item.id))return 'Invalid template ID';ids.add(item.id);
  if(typeof item.name!=='string'||!item.name.trim()||item.name.length>120)return 'Invalid template name';
  if(!Array.isArray(item.terminals)||item.terminals.length>100||item.terminals.some(x=>typeof x!=='string'||!x.trim()||x.length>160))return 'Invalid terminals';
  if(!Array.isArray(item.to)||!Array.isArray(item.cc)||[...item.to,...item.cc].length>100||[...item.to,...item.cc].some(x=>typeof x!=='string'||x.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x)))return 'Invalid email address';
  if(item.bodyFormat!==undefined && item.bodyFormat!=='html')return 'Invalid body format';
  if(typeof item.subject!=='string'||item.subject.length>500||typeof item.body!=='string'||item.body.length>15000)return 'Invalid subject or body';
 }
 return null;
}
export async function loadPermitMailTemplates({read=readJson}={}){const file=await read(permitMailPath);const templates=file?.data?.templates||[];if(validatePermitMailTemplates(templates))throw Error('Invalid stored templates');return {templates,revision:file?.sha||null};}
export async function savePermitMailTemplates(templates,revision,{read=readJson,write=gh}={}){
 const invalid=validatePermitMailTemplates(templates);if(invalid)return {status:400,error:invalid};
 const old=await read(permitMailPath);if((old?.sha||null)!==(revision||null))return {status:409,error:'Templates changed on another device. Reload before saving.'};
 try{const out=await write('PUT',permitMailPath,{message:'Update Terminal Permit email templates',content:Buffer.from(JSON.stringify({version:1,templates},null,2)+'\n').toString('base64'),...(old?.sha?{sha:old.sha}:{})});return {status:200,templates,revision:out.content.sha};}
 catch(e){if(/\((409|422)\)/.test(e.message))return {status:409,error:'Templates changed on another device. Reload before saving.'};throw e;}
}
