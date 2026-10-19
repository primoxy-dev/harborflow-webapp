import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const require=createRequire('C:/Users/thanaphon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const root=process.cwd(),out=path.join(root,'output','summary-report-qa');
const job={id:'fictional-job',data:{vessel:'MV DEMO STAR',jobNo:'DEMO-001',port:'Laem Chabang / A1',principal:'Demo Shipping',eta:'2026-10-21T08:00',etd:'2026-10-22T18:00',status:'Arrived',pic:'demo'}};
const services=[
  {id:'service-crew',job_id:job.id,seq:1,data:{type:'Crew Change',status:'In Progress',description:'Two signers, one hotel',pic:'demo',plannedStart:'2026-10-21T09:00',supplierConfirmed:true,details:{boardingPoint:'Gangway A'},checklist:[{text:'Confirm flights',done:true,actor:'demo',completedAt:'2026-10-20T11:00'},{text:'Confirm transport',done:false}]}} ,
  {id:'service-water',job_id:job.id,seq:2,data:{type:'Fresh Water',status:'Waiting',description:'100 MT requested',supplier:'Demo Water',details:{requestedQuantity:'100',actualQuantity:'80',unit:'MT'},checklist:[{text:'Obtain receipt',done:false}]}}
];
const people=[{id:'person-1',kind:'crew',data:{name:'FICTIONAL CREW',category:'On-signers',nationality:'THAI',rank:'Master',serviceIds:['service-crew']}}];
const trips=[{id:'trip-1',service_id:'service-crew',data:{kind:'car',originName:'Airport',destinationName:'Hotel',plannedDeparture:'2026-10-20T15:00',plannedArrival:'2026-10-20T17:00',personIds:['person-1'],cargoItems:['1 bag'],status:'Planned'}}];
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  let publicOnly=false;
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://harborflow.test/**',async route=>{
    const url=new URL(route.request().url());
    const json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
    if(url.pathname==='/api/operations'){
      const action=url.searchParams.get('action');
      if(action==='state')return publicOnly?route.fulfill({status:401,contentType:'application/json',body:'{"error":"Sign in required"}'}):json({login:'demo',grant:{role:'owner',crewView:true,visitorView:true},jobs:[job],services});
      if(action==='publicState')return json({public:true,jobs:[{id:job.id,data:{vessel:job.data.vessel,port:job.data.port,eta:job.data.eta,status:job.data.status}}],services:services.map(service=>({id:service.id,job_id:job.id,seq:service.seq,data:{type:service.data.type,status:service.data.status}}))});
      if(action==='people')return json({people});
      if(action==='trips')return json({trips});
      return json({});
    }
    if(url.pathname==='/api/knowledge')return json({data:{terminals:[]}});
    const file=path.resolve(root,'.'+url.pathname.replace(/\/$/,'/index.html'));
    if(!file.startsWith(root+path.sep))return route.abort();
    try{return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}
    catch{return route.fulfill({status:404,body:''});}
  });
  await page.goto('https://harborflow.test/');
  await page.locator('[data-view="allservices"]').click();
  await page.locator('.hfs-service-card').first().waitFor();
  assert.equal(await page.locator('.hfs-service-card').count(),2);
  assert.equal(await page.locator('.hfs-check-row').count(),3);
  assert.match(await page.locator('.hfs-report-paper').innerText(),/FICTIONAL CREW/);
  assert.match(await page.locator('.hfs-report-paper').innerText(),/100 MT requested/);
  await mkdir(out,{recursive:true});
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  const pdfData=await page.evaluate(async()=>{
    const {filename,blob}=window.HarborFlowSummaryReport.createPdf(window.HarborFlowSummaryReport.build({
      jobs:[{id:'fictional-job',data:{vessel:'MV DEMO STAR',jobNo:'DEMO-001',port:'Laem Chabang / A1',principal:'Demo Shipping',eta:'2026-10-21T08:00',etd:'2026-10-22T18:00',status:'Arrived',pic:'demo'}}],
      services:[
        {id:'service-crew',job_id:'fictional-job',seq:1,data:{type:'Crew Change',status:'In Progress',description:'Two signers, one hotel',details:{boardingPoint:'Gangway A'},checklist:[{text:'Confirm flights',done:true},{text:'Confirm transport',done:false}]}},
        {id:'service-water',job_id:'fictional-job',seq:2,data:{type:'Fresh Water',status:'Waiting',description:'100 MT requested',details:{requestedQuantity:'100',actualQuantity:'80',unit:'MT'},checklist:[{text:'Obtain receipt',done:false}]}}
      ],grant:{crewView:true,visitorView:true}
    },'fictional-job',{people:[{id:'person-1',kind:'crew',data:{name:'FICTIONAL CREW',category:'On-signers',nationality:'THAI',rank:'Master',serviceIds:['service-crew']}}],trips:[{service_id:'service-crew',data:{kind:'car',originName:'Airport',destinationName:'Hotel',plannedDeparture:'2026-10-20T15:00',plannedArrival:'2026-10-20T17:00',personIds:['person-1'],cargoItems:['1 bag'],status:'Planned'}}]}));
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return {filename,base64:btoa(binary)};
  });
  const pdf=Buffer.from(pdfData.base64,'base64');
  await writeFile(path.join(out,'sample.pdf'),pdf);
  assert.equal(pdf.subarray(0,4).toString(),'%PDF');
  assert.match(pdfData.filename,/DEMO-001\.PDF$/);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-report-download]').click();
  assert.match((await downloadPromise).suggestedFilename(),/DEMO-001\.PDF$/);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  publicOnly=true;
  await page.locator('[data-report-refresh]').click();
  await page.locator('.hfs-service-card').first().waitFor();
  const publicText=await page.locator('.hfs-report-paper').innerText();
  assert.match(publicText,/PUBLIC SUMMARY/);
  assert.doesNotMatch(publicText,/FICTIONAL CREW|Demo Water|Confirm flights|DEMO-001/);
  assert.equal(await page.locator('.hfs-check-row').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS Summary report: per-Job services, checklist, linked crew/travel, PDF download, mobile layout');
}finally{await browser.close();}
