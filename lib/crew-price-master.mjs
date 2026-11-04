export const CREW_CATALOG_PATH='Templates/crew-pda-services.json';
const amount=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1_000_000_000&&Math.abs(Math.round(value*100)-value*100)<1e-6;
export function validCatalog(data){
 return !!data&&data.version===1&&data.currency==='USD'&&Array.isArray(data.items)&&data.items.length<=200&&data.items.every(item=>item&&typeof item.name==='string'&&item.name.length>0&&item.name.length<=500&&typeof item.category==='string'&&item.category.length<=200&&typeof item.unit==='string'&&item.unit.length<=500&&amount(item.price)&&(item.margin===undefined||amount(item.margin)));
}
export function customerCatalog(data){
 if(!validCatalog(data))throw Error('CREW service template is unavailable');
 return {currency:data.currency,items:data.items.map(({category,name,unit,price,margin=0})=>({category,name,unit,price:Math.round((price+margin)*100)/100})),defaultNotes:typeof data.defaultNotes==='string'&&data.defaultNotes.length<=5000?data.defaultNotes:''};
}
export function updateCatalog(data,items){
 if(!validCatalog(data)||!Array.isArray(items)||items.length!==data.items.length)throw Error('Invalid catalog');
 return {...data,items:data.items.map((old,index)=>{
  const next=items[index];
  if(!next||next.name!==old.name||next.category!==old.category||!amount(next.price)||!amount(next.margin)||!Number.isInteger(next.price)||!Number.isInteger(next.margin))throw Error('Invalid catalog item');
  return {...old,price:next.price,margin:next.margin};
 })};
}
