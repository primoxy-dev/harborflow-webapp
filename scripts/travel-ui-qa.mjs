import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const require=createRequire('C:/Users/thanaphon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright'),root=process.cwd();
const job={id:'11111111-1111-4111-8111-111111111111',data:{jobNo:'DEMO-TRAVEL',vessel:'TRAVEL DEMO',port:'Laem Chabang / A1',eta:'2026-10-20T06:00',status:'Open',pic:'demo'}};
const service={id:'22222222-2222-4222-8222-222222222222',job_id:job.id,seq:1,data:{type:'Fresh Water',status:'Not Started',pic:'demo',checklist:[]}};
const people=[{id:'crew-1',job_id:job.id,kind:'crew',data:{name:'DEMO CREW',category:'On-signers',serviceIds:[]}},{id:'visitor-1',job_id:job.id,kind:'visitor',data:{name:'DEMO SURVEYOR',category:'Surveyors',serviceIds:[]}}];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://harborflow.test/**',async route=>{
  const request=route.request(),url=new URL(request.url()),json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/api/operations'){
   const input=request.method()==='POST'?request.postDataJSON():Object.fromEntries(url.searchParams);
   if(input.action==='state')return json({login:'demo',grant:{role:'owner',crewView:true,crewEdit:true,visitorView:true,visitorEdit:true},jobs:[job],services:[service]});
   if(input.action==='people')return json({people});
   if(input.action==='trips')return json({trips:[]});
   return json({});
  }
  if(url.pathname==='/api/knowledge')return json({data:{terminals:[]}});
  if(url.pathname==='/api/maps'){
   if(url.searchParams.get('action')==='search'){const name=url.searchParams.get('q');return json({results:[{name,address:'Demo district, Thailand',label:name+', Demo district, Thailand',lat:13.69,lon:100.75}]});}
   if(url.searchParams.get('action')==='route')return json({route:{distanceMeters:100000,durationSeconds:7200,geometry:null}});
   return json({result:{label:'Pinned place, Thailand',lat:13.69,lon:100.75}});
  }
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/operations.css"></head><body><h1 id="title"></h1><div class="top"><div class="actions"><select></select></div></div><button id="createJob"></button><div id="operations" class="active"></div><script src="/operations.js"></script></body></html>'});
  const file=path.resolve(root,'.'+url.pathname);try{return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('https://harborflow.test/');
 await page.locator(`[data-open-job="${job.id}"]`).first().click();
 await page.locator(`[data-open-service="${service.id}"]`).click();
 await page.locator('[data-tab="travel"]').click();
 await page.locator('[data-add-trip]').click();
 assert.equal(await page.getByText('Actual departure',{exact:true}).count(),0);
 assert.equal(await page.getByText('Actual arrival',{exact:true}).count(),0);
 assert.equal(await page.locator('[data-trip-time="plannedDeparture"]').getAttribute('placeholder'),'HH:MM');
 await page.locator('[data-trip-date="plannedDeparture"]').fill('2026-10-20');
 await page.locator('[data-trip-time="plannedDeparture"]').fill('06:30');
 assert.equal(await page.locator('input[name="plannedDeparture"]').inputValue(),'2026-10-20T06:30');
 await page.locator('[data-trip-time-picker="plannedArrival"]').evaluate(input=>{input.value='08:15';input.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.locator('[data-trip-time="plannedArrival"]').inputValue(),'08:15');
 await page.locator('[data-place-field="origin"]').fill('Suvarnabhumi Airport');
 await page.locator('[data-place-choice="origin"]').waitFor();
 await page.locator('[data-place-choice="origin"]').click();
 await page.locator('[data-place-field="destination"]').fill('Laem Chabang Port');
 await page.locator('[data-place-choice="destination"]').waitFor();
 await page.locator('[data-place-choice="destination"]').click();
 await page.locator('input[name="personIds"]').nth(0).check();
 await page.locator('input[name="personIds"]').nth(1).check();
 await page.locator('input[name="cargoItems"]').fill('2 BOXES');
 await page.locator('[data-add-cargo-item]').click();
 await page.locator('input[name="cargoItems"]').nth(1).fill('1 SPARE PART');
 assert.match(await page.locator('#hfoPassengerCargoSummary').innerText(),/DEMO CREW, DEMO SURVEYOR · Cargo: 2 BOXES, 1 SPARE PART/);
 assert.equal(await page.locator('#hfoRouteSummary').innerText(),'100 km · 2 hr 0 min');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await mkdir(path.join(root,'output/travel-ui-qa'),{recursive:true});
 await page.screenshot({path:path.join(root,'output/travel-ui-qa/mobile.png'),fullPage:true});
 await page.setViewportSize({width:768,height:1000});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(root,'output/travel-ui-qa/tablet.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS Travel UI: autocomplete, route estimate, multi passenger/cargo, manual/picker time, mobile/tablet');
}finally{await browser.close();}
