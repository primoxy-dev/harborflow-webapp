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

test('rename moves the same blob in one commit and refuses to overwrite an existing name',async()=>{
  const folder=root+'/Files/Invoices';
  const source=folder+'/Order.txt';
  const tree=[...snapshot.tree,{path:source,mode:'100644',type:'blob',sha},
    {path:folder+'/Other.txt',mode:'100644',type:'blob',sha:'b'.repeat(40)}];
  const gitWithFiles=(method,path,data)=>method==='GET'&&path.startsWith('trees/')
    ?Promise.resolve({tree}):git(method,path,data);
  const input={action:'renameJobFile',path:'Invoices/Order.txt',expectedSha:sha};
  assert.equal((await request({...input,name:'other.txt'},{git:gitWithFiles})).status,409);
  assert.equal((await request({...input,name:'../Order.txt'},{git:gitWithFiles})).status,400);
  calls.length=0;
  assert.equal((await request({...input,name:'Updated order.txt'},{git:gitWithFiles})).status,200);
  assert.deepEqual(calls.find(([,path])=>path==='trees')[2].tree,[
    {path:source,mode:'100644',type:'blob',sha:null},
    {path:folder+'/Updated order.txt',mode:'100644',type:'blob',sha}
  ]);
  assert.equal(calls.some(([method,path])=>method==='POST'&&path==='blobs'),false);
  assert.deepEqual(calls.at(-1),['PATCH','refs/heads/main',{sha:'created',force:false}]);
});

test('delete rejects a changed file on retry and preserves a folder after deleting its last file',async()=>{
  const folder=root+'/Files/Invoices', source=folder+'/Order.txt';
  const input={action:'deleteJobFile',path:'Invoices/Order.txt',expectedSha:sha};
  let refAttempts=0;
  const gitWithFiles=async(method,path,data)=>{
    if(method==='GET'&&path.startsWith('trees/'))return {tree:[
      ...snapshot.tree,{path:source,mode:'100644',type:'blob',sha:refAttempts?'b'.repeat(40):sha}
    ]};
    if(method==='PATCH'){refAttempts++;throw Object.assign(Error('Head moved'),{status:422});}
    return git(method,path,data);
  };
  calls.length=0;
  assert.equal((await request(input,{git:gitWithFiles,login:'other'})).status,403);
  assert.equal((await request(input,{git:gitWithFiles})).status,409);
  assert.equal(refAttempts,1);
  assert.deepEqual(calls.find(([,path])=>path==='trees')[2].tree.map(entry=>[entry.path,entry.sha]),[
    [source,null],[folder+'/.harborflow-folder',undefined]
  ]);
  assert.equal(calls.filter(([method,path])=>method==='POST'&&path==='trees').length,1);
});
