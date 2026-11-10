import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));

test('table borders and text use the same post-reflow capture coordinates',{timeout:60000},async()=>{
 const fixture='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/documents.css"><style>@media(max-width:600px){.hfd-oktb-page>p{line-height:2.8}}</style><article class="hfd-oktb-page"><h2>TEST DOCUMENT</h2><p>'+('A responsive paragraph before the crew table. '.repeat(8))+'</p><table><tr><th>Name</th><th>Nationality</th></tr><tr><td>TEST PERSON</td><td>THAI</td></tr></table><p>Flight details and closing text must not overlap the table.</p><table><tr><th>Flight</th><th>From</th><th>To</th></tr><tr><td>TEST 123</td><td>AAA</td><td>BBB</td></tr></table></article><script src="/pdf-vector.js"></script>';
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end(fixture);return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('content-type',file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
  fs.createReadStream(file).on('error',()=>{res.statusCode=404;res.end();}).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const results=[];
  for(const width of [1280,390]){
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,deviceScaleFactor:width===390?3:1});
   const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
   results.push(await page.evaluate(async()=>{
    const blob=await window.HarborFlowVectorPdf.fromLivePage(document.querySelector('.hfd-oktb-page'));
    const lib=await import('/pdf-export-source/node_modules/pdfjs-dist/build/pdf.mjs');
    lib.GlobalWorkerOptions.workerSrc='/pdf-export-source/node_modules/pdfjs-dist/build/pdf.worker.mjs';
    const doc=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
    const pdfPage=await doc.getPage(1),viewport=pdfPage.getViewport({scale:1.2}),canvas=document.createElement('canvas');
    canvas.width=viewport.width;canvas.height=viewport.height;
    await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const result={pages:doc.numPages,image:canvas.toDataURL('image/png')};await doc.destroy();return result;
   }));
   await context.close();
  }
  assert.equal(results[0].pages,1);assert.equal(results[1].pages,1);
  assert.ok(results[0].image===results[1].image,'Mobile table borders/text shifted relative to desktop capture');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
