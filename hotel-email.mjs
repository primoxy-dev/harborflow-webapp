const tags = new Set('P DIV BR B STRONG I EM U UL OL LI TABLE THEAD TBODY TFOOT TR TH TD A SPAN'.split(' '));
const drop = new Set('SCRIPT STYLE SVG MATH IFRAME OBJECT EMBED TEMPLATE'.split(' '));
const addressPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const fields = {hotel:'Hotel',vessel:'Vessel',checkIn:'Check-in',checkOut:'Check-out',rooms:'Rooms',roomType:'Room type'};
const substitute = (text, values) => values ? text.replace(/\{\{(\w+)\}\}/g, (match,key) => Object.hasOwn(fields,key) ? values[key] || 'To be confirmed' : match) : text;

function safeLink(value) {
  try { return ['https:','http:','mailto:'].includes(new URL(value).protocol); }
  catch { return false; }
}

export function cleanBody(html, values) {
  const input = document.createElement('template');
  input.innerHTML = html;
  const output = document.createElement('div');
  function copy(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(substitute(node.data,values))); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || drop.has(node.tagName) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
    const element = tags.has(node.tagName) ? document.createElement(node.tagName) : null;
    if (element) {
      if (node.tagName === 'A' && safeLink(node.getAttribute('href'))) element.setAttribute('href',node.getAttribute('href'));
      if (['TD','TH'].includes(node.tagName)) {
        for (const attribute of ['colspan','rowspan']) {
          const value = Number(node.getAttribute(attribute));
          if (Number.isInteger(value) && value > 1 && value <= 100) element.setAttribute(attribute,String(value));
        }
        element.style.cssText='border:1px solid #64748b;padding:4px 8px;';
      }
      if (node.tagName === 'TABLE') element.style.borderCollapse='collapse';
      const style = node.getAttribute('style') || '';
      if (/font-weight\s*:\s*(bold|[6-9]00)\b/i.test(style)) element.style.fontWeight='bold';
      if (/font-style\s*:\s*italic\b/i.test(style)) element.style.fontStyle='italic';
      if (/text-decoration(?:-line)?\s*:[^;]*\bunderline\b/i.test(style)) element.style.textDecoration='underline';
      parent.append(element);
    }
    for (const child of node.childNodes) copy(child,element || parent);
  }
  for (const child of input.content.childNodes) copy(child,output);
  return output.innerHTML;
}

export function outlookUrl({to,cc,subject}) {
  const recipients = value => value.split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean);
  const targets = recipients(to), copies = recipients(cc);
  if ([...targets,...copies].some(address=>!addressPattern.test(address))) throw Error('Check the To and CC email addresses.');
  const url = new URL('https://outlook.office.com/mail/deeplink/compose');
  url.search='?'+Object.entries({to:targets.join(';'),cc:copies.join(';'),subject})
    .map(([key,value])=>key+'='+encodeURIComponent(value)).join('&');
  if (url.href.length > 7000) throw Error('Shorten the recipients or subject before opening Outlook.');
  return url.href;
}

