import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

async function fixture({blocked=false}={}) {
 const opens=[],alerts=[],windows=[];
 const window={alert:message=>alerts.push(message),open:(url,name,features)=>{
  opens.push({url,name,features});if(blocked)return null;
  const popup={closed:false,opener:window,navigations:[],focusCount:0,location:{replace:destination=>popup.navigations.push(destination)},focus:()=>popup.focusCount++};
  windows.push(popup);return popup;
 }};
 const code=await readFile(new URL('../outlook.js',import.meta.url),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
 runInNewContext(code,{window});
 assert.equal(typeof window.HarborFlowOutlook?.open,'function','Outlook menu launcher is not implemented');
 return {window,opens,alerts,windows,launch:()=>window.HarborFlowOutlook.open()};
}
test('Outlook opens the company web mailbox without a connection request and isolates opener',async()=>{
 const f=await fixture();assert.equal(f.launch(),true);
 assert.equal(f.opens[0].name,'HarborFlowOutlook');assert.match(f.opens[0].features,/popup/);
 assert.equal(f.windows[0].opener,null);
 assert.deepEqual(f.windows[0].navigations,['https://outlook.office.com/mail/']);
});
test('clicking again focuses the existing Outlook window without reloading its mailbox',async()=>{
 const f=await fixture();f.launch();f.launch();
 assert.equal(f.opens.length,1);assert.equal(f.windows[0].focusCount,2);assert.equal(f.windows[0].navigations.length,1);
});
test('a closed Outlook window is reopened on the next click',async()=>{
 const f=await fixture();f.launch();f.windows[0].closed=true;f.launch();
 assert.equal(f.opens.length,2);assert.deepEqual(f.windows[1].navigations,['https://outlook.office.com/mail/']);
});
test('blocked popups show an actionable warning, not a false success',async()=>{
 const f=await fixture({blocked:true});assert.equal(f.launch(),false);
 assert.equal(f.alerts.length,1);assert.match(f.alerts[0],/popup/i);
});
