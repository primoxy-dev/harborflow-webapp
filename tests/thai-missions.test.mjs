import test from 'node:test';import assert from 'node:assert/strict';
const m=await import('../lib/thai-missions.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const mission={id:'demo',kind:'embassy',name:'Royal Thai Embassy, DEMO',address:'DEMO ADDRESS',phone:'DEMO PHONE',fax:'',emails:{general:['general@example.test'],visa:['visa@example.test']},sourceUrl:'https://demo.thaiembassy.org/contact',verifiedAt:'2026-10-13',status:'verified'};
test('mission contact lines follow the document order and omit missing fax',()=>{
 assert.equal(typeof m.missionContactLines,'function');assert.deepEqual(m.missionContactLines(mission),['Royal Thai Embassy, DEMO','DEMO ADDRESS','Tel: DEMO PHONE','Email (general inquiries): general@example.test','Email (visa inquiries): visa@example.test']);
});
test('directory rejects duplicate IDs and unverified source metadata',()=>{
 assert.equal(typeof m.validateMissionDirectory,'function');assert.throws(()=>m.validateMissionDirectory([mission,mission]));assert.throws(()=>m.validateMissionDirectory([{...mission,verifiedAt:''}]));assert.throws(()=>m.validateMissionDirectory([{...mission,sourceUrl:'https://example.test'}]));
});
test('saved document addressee survives directory contact changes',()=>{
 assert.equal(typeof m.selectedMission,'function');const saved={...mission,address:'SAVED ADDRESS'};
 assert.equal(m.selectedMission('demo',saved,[{...mission,address:'UPDATED ADDRESS'}]).address,'SAVED ADDRESS');assert.equal(m.selectedMission('demo',null,[mission]).name,mission.name);
});
