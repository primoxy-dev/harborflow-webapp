// Browser→real documents route→fixture DB→browser. Fictional data only; not a real Neon check.
import {createRequire} from 'node:module';import {readFile,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {createDocumentsRoute} from '../api/documents.mjs';
const require=createRequire('C:/Users/thanaphon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');const {chromium}=require('playwright');
const jobId='11111111-1111-4111-8111-111111111111',serviceId='22222222-2222-4222-8222-222222222222';
const crewId='33333333-3333-4333-8333-333333333333';
const secondCrewId='44444444-4444-4444-8444-444444444444';let delayNextPost=false,releasePost,failNextPost=false;
const records=new Map(),preferences=new Map(),saved=[];let grant={role:'owner',crewView:true,crewEdit:true,visitorView:true,visitorEdit:true};
const sql={async query(q,p=[]){
 if(q.startsWith('CREATE TABLE'))return [];
 if(q.startsWith('INSERT INTO document_preferences')){if(!preferences.has(p[0]))preferences.set(p[0],{data:{},version:1});return [];}
 if(q.startsWith('SELECT data')&&q.includes('document_preferences'))return preferences.has(p[0])?[preferences.get(p[0])]:[];
 if(q.startsWith('UPDATE document_preferences')){const r=preferences.get(p[0]);if(r.version!==p[2])return [];r.data={...r.data,...JSON.parse(p[1])};r.version++;return [{data:r.data}];}
 if(q.includes('permit_preferences'))return q.startsWith('SELECT')?[]:[];
 if(q.startsWith('SELECT')&&q.includes('operation_jobs'))return [{id:jobId,data:{vessel:'MV DEMO',port:'DEMO PORT',pic:'demo',eta:'2026-10-20T08:00'}}];
 if(q.startsWith('SELECT')&&q.includes('operation_services'))return [{job_id:jobId,data:{type:'Crew Change',pic:'demo'}}];
 if(q.includes('operation_people'))return [{id:crewId,kind:'crew',data:{name:'DEMO CREW',nationality:'THAI',rank:'Master',passport:'DEMO-ONLY',serviceIds:[serviceId],category:'On-signers',flights:[]}},{id:secondCrewId,kind:'crew',data:{name:'DEMO SECOND',passport:'SECOND-ONLY',serviceIds:[serviceId],category:'On-signers'}},{id:'55555555-5555-4555-8555-555555555555',kind:'visitor',data:{name:'DEMO VISITOR',serviceIds:[serviceId],category:'Medical visitors'}}];
 if(q.includes('operation_trips'))return [];
 if(q.startsWith('SELECT * FROM document_records'))return [...records.values()].filter(r=>r.job_id===p[0]&&r.service_key===p[1]&&r.type===p[2]).map(r=>structuredClone(r));
 if(q.startsWith('WITH saved')){if((records.get(p[0])?.version||0)!==p[5])return [];const r={job_id:p[1],service_key:p[2],type:p[3],section:p[4],data:JSON.parse(p[6]),version:p[5]+1,source_fingerprint:p[7]};records.set(p[0],r);saved.push(r);return [r];}
 throw Error('Unexpected SQL in fictional fixture');
}};
const handler=createDocumentsRoute({db:()=>sql,sessionLogin:()=> 'demo',permission:async()=>grant});
const root=process.cwd(),browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const routeRequest=async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.pathname==='/api/documents'){
   if(req.method()==='POST'&&failNextPost){failNextPost=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'DEMO NETWORK INTERRUPTION'})});}
   if(req.method()==='POST'&&delayNextPost){delayNextPost=false;await new Promise(resolve=>releasePost=resolve);}
   const response=await handler(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.method()==='POST'?{body:req.postData()}: {})}));
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  if(u.pathname==='/qa.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<html><head><meta charset="utf-8"><link rel="stylesheet" href="/documents.css"></head><body><div id="host"></div><script src="/oktb-pdf.js"></script><script src="/documents.js"></script></body></html>'});
  const filename=path.resolve(root,'.'+u.pathname);if(!filename.startsWith(root+path.sep))return route.abort();
  try{return route.fulfill({body:await readFile(filename),contentType:/\.m?js$/.test(filename)?'text/javascript; charset=utf-8':filename.endsWith('.css')?'text/css; charset=utf-8':filename.endsWith('.json')?'application/json':'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
 };
 await context.route('https://harborflow.test/**',routeRequest);
 async function mount(type,target=page){await target.goto('https://harborflow.test/qa.html');await target.evaluate(async args=>window.HarborFlowDocuments.mount(document.querySelector('#host'),args),{login:'demo',jobId,serviceId,type});}
 await mount('oktb');assert.ok(await page.locator('#hfdIssueDate').count(),await page.locator('#host').innerText());const settings=page.locator('details').filter({has:page.locator('#hfdIssueDate')}).locator('summary');if(await settings.count())await settings.click();
 await page.locator('#hfdIssueDate').fill('2030-01-02');
 await page.waitForFunction(()=>document.querySelector('#hfdSaveStatus')?.textContent.includes('บันทึกแล้ว'),{},{timeout:4000});
 assert.ok(saved.some(r=>r.data.issueDate==='2030-01-02'),'No document autosave request reached actual API');
 await mount('oktb');assert.equal(await page.locator('#hfdIssueDate').inputValue(),'2030-01-02');
 await page.locator('details').filter({has:page.locator('#hfdIssueDate')}).locator('summary').click();await page.locator('#hfdIssueDate').fill('');
 await page.waitForFunction(()=>document.querySelector('#hfdDocSaveStatus')?.textContent==='บันทึกแล้ว',{}, {timeout:4000});
 await mount('oktb');assert.equal(await page.locator('#hfdIssueDate').inputValue(),'','Cleared issue date was reseeded');
 await mount('permit');assert.equal(await page.locator('.hfd-permit-settings').count(),1,'Permit details must be collapsible: '+await page.locator('#host').innerText());assert.equal(await page.locator('.hfd-permit-settings').getAttribute('open'),null);
 assert.equal(await page.locator('.hfd-permit-editor-table[open]').count(),0);assert.equal(await page.locator('[data-permit-person]').count(),0,'Name must not use adjacent select + input');
 await page.locator('#hfdPermitEditors').locator('..').locator('summary').first().click();await page.locator('[data-permit-table="on"] > summary').click();
 await page.locator('[data-permit-table="on"] [data-permit-name]').first().fill('DEMO');await page.getByRole('option').first().click();
 assert.equal(await page.locator('[data-permit-table="on"] [data-permit-name]').first().inputValue(),'DEMO CREW');
 await page.locator('[data-permit-add="on"]').click();assert.equal(await page.locator('[data-permit-table="on"]').getAttribute('open'),'');
 for(const width of [390,768]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflows at '+width);}
 await page.setViewportSize({width:1280,height:900});await mount('loi');assert.equal(await page.locator('.hfd-loi-settings').getAttribute('open'),null);
 await page.locator('#hfdLoiPerson').selectOption('');await page.waitForTimeout(1000);await page.locator('#hfdLoiPerson').selectOption(crewId);await page.waitForFunction(()=>document.querySelector('[data-loi-personal]')?.open);
 await page.waitForFunction(()=>document.querySelector('[data-loi-field="passport"]')?.value==='DEMO-ONLY');assert.equal(await page.locator('[data-loi-field="passport"]').inputValue(),'DEMO-ONLY');
 assert.equal(await page.locator('#hfdEmbassy option').count(),96);
 await page.locator('#hfdEmbassy').selectOption({label:'Royal Thai Embassy, Dhaka'});
 assert.match(await page.locator('#hfdEmbassyOut').innerText(),/18 & 20, Madani Avenue/);
 assert.match(await page.locator('#hfdEmbassyOut').innerText(),/Email \(visa inquiries\): visa.dac@mfa.go.th/);
 await page.locator('.hfd-loi-settings > summary').click();
 await page.locator('[data-mission-field="address"]').fill('DEMO SAVED ADDRESS');
 await page.waitForFunction(()=>document.querySelector('#hfdDocSaveStatus')?.textContent==='บันทึกแล้ว',{}, {timeout:4000});
 await mount('loi');assert.match(await page.locator('#hfdEmbassyOut').innerText(),/DEMO SAVED ADDRESS/);
 await page.locator('#hfdEmbassy').selectOption('other');await page.locator('#hfdCustomEmbassy').fill('DEMO CUSTOM EMBASSY');
 if(!process.env.QA_CASE)assert.match(await page.locator('#hfdEmbassyOut').innerText(),/DEMO CUSTOM EMBASSY/);
 await page.waitForFunction(()=>document.querySelector('#hfdDocSaveStatus')?.textContent==='บันทึกแล้ว',{}, {timeout:4000});
 if(process.env.QA_CASE!=='scope'){
 delayNextPost=true;await page.locator('#hfdLoiPerson').selectOption(secondCrewId);
 assert.equal(await page.locator('[data-loi-field="passport"]').isEnabled(),false,'Old person fields remained editable during switch');
 while(!releasePost)await new Promise(r=>setTimeout(r,10));releasePost();releasePost=null;
 await page.waitForFunction(()=>document.querySelector('[data-loi-field="passport"]')?.value==='SECOND-ONLY');assert.equal(await page.locator('[data-loi-personal]').getAttribute('open'),'');
 await page.waitForFunction(()=>document.querySelector('#hfdDocSaveStatus')?.textContent!=='กำลังบันทึก…');
 }
 await mount('permit');await page.locator('.hfd-permit-settings > summary').click();
 delayNextPost=true;await page.locator('#hfdIssueDate').fill('2031-01-01');
 while(!releasePost)await new Promise(r=>setTimeout(r,10));grant={role:'owner',crewView:true,crewEdit:true,visitorView:false,visitorEdit:false};releasePost();releasePost=null;
 await page.waitForFunction(()=>!document.querySelector('[data-permit-table="medical"]'));
 assert.equal(await page.locator('[data-permit-table="medical"]').count(),0,'Revoked Visitor editor remained accessible');
 grant={role:'owner',crewView:true,crewEdit:true,visitorView:true,visitorEdit:true};
 await mount('permit');grant={role:'owner',crewView:true,crewEdit:true,visitorView:false,visitorEdit:false};
 await page.locator('[data-download-permit]').click();await page.waitForFunction(()=>!document.querySelector('[data-permit-table="medical"]'),{}, {timeout:4000});
 grant={role:'owner',crewView:true,crewEdit:true,visitorView:true,visitorEdit:true};
 const out=path.join(root,'output/pdf/document-qa');await mkdir(out,{recursive:true});
 for(const type of ['oktb','permit','loi']){
  await mount(type);
  if(type==='oktb'){await page.locator('[data-select-crew="all"]').click();await page.waitForTimeout(1000);}
  await page.evaluate(()=>{const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.qaPdf=blob;return original(blob);};});
  await page.locator('[data-download-'+type+']').click();try{await page.waitForFunction(()=>window.qaPdf instanceof Blob,{}, {timeout:4000});}catch{throw Error(type+': '+await page.locator('#host').innerText());}
  const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await window.qaPdf.arrayBuffer())));await writeFile(path.join(out,type+'-final.pdf'),Buffer.from(bytes));
  await page.evaluate(type=>{const key={oktb:'download',permit:'downloadPermit',loi:'downloadLoi'}[type];window.HarborFlowOktbPdf[key]=async()=>{window.unexpectedDownload=true;};},type);
  grant={role:'viewer',crewView:false,visitorView:false};await page.locator('[data-download-'+type+']').click();
  await page.waitForFunction(()=>document.querySelector('#host')?.textContent.includes('สิทธิ์'));
  assert.equal(await page.evaluate(()=>Boolean(window.unexpectedDownload)),false,'Revocation did not block '+type);
  grant={role:'owner',crewView:true,crewEdit:true,visitorView:true,visitorEdit:true};
 }
 await mount('loi');
 await page.evaluate(async()=>{
  const input={preview:{job:{vessel:'DEMO',port:'DEMO'}},person:{id:'demo',name:'DEMO'},ctx:{embassy:'DEMO MISSION',missionContactLines:Array(70).fill('DEMO CONTACT LINE - LONG ADDRESS'),issueDate:'2026-10-13'},profile:{signer:'DEMO SIGNER'},outputMode:'final'};
  const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.qaPdf=blob;return original(blob);};await window.HarborFlowOktbPdf.downloadLoi(input);
 });
 let bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await window.qaPdf.arrayBuffer())));assert.equal((Buffer.from(bytes).toString('latin1').match(/\/Type \/Page /g)||[]).length,1);await writeFile(path.join(out,'loi-long-final.pdf'),Buffer.from(bytes));
 await page.evaluate(async()=>{
  const model=await import('/permit-draft.mjs'),draft=model.newPermitDraft(),table=draft.tables.find(t=>t.key==='on');table.rows=Array.from({length:100},(_,i)=>({...model.blankRow(table,i),cells:[String(i+1),'DEMO NAME '+i,'DEMO','DEMO','','','','']}));
  await window.HarborFlowOktbPdf.downloadPermit({preview:{job:{vessel:'DEMO',port:'DEMO'}},ctx:{permitDraft:draft},profile:{signer:'DEMO SIGNER'},outputMode:'final'});
 });
 bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await window.qaPdf.arrayBuffer())));assert.equal((Buffer.from(bytes).toString('latin1').match(/\/Type \/Page /g)||[]).length,1);await writeFile(path.join(out,'permit-long-final.pdf'),Buffer.from(bytes));
 await page.evaluate(async()=>window.HarborFlowOktbPdf.download({preview:{job:{vessel:'DEMO',port:'DEMO'}},people:[{name:'DEMO'}],ctx:{},profile:{}}));
 bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await window.qaPdf.arrayBuffer())));await writeFile(path.join(out,'oktb-offline-sample.pdf'),Buffer.from(bytes));
 const otherContext=await browser.newContext();await otherContext.route('https://harborflow.test/**',routeRequest);const other=await otherContext.newPage();
 await mount('oktb');await mount('oktb',other);
 for(const target of [page,other])await target.locator('details').filter({has:target.locator('#hfdIssueDate')}).locator('summary').click();
 await page.locator('#hfdIssueDate').fill('2032-01-02');await page.waitForFunction(()=>document.querySelector('#hfdDocSaveStatus')?.textContent==='บันทึกแล้ว');
 await other.locator('#hfdIssueDate').fill('2033-01-02');await other.waitForSelector('.hfd-conflict');
 await other.locator('.hfd-conflict button').click();await other.waitForSelector('.hfd-conflict select');
 const conflictText=await other.locator('.hfd-conflict').innerText();assert.match(conflictText,/เดิม:/);assert.match(conflictText,/2032-01-02/);assert.match(conflictText,/2033-01-02/);
 for(const select of await other.locator('.hfd-conflict select').all())await select.selectOption('local');
 await other.locator('.hfd-conflict button').last().click();try{await other.waitForFunction(()=>!document.querySelector('.hfd-conflict')&&document.querySelector('#hfdIssueDate')?.value==='2033-01-02'&&document.querySelector('#hfdDocSaveStatus')?.textContent==='โหลดข้อมูลส่วนกลางแล้ว',{}, {timeout:5000});}catch{throw Error(await other.locator('#hfdDocSaveStatus').innerText()+' '+await other.locator('.hfd-conflict').innerText());}
 await mount('oktb');assert.equal(await page.locator('#hfdIssueDate').inputValue(),'2033-01-02');await otherContext.close();
 await page.locator('details').filter({has:page.locator('#hfdIssueDate')}).locator('summary').click();failNextPost=true;await page.locator('#hfdIssueDate').fill('2034-01-02');
 await page.waitForFunction(()=>document.querySelector('#hfdDocSaveStatus')?.textContent.includes('DEMO NETWORK INTERRUPTION'));
 assert.notEqual([...records.values()].find(r=>r.type==='oktb'&&r.section==='common').data.issueDate,'2034-01-02');
 await page.evaluate(()=>document.querySelector('#host')._hfdSaver.flush());await mount('oktb');assert.equal(await page.locator('#hfdIssueDate').inputValue(),'2034-01-02');
 assert.deepEqual(errors,[]);console.log('PASS browser→API→fixture DB autosave and reload; no real Neon or personal data used');
}finally{await browser.close();}
