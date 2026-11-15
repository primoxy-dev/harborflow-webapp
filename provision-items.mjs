import { CURRENCIES } from './lib/price-master-money.mjs';
const units=['pcs','sets','boxes','cartons','packs','bags','pallets','kg','g','MT','L','m','rolls','bottles'];
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateLabel=value=>{
  if(!value)return '';
  const [year,month,day]=value.split('-');
  const name=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(month)-1];
  return name?day+'-'+name+'-'+year.slice(-2):'';
};
const attachmentUrl=(serviceId,id)=>'/api/operations?'+new URLSearchParams({action:'provisionEmail',serviceId,id});
const fileBase64=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result).split(',')[1]);
  reader.onerror=()=>reject(Error('Could not read the attachment.'));
  reader.readAsDataURL(file);
});

export async function mountProvisionItems(host,{serviceId,api}) {
  let items=[],categories=[],editable=false,draft=null,busy=false,selectedFile=null;
  function notify(message,error=false) {
    const status=host.querySelector('[data-item-status]');
    if(status){status.textContent=message;status.classList.toggle('hfo-alert',error);}
  }
  function editor(item) {
    const d=item.data;
    const field=(label,key,type='text',attrs='')=>'<label class="hfo-field"><span>'+label+'</span><input type="'+type+'" name="'+key+'" value="'+escape(d[key])+'" '+attrs+'></label>';
    const select=(label,key,options)=>`<label class="hfo-field"><span>${label}</span><select name="${key}" aria-label="${label}"><option value="">Select ${label.toLowerCase()}</option>${[...new Set([...options,...(d[key]?[d[key]]:[])])].map(value=>`<option value="${escape(value)}" ${value===d[key]?'selected':''}>${escape(value)}</option>`).join('')}</select></label>`;
    const check=(label,key)=>'<label class="hfo-checkbox"><input type="checkbox" name="'+key+'" '+(d[key]?'checked':'')+'> '+label+'</label>';
    return `<form class="hfo-provision-editor" data-item-form>
      <h4>${item.version?'Edit':'New'} ${escape(d.category)} item</h4>
      <div class="hfo-provision-fields">
        <div class="hfo-provision-wide">${field('Description','description','text','required maxlength="500"')}</div>
        ${field('Quantity','quantity','number','min="0" step="any" inputmode="decimal"')}
        ${select('Unit','unit',units)}
        ${field('Supplier','supplier','text','maxlength="200"')}
        ${field('Supplier contact','supplierContact','text','maxlength="300"')}
        <label class="hfo-field"><span>Delivery Point</span><select name="deliveryPoint"><option value="">Select delivery point</option>${['Berth','Anchorage'].map(point=>`<option ${d.deliveryPoint===point?'selected':''}>${point}</option>`).join('')}</select></label>
        ${field('Price','price','number','min="0" step="any" inputmode="decimal"')}
        ${select('Currency','currency',CURRENCIES)}
        <div>${field('Delivery date','deliveryDate','date')}<output data-delivery-date>${dateLabel(d.deliveryDate)||'DD-MMM-YY'}</output></div>
        ${field('Delivery time','deliveryTime','time')}
        <label class="hfo-field hfo-provision-wide"><span>Notes</span><textarea name="notes" maxlength="3000" rows="3">${escape(d.notes)}</textarea></label>
      </div>
      <div class="hfo-provision-checks">${check('Customer confirmed','customerConfirmed')}${check('Supplier confirmed','supplierConfirmed')}</div>
      <label class="hfo-field hfo-msg-drop" data-msg-drop><span>Customer email (.msg)</span><small>Drop a .msg file here or choose a file · Up to 3 MB</small><input name="email" type="file" accept=".msg" aria-label="Customer email (.msg)"></label>
      <p data-msg-name hidden></p>
      <button type="button" class="hfo-btn" data-preview-new-msg hidden>Preview selected email</button>
      <button type="button" class="hfo-btn" data-clear-new-msg hidden>Clear selection</button>
      ${item.emailName?`<label class="hfo-checkbox"><input type="checkbox" name="removeEmail"> Remove ${escape(item.emailName)}</label>`:''}
      <div class="hfo-actions">
        <button class="hfo-btn primary" type="submit">Save item</button>
        <button class="hfo-btn" type="button" data-cancel-item>Cancel</button>
      </div>
    </form>`;
  }
  function card(item) {
    const d=item.data;
    const facts=[
      ['Quantity',[d.quantity,d.unit].filter(Boolean).join(' ')],
      ['Supplier',d.supplier],['Supplier contact',d.supplierContact],['Delivery Point',d.deliveryPoint],
      ['Delivery',[dateLabel(d.deliveryDate),d.deliveryTime].filter(Boolean).join(' · ')],['Price',d.price==null||d.price===''?'':[d.currency,d.price].filter(Boolean).join(' ')]
    ];
    return `<article class="hfo-provision-item">
      <h4>${escape(d.description)}</h4>
      <dl>${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value||'—')}</dd></div>`).join('')}</dl>
      <div class="hfo-provision-checks">
        <span>${d.customerConfirmed?'✓ Customer confirmed':'Customer pending'}</span>
        <span>${d.supplierConfirmed?'✓ Supplier confirmed':'Supplier pending'}</span>
      </div>
      ${d.notes?`<p class="hfo-provision-note">${escape(d.notes)}</p>`:''}
      ${item.emailName?`<p>${editable?`<a href="${escape(attachmentUrl(serviceId,item.id))}">${escape(item.emailName)}</a> <button type="button" class="hfo-btn" data-preview-msg="${escape(item.id)}">Preview email</button>`:escape(item.emailName)}</p>`:''}
      ${editable?`<div class="hfo-actions"><button type="button" class="hfo-btn" data-edit-item="${escape(item.id)}">Edit</button><button type="button" class="hfo-btn danger" data-remove-item="${escape(item.id)}">Remove</button></div>`:''}
    </article>`;
  }
  function render() {
    host.innerHTML='<p data-item-status role="status" class="hfo-muted"></p><div class="hfo-provision-lists" data-columns="'+categories.length+'">'+categories.map(category=>{
      const list=items.filter(item=>item.data.category===category);
      return `<section class="hfo-section hfo-provision-list" aria-label="${category}">
        <div class="hfo-toolbar"><h3>${category} <small>${list.length}</small></h3>
          ${editable?`<button type="button" class="hfo-btn primary" data-add-item="${category}" ${draft?'disabled':''}>+ Add item</button>`:''}
        </div>
        ${draft?.data.category===category && !draft.version?editor(draft):''}
        ${list.length?list.map(item=>draft?.id===item.id?editor(draft):card(item)).join(''):`<p class="hfo-muted">No ${category.toLowerCase()} items yet.</p>`}
      </section>`;
    }).join('')+'</div>';
  }
  async function load() {
    try {
      const result=await api('provisionItems',{serviceId},'GET');
      if(!host.isConnected)return;
      ({items,categories,editable}=result);
      render();
    } catch(error) {
      if(!host.isConnected)return;
      host.innerHTML='<p role="alert">'+escape(error.message)+'</p><button class="hfo-btn" type="button" data-reload-items>Retry</button>';
    }
  }
  function selectFile(file) {
    if(file && (!/\.msg$/i.test(file.name)||file.size>3000000||!file.size)){
      notify('Choose an Outlook .msg file up to 3 MB.',true);return;
    }
    selectedFile=file||null;
    const name=host.querySelector('[data-msg-name]');
    name.textContent=selectedFile?.name||'';
    name.hidden=!selectedFile;
    host.querySelector('[data-preview-new-msg]').hidden=!selectedFile;
    host.querySelector('[data-clear-new-msg]').hidden=!selectedFile;
    notify('');
  }
  host.addEventListener('dragover',event=>{
    const zone=event.target.closest('[data-msg-drop]');
    if(!zone || busy)return;
    event.preventDefault();
    zone.classList.add('is-dragging');
  });
  host.addEventListener('dragleave',event=>{
    const zone=event.target.closest('[data-msg-drop]');
    if(zone && !zone.contains(event.relatedTarget))zone.classList.remove('is-dragging');
  });
  host.addEventListener('drop',event=>{
    const zone=event.target.closest('[data-msg-drop]');
    if(!zone)return;
    event.preventDefault();zone.classList.remove('is-dragging');
    if(busy)return;
    const files=event.dataTransfer.files;
    if(files.length!==1){notify('Drop one .msg file here. If Outlook did not provide a file, save the message as .msg first.',true);return;}
    selectFile(files[0]);
  });
  host.addEventListener('change',event=>{
    if(event.target.name==='email'){
      if(event.target.files.length)selectFile(event.target.files[0]);
      event.target.value='';
    }
    if(event.target.name==='deliveryDate')host.querySelector('[data-delivery-date]').textContent=dateLabel(event.target.value)||'DD-MMM-YY';
  });
  host.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if(!button||busy)return;
    if(button.hasAttribute('data-reload-items')){busy=true;try{await load();}finally{busy=false;}return;}
    if(!editable)return;
    if(button.hasAttribute('data-clear-new-msg')){selectFile(null);return;}
    if(button.hasAttribute('data-preview-new-msg')||button.dataset.previewMsg){
      const file=button.hasAttribute('data-preview-new-msg')?selectedFile:null;
      const id=button.dataset.previewMsg;
      await showEmailPreview(host,button,async()=>{
        if(!file)return api('provisionEmailPreview',{serviceId,id},'GET');
        const email={name:file.name,content:await fileBase64(file)};
        return api('previewProvisionEmailFile',{serviceId,email});
      });
      return;
    }
    if(button.dataset.addItem)draft={id:crypto.randomUUID(),version:0,data:{category:button.dataset.addItem}};
    else if(button.hasAttribute('data-cancel-item'))draft=null;
    else if(draft)return;
    else if(button.dataset.editItem)draft=items.find(item=>item.id===button.dataset.editItem);
    else if(button.dataset.removeItem){
      const item=items.find(item=>item.id===button.dataset.removeItem);
      if(!item||!window.confirm('Remove '+item.data.description+'?'))return;
      busy=true;
      try {
        await api('removeProvisionItem',{serviceId,id:item.id,version:item.version});
        items=items.filter(row=>row.id!==item.id);
        render();notify('Item removed.');
      } catch(error){notify(error.message,true);}
      finally{busy=false;}
      return;
    } else return;
    selectedFile=null;
    render();
    host.querySelector('[data-item-form] [name="description"]')?.focus();
  });
  host.addEventListener('submit',async event=>{
    if(!event.target.matches('[data-item-form]'))return;
    event.preventDefault();
    if(busy||!draft||!editable)return;
    const form=event.target,values=new FormData(form);
    const file=selectedFile, removeEmail=values.get('removeEmail')==='on';
    values.delete('email');values.delete('removeEmail');
    const data=Object.fromEntries(values);
    data.category=draft.data.category;
    data.customerConfirmed=values.has('customerConfirmed');
    data.supplierConfirmed=values.has('supplierConfirmed');
    busy=true;
    for(const control of form.elements)control.disabled=true;
    notify('Saving item…');
    try {
      let email;
      if(file?.name){
        if(!/\.msg$/i.test(file.name)||file.size>3000000||!file.size)throw Error('Choose an Outlook .msg file up to 3 MB.');
        email={name:file.name,content:await fileBase64(file)};
      }
      const {item}=await api('saveProvisionItem',{serviceId,id:draft.id,version:draft.version,data,email,removeEmail});
      const index=items.findIndex(row=>row.id===item.id);
      if(index<0)items.push(item);else items[index]=item;
      draft=null;selectedFile=null;render();notify('Item saved.');
    } catch(error){
      notify(error.message,true);
      for(const control of form.elements)control.disabled=false;
    } finally {busy=false;}
  });
  await load();
}

function previewText(html) {
  const template=document.createElement('template');
  template.innerHTML=html;
  for(const element of template.content.querySelectorAll('style,script,template,head,svg,math,iframe,object'))element.remove();
  for(const element of template.content.querySelectorAll('br,p,div,li,tr,blockquote,h1,h2,h3'))element.after(document.createTextNode('\n'));
  for(const element of template.content.querySelectorAll('td,th'))element.after(document.createTextNode('\t'));
  return template.content.textContent.trim();
}

async function showEmailPreview(host,trigger,load) {
  const dialog=document.createElement('dialog');
  dialog.className='hfo-msg-preview';
  dialog.setAttribute('aria-label','Customer email preview');
  dialog.innerHTML='<form method="dialog" class="hfo-toolbar"><h3>Customer email</h3><button class="hfo-btn">Close</button></form><p role="status">Loading email…</p><h4 data-msg-subject hidden></h4><dl hidden></dl><pre hidden></pre>';
  host.append(dialog);
  dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();},{once:true});
  dialog.showModal();
  const status=dialog.querySelector('[role="status"]');
  try {
    const {message}=await load();
    if(!dialog.isConnected)return;
    status.hidden=true;
    const subject=dialog.querySelector('[data-msg-subject]');
    subject.textContent=message.subject||'No subject';
    subject.hidden=false;
    const details=dialog.querySelector('dl');
    for(const [label,value] of [['From',message.from],['To',message.to],['CC',message.cc],['Date',message.date]]){
      if(!value)continue;
      const key=document.createElement('dt'),text=document.createElement('dd');
      key.textContent=label;text.textContent=value;details.append(key,text);
    }
    details.hidden=!details.childElementCount;
    const body=dialog.querySelector('pre');
    body.textContent=message.body||previewText(message.html||'')||'No readable message body. Open the original .msg in Outlook.';
    body.hidden=false;
  }catch(error){status.textContent=error.message;status.classList.add('hfo-alert');}
}
