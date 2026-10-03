import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentsRoute } from '../api/documents.mjs';
import { buildDocumentPreview } from '../lib/document-preview.mjs';
import { saveSettings, readSettings, validateSettingsPatch } from '../lib/document-settings.mjs';

const jobId = '11111111-1111-4111-8111-111111111111';
const serviceId = '22222222-2222-4222-8222-222222222222';
const otherId = '77777777-7777-4777-8777-777777777777';
const job = { id: jobId, data: { jobNo:'DEMO-1', vessel:'DEMO VESSEL', port:'MAP TA PHUT', eta:'2026-10-01T08:00' } };
const person = { id:'33333333-3333-4333-8333-333333333333', kind:'crew', data:{ name:'DEMO CREW', passport:'DEMO-PASSPORT', nationality:'THAI', category:'On-signers', serviceIds:[serviceId], flights:[{airline:'tg',number:'123',date:'01OCT',from:'bkk',to:'sin',departure:'09:00',arrival:'12:00',booking:'demo'}] } };
const visitor = { id:'44444444-4444-4444-8444-444444444444',kind:'visitor',data:{name:'PRIVATE VISITOR',passport:'PRIVATE VISITOR PASSPORT',serviceIds:[serviceId]} };

export function fixtureDb() {
  const preferences = new Map();
  const queries = [];
  return { preferences, queries, async query(query, params=[]) {
    queries.push(query);
    if (query.startsWith('CREATE TABLE')) return [];
    if (query.startsWith('INSERT INTO document_preferences')) { if(!preferences.has(params[0])) preferences.set(params[0],{data:{},version:1});return []; }
    if (query.startsWith('SELECT data') && query.includes('document_preferences')) { const row=preferences.get(params[0]);return row?[structuredClone(row)]:[]; }
    if (query.startsWith('UPDATE document_preferences')) { const row=preferences.get(params[0]); if(row.version!==params[2])return [];row.data={...row.data,...JSON.parse(params[1])};row.version++;return [{data:structuredClone(row.data)}]; }
    if (query.includes('operation_jobs')) return [job];
    if (query.includes('operation_services')) return [{job_id:params[0]===otherId?otherId:jobId,data:{type:'Crew Change'}}];
    if (query.includes('operation_people')) return [person,visitor,{...person,id:'55555555-5555-4555-8555-555555555555',data:{...person.data,name:'OTHER SERVICE CREW',serviceIds:[otherId]}}];
    if (query.includes('operation_trips')) return [];
    throw Error('Unexpected SQL');
  }};
}

function fixtureRoute(sql, login='demo', grant={role:'editor',crewView:true,visitorView:false}) {
  return createDocumentsRoute({db:()=>sql,sessionLogin:()=>login,permission:async()=>grant});
}
const url = 'https://harborflow.test/api/documents?action=preview&type=oktb&jobId='+jobId+'&serviceId='+serviceId;

