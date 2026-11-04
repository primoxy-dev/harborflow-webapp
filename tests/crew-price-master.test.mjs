import test from 'node:test';
import assert from 'node:assert/strict';
import {createPriceMasterRoute} from '../api/price-master.mjs';
import {customerCatalog,updateCatalog} from '../lib/crew-price-master.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const initial={version:1,currency:'USD',defaultNotes:'Private notes',items:[{name:'Sample service',category:'CREW',unit:'PER CREW',price:100,extra:'preserved'}]};
const url='https://example.test/api/price-master';
const post=body=>new Request(url,{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify(body)});
function fixture(role='owner'){
 let file={sha:'v1',data:structuredClone(initial)},writes=0;
 const route=createPriceMasterRoute({db:()=>({}),sessionLogin:()=> 'alice',permission:async()=>({role}),readJson:async()=>structuredClone(file),gh:async(method,path,body)=>{assert.equal(body.sha,file.sha);file={sha:'v2',data:JSON.parse(Buffer.from(body.content,'base64').toString())};writes++;}});
 return {route,get file(){return file},get writes(){return writes}};
}
test('owner can save unit cost and margin while preserving catalog and notes',async()=>{
 const f=fixture(),get=await f.route(new Request(url)),data=await get.json();assert.equal(data.items[0].margin,0);
 const r=await f.route(post({login:'alice',sha:data.sha,items:[{...data.items[0],price:110,margin:12}]}));
 assert.equal(r.status,200);assert.equal(f.file.data.items[0].margin,12);assert.equal(f.file.data.items[0].extra,'preserved');assert.equal(f.file.data.defaultNotes,'Private notes');
 assert.deepEqual(customerCatalog(f.file.data).items,[{name:'Sample service',category:'CREW',unit:'PER CREW',price:122}]);
});
test('denies non-owners and rejects stale, invalid, and cross-account writes',async()=>{
 const notOwner=fixture('viewer');assert.equal((await notOwner.route(new Request(url))).status,403);
 const f=fixture();let response=await f.route(post({login:'alice',sha:'old',items:initial.items}));assert.equal(response.status,409);
 response=await f.route(post({login:'bob',sha:'v1',items:initial.items}));assert.equal(response.status,409);
 response=await f.route(post({login:'alice',sha:'v1',items:[{...initial.items[0],margin:-1}]}));assert.equal(response.status,400);assert.equal(f.writes,0);
 response=await f.route(post({login:'alice',sha:'v1',items:[{...initial.items[0],margin:1.5}]}));assert.equal(response.status,400);assert.equal(f.writes,0);
 assert.throws(()=>updateCatalog(initial,[{...initial.items[0],name:'Changed',margin:0}]));
});
test('Price Master renders private catalog and saves edited margin',async()=>{
 const handlers={},requests=[];
 const root={innerHTML:'',addEventListener:(type,handler)=>handlers[type]=handler,querySelector:()=>null};
 const data={login:'alice',sha:'v1',currency:'USD',items:[{name:'Sample service',category:'CREW',unit:'PER CREW',price:100,margin:0}]};
 const context={document:{getElementById:()=>root},window:{},confirm:()=>true,fetch:async(url,options)=>{requests.push(options);return {ok:true,json:async()=>options.method==='POST'?{ok:true}:structuredClone(data)};},console};
 vm.createContext(context);vm.runInContext(await readFile(new URL('../price-master.js',import.meta.url),'utf8'),context);
 await context.window.HarborFlowPriceMaster.open();
 assert.match(root.innerHTML,/Sample service/);assert.match(root.innerHTML,/Margin/);
 handlers.input({target:{dataset:{pmIndex:'0',pmField:'margin'},value:'25'}});
 await handlers.click({target:{closest:()=>({dataset:{pm:'save'}})}});
 const sent=JSON.parse(requests.find(r=>r.method==='POST').body);
 assert.equal(sent.items[0].margin,25);assert.equal(sent.items[0].price,100);assert.equal(sent.sha,'v1');
});
