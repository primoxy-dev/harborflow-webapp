import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/thanaphon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const root=process.cwd(),job={id:'demo-job',data:{jobNo:'DEMO',vessel:'DEMO VESSEL',eta:new Date().toISOString().slice(0,16),status:'Confirmed'}};
const types=['Visitor','SIRE Inspector','Surveyor','Crew Change'];
const services=types.map((type,i)=>({id:'service-'+i,job_id:job.id,seq:i+1,data:{type,status:'Not Started'}}));
const immigration={status:'Approved',codes:{VISA:true},notes:'EXISTING DEMO NOTE'};
const people=types.map((type,i)=>({id:'person-'+i,kind:i===3?'crew':'visitor',data:{name:'DEMO '+type,category:['Other','SIRE Inspectors','Surveyors','On-signers'][i],serviceIds:[services[i].id],immigration:structuredClone(immigration),flights:[]}}));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://harborflow.test/**',async route=>{
  const req=route.request(),u=new URL(req.url());
  const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/api/operations'){
   const body=req.method()==='POST'?req.postDataJSON():Object.fromEntries(u.searchParams);
   if(body.action==='state')return json({login:'demo',grant:{role:'owner',crewView:true,crewEdit:true,visitorView:true,visitorEdit:true},jobs:[job],services});
   if(body.action==='people')return json({people});
   if(body.action==='updatePerson'){const p=people.find(p=>p.id===body.id);Object.assign(p.data,body.patch);return json({record:p});}
   return json({});
  }
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/operations.css"></head><body><h1 id="title"></h1><div class="top"><div class="actions"><select></select></div></div><button id="createJob"></button><div id="operations" class="active"></div><script src="/operations.js"></script></body></html>'});
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep))return route.abort();
  try{return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/json'});}catch{return route.fulfill({status:404,body:''});}
 });
 for(let i=0;i<types.length;i++){
  await page.goto('https://harborflow.test/');
  await page.locator('[data-open-job]').first().click();
  await page.locator('[data-open-service="service-'+i+'"]').click();
  await page.locator('[data-edit-person="person-'+i+'"]').click();
  assert.equal(await page.locator('.hfo-immigration-row').count(),i===3?1:0);
  assert.match(await page.locator('#hfoPersonForm h4').first().innerText(),i===3?/Immigration & flight details/:/^Flight details/);
  const airline=page.locator('[data-flight-field="airline"]').first();await airline.fill('thai');
  await page.locator('[data-flight-code="TG"]').click();
  await page.locator('[data-flight-field="from"]').first().fill('suvarnabhumi');
  await page.locator('[data-flight-code="BKK"]').click();
  await page.locator('[data-flight-field="booking"]').first().fill('demo123');
  await page.locator('[data-close-person]').click();
  assert.equal(people[i].data.flights[0].airline,'TG');assert.equal(people[i].data.flights[0].from,'BKK');assert.equal(people[i].data.flights[0].booking,'DEMO123');
  if(i!==3)assert.deepEqual(people[i].data.immigration,immigration);
  await page.locator('[data-edit-person="person-'+i+'"]').click();await page.locator('[data-add-flight]').click();
  assert.equal(await page.locator('[data-flight-field="airline"]').count(),2);
  await page.locator('[data-remove-flight="1"]').click();assert.equal(await page.locator('[data-flight-field="airline"]').count(),1);
  if(i===0){await mkdir(path.join(root,'output/visitor-qa'),{recursive:true});
   for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(root,'output/visitor-qa/visitor-'+width+'.png'),fullPage:true});}
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS Visitor/SIRE/Surveyor/Crew flights: autocomplete, uppercase, add/remove, autosave, hidden immigration preserved');
}finally{await browser.close();}
