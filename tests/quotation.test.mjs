import test from 'node:test';
import assert from 'node:assert/strict';
import { saleFromCost, quoteTotals, customerProjection, timeCostPerTrip, roundMoney } from '../quotation-model.mjs';
import { createQuotationRoute } from '../api/quotation.mjs';

const quotationId='11111111-1111-4111-8111-111111111111';
const lineId='22222222-2222-4222-8222-222222222222';
const data={number:'Q-1',date:'2026-10-27',customer:'Example',vessel:'Demo',jobNo:'',port:'Bangkok',category:'Crew Change',currency:'THB',exchangeRate:'',exchangeDate:'',notes:'',lines:[{id:lineId,description:'Service',unit:'Person',saleQuantity:'2',salePrice:'1200',vatMode:'excluded',vatRate:'7',customerNote:'',costUnit:'1000',costQuantity:'1',costNote:'PRIVATE COST NOTE',markup:'20',rateId:'33333333-3333-4333-8333-333333333333'}]};

test('markup is per unit, foreign exchange is THB per unit, and VAT totals support mixed modes',()=>{
  assert.equal(saleFromCost(1000,'percent',20,'USD',35),34.29);
  assert.equal(roundMoney(10.075),10.08);
  assert.equal(saleFromCost(1000,'percent',20,'USD',''),null);
  const totals=quoteTotals({lines:[{description:'A',unit:'Trip',saleQuantity:2,salePrice:100,vatMode:'excluded',vatRate:7},{description:'B',unit:'Person',saleQuantity:1,salePrice:107,vatMode:'included',vatRate:7},{description:'C',unit:'Trip',saleQuantity:1,salePrice:50,vatMode:'none',vatRate:''}]});
  assert.deepEqual([totals.subtotal,totals.tax,totals.total],[350,21,371]);
  assert.equal(quoteTotals({lines:[{description:'A',saleQuantity:'',salePrice:'100',vatMode:'excluded',vatRate:'7'}]}).complete,false);
});
test('a confirmed minimum-hour charge covers the minimum and adds only extra hours',()=>{
  assert.equal(timeCostPerTrip(9000,2,1,4500),9000);
  assert.equal(timeCostPerTrip(9000,2,2,4500),9000);
  assert.equal(timeCostPerTrip(9000,2,3,4500),13500);
  assert.equal(timeCostPerTrip(9000,2,'',4500),null);
});
test('customer projection never includes cost, margin, rate references or internal notes',()=>{
  const projection=customerProjection(data);assert.equal(projection.lines[0].salePrice,'1200');
  assert.doesNotMatch(JSON.stringify(projection),/PRIVATE COST NOTE|costUnit|costQuantity|rateId|markup/);
});
function fixture({role='editor',commercial={quote_view:true,quote_edit:true,cost_view:false,cost_manage:false},login='alice'}={}){
  const original=structuredClone({id:quotationId,job_id:null,created_by:'alice',shared_with:[],status:'draft',revision:1,version:1,data});
  const calls=[];let saved=null;
  const sql={async query(q,p=[]){calls.push(q);if(q.includes('FROM quotation_categories'))return [];if(q.includes('quotation_grants WHERE'))return [commercial];if(q.includes('FROM operation_jobs'))return [];if(q.startsWith('SELECT * FROM quotations WHERE'))return [original];if(q.startsWith('SELECT * FROM quotations ORDER'))return [original];if(q.startsWith('SELECT * FROM quotation_rates'))return [];if(q.startsWith('UPDATE quotations SET job_id')){saved=JSON.parse(p[2]);return [{...original,data:saved,version:2}];}throw Error('Unexpected query '+q);}};
  return {calls,get saved(){return saved;},route:createQuotationRoute({db:()=>sql,permission:async()=>({role}),sessionLogin:()=>login,ensureSchema:async()=>{}})};
}
const get=()=>new Request('https://example.test/api/quotation?action=state');
const post=payload=>new Request('https://example.test/api/quotation',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify(payload)});
test('document settings round-trip through save and customer projection',async()=>{
  const f=fixture(),edited={...customerProjection(data),template:'classic',issuer:'Agency',issuerAddress:'Bangkok',customerAddress:'Example address',validUntil:'2026-11-30',terms:'Valid for 30 days'};
  const response=await f.route(post({action:'save',login:'alice',id:quotationId,version:1,jobId:null,data:edited}));
  assert.equal(response.status,200);const saved=(await response.json()).quotation.data;
  for(const key of ['template','issuer','issuerAddress','customerAddress','validUntil','terms'])assert.equal(saved[key],edited[key]);
});
test('document settings reject unsupported templates and invalid validity dates',async()=>{
  for(const settings of [{template:'unknown'},{validUntil:'2026-02-30'}]){
    const f=fixture();const response=await f.route(post({action:'save',login:'alice',id:quotationId,version:1,jobId:null,data:{...customerProjection(data),...settings}}));
    assert.equal(response.status,400);assert.equal(f.saved,null);
  }
});
test('API hides cost from a quote editor and does not load cost rates',async()=>{
  const f=fixture(),r=await f.route(get());assert.equal(r.status,200);const body=await r.json();
  assert.equal(body.quotations.length,1);assert.doesNotMatch(JSON.stringify(body),/PRIVATE COST NOTE|costUnit|costQuantity|rateId|markup/);
  assert.equal(f.calls.some(q=>q.startsWith('SELECT * FROM quotation_rates')),false);
});
test('saving as an editor without cost access preserves existing internal values and ignores forged cost fields',async()=>{
  const f=fixture(),edited=customerProjection(data);edited.lines[0].salePrice='1500';edited.lines[0].costUnit='1';edited.lines[0].costNote='FORGED';
  const r=await f.route(post({action:'save',login:'alice',id:quotationId,version:1,jobId:null,data:edited}));
  assert.equal(r.status,200);assert.equal(f.saved.lines[0].salePrice,'1500');assert.equal(f.saved.lines[0].costUnit,'1000');assert.equal(f.saved.lines[0].costNote,'PRIVATE COST NOTE');assert.doesNotMatch(JSON.stringify(await r.json()),/PRIVATE COST NOTE/);
});
test('cost import requires a separate management grant and requests require same origin',async()=>{
  const f=fixture();assert.equal((await f.route(post({action:'importRates',login:'alice',rates:[]}))).status,403);
  const foreign=new Request('https://example.test/api/quotation',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'});assert.equal((await f.route(foreign)).status,403);
});
test('historical revisions remain restricted to their original Job scope',async()=>{
  const jobA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jobB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const sql={async query(q){
    if(q.includes('quotation_grants WHERE'))return [{quote_view:true,quote_edit:true,cost_view:false}];
    if(q.includes('FROM operation_jobs'))return [{id:jobA,data:{pic:'alice'}},{id:jobB,data:{pic:'other'}}];
    if(q.startsWith('SELECT * FROM quotations WHERE'))return [{id:quotationId,job_id:jobA,created_by:'other',shared_with:[],data}];
    if(q.includes('FROM quotation_revisions'))return [{revision:1,job_id:jobB,data},{revision:2,job_id:jobA,data}];
    throw Error('Unexpected query');
  }};
  const route=createQuotationRoute({db:()=>sql,permission:async()=>({role:'editor'}),sessionLogin:()=> 'alice',ensureSchema:async()=>{}});
  const response=await route(new Request(`https://example.test/api/quotation?action=revisions&id=${quotationId}`));
  assert.equal(response.status,200);assert.deepEqual((await response.json()).revisions.map(x=>x.revision),[2]);
});
test('an incomplete quotation cannot be marked sent',async()=>{
  let updated=false;const sql={async query(q){
    if(q.includes('quotation_grants WHERE'))return [{quote_view:true,quote_edit:true,cost_view:false}];
    if(q.includes('FROM operation_jobs'))return [];
    if(q.startsWith('SELECT * FROM quotations WHERE'))return [{id:quotationId,job_id:null,created_by:'alice',shared_with:[],status:'draft',version:1,data:{...data,customer:''}}];
    if(q.includes('UPDATE quotations'))updated=true;return [];
  }};
  const route=createQuotationRoute({db:()=>sql,permission:async()=>({role:'editor'}),sessionLogin:()=> 'alice',ensureSchema:async()=>{}});
  const response=await route(post({action:'markSent',login:'alice',id:quotationId,version:1}));
  assert.equal(response.status,400);assert.equal(updated,false);
});
test('marking sent records a revision and an edit after sending starts the next draft revision',async()=>{
  let savedRevision=0,record={id:quotationId,job_id:null,created_by:'alice',shared_with:[],status:'draft',revision:1,version:1,data:structuredClone(data)};
  const sql={async query(q,p=[]){
    if(q.includes('quotation_grants WHERE'))return [{quote_view:true,quote_edit:true,cost_view:true}];
    if(q.includes('FROM operation_jobs'))return [];
    if(q.startsWith('SELECT * FROM quotations WHERE'))return [record];
    if(q.includes('INSERT INTO quotation_revisions')){assert.match(q,/WHERE id=\$1 AND version=\$2/);savedRevision=record.revision;record={...record,status:'sent',version:record.version+1};return [record];}
    if(q.startsWith('UPDATE quotations SET job_id')){record={...record,job_id:p[1],data:JSON.parse(p[2]),revision:p[3],status:'draft',version:record.version+1};return [record];}
    throw Error('Unexpected query');
  }};
  const route=createQuotationRoute({db:()=>sql,permission:async()=>({role:'editor'}),sessionLogin:()=> 'alice',ensureSchema:async()=>{}});
  const sent=await route(post({action:'markSent',login:'alice',id:quotationId,version:1}));assert.equal(sent.status,200);assert.equal(savedRevision,1);
  const edited=structuredClone(data);edited.customer='Changed';const save=await route(post({action:'save',login:'alice',id:quotationId,version:2,jobId:null,data:edited}));
  assert.equal(save.status,200);const quote=(await save.json()).quotation;assert.equal(quote.revision,2);assert.equal(quote.status,'draft');
  assert.equal((await route(post({action:'save',login:'alice',id:quotationId,version:2,jobId:null,data:edited}))).status,409);
});
test('a newly selected time-based rate must match its approved terms and confirmed hours',async()=>{
  const rateId='33333333-3333-4333-8333-333333333333';let inserted=0;
  const rate={id:rateId,status:'approved',version:1,data:{port:'Bangkok',category:'Crew Change',amount:'9000',billingType:'hours',minimumHours:'2',additionalHourlyRate:'4500'}};
  const sql={async query(q,p=[]){
    if(q.includes('quotation_grants WHERE'))return [{quote_view:true,quote_edit:true,cost_view:true}];
    if(q.includes('FROM operation_jobs'))return [];
    if(q.startsWith('SELECT * FROM quotations WHERE'))return [];
    if(q.startsWith('SELECT * FROM quotation_rates WHERE'))return [rate];
    if(q.startsWith('INSERT INTO quotations')){inserted++;return [{id:p[0],job_id:p[1],created_by:p[2],data:JSON.parse(p[3]),version:1,status:'draft',revision:1}];}
    throw Error('Unexpected query');
  }};
  const route=createQuotationRoute({db:()=>sql,permission:async()=>({role:'editor'}),sessionLogin:()=> 'alice',ensureSchema:async()=>{}});
  const quote=structuredClone(data);Object.assign(quote.lines[0],{rateId,rateVersion:1,rateDateConfirmed:true,billingType:'hours',costBaseUnit:'9000',minimumHours:'2',hoursPerTrip:'3',additionalHourlyRate:'4500',costUnit:'9000'});
  let response=await route(post({action:'save',login:'alice',id:quotationId,version:0,jobId:null,data:quote}));assert.equal(response.status,409);assert.equal(inserted,0);
  quote.lines[0].costUnit='13500';response=await route(post({action:'save',login:'alice',id:quotationId,version:0,jobId:null,data:quote}));assert.equal(response.status,200);assert.equal(inserted,1);
});
