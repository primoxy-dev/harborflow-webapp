import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuotationRoute} from '../api/quotation.mjs';
import {ensureQuotationSchema} from '../lib/quotation-schema.mjs';

const rateId='33333333-3333-4333-8333-333333333333';
const quoteId='11111111-1111-4111-8111-111111111111';
const post=body=>new Request('https://example.test/api/quotation',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify({login:'alice',...body})});
const get=()=>new Request('https://example.test/api/quotation?action=state');
function fixture({manage=true,view=true}={}){
  const record={id:rateId,version:1,status:'approved',removed_at:null,data:{port:'Bangkok',category:'Crew Change',description:'Crew handling',unit:'Person',amount:'1000'}};
  const quote={id:quoteId,job_id:null,created_by:'alice',shared_with:[],status:'draft',version:1,revision:1,data:{number:'Q-1',date:'2026-10-27',customer:'Example',vessel:'Demo',port:'Bangkok',category:'Crew Change',currency:'THB',exchangeRate:'',exchangeDate:'',lines:[{id:rateId,description:'Crew handling',unit:'Person',saleQuantity:'1',salePrice:'1200',vatMode:'none',vatRate:'',costUnit:'1000',rateId,rateVersion:1,rateDateConfirmed:true}]}};
  const categories=[{port:'Bangkok',name:'Crew Change'}],history=[],queries=[];
  const sql={async query(q,p=[]){
    queries.push(q);
    if(q.includes('quotation_grants WHERE'))return [{quote_view:true,quote_edit:true,cost_view:view,cost_manage:manage}];
    if(q.includes('FROM operation_jobs'))return [];
    if(q.startsWith('SELECT * FROM quotations'))return [structuredClone(quote)];
    if(q.startsWith('SELECT port,name FROM quotation_categories'))return structuredClone(categories);
    if(q.startsWith('SELECT * FROM quotation_rates WHERE removed_at IS NOT NULL'))return record.removed_at?[structuredClone(record)]:[];
    if(q.startsWith('SELECT * FROM quotation_rates WHERE removed_at IS NULL'))return record.removed_at?[]:[structuredClone(record)];
    if(q.startsWith('SELECT * FROM quotation_rates WHERE id'))return [structuredClone(record)];
    if(q.includes('UPDATE quotation_rates SET removed_at=')){
      const remove=p[3]==='delete';if(p[1]!==record.version||remove===!!record.removed_at)return [];
      record.removed_at=remove?'2026-10-27T08:00:00Z':null;record.version++;history.push({action:p[3],version:record.version});return [structuredClone(record)];
    }
    if(q.startsWith('INSERT INTO quotation_categories')){
      if(categories.some(c=>c.port.toLowerCase()===p[0].toLowerCase()&&c.name.toLowerCase()===p[1].toLowerCase()))return [];
      const category={port:p[0],name:p[1]};categories.push(category);return [category];
    }
    if(q.startsWith('UPDATE quotations SET job_id'))return [{...quote,data:JSON.parse(p[2]),version:2}];
    throw Error('Unexpected SQL in rate fixture');
  }};
  return {record,quote,categories,history,queries,route:createQuotationRoute({db:()=>sql,permission:async()=>({role:'editor'}),sessionLogin:()=> 'alice',ensureSchema:async()=>{}})};
}

test('removing a rate hides it from active state, preserves quotation snapshots and permits restoration',async()=>{
  const f=fixture();
  let r=await f.route(post({action:'deleteRate',id:rateId,version:1}));assert.equal(r.status,200);
  const state=await(await f.route(get())).json();assert.equal(state.rates.length,0);assert.equal(state.deletedRates.length,1);
  assert.equal(state.quotations[0].data.lines[0].costUnit,'1000');assert.equal(state.quotations[0].data.lines[0].rateVersion,1);
  r=await f.route(post({action:'save',id:quoteId,version:1,jobId:null,data:f.quote.data}));assert.equal(r.status,200,'existing snapshot remains usable');
  r=await f.route(post({action:'restoreRate',id:rateId,version:2}));assert.equal(r.status,200);
  const restored=await(await f.route(get())).json();assert.equal(restored.rates.length,1);assert.equal(restored.deletedRates.length,0);
  assert.deepEqual(f.history.map(h=>h.action),['delete','restore']);
});
test('rate deletion and category creation require management access, not merely cost view',async()=>{
  const f=fixture({manage:false});
  for(const action of ['deleteRate','restoreRate'])assert.equal((await f.route(post({action,id:rateId,version:1}))).status,403);
  assert.equal((await f.route(post({action:'addCategory',port:'Bangkok',name:'Surveyor'}))).status,403);
  assert.equal(f.record.removed_at,null);assert.equal(f.categories.length,1);
});
test('a stale delete or restore cannot change a rate edited elsewhere',async()=>{
  const f=fixture();f.record.version=2;
  assert.equal((await f.route(post({action:'deleteRate',id:rateId,version:1}))).status,409);
  assert.equal(f.record.removed_at,null);
  assert.equal((await f.route(post({action:'restoreRate',id:rateId,version:2}))).status,409);
});
test('a removed rate cannot be selected as a new quotation reference',async()=>{
  const f=fixture();await f.route(post({action:'deleteRate',id:rateId,version:1}));
  const changed=structuredClone(f.quote.data);changed.lines[0].id='44444444-4444-4444-8444-444444444444';changed.lines[0].rateVersion=2;
  assert.equal((await f.route(post({action:'save',id:quoteId,version:1,jobId:null,data:changed}))).status,409);
  assert.equal(f.quote.data.lines[0].rateVersion,1);
});
test('service categories are scoped to a Port, reject duplicates and remain visible without rates',async()=>{
  const f=fixture();
  assert.equal((await f.route(post({action:'addCategory',port:'Bangkok',name:'  Medical Visit  '}))).status,201);
  assert.equal((await f.route(post({action:'addCategory',port:'Bangkok',name:'medical visit'}))).status,409);
  assert.equal((await f.route(post({action:'addCategory',port:'Laem Chabang',name:'Medical Visit'}))).status,201);
  const state=await(await f.route(get())).json();assert.equal(state.categories.filter(c=>c.name==='Medical Visit').length,2);
  assert.equal(state.rates.length,1,'empty categories do not create fake cost rows');
});
test('rate and deleted-rate contents stay out of responses without cost permission',async()=>{
  const f=fixture({manage:false,view:false});f.record.removed_at='2026-10-27T08:00:00Z';
  const state=await(await f.route(get())).json();assert.deepEqual(state.rates,[]);assert.deepEqual(state.deletedRates,[]);
  assert.equal(f.queries.some(q=>q.startsWith('SELECT * FROM quotation_rates')),false);
});
test('the category migration upgrades an already initialized quotation database',async()=>{
  const statements=[];const sql={async query(q){statements.push(q);if(q.startsWith('SELECT to_regclass'))return [{ready:'quotation_revisions',categories_ready:null,removal_ready:false,action_ready:false}];return [];}};
  await ensureQuotationSchema(sql);
  assert.ok(statements.some(q=>q.includes('ADD COLUMN IF NOT EXISTS removed_at')));
  assert.ok(statements.some(q=>q.includes('INSERT INTO quotation_categories')));
  assert.equal(statements.some(q=>q.includes('UPDATE quotations')),false);
});
