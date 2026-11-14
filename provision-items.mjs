const categories=['Provision','Store'];
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
  let items=[],editable=false,draft=null,busy=false;
  function notify(message,error=false) {
    const status=host.querySelector('[data-item-status]');
    if(status){status.textContent=message;status.classList.toggle('hfo-alert',error);}
  }
  function editor(item) {
    const d=item.data;
    const field=(label,key,type='text',attrs='')=>'<label class="hfo-field"><span>'+label+'</span><input type="'+type+'" name="'+key+'" value="'+escape(d[key])+'" '+attrs+'></label>';
    const check=(label,key)=>'<label class="hfo-checkbox"><input type="checkbox" name="'+key+'" '+(d[key]?'checked':'')+'> '+label+'</label>';
    return `<form class="hfo-provision-editor" data-item-form>
      <h4>${item.version?'Edit':'New'} ${escape(d.category)} item</h4>
      <div class="hfo-provision-fields">
        <div class="hfo-provision-wide">${field('Description','description','text','required maxlength="500"')}</div>
        ${field('Quantity','quantity','number','min="0" step="any" inputmode="decimal"')}
        ${field('Unit','unit','text','maxlength="80"')}
        ${field('Supplier','supplier','text','maxlength="200"')}
        ${field('Supplier contact','supplierContact','text','maxlength="300"')}
        <label class="hfo-field"><span>Delivery Point</span><select name="deliveryPoint"><option value="">Select delivery point</option>${['Berth','Anchorage'].map(point=>`<option ${d.deliveryPoint===point?'selected':''}>${point}</option>`).join('')}</select></label>
        ${field('Price','price','number','min="0" step="any" inputmode="decimal"')}
        <div>${field('Delivery date','deliveryDate','date')}<output data-delivery-date>${dateLabel(d.deliveryDate)||'DD-MMM-YY'}</output></div>
        ${field('Delivery time','deliveryTime','time')}
        <label class="hfo-field hfo-provision-wide"><span>Notes</span><textarea name="notes" maxlength="3000" rows="3">${escape(d.notes)}</textarea></label>
      </div>
      <div class="hfo-provision-checks">${check('Customer confirmed','customerConfirmed')}${check('Supplier confirmed','supplierConfirmed')}</div>
      <label class="hfo-field"><span>Customer email (.msg)</span><input name="email" type="file" accept=".msg"></label>
      <small class="hfo-muted">Maximum 3 MB per item</small>
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
      ['Delivery',[dateLabel(d.deliveryDate),d.deliveryTime].filter(Boolean).join(' · ')],['Price',d.price]
    ];
    return `<article class="hfo-provision-item">
      <h4>${escape(d.description)}</h4>
      <dl>${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value||'—')}</dd></div>`).join('')}</dl>
      <div class="hfo-provision-checks">
        <span>${d.customerConfirmed?'✓ Customer confirmed':'Customer pending'}</span>
        <span>${d.supplierConfirmed?'✓ Supplier confirmed':'Supplier pending'}</span>
      </div>
      ${d.notes?`<p class="hfo-provision-note">${escape(d.notes)}</p>`:''}
      ${item.emailName?`<p>${editable?`<a href="${escape(attachmentUrl(serviceId,item.id))}">${escape(item.emailName)}</a>`:escape(item.emailName)}</p>`:''}
      ${editable?`<div class="hfo-actions"><button type="button" class="hfo-btn" data-edit-item="${escape(item.id)}">Edit</button><button type="button" class="hfo-btn danger" data-remove-item="${escape(item.id)}">Remove</button></div>`:''}
    </article>`;
  }
  function render() {
    host.innerHTML='<p data-item-status role="status" class="hfo-muted"></p><div class="hfo-provision-lists">'+categories.map(category=>{
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
      ({items,editable}=result);
      render();
    } catch(error) {
      if(!host.isConnected)return;
      host.innerHTML='<p role="alert">'+escape(error.message)+'</p><button class="hfo-btn" type="button" data-reload-items>Retry</button>';
    }
  }
  host.addEventListener('change',event=>{
    if(event.target.name==='deliveryDate')host.querySelector('[data-delivery-date]').textContent=dateLabel(event.target.value)||'DD-MMM-YY';
  });
  host.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if(!button||busy)return;
    if(button.hasAttribute('data-reload-items')){busy=true;try{await load();}finally{busy=false;}return;}
    if(!editable)return;
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
    render();
    host.querySelector('[data-item-form] [name="description"]')?.focus();
  });
  host.addEventListener('submit',async event=>{
    if(!event.target.matches('[data-item-form]'))return;
    event.preventDefault();
    if(busy||!draft||!editable)return;
    const form=event.target,values=new FormData(form);
    const file=values.get('email'), removeEmail=values.get('removeEmail')==='on';
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
      draft=null;render();notify('Item saved.');
    } catch(error){
      notify(error.message,true);
      for(const control of form.elements)control.disabled=false;
    } finally {busy=false;}
  });
  await load();
}
