import test from 'node:test';
import assert from 'node:assert/strict';
import {createReaderDatabaseRoute} from '../lib/reader-database-server.mjs';
import handler from '../api/crew.mjs';
import {sign} from '../lib/harborflow.mjs';

const id='11111111-1111-4111-8111-111111111111',box={x:.1,y:.1,width:.2,height:.2};
const record={id,nationality:'FILIPINO',type:'passport',title:'Sample',page:1,mime:'image/png',contentBase64:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64'),mappings:[{field:'passport',heading:'PASSPORT NO',label:box,value:box}]};
function fixture(){
 const store=new Map();let seq=0;
 const github=async(method,path,body)=>{
  if(path==='ReaderDatabase'&&method==='GET')return [...store.keys()].map(k=>({type:'file',name:k.split('/').at(-1)}));
  if(method==='GET')return store.get(path)||null;
  if(method==='PUT'){const sha='sha'+ ++seq;store.set(path,{type:'file',sha,encoding:'base64',content:body.content});return {content:{sha}};}
  if(method==='DELETE'){store.delete(path);return {};}
 };
 return createReaderDatabaseRoute({github});
}
const req=(method,body,idParam='',origin='https://example.com')=>new Request('https://example.com/api/crew?action=readerDatabase'+idParam,{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('saves and retrieves private examples without sending images in listings',async()=>{
 const route=fixture(),saved=await route(req('PUT',{record}));assert.equal(saved.status,200);const revision=(await saved.json()).revision;
 const listing=await (await route(req('GET'))).json();assert.equal(listing.examples.length,1);assert.equal(listing.examples[0].contentBase64,undefined);
 const read=await (await route(req('GET',null,'&id='+id))).json();assert.equal(read.data.contentBase64,record.contentBase64);assert.equal(read.revision,revision);
});
test('rejects stale edits, deletion and cross-origin writes',async()=>{
 const route=fixture();const saved=await (await route(req('PUT',{record}))).json();
 assert.equal((await route(req('PUT',{record,revision:'stale'}))).status,409);
 assert.equal((await route(req('DELETE',{revision:'stale'},'&id='+id))).status,409);
 assert.equal((await route(req('DELETE',{revision:saved.revision},'&id='+id,'https://attacker.invalid'))).status,403);
 assert.equal((await route(req('DELETE',{revision:saved.revision},'&id='+id))).status,200);
});
test('rejects invalid file signatures and invalid boxes',async()=>{
 const route=fixture();assert.equal((await route(req('PUT',{record:{...record,contentBase64:'SGVsbG8='}}))).status,400);
 assert.equal((await route(req('PUT',{record:{...record,mappings:[{...record.mappings[0],value:{...box,x:2}}]}}))).status,400);
});
test('shared reader endpoint rejects requests without an authorized session',async()=>{
 const keys=['GITHUB_OAUTH_CLIENT_ID','GITHUB_OAUTH_CLIENT_SECRET','GITHUB_DOCUMENTS_TOKEN','HARBORFLOW_SESSION_SECRET'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));for(const k of keys)process.env[k]='test';
 try{
  let text='';const res={statusCode:0,setHeader(){},end(data){text=String(data)}};
  await handler({method:'GET',url:'/api/crew?action=readerDatabase',headers:{host:'example.com'}},res);
  assert.equal(res.statusCode,401);assert.match(text,/Sign in/);
 }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
test('authorized crew endpoint routes to shared reader database',async()=>{
 const keys=['GITHUB_OAUTH_CLIENT_ID','GITHUB_OAUTH_CLIENT_SECRET','GITHUB_DOCUMENTS_TOKEN','HARBORFLOW_SESSION_SECRET'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;for(const k of keys)process.env[k]='test';
 try{
  const expiry=String(Date.now()+60000),payload='primoxy-dev.'+expiry,cookie='hf_session='+payload+'.'+sign(payload);let called='';
  globalThis.fetch=async url=>{called=String(url);return new Response('[]',{status:200,headers:{'content-type':'application/json'}})};
  let text='';const res={statusCode:0,setHeader(){},end(data){text=String(data)}};
  await handler({method:'GET',url:'/api/crew?action=readerDatabase',headers:{host:'example.com',cookie}},res);
  assert.equal(res.statusCode,200);assert.deepEqual(JSON.parse(text),{examples:[]});assert.match(called,/ReaderDatabase/);
 }finally{globalThis.fetch=oldFetch;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
