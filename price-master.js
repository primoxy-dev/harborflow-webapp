const root=document.getElementById('price');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=null,dirty=false,busy=false,message='';
const format=value=>Number(value).toLocaleString('en-US',{maximumFractionDigits:2});
async function request(method='GET',body){
 const response=await fetch('/api/price-master',{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'ไม่สามารถโหลด Price Master');return result;
}
function render(){
 if(!root)return;
 if(!catalog){root.innerHTML=`<div class="panel"><h2>Price Master</h2><p role="status">${escape(message||'กำลังโหลด…')}</p><button class="secondary" data-pm="reload">ลองอีกครั้ง</button></div>`;return;}
 let previous='';
 const rows=catalog.items.map((item,i)=>{
  const header=item.category!==previous?`<tr><th colspan="5" class="pm-category">${escape(item.category)}</th></tr>`:'';previous=item.category;
  return `${header}<tr><td>${escape(item.name)}</td><td>${escape(item.unit)}</td><td><input type="number" min="0" max="1000000000" step="0.01" inputmode="decimal" data-pm-index="${i}" data-pm-field="price" aria-label="ต้นทุน ${escape(item.name)}" value="${escape(item.price)}" ${busy?'disabled':''}></td><td><input type="number" min="0" max="1000000000" step="0.01" inputmode="decimal" data-pm-index="${i}" data-pm-field="margin" aria-label="Margin ${escape(item.name)}" value="${escape(item.margin)}" ${busy?'disabled':''}></td><td data-pm-total="${i}">${format(Number(item.price)+Number(item.margin))}</td></tr>`;
 }).join('');
 root.innerHTML=`<section class="panel pm-panel"><div class="pm-head"><div><h2>Price Master</h2><p>Estimated Proforma D/A (CREW) · USD ต่อหน่วย</p><p>ราคาขาย = ต้นทุน + Margin · ใบเสนอราคาเดิมจะไม่เปลี่ยน</p></div><div><button class="secondary" data-pm="reload" ${busy?'disabled':''}>โหลดใหม่</button> <button class="primary" data-pm="save" ${busy||!dirty?'disabled':''}>บันทึก</button></div></div><p role="status" class="pm-status">${escape(message||(dirty?'มีการแก้ไขที่ยังไม่ได้บันทึก':''))}</p><div class="pm-table-wrap"><table class="pm-table"><thead><tr><th>รายการ</th><th>หน่วย</th><th>ต้นทุน (USD)</th><th>Margin (USD)</th><th>ราคาขาย (USD)</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
async function open(){
 if(dirty){render();return;}
 catalog=null;message='กำลังโหลด…';render();
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
 const status=root.querySelector('.pm-status');if(status)status.textContent='มีการแก้ไขที่ยังไม่ได้บันทึก';
});
root?.addEventListener('click',async event=>{
 const action=event.target.closest('[data-pm]')?.dataset.pm;if(!action||busy)return;
 if(action==='reload'){if(dirty&&!confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการโหลดใหม่หรือไม่?'))return;dirty=false;await open();return;}
 if(action!=='save'||!catalog)return;
 const items=catalog.items.map(item=>({...item,price:item.price===''?NaN:Number(item.price),margin:item.margin===''?NaN:Number(item.margin)}));
 if(items.some(item=>[item.price,item.margin].some(value=>!Number.isFinite(value)||value<0||value>1e9||Math.abs(Math.round(value*100)-value*100)>1e-6))){message='กรอกต้นทุนและ Margin เป็นจำนวนไม่ติดลบ และมีทศนิยมไม่เกิน 2 ตำแหน่ง';render();return;}
 busy=true;message='กำลังบันทึก…';render();
 try{await request('POST',{login:catalog.login,sha:catalog.sha,items});dirty=false;catalog=await request();message='บันทึก Price Master แล้ว';}catch(error){message=error.message;}finally{busy=false;render();}
});
window.HarborFlowPriceMaster={open};
