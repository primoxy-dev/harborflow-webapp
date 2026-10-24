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
const filipinoPerson={id:'crew-2',kind:'crew',data:{name:'MR. RUEL LABANDERO EPE',category:'On-signers',serviceIds:[service.id],flights:[]}};
const priorImport={id:'crew-3',kind:'crew',data:{name:'MR. SREENATHKNARAYANAS',category:'On-signers',serviceIds:[service.id],passport:'Z6975453',flights:[]}};
const people=[person,filipinoPerson,priorImport];
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
      if(file.name.includes('corrected-indian'))return {type,fileName:file.name,confidence:44,checkedAt:new Date().toISOString(),machineChecks:[true,false,true],nameNeedsTitle:false,nameWithoutTitle:'SREENATH NARAYANA SWAMY',fields:{name:'MR. SREENATH NARAYANA SWAMY',passport:'Z6975453',nationality:'INDIAN',dob:'1986-10-30',passportExpiry:'2032-09-05'}};
      if(type==='passport')return {type,fileName:file.name,confidence:74,checkedAt:new Date().toISOString(),machineChecks:[true,false,true],nameNeedsTitle:true,nameWithoutTitle:'CREW DEMO',fields:{name:'CREW DEMO',passport:'P1234567',passportExpiry:'2027-01-10',nationality:'THAI',dob:'1990-02-03'}};
      if(type==='seamanBook')return {type,fileName:file.name,confidence:92,checkedAt:new Date().toISOString(),machineChecks:[],matchStrategy:'given-surname',fields:{name:file.name.includes('unmatched')?'OTHER CREW':'RUEL EPE',seamanBook:'SB999999',seamanBookExpiry:'2030-01-01'}};
      return {type,fileName:file.name,confidence:92,checkedAt:new Date().toISOString(),machineChecks:[],fields:{name:'RUEL LABANDERO EPE'},flight:{airline:'PR',number:'736',date:'26OCT',from:'MNL',to:'BKK',departure:'16:10',arrival:'18:45',booking:'5GIPCV'}};};
    base.createBatchReader=()=>({read:base.read,close:async()=>{}});
  });
  await page.locator('[data-open-job]').first().click();
  await page.locator('[data-open-service="crew-change"]').click();
  assert.equal(await page.locator('[data-doc-drop]').count(),3);
  const panelTop=await page.locator('.hfo-doc-batch').evaluate(node=>node.getBoundingClientRect().top);
  const tableTop=await page.locator('.hfo-roster-table').first().evaluate(node=>node.getBoundingClientRect().top);
  assert.ok(panelTop<tableTop,'batch upload must appear above crew tables');
  await page.locator('[data-edit-person="crew-2"]').click();
  assert.equal(await page.locator('#hfoPersonForm [data-person-document-field]').count(),0,'expanded crew details must not repeat passport and seaman book fields');
  assert.equal(await page.locator('#hfoPersonForm').getByText('Passport no.').count(),0);
  assert.equal(await page.locator('#hfoPersonForm').getByText('Seaman book no.').count(),0);
  await page.locator('[data-close-person]').click();
  await page.locator('[data-doc-file="passport"]').setInputFiles([
    {name:'passport-demo.jpg',mimeType:'image/jpeg',buffer:Buffer.from('demo')},
    {name:'passport-no-name.jpg',mimeType:'image/jpeg',buffer:Buffer.from('demo')}
  ]);
  await page.getByText('Batch complete').waitFor();
  assert.equal(person.data.passport,'KEEP-ME');
  assert.equal(person.data.passportExpiry,undefined,'uncertain sex must wait for title choice before saving');
  await page.locator('[data-doc-title="MR."]').click();
  assert.equal(person.data.passportExpiry,'2027-01-10');
  assert.equal(people.length,3,'missing name must not create a crew row');
  assert.match(await page.locator('.hfo-doc-batch-results').innerText(),/No readable crew name/);
  await page.locator('[data-doc-file="seamanBook"]').setInputFiles({name:'seaman-match.pdf',mimeType:'application/pdf',buffer:Buffer.from('demo')});
  await page.getByText('Batch complete').waitFor();
  assert.equal(people.length,3);
  assert.equal(filipinoPerson.data.name,'MR. RUEL LABANDERO EPE');
  assert.equal(filipinoPerson.data.seamanBook,'SB999999');
  await page.locator('[data-doc-file="seamanBook"]').setInputFiles({name:'seaman-unmatched.pdf',mimeType:'application/pdf',buffer:Buffer.from('demo')});
  await page.getByText('Batch complete').waitFor();
  assert.equal(people.length,3,'an unmatched Filipino seaman book must not create a crew row');
  assert.match(await page.locator('.hfo-doc-batch-results').innerText(),/No existing crew matched the Given name and Surname/);
  await page.locator('[data-doc-file="flightTicket"]').setInputFiles({name:'ticket-demo.pdf',mimeType:'application/pdf',buffer:Buffer.from('demo')});
  await page.getByText('Batch complete').waitFor();
  assert.equal(people.length,3,'title-free ticket name must match the existing crew');
  assert.equal(filipinoPerson.data.flights[0].airline,'PR');
  assert.equal(filipinoPerson.data.flights[0].from,'MNL');
  assert.equal(filipinoPerson.data.flights[0].booking,'5GIPCV');
  await page.locator('[data-doc-file="passport"]').setInputFiles({name:'corrected-indian.pdf',mimeType:'application/pdf',buffer:Buffer.from('demo')});
  await page.getByText('Batch complete').waitFor();
  assert.equal(people.length,3,'the corrected scan must not create a duplicate when the Passport number already exists');
  assert.equal(priorImport.data.name,'MR. SREENATHKNARAYANAS','the importer must not overwrite the saved name without review');
  assert.equal(priorImport.data.dob,'1986-10-30');
  assert.match(await page.locator('.hfo-doc-batch-results').innerText(),/Review Name - Surname/);
  await mkdir(path.join(root,'output/document-import-qa'),{recursive:true});
  await page.screenshot({path:path.join(root,'output/document-import-qa/crew-document-import.png'),fullPage:true});
  await page.setViewportSize({width:390,height:900});
  await page.locator('.hfo-doc-batch').screenshot({path:path.join(root,'output/document-import-qa/crew-document-import-mobile.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS crew document batch import: shared position, multiple files, exact normalized matching, blank-only fill, new crew, safe no-name review, responsive layout');
}finally{await browser.close();}
