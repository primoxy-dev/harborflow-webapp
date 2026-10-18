import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const require=createRequire('C:/Users/thanaphon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const root=process.cwd();
const jobs=[
 {id:'job-mtp',data:{jobNo:'DEMO-1',vessel:'MTP DEMO',imo:'',port:'Map Ta Phut / SPM',principal:'DEMO',eta:'2026-10-15T12:56',etd:'2026-10-16T01:05',status:'Completed',pic:'demo',notes:''}},
 {id:'job-lch',data:{jobNo:'DEMO-2',vessel:'LCH DEMO',imo:'',port:'Laem Chabang / A1',principal:'DEMO',eta:'2026-10-16T08:00',etd:'',status:'Open',pic:'demo',notes:''}},
 {id:'job-src',data:{jobNo:'DEMO-3',vessel:'SRC DEMO',imo:'',port:'Sriracha / Kerry',principal:'DEMO',eta:'2026-10-17T18:30',etd:'',status:'Arrived',pic:'demo',notes:''}},
 {id:'job-mtp-prior',data:{jobNo:'DEMO-4',vessel:'MTP PRIOR',port:'Map Ta Phut / SPM',eta:'2026-09-12T09:00',status:'Sailed'}},
 {id:'job-lch-prior',data:{jobNo:'DEMO-5',vessel:'LCH PRIOR',port:'Laem Chabang / A1',eta:'2026-09-13T09:00',status:'Sailed'}}
];
const updates=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://harborflow.test/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname==='/api/operations'){
   const body=request.method()==='POST'?request.postDataJSON():Object.fromEntries(url.searchParams);
   if(body.action==='state')return json({login:'demo',grant:{role:'owner',crewView:true,crewEdit:true,visitorView:true,visitorEdit:true},jobs,services:[]});
   if(body.action==='people')return json({people:[]});
   if(body.action==='updateJob'){
    const record=jobs.find(job=>job.id===body.id);Object.assign(record.data,body.patch);updates.push(body.patch);return json({record});
   }
   return json({});
  }
  if(url.pathname==='/api/knowledge')return json({data:{terminals:[{port:'Map Ta Phut',terminal:'SPM'},{port:'Laem Chabang',terminal:'A1'},{port:'Sriracha',terminal:'Kerry'}]}});
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/operations.css"></head><body><h1 id="title"></h1><div class="top"><div class="actions"><select></select></div></div><button id="createJob"></button><div id="operations" class="active"></div><script src="/operations.js"></script></body></html>'});
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))return route.abort();
  try{return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('https://harborflow.test/');
 await page.waitForSelector('.hfo-job-pill');
 await page.locator('#createJob').click();
 await page.locator('[data-job-date="eta"]').fill('2026-10-22');
 await page.locator('[data-open-time-picker="eta"]').click();
 assert.deepEqual(await page.locator('[data-time-hour="eta"] option').allTextContents(),Array.from({length:24},(_,index)=>String(index).padStart(2,'0')));
 await page.locator('[data-time-hour="eta"]').selectOption('21');
 await page.locator('[data-time-minute="eta"]').selectOption('05');
 assert.equal(await page.locator('[data-job-time="eta"]').inputValue(),'21:05');
 assert.equal(await page.locator('input[type="hidden"][name="eta"]').inputValue(),'2026-10-22T21:05');
 await mkdir(path.join(root,'output/job-ui-qa'),{recursive:true});
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(root,`output/job-ui-qa/create-${width}.png`),fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-close]').click();
 assert.equal(await page.locator('[data-chart="port-terminal"] [data-port-chart-row]').count(),3);
 assert.deepEqual(await page.locator('[data-chart="port-terminal"] [data-port-chart-row]').evaluateAll(rows=>rows.map(row=>[row.querySelector('.hfo-chart-label').textContent,row.dataset.current,row.dataset.previous])),[
  ['Laem Chabang / A1','1','1'],['Map Ta Phut / SPM','1','1'],['Sriracha / Kerry','1','0']
 ]);
 assert.equal(await page.locator('[data-chart="port-terminal"] .hfo-bar.previous').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(245, 158, 11)');
 assert.deepEqual(await page.locator('[data-chart="status"] [data-status-chart-row]').evaluateAll(rows=>rows.map(row=>[row.querySelector('.hfo-chart-label').textContent,row.dataset.count])),[
  ['Arrived','1'],['Open','1'],['Ops Closed/Awaiting Invoices','1']
 ]);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(root,`output/job-ui-qa/dashboard-${width}.png`),fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
 assert.equal(await page.locator('.hfo-job-pill.port-map-ta-phut').count(),1);
 assert.equal(await page.locator('.hfo-job-pill.port-laem-chabang').count(),1);
 assert.equal(await page.locator('.hfo-job-pill.port-sriracha').count(),1);
 await page.locator('[data-open-job="job-mtp"]').first().click();
 const statusOptions=await page.locator('select[name="status"] option').allTextContents();
 assert.deepEqual(statusOptions,['Arrived','Awaiting Customer PO','Cancelled','Invoiced','Open','Ops Closed/Awaiting Invoices','Partial Invoiced','Ready For DA','Sailed']);
 assert.equal(await page.locator('select[name="status"]').inputValue(),'Ops Closed/Awaiting Invoices');
 assert.equal(await page.locator('[data-job-date="eta"]').inputValue(),'2026-10-15');
 assert.equal(await page.locator('[data-job-time="eta"]').inputValue(),'12:56');
 assert.equal((await page.locator('.hfo-overlay').innerText()).includes('Suggestions from Wikidata'),false);
 assert.equal((await page.locator('.hfo-overlay').innerText()).includes('From Terminal Restriction'),false);
 await page.locator('[data-job-time="eta"]').fill('23:45');
 await page.locator('[data-job-time="eta"]').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelector('#hfoSync')?.textContent.startsWith('Saved'));
 assert.equal(updates.at(-1).eta,'2026-10-15T23:45');
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(root,`output/job-ui-qa/job-${width}.png`),fullPage:true});}
 jobs.splice(0,3);
 await page.goto('https://harborflow.test/');
 assert.equal(await page.locator('[data-chart="status"] .hfo-empty').innerText(),'No Port Calls in October 2026.');
 assert.deepEqual(errors,[]);
 console.log('PASS Job UI: New Port Call 24-hour picker/manual ETA/ETD, exact statuses, port colors, autosave');
}finally{await browser.close();}
