import {CURRENCIES,sellingPrice,convert} from './lib/price-master-money.mjs';
const root=document.getElementById('price');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=null,dirty=false,busy=false,message='',view='folders',draggedColumn='';
const DEFAULT_ORDER=['price','margin','selling'];
let columnOrder=[...DEFAULT_ORDER];
try{const saved=JSON.parse(localStorage.getItem('harborflow.priceMaster.columnOrder'));if(Array.isArray(saved)&&saved.length===3&&DEFAULT_ORDER.every(key=>saved.includes(key)))columnOrder=saved;}catch{}
function moveColumn(from,to){const next=[...columnOrder],target=next.indexOf(to),source=next.indexOf(from);if(source<0||target<0||source===target)return;next.splice(source,1);next.splice(target,0,from);columnOrder=next;try{localStorage.setItem('harborflow.priceMaster.columnOrder',JSON.stringify(next));}catch{}render();}
const keys={price:'costCurrency',margin:'marginCurrency',selling:'sellingCurrency'};
function selectedCurrency(column){const values=[...new Set(catalog.items.map(item=>item[keys[column]]||'USD'))];return values.length===1?values[0]:'';}
function columnHeader(column){const name={price:'Cost',margin:'Margin',selling:'Selling Price'}[column],selected=selectedCurrency(column);return `<th scope="col" data-pm-column="${column}"><div class="pm-column-head"><span draggable="true" data-pm-drag="${column}" role="button" tabindex="0" aria-label="Drag ${name} column to reorder">⠿</span><span>${name}</span><select data-pm-column-currency="${column}" aria-label="${name} currency" ${busy?'disabled':''}>${selected?'':'<option value="" selected>Mixed</option>'}${CURRENCIES.map(c=>`<option value="${c}" ${selected===c?'selected':''}>${c}</option>`).join('')}</select><button type="button" class="pm-move" data-pm-move="${column}" data-pm-direction="left" aria-label="Move ${name} left">‹</button><button type="button" class="pm-move" data-pm-move="${column}" data-pm-direction="right" aria-label="Move ${name} right">›</button></div></th>`;}
function columnCell(item,i,column){
 const mixed=selectedCurrency(column)==='';
 if(column==='selling')return `<td><span data-pm-total="${i}">${format(sellingPrice(item,item.sellingCurrency||'USD',catalog.roe))}</span>${mixed?` <small>${escape(item.sellingCurrency||'USD')}</small>`:''}</td>`;
 const label=column==='price'?'Cost':'Margin',value=item[column];return `<td><input type="number" min="0" max="1000000000" step="1" inputmode="numeric" data-pm-index="${i}" data-pm-field="${column}" aria-label="${label} ${escape(item.name)}" value="${escape(value)}" ${busy?'disabled':''}>${mixed?` <small>${escape(item[keys[column]]||'USD')}</small>`:''}</td>`;
}
const format=value=>value===null?'—':Number(value).toLocaleString('en-US',{maximumFractionDigits:0});
async function request(method='GET',body){
 const response=await fetch('/api/job-quotation?mode=price-master',{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Could not load Price Master');return result;
}
function render(){
 if(!root)return;
 if(!catalog){root.innerHTML=`<div class="panel"><h2>Price Master</h2><p role="status">${escape(message||'Loading…')}</p><button class="secondary" data-pm="reload">Try again</button></div>`;return;}
 if(view==='folders'){root.innerHTML=`<section class="panel"><h2>Price Master</h2><p>Select a template folder.</p><button class="pm-folder" data-pm="folder">📁 Estimated Proforma D/A (CREW)<small>${catalog.items.length} services</small></button></section>`;return;}
 let previous='';
 const rows=catalog.items.map((item,i)=>{
  const header=item.category!==previous?`<tr><th colspan="5" class="pm-category">${escape(item.category)}</th></tr>`:'';previous=item.category;
  return `${header}<tr><td>${escape(item.name)}</td><td>${escape(item.unit)}</td>${columnOrder.map(column=>columnCell(item,i,column)).join('')}</tr>`;
 }).join('');
 root.innerHTML=`<section class="panel pm-panel"><div class="pm-head"><div><button class="secondary" data-pm="back">← Folders</button><h2>Estimated Proforma D/A (CREW)</h2><p>Selling price = Cost + Margin. Amounts are rounded to whole units.</p><p>Changing a column currency converts its amounts using ROE and rounds to whole units. Review changes before saving.</p><p>CREW quotations use USD; each selling price is converted to USD using the ROE below.</p></div><div><button class="secondary" data-pm="reload" ${busy?'disabled':''}>Reload</button> <button class="primary" data-pm="save" ${busy||!dirty?'disabled':''}>Save</button></div></div><div class="pm-roe"><b>Rate of Exchange (ROE)</b>${['THB','EUR'].map(c=>`<label>1 USD = <input type="number" min="0" step="any" data-pm-roe="${c}" value="${escape(catalog.roe?.[c]??'')}" placeholder="Enter rate" ${busy?'disabled':''}> ${c}</label>`).join('')}</div><p role="status" class="pm-status">${escape(message||(dirty?'Unsaved changes':''))}</p><div class="pm-table-wrap"><table class="pm-table"><thead><tr><th>Description</th><th>Unit</th>${columnOrder.map(columnHeader).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
async function open(){if(dirty){render();return;}catalog=null;message='Loading…';render();try{catalog=await request();catalog.roe??={};message='';}catch(error){message=error.message;}render();}
function change(event){
 const input=event.target;
 if(input.dataset.pmRoe&&catalog){catalog.roe[input.dataset.pmRoe]=input.value;dirty=true;catalog.items.forEach((item,index)=>{const total=root.querySelector(`[data-pm-total="${index}"]`);if(total)total.textContent=format(sellingPrice(item,item.sellingCurrency||'USD',catalog.roe));});const button=root.querySelector('[data-pm="save"]');if(button)button.disabled=false;const status=root.querySelector('.pm-status');if(status)status.textContent='Unsaved changes';return;}
 if(input.dataset.pmColumnCurrency&&catalog){
  const column=input.dataset.pmColumnCurrency,target=input.value,field=keys[column];if(!field||!CURRENCIES.includes(target))return;
  const updates=[];for(const item of catalog.items){if(column==='selling'){if(sellingPrice(item,target,catalog.roe)===null){message='Enter a positive ROE for each currency before changing the column.';render();return;}updates.push({item,value:null});continue;}
   if(item[column]===''||!Number.isFinite(Number(item[column]))){message='Enter all amounts before changing the column currency.';render();return;}
   const value=convert(item[column],item[field]||'USD',target,catalog.roe);if(value===null||Math.round(value)>1e9){message='Enter a positive ROE for each currency before changing the column.';render();return;}updates.push({item,value:Math.round(value)});
  }
  updates.forEach(({item,value})=>{if(column!=='selling')item[column]=value;item[field]=target;});dirty=true;message='Currency converted. Review the rounded amounts and save.';render();return;
 }
 const index=Number(input.dataset.pmIndex),key=input.dataset.pmField;
 if(!catalog||!Number.isInteger(index)||!['price','margin','costCurrency','marginCurrency','sellingCurrency'].includes(key)||!catalog.items[index])return;
 catalog.items[index][key]=input.value;dirty=true;message='';
 const item=catalog.items[index],total=root.querySelector(`[data-pm-total="${index}"]`);
 if(total)total.textContent=[item.price,item.margin].every(v=>v!==''&&Number.isFinite(Number(v))&&Number(v)>=0)?format(sellingPrice(item,item.sellingCurrency||'USD',catalog.roe)):'—';
 const button=root.querySelector('[data-pm="save"]');if(button)button.disabled=false;const status=root.querySelector('.pm-status');if(status)status.textContent='Unsaved changes';
}
root?.addEventListener('input',event=>{if(event.target.tagName!=='SELECT')change(event);});
root?.addEventListener('change',event=>{if(event.target.tagName==='SELECT')change(event);});
root?.addEventListener('dragstart',event=>{const handle=event.target.closest('[data-pm-drag]');if(!handle)return;draggedColumn=handle.dataset.pmDrag;event.dataTransfer?.setData('text/plain',draggedColumn);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';});
root?.addEventListener('dragover',event=>{if(draggedColumn&&event.target.closest('[data-pm-column]'))event.preventDefault();});
root?.addEventListener('drop',event=>{const target=event.target.closest('[data-pm-column]')?.dataset.pmColumn;if(!draggedColumn||!target||draggedColumn===target)return;event.preventDefault();moveColumn(draggedColumn,target);draggedColumn='';});
root?.addEventListener('dragend',()=>{draggedColumn='';});
root?.addEventListener('click',async event=>{
 const mover=event.target.closest('[data-pm-move]');if(mover){const column=mover.dataset.pmMove,index=columnOrder.indexOf(column),other=columnOrder[index+(mover.dataset.pmDirection==='left'?-1:1)];if(other)moveColumn(column,other);return;}
 const action=event.target.closest('[data-pm]')?.dataset.pm;if(!action||busy)return;
 if(action==='folder'){view='template';render();return;}
 if(action==='back'){view='folders';render();return;}
 if(action==='reload'){if(dirty&&!confirm('You have unsaved changes. Reload and discard them?'))return;dirty=false;await open();return;}
 if(action!=='save'||!catalog)return;
 const items=catalog.items.map(item=>({...item,price:item.price===''?NaN:Number(item.price),margin:item.margin===''?NaN:Number(item.margin)}));
 const roe={};for(const c of ['THB','EUR']){const value=catalog.roe?.[c];if(value!==''&&value!==undefined&&value!==null)roe[c]=Number(value);}
 if(items.some(item=>[item.price,item.margin].some(value=>!Number.isInteger(value)||value<0||value>1e9))||Object.values(roe).some(x=>!Number.isFinite(x)||x<=0)||items.some(item=>sellingPrice(item,'USD',roe)===null||sellingPrice(item,item.sellingCurrency||'USD',roe)===null)){message='Enter whole amounts and a positive ROE for each currency used.';render();return;}
 busy=true;message='Saving…';render();try{await request('POST',{login:catalog.login,sha:catalog.sha,items,roe});dirty=false;catalog=await request();catalog.roe??={};message='Price Master saved';}catch(error){message=error.message;}finally{busy=false;render();}
});
window.HarborFlowPriceMaster={open};
