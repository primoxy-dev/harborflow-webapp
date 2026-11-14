import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionRoute, provisionItemData } from '../lib/provision.mjs';

const id='00000000-0000-4000-8000-000000000001';
const data={category:'Store',description:'Deck supplies',deliveryPoint:'Anchorage',deliveryDate:'2026-11-18',deliveryTime:'09:00',price:'0',customerConfirmed:true};
test('validates delivery dates, points, and zero price',()=>{
  assert.equal(provisionItemData(data).price,'0');
  assert.throws(()=>provisionItemData({...data,deliveryDate:'2026-02-30'}),/Invalid delivery date/);
  assert.throws(()=>provisionItemData({...data,deliveryPoint:'Other'}),/Invalid delivery point/);
});

test('provision attachments are scoped to the service and require edit access',async()=>{
  const content=Buffer.from('d0cf11e0a1b11ae100','hex').toString('base64');
  const context={service:{id:'service',data:{type:'Provision & Store',pic:'editor'}},grant:{role:'editor'},login:'editor'};
  const calls=[];
  const sql={query:async(query,args)=>{
    calls.push([query,args]);
    if(query.startsWith('SELECT email_name'))return [{email_name:'Request.msg',content}];
    if(query.startsWith('INSERT'))return [{id,data,emailName:'Request.msg',version:1}];
    return [];
  }};
  const request=(action,input={},override={})=>provisionRoute({sql,...context,...override,input:{action,id,...input}});
  assert.equal((await request('provisionEmail',{}, {login:'another'})).status,403);
  assert.equal(calls.length,0);
  assert.equal((await request('saveProvisionItem',{version:0,data,email:{name:'bad.msg',content:'dGV4dA=='}})).status,400);
  assert.equal(calls.length,0);
  const created=await request('saveProvisionItem',{version:0,data,email:{name:'Request.msg',content}});
  assert.equal((await created.json()).item.emailName,'Request.msg');
  assert.equal(calls[0][1][0],'service');
  const downloaded=await request('provisionEmail');
  assert.equal(Buffer.from(await downloaded.arrayBuffer()).toString('base64'),content);
  assert.deepEqual(calls[1][1],['service',id]);
  assert.match(downloaded.headers.get('content-disposition'),/attachment/);
  assert.equal((await request('saveProvisionItem',{version:1,data})).status,409);
});
