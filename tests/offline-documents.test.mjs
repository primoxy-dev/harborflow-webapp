import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {TTL,validRecord} from '../offline/draft-store.mjs';
test('Offline drafts expire after seven days and unknown schemas are rejected',()=>{
 const now=100000,row={schema:1,payload:{},savedAt:now,expiresAt:now+TTL};
 assert.equal(validRecord(row,now),true);assert.equal(validRecord(row,now+TTL),false);assert.equal(validRecord({...row,schema:2},now),false);assert.equal(validRecord({...row,expiresAt:now+TTL+1},now),false);
});
test('Offline service worker only intercepts explicit public assets, never APIs or authenticated home',()=>{
 const handlers={};vm.runInNewContext(readFileSync(new URL('../offline/sw.js',import.meta.url),'utf8'),{URL,self:{location:{href:'https://harborflow.test/offline/sw.js'},addEventListener:(name,handler)=>handlers[name]=handler},caches:{match:async()=>({cached:true})}});
 let intercepted=0;const event=(url,method='GET')=>({request:{url,method},respondWith:()=>intercepted++});
 for(const path of ['/','/api/documents?action=permitDefaults','/api/operations','/offline/app.mjs?private=1'])handlers.fetch(event('https://harborflow.test'+path));
 handlers.fetch(event('https://other.test/offline/app.mjs'));handlers.fetch(event('https://harborflow.test/offline/app.mjs','POST'));assert.equal(intercepted,0);
 handlers.fetch(event('https://harborflow.test/offline/index.html'));assert.equal(intercepted,1);
});
