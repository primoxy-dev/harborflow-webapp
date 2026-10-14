import test from 'node:test';import assert from 'node:assert/strict';
const m=await import('../document-downloads.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const state={login:'demo',sourceFingerprint:'source',sections:[{section:'common',version:1}],preview:{downloadAllowed:true}};
test('downloads wait for saves and reject failed autosave',async()=>{
 assert.equal(typeof m.prepareDocumentDownload,'function');let loaded=false;
 await assert.rejects(()=>m.prepareDocumentDownload({flush:async()=>{throw Error('Save failed');},load:async()=>{loaded=true;return state;},current:()=>state,login:'demo'}),/Save failed/);assert.equal(loaded,false);
});
test('new local edits during fresh-state lookup block an unchecked export',async()=>{
 let pending=false;await assert.rejects(()=>m.prepareDocumentDownload({flush:async()=>{},current:()=>state,load:async()=>{pending=true;return state;},login:'demo',hasPending:()=>pending}));
});
test('fresh authorization, source and every visible revision gate downloads',async()=>{
 assert.equal(typeof m.prepareDocumentDownload,'function');
 for(const fresh of [{...state,login:'other'},{...state,sourceFingerprint:'changed'},{...state,sections:[{section:'common',version:2}]},{...state,preview:{downloadAllowed:false}}]){
  await assert.rejects(()=>m.prepareDocumentDownload({flush:async()=>{},load:async()=>fresh,current:()=>state,login:'demo'}));
 }
 assert.equal((await m.prepareDocumentDownload({flush:async()=>{},load:async()=>state,current:()=>state,login:'demo'})).login,'demo');
});
