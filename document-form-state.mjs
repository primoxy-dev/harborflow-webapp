const fields={oktb:['issueDate','arrivalDate','airline'],permit:['issueDate','permitDate'],loi:['issueDate','embassy','customEmbassy','embassySnapshot','loiTitle']};
export function encodeDocumentContext(ctx,type){
 const common=Object.fromEntries(fields[type].filter(k=>Object.hasOwn(ctx,k)).map(k=>[k,structuredClone(ctx[k])]));
 if(type==='oktb')return {common,crew:{selected:[...(ctx.selected||[])]}};
 if(type==='loi')return {common,crew:{loiPersonId:ctx.loiPersonId||'',loiDetails:structuredClone(ctx.loiDetails||{})}};
 common.subject=ctx.permitDraft.subject;
 const tables=ctx.permitDraft.tables.map(t=>({key:t.key,title:t.title,headers:[...t.headers],rows:t.rows.map(r=>({id:r.id,personId:r.personId||'',cells:[...r.cells]}))}));
 return {common,crew:{tables:tables.filter(t=>['on','off'].includes(t.key))},visitor:{tables:tables.filter(t=>!['on','off'].includes(t.key))}};
}
export function applyDocumentSections(ctx,type,sections){
 for(const {section,data} of sections){
  if(section==='common'){
   const copy={...data};if(type==='permit'&&Object.hasOwn(copy,'subject')){ctx.permitDraft.subject=copy.subject;delete copy.subject;}
   Object.assign(ctx,structuredClone(copy));
  }else if(type==='permit'){
   for(const t of data.tables||[]){const table=ctx.permitDraft.tables.find(original=>original.key===t.key);if(table)Object.assign(table,structuredClone(t));}
  }else {Object.assign(ctx,structuredClone(data));if(type==='oktb'&&Object.hasOwn(data,'selected'))ctx.selected=new Set(data.selected);}
 }
 return ctx;
}