test('OKTB uses the Crew members source within this Service, without requiring Visitor access',async()=>{
  const sql=fixtureDb();
  const response=await fixtureRoute(sql)(new Request(url));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  const data=await response.json();
  assert.deepEqual(data.preview.people.map(p=>p.name),['DEMO CREW']);
  assert.equal(data.preview.people[0].passport,'DEMO-PASSPORT');
  assert.equal(data.preview.people[0].flights[0].airline,'TG');
  assert.equal(data.preview.downloadAllowed,true);
  assert.ok(!JSON.stringify(data).includes('PRIVATE VISITOR'));
  assert.ok(!sql.queries.some(q=>q.includes('operation_trips')));
});
test('anonymous and Operations-only or Visitor-only users cannot access OKTB',async()=>{
  for(const [login,grant,status] of [['',null,401],['demo',{role:'viewer'},403],['demo',{role:'viewer',visitorView:true},403]]) {
    const response=await fixtureRoute(fixtureDb(),login,grant)(new Request(url));
    assert.equal(response.status,status);
    assert.ok(!JSON.stringify(await response.json()).includes('DEMO CREW'));
  }
});
test('Service from another Job is rejected before reading people',async()=>{
  const sql=fixtureDb(); const response=await fixtureRoute(sql)(new Request(url.replace(serviceId,otherId)));
  assert.equal(response.status,404); assert.ok(!sql.queries.some(q=>q.includes('operation_people')));
});
test('LOI derives one selectable crew roster from its Service and never includes Visitors',async()=>{
  const response=await fixtureRoute(fixtureDb())(new Request(url.replace('type=oktb','type=loi')));
  assert.equal(response.status,200);
  const {preview}=await response.json();
  assert.equal(preview.type,'loi');assert.equal(preview.downloadAllowed,true);
  assert.deepEqual(preview.people.map(p=>p.name),['DEMO CREW']);
  assert.ok(!JSON.stringify(preview).includes('PRIVATE VISITOR'));
});
test('LOI requires separate Crew permission, including after revocation',async()=>{
  for(const [login,grant,status] of [['',null,401],['demo',{role:'viewer'},403],['demo',{role:'viewer',visitorView:true},403],['demo',null,403]]) {
    const sql=fixtureDb(),response=await fixtureRoute(sql,login,grant)(new Request(url.replace('type=oktb','type=loi')));
    assert.equal(response.status,status);assert.ok(!sql.queries.some(q=>q.includes('operation_people')));
  }
});
test('the existing masked previews still omit identifiers by default',()=>{
  for(const type of ['oktb','permit','loi']) {
    const preview=buildDocumentPreview(type,job,[person,visitor]);
    for(const value of ['DEMO CREW','DEMO-PASSPORT','PRIVATE VISITOR PASSPORT'])assert.ok(!JSON.stringify(preview).includes(value));
  }
});
test('remembered fields are private to each account and field conflicts never overwrite silently',async()=>{
  const sql=fixtureDb();
  assert.equal((await saveSettings(sql,'alice',{contact:'DEMO CONTACT'},{contact:''})).status,200);
  assert.equal((await readSettings(sql,'alice')).contact,'DEMO CONTACT');
  assert.deepEqual(await readSettings(sql,'bob'),{});
  assert.equal((await saveSettings(sql,'alice',{phone:'000'},{phone:''})).status,200);
  assert.equal((await saveSettings(sql,'alice',{contact:'STALE CONTACT'},{contact:''})).status,409);
  assert.equal((await readSettings(sql,'alice')).contact,'DEMO CONTACT');
  assert.equal((await readSettings(sql,'alice')).phone,'000');
});
test('saving private defaults requires an editor, the current account, and same Origin',async()=>{
  const request=(body,origin='https://harborflow.test')=>new Request('https://harborflow.test/api/documents',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const payload={action:'savePreferences',login:'demo',patch:{contact:'DEMO CONTACT'},base:{contact:''}};
  assert.equal((await fixtureRoute(fixtureDb())(request(payload,'https://untrusted.test'))).status,403);
  assert.equal((await fixtureRoute(fixtureDb(),'demo',{role:'viewer',crewView:true})(request(payload))).status,403);
  assert.equal((await fixtureRoute(fixtureDb())(request({...payload,login:'other'}))).status,409);
  assert.equal((await fixtureRoute(fixtureDb())(request(payload))).status,200);
});
test('signature validation only accepts raster image data, and supports removing it',()=>{
  assert.equal(validateSettingsPatch({signature:''}),null);
  assert.ok(validateSettingsPatch({signature:'data:image/svg+xml;base64,PHN2Zz4='}));
  assert.ok(validateSettingsPatch({signature:'data:image/png;base64,YmFk'}));
  assert.ok(validateSettingsPatch({signature:'https://external.test/signature.png'}));
  assert.ok(validateSettingsPatch({contact:'x'.repeat(201)}));
});
test('authorization is rechecked on each request and database failures stay private',async()=>{
  let grant={role:'editor',crewView:true};
  const sql=fixtureDb();const route=createDocumentsRoute({db:()=>sql,sessionLogin:()=> 'demo',permission:async()=>grant});
  assert.equal((await route(new Request(url))).status,200);
  grant=null; assert.equal((await route(new Request(url))).status,403);
  const broken=createDocumentsRoute({db:()=>{throw Error('SECRET CONNECTION STRING');},sessionLogin:()=> 'demo'});
  const response=await broken(new Request(url)); assert.equal(response.status,503);
  assert.ok(!(await response.text()).includes('SECRET'));
});

// Keep the original masked-preview regression coverage.
{
const job = { id: 'job-1', data: { jobNo: 'DEMO-001', vessel: 'Demo Vessel', port: 'Demo Port', eta: '2026-09-30T08:00', principal: 'Demo Principal' } };
const people = [{ kind: 'crew', data: { name: 'Sensitive Name', passport: 'Sensitive Passport', category: 'Sensitive Category', flights: [{ number: 'Sensitive Flight' }] } }, { kind: 'visitor', data: { name: 'Visitor Name', passport: 'Visitor Passport', category: 'Surveyors' } }];
const trips = [{ data: { kind: 'car', origin: 'Sensitive Hotel', destination: 'Sensitive Terminal', personIds: ['person-1'] } }];

for (const type of ['oktb','permit','loi']) test(`${type} derives a masked draft from the shared Job, people and travel`, () => {
  const preview = buildDocumentPreview(type, job, people, trips);
  assert.equal(preview.job.jobNo, 'DEMO-001');
  assert.deepEqual(preview.counts, { crew: 1, visitors: 1, car: 1, boat: 0 });
  assert.equal(preview.downloadAllowed, false);
  const serialized = JSON.stringify(preview);
  for (const secret of ['Sensitive Name','Sensitive Passport','Sensitive Flight','Sensitive Hotel','Sensitive Terminal','Sensitive Category','Visitor Name','Visitor Passport']) assert.ok(!serialized.includes(secret), `${type} leaked ${secret}`);
});

test('unknown document type is rejected', () => assert.throws(() => buildDocumentPreview('other', job), /Unknown document type/));
}