export function openHotelEmail({api,serviceId,booking,trigger}) {
  const scope = {serviceId,bookingId:booking.id};
  const dialog = document.createElement('dialog');
  dialog.className='hfo-hotel-mail';
  dialog.setAttribute('aria-labelledby','hotelEmailTitle');
  dialog.innerHTML=`<header><div><h2 id="hotelEmailTitle">Compose Email</h2><p data-branch></p></div><button type="button" class="hfo-btn" data-close-mail>Close</button></header>
    <p role="status" data-mail-notice>Loading email…</p>
    <form hidden>
      <div class="hfo-mail-templates">
        <label>Hotel email template<select name="template"></select></label>
        <button type="button" class="hfo-btn" data-use>Use template</button>
        <small data-branch-hint></small>
      </div>
      <label class="hfo-mail-line"><span>To</span><input name="to" maxlength="2000" placeholder="Separate addresses with ;"></label>
      <label class="hfo-mail-line"><span>CC</span><input name="cc" maxlength="2000" placeholder="Separate addresses with ;"></label>
      <label class="hfo-mail-line"><span>Subject</span><input name="subject" maxlength="500"></label>
      <div class="hfo-mail-body">
        <div class="hfo-mail-tools" role="group" aria-label="Format body">
          <button type="button" data-format="bold" aria-label="Bold"><b>B</b></button>
          <button type="button" data-format="italic" aria-label="Italic"><i>I</i></button>
          <button type="button" data-format="underline" aria-label="Underline"><u>U</u></button>
          <button type="button" data-format="insertUnorderedList">Bullets</button>
          <button type="button" data-format="insertOrderedList">Numbering</button>
          <button type="button" data-format="createLink">Link</button>
          <select data-field aria-label="Booking field">${Object.entries(fields).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select>
          <button type="button" data-insert>Insert field</button>
        </div>
        <div class="hfo-mail-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Body"></div>
      </div>
      <details data-manage hidden><summary>Manage templates</summary>
        <label>Template name<input name="templateName" maxlength="120"></label>
        <small>Use placeholders like {{hotel}} in the subject or body to fill each booking.</small>
        <div class="hfo-actions"><button type="button" class="hfo-btn" data-template-action="create">Save as new</button>
        <button type="button" class="hfo-btn" data-template-action="load">Load for editing</button>
        <button type="button" class="hfo-btn" data-template-action="update">Update selected</button>
        <button type="button" class="hfo-btn danger" data-template-action="remove">Delete selected</button></div>
      </details>
      <footer><button type="submit" class="hfo-btn">Save draft</button>
        <button type="button" class="hfo-btn" data-copy>Copy formatted body</button>
        <button type="button" class="hfo-btn primary" data-outlook>Open Outlook</button></footer>
    </form>`;
  const form=dialog.querySelector('form'), editor=form.querySelector('.hfo-mail-editor'), select=form.elements.template;
  const notice=dialog.querySelector('[data-mail-notice]');
  let state, baseline, range, busy=false;
  const read=()=>({to:form.elements.to.value,cc:form.elements.cc.value,subject:form.elements.subject.value,body:cleanBody(editor.innerHTML)});
  const set=data=>{
    for(const key of ['to','cc','subject'])form.elements[key].value=data[key] || '';
    editor.innerHTML=cleanBody(data.body || '');
    range=null;
  };
  const changed=()=>state && JSON.stringify(read())!==baseline;
  const report=(message,error=false)=>{notice.textContent=message;notice.classList.toggle('hfo-alert',error);};
  function closeEmail() {
    if (busy) return;
    if (!changed()) { dialog.close(); return; }
    void run(async()=>{await saveDraft(); if(!changed())dialog.close();});
  }
  dialog.querySelector('[data-close-mail]').onclick=closeEmail;
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeEmail();});
  dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();},{once:true});
  document.body.append(dialog);
  dialog.showModal();

  function remember() {
    const selection=window.getSelection();
    if(selection.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer))range=selection.getRangeAt(0).cloneRange();
  }
  editor.addEventListener('pointerup',remember);
  editor.addEventListener('keyup',remember);
  editor.addEventListener('focusout',remember);
  function restore(){
    editor.focus();
    const selection=window.getSelection();
    if(!range || !editor.contains(range.commonAncestorContainer)){
      range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
    }
    selection.removeAllRanges();selection.addRange(range);
  }
  editor.addEventListener('paste',event=>{
    event.preventDefault();
    const html=event.clipboardData.getData('text/html');
    if(html)document.execCommand('insertHTML',false,cleanBody(html));
    else document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));
    remember();
  });
  function renderTemplates(id=''){
    const options=[new Option('Standard reservation enquiry','default'),...state.templates.map(t=>new Option(t.name,t.id))];
    select.replaceChildren(...options);
    select.value=id || 'default';
    select.dispatchEvent(new Event('change'));
  }
  select.onchange=()=>{
    const selected=state.templates.find(t=>t.id===select.value);
    form.elements.templateName.value=selected?.name || '';
    for(const action of ['update','remove'])form.querySelector('[data-template-action="'+action+'"]').disabled=!selected;
  };
  const defaultEmail={
    to:'',cc:'',subject:'Hotel room reservation enquiry - {{hotel}}',
    body:'<p>Dear Reservations Team,</p><p>Please advise availability and a quotation for the following booking:</p><p>Hotel: {{hotel}}<br>Vessel: {{vessel}}<br>Check-in: {{checkIn}}<br>Check-out: {{checkOut}}<br>Room type: {{roomType}}<br>Rooms: {{rooms}}</p><p>Please confirm the rate, taxes, cancellation terms, and booking reference.</p><p>Best regards,</p>'
  };
  function emailForDelivery(data){
    const values={...state.booking,vessel:state.vessel};
    return {...data,subject:substitute(data.subject,values),body:cleanBody(data.body,values)};
  }
  function fill(template){
    return {...emailForDelivery(template),to:template.to || state.booking.email || ''};
  }
  async function run(work){
    if(busy)return;
    busy=true;
    form.setAttribute('aria-busy','true');
    try{await work();}catch(error){report(error.message,true);}
    finally{busy=false;form.removeAttribute('aria-busy');}
  }
  async function saveDraft(){
    const data=read();
    const result=await api('saveHotelEmailDraft',{...scope,data,version:state.draft?.version || 0});
    state.draft={data,version:result.version};
    baseline=JSON.stringify(data);
    report('Draft saved to your account.');
  }
  form.onsubmit=event=>{event.preventDefault();void run(saveDraft);};
  form.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button || busy)return;
    if(button.dataset.format){
      restore();
      const command=button.dataset.format;
      if(command==='createLink'){
        const url=window.prompt('Link URL','https://')?.trim();
        if(!url)return;
        if(!safeLink(url)){report('Enter a valid web or email link.',true);return;}
        if(window.getSelection().isCollapsed){
          const link=document.createElement('a');link.href=url;link.textContent=url;
          document.execCommand('insertHTML',false,link.outerHTML);
        }else document.execCommand(command,false,url);
      }else document.execCommand(command,false);
      remember();
    }else if(button.hasAttribute('data-insert')){
      restore();
      document.execCommand('insertText',false,'{{'+form.querySelector('[data-field]').value+'}}');
      remember();
    }else if(button.hasAttribute('data-use')){
      if(changed() && !window.confirm('Replace this email with the selected template?'))return;
      const template=state.templates.find(t=>t.id===select.value);
      set(fill(template?.data || defaultEmail));
      report('Template applied to this draft.');
    }else if(button.hasAttribute('data-outlook')){
      try{window.open(outlookUrl(emailForDelivery(read())),'_blank','noopener,noreferrer');report('Paste the formatted body into Outlook, then review and send.');}
      catch(error){report(error.message,true);}
    }else if(button.hasAttribute('data-copy')){
      void run(async()=>{
        const data=emailForDelivery(read());
        const plain=substitute(editor.innerText,{...state.booking,vessel:state.vessel});
        if(!navigator.clipboard?.write || typeof ClipboardItem==='undefined')throw Error('Select and copy the body directly to keep its formatting.');
        await navigator.clipboard.write([new ClipboardItem({
          'text/html':new Blob([data.body],{type:'text/html'}),
          'text/plain':new Blob([plain],{type:'text/plain'})
        })]);
        report('Formatted body copied. Paste it into Outlook.');
      });
    }else if(button.dataset.templateAction){
      void run(async()=>{
        const action=button.dataset.templateAction;
        const selected=state.templates.find(t=>t.id===select.value);
        if(action==='load'){
          if(changed() && !window.confirm('Replace the email fields with the saved template?'))return;
          set(selected?.data || defaultEmail);
          report('Template loaded with its placeholders. Use Update selected to save changes to the template.');
          return;
        }
        const common={...scope,branch:state.branch,id:action==='create'?undefined:selected.id,version:action==='create'?0:selected.version};
        if(action==='remove'){
          if(!window.confirm('Delete template “'+selected.name+'”?'))return;
          await api('removeHotelEmailTemplate',common);
          state.templates=state.templates.filter(t=>t.id!==selected.id);
          renderTemplates();
          report('Template deleted.');
          return;
        }
        const name=form.elements.templateName.value.trim();
        if(!name){report('Enter a template name.',true);return;}
        const data=read();
        outlookUrl(data);
        const result=await api('saveHotelEmailTemplate',{...common,name,data});
        state.templates=[...state.templates.filter(t=>t.id!==result.template.id),result.template];
        renderTemplates(result.template.id);
        report('Template saved for this hotel branch.');
      });
    }
  });

  void run(async()=>{
    state=await api('hotelEmail',scope,'GET');
    if(!dialog.isConnected)return;
    dialog.querySelector('[data-branch]').textContent=[state.booking.hotel,state.booking.address].filter(Boolean).join(' · ');
    form.querySelector('[data-branch-hint]').textContent=state.branch?'':'Add an address to the booking to use branch templates.';
    form.querySelector('[data-manage]').hidden=!state.canManage || !state.branch;
    renderTemplates();
    set(state.draft?.data || fill(defaultEmail));
    baseline=JSON.stringify(read());
    form.hidden=false;
    report('');
  });
}
