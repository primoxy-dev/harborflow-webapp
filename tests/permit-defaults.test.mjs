import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentsRoute} from '../api/documents.mjs';
import {validatePermitDefaults} from '../lib/permit-defaults.mjs';
import {newPermitDraft,applyPermitDefaults,collectPermitDefaults} from '../permit-draft.mjs';
const sample={staff:[['1.','DEMO DRIVER','DEMO ID','Driver']],car:[['DEMO VAN','DEMO PLATE']]};
function fixture(seed){
 let login='owner',grant={role:'owner',visitorView:true};const rows=new Map();
 const sql={query:async(q,p)=>{
  if(q.startsWith('CREATE'))return [];
  if(q.startsWith('INSERT')){if(!rows.has(p[0]))rows.set(p[0],{data:p[1]?JSON.parse(p[1]):{staff:[],car:[]},version:p[1]?1:0});return [];}
  if(q.startsWith('UPDATE')){const row=rows.get(p[0]);if(row?.version!==p[2])return [];row.data=JSON.parse(p[1]);row.version++;return [row];}
  return rows.has(p[0])?[rows.get(p[0])]:[];
 }};
 const route=createDocumentsRoute({sessionLogin:()=>login,permission:async()=>grant,db:()=>sql,permitSeed:seed&&JSON.stringify(seed)});
 return {route,set:(l,g)=>{login=l;grant=g;}};
}
const get=()=>new Request('https://harborflow.test/api/documents?action=permitDefaults');
const post=(login='owner',version=0,defaults=sample,origin='https://harborflow.test')=>new Request('https://harborflow.test/api/documents',{method:'POST',headers:{Origin:origin},body:JSON.stringify({action:'savePermitDefaults',login,version,defaults})});
test('Private defaults are account-isolated and require Visitor view every request',async()=>{
 const f=fixture();assert.equal((await f.route(post())).status,200);
 assert.deepEqual((await(await f.route(get())).json()).defaults,sample);
 f.set('other',{role:'viewer',visitorView:true});const other=await(await f.route(get())).json();assert.deepEqual(other.defaults,{staff:[],car:[]});assert.equal(other.canSave,false);
 f.set('owner',{role:'viewer',crewView:true,visitorView:false});assert.equal((await f.route(get())).status,403);
 f.set(null,null);assert.equal((await f.route(get())).status,401);
});
test('Owner tables seed automatically, stay private, and never overwrite edited or cleared defaults',async()=>{
 const seed={...sample,agent:[['1.','DEMO AGENT','THAI','DEMO PLATE']]};const f=fixture(seed);
 f.set('other',{role:'viewer',visitorView:true});assert.deepEqual((await(await f.route(get())).json()).defaults,{staff:[],car:[]});
 f.set('owner',{role:'owner',visitorView:true});let result=await(await f.route(get())).json();assert.deepEqual(result.defaults,seed);assert.equal(result.version,1);
 const draft=applyPermitDefaults(newPermitDraft(),result.defaults);assert.equal(draft.tables.find(t=>t.key==='agent').rows[0].cells[1],'DEMO AGENT');
 assert.equal((await f.route(post('owner',1,sample))).status,200);assert.deepEqual((await(await f.route(get())).json()).defaults,sample);
 assert.equal((await f.route(post('owner',2,{staff:[],car:[]}))).status,200);assert.deepEqual((await(await f.route(get())).json()).defaults,{staff:[],car:[]});
});
test('Only owner can save; origin, account and optimistic version are checked',async()=>{
 const f=fixture();f.set('owner',{role:'editor',visitorView:true});assert.equal((await f.route(post())).status,403);
 f.set('owner',{role:'owner',visitorView:true});assert.equal((await f.route(post('other'))).status,409);assert.equal((await f.route(post('owner',0,sample,'https://evil.test'))).status,403);
 assert.equal((await f.route(post())).status,200);assert.equal((await f.route(post())).status,409);
 assert.equal((await f.route(post('owner',1,{staff:[],car:[]}))).status,200);assert.deepEqual((await(await f.route(get())).json()).defaults,{staff:[],car:[]});
});
test('Default format is bounded; draft edits do not mutate stored defaults',()=>{
 assert.equal(validatePermitDefaults(sample),null);assert(validatePermitDefaults({...sample,crew:[]}));assert(validatePermitDefaults({staff:[['too','few']],car:[]}));
 const draft=applyPermitDefaults(newPermitDraft(),sample);draft.tables.find(t=>t.key==='staff').rows[0].cells[1]='EDITED';assert.equal(sample.staff[0][1],'DEMO DRIVER');assert.equal(collectPermitDefaults(draft).staff[0][1],'EDITED');
});