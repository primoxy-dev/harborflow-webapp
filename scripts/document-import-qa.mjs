import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const require=createRequire('C:/Users/thanaphon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const root=process.cwd();
const job={id:'demo-job',data:{jobNo:'DEMO-IMPORT',vessel:'DEMO VESSEL',eta:'2026-10-22T06:00',status:'Open'}};
const service={id:'crew-change',job_id:job.id,seq:1,data:{type:'Crew Change',status:'In Progress'}};
const person={id:'crew-1',kind:'crew',data:{name:'DEMO CREW',category:'On-signers',serviceIds:[service.id],passport:'KEEP-ME',flights:[]}};
const people=[person];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://harborflow.test/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname==='/api/operations'){
      const body=request.method()==='POST'?request.postDataJSON():Object.fromEntries(url.searchParams);
      if(body.action==='state')return json({login:'owner',grant:{role:'owner',crewView:true,crewEdit:true,visitorView:true,visitorEdit:true},jobs:[job],services:[service]});
      if(body.action==='people')return json({people});
      if(body.action==='updatePerson'){const target=people.find(item=>item.id===body.id);Object.assign(target.data,body.patch);return json({record:target});}
      if(body.action==='createPerson'){const created={id:'crew-'+(people.length+1),kind:body.kind,data:body.data};people.push(created);return json({person:created});}
      return json({});
    }
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/operations.css"></head><body><h1 id="title"></h1><div class="top"><div class="actions"><select></select></div></div><button id="createJob"></button><div id="operations" class="active"></div><script src="/document-import.js"></script><script src="/operations.js"></script></body></html>'});
    const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))return route.abort();
    try{return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/json'});}catch{return route.fulfill({status:404,body:''});}
  });
  await page.goto('https://harborflow.test/');
  await page.evaluate(()=>{
    const base=window.HarborFlowDocumentImport;
    base.read=async(file,type,onProgress)=>{onProgress(35);onProgress(100);
      if(file.name.includes('no-name'))return {type,fileName:file.name,confidence:90,checkedAt:new Date().toISOString(),machineChecks:[],fields:{passport:'UNKNOWN'}};
      if(type==='passport')return {type,fileName:file.name,confidence:74,checkedAt:new Date().toISOString(),machineChecks:[true,false,true],fields:{name:'CREW DEMO',passport:'P1234567',passportExpiry:'2027-01-10',nationality:'THAI',dob:'1990-02-03'}};
      if(type==='seamanBook')return {type,fileName:file.name,confidence:92,checkedAt:new Date().toISOString(),machineChecks:[],fields:{name:'NEW CREW',seamanBook:'SB999999',seamanBookExpiry:'2030-01-01'}};
      return {type,fileName:file.name,confidence:92,checkedAt:new Date().toISOString(),machineChecks:[],fields:{name:'CREW NEW'},flight:{airline:'TG',number:'123',date:'24OCT',from:'BKK',to:'HKT',departure:'08:30',arrival:'09:50',booking:'DEMO1'}};};
  });
  await page.locator('[data-open-job]').first().click();
  await page.locator('[data-open-service="crew-change"]').click();
  assert.equal(await page.locator('[data-doc-drop]').count(),3);
  const panelTop=await page.locator('.hfo-doc-batch').evaluate(node=>node.getBoundingClientRect().top);
  const tableTop=await page.locator('.hfo-roster-table').first().evaluate(node=>node.getBoundingClientRect().top);
  assert.ok(panelTop<tableTop,'batch upload must appear above crew tables');
  await page.locator('[data-doc-file="passport"]').setInputFiles([
    {name:'passport-demo.jpg',mimeType:'image/jpeg',buffer:Buffer.from('demo')},
    {name:'passport-no-name.jpg',mimeType:'image/jpeg',buffer:Buffer.from('demo')}
  ]);
  await page.getByText('Batch complete').waitFor();
  assert.equal(person.data.passport,'KEEP-ME');
  assert.equal(person.data.passportExpiry,'2027-01-10');
  assert.equal(people.length,1,'missing name must not create a crew row');
  assert.match(await page.locator('.hfo-doc-batch-results').innerText(),/No readable crew name/);
  await page.locator('[data-doc-file="seamanBook"]').setInputFiles({name:'seaman-new.pdf',mimeType:'application/pdf',buffer:Buffer.from('demo')});
  await page.getByText('Batch complete').waitFor();
  assert.equal(people.length,2);
  assert.equal(people[1].data.name,'NEW CREW');
  assert.equal(people[1].data.seamanBook,'SB999999');
  await page.locator('[data-doc-file="flightTicket"]').setInputFiles({name:'ticket-demo.pdf',mimeType:'application/pdf',buffer:Buffer.from('demo')});
  await page.getByText('Batch complete').waitFor();
  assert.equal(people.length,2,'reversed name order must match the existing new crew');
  assert.equal(people[1].data.flights[0].airline,'TG');
  assert.equal(people[1].data.flights[0].from,'BKK');
  await mkdir(path.join(root,'output/document-import-qa'),{recursive:true});
  await page.screenshot({path:path.join(root,'output/document-import-qa/crew-document-import.png'),fullPage:true});
  await page.setViewportSize({width:390,height:900});
  await page.locator('.hfo-doc-batch').screenshot({path:path.join(root,'output/document-import-qa/crew-document-import-mobile.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS crew document batch import: shared position, multiple files, exact normalized matching, blank-only fill, new crew, safe no-name review, responsive layout');
}finally{await browser.close();}
