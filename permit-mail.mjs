import {bindMailEditor, cleanBody, createMailComposer} from './hotel-email.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const permitFields={vessel:'Vessel',jobNo:'Job No.',port:'Port',terminal:'Terminal',eta:'ETA',etd:'ETD',permitDate:'Permit date'};
const clean=v=>String(v||'').trim();
const split=v=>String(v||'').split(/[;,\n]+/).map(clean).filter(Boolean);
export function sharePreparedPermit(ready,device,now=Date.now()){
 if(!ready||now-ready.createdAt>120000)throw Error('PDF expired. Prepare it again before sharing.');
 if(typeof device.share!=='function'||typeof device.canShare==='function'&&!device.canShare({files:[ready.file]}))throw Error('File sharing is unavailable on this device. Download the PDF and attach it in Outlook.');
 return device.share({files:[ready.file],title:'Terminal Permit'});
}
export function permitTablesPlainText(source){
 const blocks=[];
 for(const section of source.querySelectorAll('section')){
  const table=section.querySelector('table');if(!table)continue;
  const rows=[...table.querySelectorAll('tr')].map(row=>[...row.querySelectorAll('th,td')].map(cell=>String(cell.textContent||'').replace(/\s+/g,' ').trim()));
  if(!rows.length)continue;
  const count=Math.max(...rows.map(row=>row.length)),widths=Array.from({length:count},(_,i)=>Math.max(1,...rows.map(row=>[...(row[i]||'')].length)));
  const border='+'+widths.map(width=>'-'.repeat(width+2)).join('+')+'+';
  const lines=rows.map(row=>'| '+widths.map((width,i)=>{const value=row[i]||'';return value+' '.repeat(width-[...value].length);}).join(' | ')+' |');
  const title=section.querySelector('h3')?.textContent?.trim()||'';
  blocks.push([title,border,lines[0],border,...lines.slice(1),border].filter(Boolean).join('\n'));
 }
 return blocks.join('\n\n');
}
function legacyCopy(html,plain){
 let handled=false;
 const listener=event=>{if(!event.clipboardData)return;event.clipboardData.setData('text/html',html);event.clipboardData.setData('text/plain',plain);event.preventDefault();handled=true;};
 document.addEventListener('copy',listener);
 try{return document.execCommand('copy')&&handled;}finally{document.removeEventListener('copy',listener);}
}
export function fillPermitMail(text,job,ctx){
 const values={vessel:job.vessel||'',jobNo:job.jobNo||'',port:job.port||'',terminal:job.terminal||'',eta:job.eta||'',etd:job.etd||'',permitDate:ctx.permitDate||''};
 return String(text||'').replace(/\{\{(vessel|jobNo|port|terminal|eta|etd|permitDate)\}\}/g,(_,key)=>String(values[key]));
}
export function outlookComposeUrl({to,cc,subject,body}){
 const recipients=[...split(to),...split(cc)];if(recipients.some(x=>!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x)))throw Error('Check the To and CC email addresses.');
 const params=Object.entries({to:split(to).join(';'),cc:split(cc).join(';'),subject:subject||'',...(body?{body}:{})})
  .map(([key,value])=>key+'='+encodeURIComponent(value)).join('&');
 const url='https://outlook.office.com/mail/deeplink/compose?'+params;
 if(url.length>7000)throw new RangeError('Email is too long for an Outlook link. Shorten the text before opening Outlook.');
 return url;
}
export async function mountPermitMail(host,{preview,ctx,login,get}){
 const root=document.createElement('section');
 root.className='hfd-oktb-settings hfd-permit-mail';
 root.innerHTML='<button type="button" class="primary" data-open-permit-mail>Compose Email</button> <button type="button" class="secondary" data-prepare-permit-share>Prepare PDF to share</button> <button type="button" class="secondary" data-share-permit hidden>Share PDF</button><p role="status" data-permit-mail-status></p>';
 host.querySelector('[data-download-permit]')?.closest('.hfd-pdf-actions')?.before(root);
 const dialog=createMailComposer({
  templateLabel:'Terminal Permit email template', availableFields:permitFields,
  templateHelp:'Use placeholders in the subject or body to fill Job details.',
  templateExtra:'<label>Terminals<input name="terminals" placeholder="Separate terminals with ;"></label><small>Leave blank for a general template.</small>',
  footerExtra:'<button type="button" class="hfo-btn" data-copy-permit-table>Copy table</button>',
  bodyExtra:'<button type="button" data-use-permit-layout>Use Permit layout</button>',
  outlookAttribute:'data-compose-permit'
 });
 root.append(dialog);
 const form=dialog.querySelector('form'), select=form.elements.template;
 const {editor,reset}=bindMailEditor(form);
 const opener=root.querySelector('[data-open-permit-mail]');
 const status=(text,error=false)=>{
  const output=dialog.open?dialog.querySelector('[data-mail-notice]'):root.querySelector('[data-permit-mail-status]');
  output.textContent=text;
  output.classList.toggle('hfo-alert',error);
 };
 opener.onclick=()=>dialog.showModal();
 dialog.querySelector('[data-close-mail]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>opener.focus());
 form.onsubmit=event=>event.preventDefault();
 form.addEventListener('mail-format-error',event=>status(event.detail,true));
 let state;
 try{state=await get({action:'permitMailTemplates'});if(state.login!==login)throw Error('Account changed; reopen this document.');}
 catch(e){const message=e.message||'Could not load templates.';dialog.querySelector('[data-mail-notice]').textContent=message;status(message,true);return null;}
 let templates=state.templates||[], lastApplied=null, saving=false;
 const blank={to:[],cc:[],subject:'',body:''};
 const terminal=clean(preview.job.terminal).toUpperCase();
 const matching=templates.filter(t=>terminal&&t.terminals.some(x=>clean(x).toUpperCase()===terminal));
 const values=()=>({...preview.job,permitDate:ctx.permitDate});
 const draft=()=>({to:form.elements.to.value,cc:form.elements.cc.value,subject:form.elements.subject.value,body:cleanBody(editor.innerHTML)});
 const selected=()=>templates.find(t=>t.id===select.value);
 const layout=()=>{
  const source=host.querySelector('[data-permit-letter-body]');
  return source?cleanBody('<div class="hfo-permit-email-layout">'+source.innerHTML+'</div>'):'';
 };
 function useLayout(){
  editor.innerHTML=layout();
  reset();
  const subject=host.querySelector('#hfdPermitSubjectOut')?.textContent;
  if(subject && !form.elements.subject.value)form.elements.subject.value=subject;
 }
 function bodyForTemplate(){
  const body=document.createElement('template');
  body.innerHTML=draft().body;
  for(const block of body.content.querySelectorAll('.hfo-permit-email-layout'))block.replaceWith(document.createTextNode('{{permitLayout}}'));
  return body.innerHTML;
 }
 const rendered=(template,fill)=>({
  subject:fill?fillPermitMail(template.subject,preview.job,ctx):template.subject,
  body:cleanBody(template.bodyFormat==='html'?template.body:esc(template.body).replace(/\r\n?|\n/g,'<br>'),fill?values():null,permitFields).replaceAll('{{permitLayout}}',fill?layout():'{{permitLayout}}')
 });
 function apply(template,fill=true){
  form.elements.to.value=template.to.join('; ');
  form.elements.cc.value=template.cc.join('; ');
  const data=rendered(template,fill);
  form.elements.subject.value=data.subject;
  editor.innerHTML=data.body;
  reset();
  lastApplied=fill?{template,...data}:null;
 }
 function renderOptions(id=''){
  select.replaceChildren(new Option('Blank email',''),...templates.map(t=>new Option(t.name+' · '+(t.terminals.join(', ')||'General'),t.id)));
  select.value=id;
  select.dispatchEvent(new Event('change'));
 }
 select.onchange=()=>{
  const template=selected();
  form.elements.templateName.value=template?.name||'';
  form.elements.terminals.value=template?.terminals.join('; ')||'';
  for(const action of ['load','update','remove'])form.querySelector('[data-template-action="'+action+'"]').disabled=!template;
 };
 dialog.querySelector('[data-branch]').textContent=preview.job.terminal||preview.job.port||'Terminal Permit';
 form.querySelector('[data-manage]').hidden=!state.canSave;
 renderOptions(matching.length===1?matching[0].id:'');
 apply(selected()||blank);
 form.hidden=false;
 dialog.querySelector('[data-mail-notice]').textContent='';
 root.addEventListener('click',async e=>{
  const btn=e.target.closest('button');if(!btn)return;
  try{
   if(btn.hasAttribute('data-copy-permit-table')){
    const source=host.querySelector('#hfdPermitTables');if(!source?.querySelector('table'))throw Error('No rows to copy.');
    const clone=source.cloneNode(true);clone.querySelectorAll('table').forEach(t=>{t.setAttribute('border','1');t.setAttribute('cellpadding','4');t.setAttribute('cellspacing','0');t.style.borderCollapse='collapse';t.style.border='1px solid #000000';});clone.querySelectorAll('th,td').forEach(c=>{c.style.border='1px solid #000000';c.style.padding='4px';});
    const plain=permitTablesPlainText(source);if(!plain)throw Error('No rows to copy.');
    if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
     try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([clone.innerHTML],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);}
     catch(error){if(!legacyCopy(clone.innerHTML,plain))throw error;}
    }else if(!legacyCopy(clone.innerHTML,plain))throw Error('Your browser cannot copy formatted tables. Select and copy the table in the preview instead.');
    status('Table copied. Paste it into Outlook.');return;
   }
   if(btn.hasAttribute('data-use-permit-layout')){
    if(!layout())throw Error('The Terminal Permit preview is unavailable.');
    if(editor.innerText.trim()&&!confirm('Replace the Body with the current Terminal Permit layout?'))return;
    useLayout();status('Terminal Permit layout added to the Body.');return;
   }
   if(btn.hasAttribute('data-use')){
    if((draft().subject||editor.innerText)&&!confirm('Replace this email with the selected template?'))return;
    apply(selected()||blank);status('Template applied to this email.');return;
   }
   if(btn.hasAttribute('data-copy')){
    const body=cleanBody(editor.innerHTML,values(),permitFields),plain=fillPermitMail(editor.innerText,preview.job,ctx);
    if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
     try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([body],{type:'text/html'}),'text/plain':new Blob([plain],{type:'text/plain'})})]);}
     catch(error){if(!legacyCopy(body,plain))throw error;}
    }else if(!legacyCopy(body,plain))throw Error('Select and copy the body directly to keep its formatting.');
    status('Formatted body copied. Paste it into Outlook.');return;
   }
   const action=btn.dataset.templateAction;
   if(!state.canSave||!action||saving)return;
   const template=selected();
   if(action==='load'){if(template&&confirm('Replace the email fields with the saved template?')){apply(template,false);status('Template loaded for editing.');}return;}
   if(action==='remove'&&(!template||!confirm('Delete the selected shared template?')))return;
   if(action==='update'&&!template)return;
   const id=action==='create'?crypto.randomUUID():template.id;
   const next=templates.filter(t=>t.id!==id);
   if(action!=='remove'){
    const name=clean(form.elements.templateName.value), data=draft();
    if(!name)throw Error('Enter a template name.');
    next.push({id,name,terminals:split(form.elements.terminals.value),to:split(data.to),cc:split(data.cc),subject:data.subject,body:bodyForTemplate(),bodyFormat:'html'});
   }
   saving=true;
   try{
    const response=await fetch('/api/documents',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'savePermitMailTemplates',login,templates:next,revision:state.revision})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save template.');
    templates=result.templates;state.revision=result.revision;
    renderOptions(action==='remove'?'':id);status('Shared templates saved.');
   }finally{saving=false;}
  }catch(error){status(error.message||'Action failed.',true);}
 });
 function refresh(){
  if(!lastApplied)return;
  const current=draft(), next=rendered(lastApplied.template,true);
  if(current.subject===lastApplied.subject)form.elements.subject.value=next.subject;
  if(current.body===lastApplied.body){editor.innerHTML=next.body;reset();}
  lastApplied={template:lastApplied.template,...next};
 }
 return {refresh,composeUrl:({includeBody=true}={})=>{
  const data=draft();
  return outlookComposeUrl({...data,subject:fillPermitMail(data.subject,preview.job,ctx),body:includeBody?fillPermitMail(editor.innerText,preview.job,ctx):''});
 },share:ready=>sharePreparedPermit(ready,navigator),status};
}
