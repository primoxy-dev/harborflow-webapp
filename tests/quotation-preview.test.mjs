import test from 'node:test';
import assert from 'node:assert/strict';
import {renderQuotationPages} from '../quotation-renderer.mjs';

const line={description:'Crew change',unit:'Person',saleQuantity:'2',salePrice:'1500',vatMode:'excluded',vatRate:'7',costNote:'SECRET',costUnit:'1000'};
const data={number:'QT-1',date:'2026-10-30',customer:'Example Shipping',vessel:'Demo',jobNo:'JOB-1',port:'Bangkok',currency:'THB',issuer:'HarborFlow',template:'harbor',lines:[line]};
function surface(){
 const draws=[],colors=[];
 const create=()=>{const records=[];draws.push(records);const ctx={font:'',textAlign:'left',set fillStyle(v){colors.push(v);},measureText(t){return {width:String(t).length*11};},fillText(t,x,y){records.push({text:String(t),x,y});},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};return {getContext:()=>ctx};};
 return {draws,colors,create};
}
test('customer preview has exact VAT totals and excludes every internal cost field',()=>{
 const f=surface();renderQuotationPages(data,f.create);const text=f.draws.flat().map(x=>x.text).join('\n');
 assert.match(text,/3,210.00 THB/);assert.match(text,/210.00 THB/);assert.doesNotMatch(text,/SECRET|1,000|costUnit/);
});
test('incomplete lines preview without crashing and do not imply a complete total',()=>{
 const f=surface();renderQuotationPages({...data,lines:[{...line,salePrice:''}]},f.create);
 const text=f.draws.flat().map(x=>x.text).join('\n');assert.match(text,/—/);assert.doesNotMatch(text,/NaN|3,210/);
});
test('long customer text and 200 services paginate within the page margins',()=>{
 const f=surface();const pages=renderQuotationPages({...data,notes:'Long notes '.repeat(270),lines:Array.from({length:200},()=>({...line,customerNote:'Service detail '.repeat(30)}))},f.create);
 assert.ok(pages.length>2);for(const item of f.draws.flat())assert.ok(item.y<=1719&&item.y>=0,JSON.stringify(item));
 assert.ok(f.draws.every(page=>page.some(x=>x.text.startsWith('Page '))));
});
test('template choice changes the document accent while preserving commercial values',()=>{
 const a=surface(),b=surface();renderQuotationPages(data,a.create);renderQuotationPages({...data,template:'classic'},b.create);
 assert.ok(a.colors.includes('#087f76'));assert.ok(b.colors.includes('#193454'));
 assert.deepEqual(a.draws,b.draws);
});
