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
 {id:'job-src',data:{jobNo:'DEMO-3',vessel:'SRC DEMO',imo:'',port:'Sriracha / Kerry',principal:'DEMO',eta:'2026-10-17T18:30',etd:'',status:'Arrived',pic:'demo',notes:''}}
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
 await mkdir(path.join(root,'output/job-ui-qa'),{recursive:true});
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(root,`output/job-ui-qa/job-${width}.png`),fullPage:true});}
 assert.deepEqual(errors,[]);
 console.log('PASS Job UI: exact statuses, 24-hour ETA/ETD, removed helper copy, port colors, autosave');
}finally{await browser.close();}
