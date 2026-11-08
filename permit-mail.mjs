const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=v=>String(v||'').trim();
const split=v=>String(v||'').split(/[;,\n]+/).map(clean).filter(Boolean);
export function fillPermitMail(text,job,ctx){
 const values={vessel:job.vessel||'',jobNo:job.jobNo||'',port:job.port||'',terminal:job.terminal||'',eta:job.eta||'',etd:job.etd||'',permitDate:ctx.permitDate||''};
 return String(text||'').replace(/\{\{(vessel|jobNo|port|terminal|eta|etd|permitDate)\}\}/g,(_,key)=>String(values[key]));
}
export function outlookComposeUrl({to,cc,subject,body}){
 const recipients=[...split(to),...split(cc)];if(recipients.some(x=>!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x)))throw Error('Check the To and CC email addresses.');
 const params=new URLSearchParams({to:split(to).join(';'),cc:split(cc).join(';'),subject:subject||'',body:body||''});
 const url='https://outlook.office.com/mail/deeplink/compose?'+params;
 if(url.length>7000)throw Error('Email is too long for an Outlook link. Shorten the text before opening Outlook.');
 return url;
}
export async function mountPermitMail(host,{preview,ctx,login,get}){
 const root=document.createElement('section');root.className='hfd-oktb-settings';root.innerHTML='<h3>Compose in Outlook</h3><p role="status" data-mail-status>Loading email templates…</p><div data-mail-ui></div>';
 host.querySelector('[data-download-permit]')?.before(root);
 const status=(text,error=false)=>{const e=root.querySelector('[data-mail-status]');e.textContent=text;e.style.color=error?'#b42318':'';};
 let state;
 try{state=await get({action:'permitMailTemplates'});if(state.login!==login)throw Error('Account changed; reopen this document.');}catch(e){status(e.message||'Could not load templates.',true);return null;}
 let selected='',draft={to:'',cc:'',subject:'',body:''},templates=state.templates||[];
 const terminal=clean(preview.job.terminal).toUpperCase();
 const matching=templates.filter(t=>t.terminals.some(x=>clean(x).toUpperCase()===terminal)&&terminal);
 if(matching.length===1){selected=matching[0].id;apply(matching[0]);}
 function apply(t){draft={to:t.to.join('; '),cc:t.cc.join('; '),subject:fillPermitMail(t.subject,preview.job,ctx),body:fillPermitMail(t.body,preview.job,ctx)};}
 function render(){
  root.querySelector('[data-mail-ui]').innerHTML=`<label>Template <select data-mail-template><option value="">Blank email</option>${templates.map(t=>`<option value="${esc(t.id)}" ${selected===t.id?'selected':''}>${esc(t.name)}${t.terminals.length?' · '+esc(t.terminals.join(', ')):' · General'}</option>`).join('')}</select></label>
  <div class="hfd-oktb-editor"><label>To<input data-mail="to" value="${esc(draft.to)}" placeholder="email@example.com; another@example.com"></label><label>CC<input data-mail="cc" value="${esc(draft.cc)}"></label><label>Subject<input data-mail="subject" maxlength="500" value="${esc(draft.subject)}"></label><label>Message<textarea data-mail="body" rows="7">${esc(draft.body)}</textarea></label></div>
  <p>Use {{vessel}}, {{jobNo}}, {{port}}, {{terminal}}, {{eta}}, {{etd}}, {{permitDate}} in templates. Copy the table and paste it into Outlook; attach the downloaded PDF before sending.</p>
  <button type="button" class="secondary" data-copy-permit-table>Copy table</button> <button type="button" class="primary" data-compose-permit>Compose in Outlook</button>
  ${state.canSave?'<details><summary>Manage templates</summary><p>Enter multiple email addresses or terminals separated by semicolons. Leave terminals blank for a general template. Use the placeholders above in the template subject and message.</p><label>Template name<input data-template-name></label><label>Terminals<input data-template-terminals></label><label>Template To<input data-template-to></label><label>Template CC<input data-template-cc></label><label>Template subject<input data-template-subject maxlength="500"></label><label>Template message<textarea data-template-body rows="6"></textarea></label><button type="button" class="secondary" data-save-template>Save as new template</button> <button type="button" class="secondary" data-update-template>Update selected template</button> <button type="button" class="secondary" data-delete-template>Delete selected template</button></details>':''}`;
  if(selected){const t=templates.find(x=>x.id===selected);if(t&&state.canSave){root.querySelector('[data-template-name]').value=t.name;root.querySelector('[data-template-terminals]').value=t.terminals.join('; ');root.querySelector('[data-template-to]').value=t.to.join('; ');root.querySelector('[data-template-cc]').value=t.cc.join('; ');root.querySelector('[data-template-subject]').value=t.subject;root.querySelector('[data-template-body]').value=t.body;}}
 }
 render();status(host.querySelector('#hfdPermitTables td')&&[...host.querySelectorAll('#hfdPermitTables td')].some(td=>!td.textContent.trim())?'Some table cells are blank. Check them before sending.':'Edit this email without changing the shared template.');
 root.addEventListener('input',e=>{if(e.target.dataset.mail)draft[e.target.dataset.mail]=e.target.value;});
 root.addEventListener('change',e=>{if(e.target.matches('[data-mail-template]')){selected=e.target.value;const t=templates.find(x=>x.id===selected);if(t)apply(t);else draft={to:'',cc:'',subject:'',body:''};render();}});
 root.addEventListener('click',async e=>{
  const btn=e.target.closest('button');if(!btn)return;
  try{
   if(btn.hasAttribute('data-copy-permit-table')){
    const source=host.querySelector('#hfdPermitTables');if(!source?.querySelector('table'))throw Error('No rows to copy.');
    const clone=source.cloneNode(true);clone.querySelectorAll('table').forEach(t=>{t.style.borderCollapse='collapse';});clone.querySelectorAll('th,td').forEach(c=>{c.style.border='1px solid #000';c.style.padding='4px';});
    if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw Error('Your browser cannot copy formatted tables.');
    await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([clone.innerHTML],{type:'text/html'}),'text/plain':new Blob([source.innerText||source.textContent],{type:'text/plain'})})]);status('Table copied. Paste it into Outlook.');return;
   }
   if(!state.canSave||!['saveTemplate','updateTemplate','deleteTemplate'].some(k=>Object.hasOwn(btn.dataset,k)))return;
   const name=clean(root.querySelector('[data-template-name]').value),terminals=split(root.querySelector('[data-template-terminals]').value);
   let next=structuredClone(templates),id=selected;
   if(btn.hasAttribute('data-save-template'))id=crypto.randomUUID();
   if(btn.hasAttribute('data-delete-template')){if(!id||!confirm('Delete the selected shared template?'))return;next=next.filter(t=>t.id!==id);id='';}
   else {if(!name)throw Error('Enter a template name.');if(btn.hasAttribute('data-update-template')&&!id)throw Error('Select a template first.');const item={id,name,terminals,to:split(root.querySelector('[data-template-to]').value),cc:split(root.querySelector('[data-template-cc]').value),subject:root.querySelector('[data-template-subject]').value,body:root.querySelector('[data-template-body]').value};next=next.filter(t=>t.id!==id);next.push(item);}
   const response=await fetch('/api/documents',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'savePermitMailTemplates',login,templates:next,revision:state.revision})});const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save template.');
   templates=result.templates;state.revision=result.revision;selected=id;render();status('Shared templates saved.');
  }catch(error){status(error.message||'Action failed.',true);}
 });
 return {draft:()=>({...draft}),composeUrl:()=>outlookComposeUrl(draft),status};
}
