import test from 'node:test';
import assert from 'node:assert/strict';
import {jobFilesRoute} from '../lib/job-files.mjs';

const root='Jobs/2026/11. NOV/15. TEST - 1';
const job={id:'job1',data:{documentsPath:root,pic:'assigned'}};
const sha='a'.repeat(40);
const markerData={operationJobId:job.id};
const entries=[
  {type:'dir',name:'Invoices'},
  {type:'file',name:'.harborflow-folder'},
  {type:'file',name:'Job notes.txt',sha,size:1400000},
  {type:'symlink',name:'link'}
];
const snapshot={tree:[{path:root+'/General/job.json',type:'blob',sha}]};
const calls=[];
const git=async(method,path,data)=>{
  calls.push([method,path,data]);
  if(path==='ref/heads/main')return {object:{sha:'head'}};
  if(method==='GET'&&path.startsWith('commits/'))return {tree:{sha:'tree'}};
  if(method==='GET'&&path.startsWith('trees/'))return snapshot;
  if(method==='GET'&&path.startsWith('blobs/'))return {encoding:'base64',content:Buffer.from(JSON.stringify(markerData)).toString('base64')};
  return {sha:'created'};
};
const request=(input,overrides={})=>jobFilesRoute({
  job,grant:{role:'editor'},login:'assigned',input,git,
  marker:async()=>({data:markerData}),contents:async()=>entries,...overrides
});

test('Job files stay scoped to the assigned Job and hide control markers',async()=>{
  assert.equal((await request({action:'jobFiles'},{login:'other'})).status,403);
  assert.equal((await request({action:'jobFiles',path:'../General'})).status,400);
  assert.equal((await request({action:'jobFiles'},{marker:async()=>({data:{operationJobId:'other'}})})).status,409);
  assert.deepEqual((await (await request({action:'jobFiles'})).json()).entries.map(entry=>entry.name),['Invoices','Job notes.txt']);
  const file=await request({action:'downloadJobFile',path:'Job notes.txt'});
  assert.equal(file.status,200);
  assert.match(file.headers.get('content-disposition'),/attachment.*Job%20notes.txt/);
  assert.equal(file.headers.get('cache-control'),'private, no-store');
});

test('folder creation and upload use an atomic Git reference update',async()=>{
  calls.length=0;
  const created=await request({action:'createJobFileFolder',name:'Invoices'});
  assert.equal(created.status,201);
  assert.equal(calls.find(([,path])=>path==='trees')[2].tree[0].path,root+'/Files/Invoices/.harborflow-folder');
  assert.deepEqual(calls.at(-1),['PATCH','refs/heads/main',{sha:'created',force:false}]);
  assert.equal((await request({action:'uploadJobFile',path:'Invoices',name:'Order.txt',content:'YWJj'})).status,404);
  assert.equal((await request({action:'uploadJobFile',name:'Order.txt',content:'YWJj'})).status,201);
});
