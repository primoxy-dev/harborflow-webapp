import test from 'node:test';import assert from 'node:assert/strict';
const module=await import('../document-autosave.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
function clock(){let timer;return {setTimeout(fn,ms){timer={fn,ms};return 1;},clearTimeout(){timer=null;},async tick(){const t=timer;timer=null;await t?.fn();},get delay(){return timer?.ms;}};}
function setup({save}={}){
 assert.equal(typeof module.createDocumentAutosave,'function');const timer=clock(),writes=[],states=[];
 const c=module.createDocumentAutosave({load:async()=>({sections:[],sourceFingerprint:'source'}),save:save||(async input=>{writes.push(input);return {record:{section:input.section,data:input.patch,version:1}};}),onState:s=>states.push(s),clock:timer});return {c,timer,writes,states};
}
test('autosave waits 800ms and stores explicit empty values',async()=>{
 const f=setup();await f.c.load();f.c.change('common',{subject:'A'});f.c.change('common',{subject:''});assert.equal(f.writes.length,0);assert.equal(f.timer.delay,800);await f.timer.tick();assert.equal(f.writes.length,1);assert.equal(f.writes[0].patch.subject,'');assert.equal(f.c.hasPending(),false);assert.equal(f.states.at(-1),'saved');
});
test('flushing an already saved document does not leave a phantom pending save',async()=>{
 const f=setup();await f.c.load();await f.c.flush();assert.equal(f.c.hasPending(),false);
 f.c.change('common',{subject:'AFTER EMPTY FLUSH'});await f.c.flush();assert.equal(f.writes[0].patch.subject,'AFTER EMPTY FLUSH');
});
test('changes during an in-flight save remain pending and serialize',async()=>{
 let release;const writes=[];const f=setup({save:async input=>{writes.push(input);if(writes.length===1)await new Promise(r=>release=r);return {record:{section:input.section,data:input.patch,version:writes.length}};}});
 await f.c.load();f.c.change('common',{subject:'first'});const flush=f.c.flush();await Promise.resolve();f.c.change('common',{subject:'second'});release();await flush;assert.equal(writes.length,2);assert.equal(writes[1].version,1);assert.equal(writes[1].patch.subject,'second');
});
test('failed autosave is not saved and flushing exposes the error',async()=>{
 const f=setup({save:async()=>{throw Error('offline');}});await f.c.load();f.c.change('common',{subject:'A'});await assert.rejects(f.c.flush(),/offline/);assert.equal(f.c.hasPending(),true);assert.equal(f.states.at(-1),'error');
});
test('revision conflict pauses timer and never retries silently',async()=>{
 let writes=0;const f=setup({save:async()=>{writes++;const e=Error('conflict');e.status=409;e.body={record:{section:'common',data:{subject:'other'},version:2}};throw e;}});
 await f.c.load();f.c.change('common',{subject:'A'});await assert.rejects(f.c.flush());f.c.change('common',{subject:'B'});await f.timer.tick();assert.equal(writes,1);assert.equal(f.states.at(-1),'conflict');
});
test('disposing the old account cancels pending saves and ignores late responses',async()=>{
 const f=setup();await f.c.load();f.c.change('common',{subject:'A'});f.c.dispose();await f.timer.tick();assert.equal(f.writes.length,0);await assert.rejects(f.c.flush(),/closed/);
});
