const root=document.getElementById('price');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=null,dirty=false,busy=false,message='';
const format=value=>Number(value).toLocaleString('en-US',{maximumFractionDigits:0});
async function request(method='GET',body){
 const response=await fetch('/api/price-master',{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Could not load Price Master');return result;
}
function render(){
 if(!root)return;
 if(!catalog){root.innerHTML=`<div class="panel"><h2>Price Master</h2><p role="status">${escape(message||'Loading…')}</p><button class="secondary" data-pm="reload">Try again</button></div>`;return;}
 let previous='';
 const rows=catalog.items.map((item,i)=>{
  const header=item.category!==previous?`<tr><th colspan="5" class="pm-category">${escape(item.category)}</th></tr>`:'';previous=item.category;
  return `${header}<tr><td>${escape(item.name)}</td><td>${escape(item.unit)}</td><td><input type="number" min="0" max="1000000000" step="1" inputmode="numeric" data-pm-index="${i}" data-pm-field="price" aria-label="Cost ${escape(item.name)}" value="${escape(item.price)}" ${busy?'disabled':''}></td><td><input type="number" min="0" max="1000000000" step="1" inputmode="numeric" data-pm-index="${i}" data-pm-field="margin" aria-label="Margin ${escape(item.name)}" value="${escape(item.margin)}" ${busy?'disabled':''}></td><td data-pm-total="${i}">${format(Number(item.price)+Number(item.margin))}</td></tr>`;
 }).join('');
 root.innerHTML=`<section class="panel pm-panel"><div class="pm-head"><div><h2>Price Master</h2><p>Estimated Proforma D/A (CREW) · USD per unit</p><p>Selling price = Cost + Margin · Existing quotations remain unchanged</p></div><div><button class="secondary" data-pm="reload" ${busy?'disabled':''}>Reload</button> <button class="primary" data-pm="save" ${busy||!dirty?'disabled':''}>Save</button></div></div><p role="status" class="pm-status">${escape(message||(dirty?'Unsaved changes':''))}</p><div class="pm-table-wrap"><table class="pm-table"><thead><tr><th>Description</th><th>Unit</th><th>Cost (USD)</th><th>Margin (USD)</th><th>Selling Price (USD)</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
async function open(){
 if(dirty){render();return;}
 catalog=null;message='Loading…';render();
 try{catalog=await request();message='';}catch(error){message=error.message;}render();
}
root?.addEventListener('input',event=>{
 const input=event.target,index=Number(input.dataset.pmIndex),key=input.dataset.pmField;
 if(!catalog||!Number.isInteger(index)||!['price','margin'].includes(key)||!catalog.items[index])return;
 catalog.items[index][key]=input.value;dirty=true;message='';
 const item=catalog.items[index],total=root.querySelector(`[data-pm-total="${index}"]`);
 const valid=[item.price,item.margin].every(value=>value!==''&&Number.isFinite(Number(value))&&Number(value)>=0);
 if(total)total.textContent=valid?format(Number(item.price)+Number(item.margin)):'—';
 const button=root.querySelector('[data-pm="save"]');if(button)button.disabled=false;
 const status=root.querySelector('.pm-status');if(status)status.textContent='Unsaved changes';
});
root?.addEventListener('click',async event=>{
 const action=event.target.closest('[data-pm]')?.dataset.pm;if(!action||busy)return;
 if(action==='reload'){if(dirty&&!confirm('You have unsaved changes. Reload and discard them?'))return;dirty=false;await open();return;}
 if(action!=='save'||!catalog)return;
 const items=catalog.items.map(item=>({...item,price:item.price===''?NaN:Number(item.price),margin:item.margin===''?NaN:Number(item.margin)}));
 if(items.some(item=>[item.price,item.margin].some(value=>!Number.isInteger(value)||value<0||value>1e9))){message='Cost and Margin must be whole numbers of zero or more.';render();return;}
 busy=true;message='Saving…';render();
 try{await request('POST',{login:catalog.login,sha:catalog.sha,items});dirty=false;catalog=await request();message='Price Master saved';}catch(error){message=error.message;}finally{busy=false;render();}
});
window.HarborFlowPriceMaster={open};
