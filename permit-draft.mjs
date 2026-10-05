export const DEFAULT_SUBJECT='Request crew change permission at terminal (Shore side)';
export const PERMIT_TABLES=[
 {key:'on',title:'On-signer',fields:['no','name','nationality','rank','dob','seamanBook','passport','passportExpiry'],headers:['NO.','Name - Surname','Nationality','Rank','Date of Birth','Seaman book','Passport','PP. EXP']},
 {key:'off',title:'Off-signer',fields:['no','name','nationality','rank','dob','seamanBook','passport','passportExpiry'],headers:['NO.','Name - Surname','Nationality','Rank','Date of Birth','Seaman book','Passport','PP. EXP']},
 {key:'medical',title:'Medical Visit',fields:['no','name','nationality','rank','passport'],headers:['NO.','Name - Surname','Nationality','Rank','Passport']},
 {key:'inspection',title:'SIRE Inspector/ Surveyor/ Service Engineer',fields:['no','name','nationality','rank','passport'],headers:['NO.','Name - Surname','Nationality','Rank','Passport']},
 {key:'agent',title:'Agent',fields:['no','name','nationality','licensePlate'],headers:['NO.','Name - Surname','Nationality','License plate']},
 {key:'staff',title:'',fields:['no','name','idCard','rank'],headers:['NO.','Full Name & Family Name','ID Card','Rank']},
 {key:'car',title:'Car plate',fields:['vehicle','licensePlate'],headers:['Vehicle','License plate']}
];
export function shortDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return value||'';
 const [year,month,day]=value.split('-').map(Number);const d=new Date(Date.UTC(year,month-1,day));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return value;
 return String(day).padStart(2,'0')+'-'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]+'-'+String(year).slice(-2);
}
export function blankRow(table,n){return {id:crypto.randomUUID(),personId:'',cells:table.fields.map(f=>f==='no'?String(n+1)+'.':'')};}
export function newPermitDraft(){return {subject:DEFAULT_SUBJECT,tables:PERMIT_TABLES.map(t=>({...t,fields:[...t.fields],headers:[...t.headers],rows:[blankRow(t,0)]}))};}
export function applyPermitDefaults(draft,defaults){
 for(const key of ['agent','staff','car']){
  const table=draft.tables.find(t=>t.key===key);
  table.rows=(defaults?.[key]||[]).map(cells=>({...blankRow(table,0),cells:[...cells]}));
  if(!table.rows.length)table.rows=[blankRow(table,0)];
 }
 return draft;
}
export function collectPermitDefaults(draft){return Object.fromEntries(['staff','car'].map(key=>{
 const table=visiblePermitTables(draft).find(t=>t.key===key);return [key,table?.rows.map(r=>[...r.cells])||[]];
}));}
export function visiblePermitTables(draft){
 return draft.tables.map(table=>({...table,rows:table.rows.filter(row=>{
  const name=table.fields.indexOf('name');
  return name>=0?Boolean(String(row.cells[name]||'').trim()):table.fields.some((field,i)=>field!=='no'&&String(row.cells[i]||'').trim());
 })})).filter(table=>table.rows.length>0);
}
export function tablePeople(table,people){
 return people.filter(p=>p.id && (table.key==='on'?p.kind==='crew'&&p.category==='On-signers':table.key==='off'?p.kind==='crew'&&p.category==='Off-signers':table.key==='medical'?/Medical/i.test(p.category):table.key==='inspection'?/SIRE|Surveyor|Engineer/i.test(p.category):table.key==='agent'||table.key==='staff'?p.kind==='visitor':false));
}
export function choosePerson(table,row,person){
 if(!person){row.personId='';return;}
 row.personId=person.id;
 row.cells=table.fields.map((field,i)=>field==='no'||!['name','nationality','rank','dob','seamanBook','passport','passportExpiry'].includes(field)?row.cells[i]||'':['dob','passportExpiry'].includes(field)?shortDate(person[field]):person[field]||'');
}
export function revalidateDraft(draft,people){
 const available=new Set(people.filter(p=>p.id).map(p=>p.id));
 for(const table of draft.tables){
  table.rows=table.rows.filter(row=>!row.personId || available.has(row.personId));
  if(!table.rows.length)table.rows.push(blankRow(table,0));
 }
 return draft;
}
export function permitLocation(job){
 const combined=job.port||'';const port=combined.split(/\s+\/\s+/)[0];
 return [port||'[Port not set in Job]',job.terminal||'[Terminal not set in Job]'].join(' / ').toUpperCase();
}