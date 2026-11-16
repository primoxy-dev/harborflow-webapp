const storeName='jobs';
const missing=error=>error.name==='NotFoundError';
const lockName='harborflow-job-file-sync';
const readwrite={mode:'readwrite'};
const maximumFileBytes=3000000;

export async function gitBlobSha(blob) {
  const header=new TextEncoder().encode('blob '+blob.size+'\0');
  const bytes=new Blob([header,blob]);
  const hash=await crypto.subtle.digest('SHA-1',await bytes.arrayBuffer());
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function openDatabase() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('harborflow-onedrive',1);
    request.onupgradeneeded=()=>request.result.createObjectStore(storeName);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Close other HarborFlow tabs and try again.'));
  });
}

async function accessStore(mode, operation) {
  const db=await openDatabase();
  try{
    return await new Promise((resolve,reject)=>{
      const transaction=db.transaction(storeName,mode);
      const request=operation(transaction.objectStore(storeName));
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onabort=()=>reject(transaction.error||Error('Could not save OneDrive sync state.'));
    });
  }finally{db.close();}
}

async function fileLocation(root,path,create) {
  const parts=path.split('/');
  const name=parts.pop();
  let parent=root;
  for(const part of parts)parent=await parent.getDirectoryHandle(part,{create});
  return {parent,name};
}

async function getFile(parent,name) {
  try{return await (await parent.getFileHandle(name)).getFile();}
  catch(error){if(!missing(error))throw error;return null;}
}

async function writeFile(parent,name,blob) {
  const handle=await parent.getFileHandle(name,{create:true});
  const writer=await handle.createWritable();
  try{await writer.write(blob);await writer.close();}
  catch(error){await writer.abort().catch(()=>{});throw error;}
}

async function checkCopy(file,sha,message) {
  if(file&&(file.size>maximumFileBytes||await gitBlobSha(file)!==sha))throw Error(message);
}

async function applyRename(root,change) {
  const {parent,name}=await fileLocation(root,change.path,true);
  const from=change.from.split('/').at(-1);
  const sameName=from.toLowerCase()===name.toLowerCase();
  let oldFile,newFile;
  if(sameName){
    // A case-insensitive folder may resolve both spellings to the same file.
    for await(const entryName of parent.keys()){
      if(entryName===from)oldFile=await getFile(parent,from);
      if(entryName===name)newFile=await getFile(parent,name);
    }
  }else{
    oldFile=await getFile(parent,from);
    newFile=await getFile(parent,name);
  }
  await checkCopy(oldFile,change.sha,'The OneDrive copy was changed.');
  await checkCopy(newFile,change.sha,'A different file already exists in OneDrive.');
  if(sameName&&oldFile&&!newFile){
    await parent.removeEntry(from);
    await writeFile(parent,name,change.blob);
    return;
  }
  if(!newFile)await writeFile(parent,name,change.blob);
  if(oldFile){
    await checkCopy(await getFile(parent,from),change.sha,'The OneDrive copy was changed.');
    try{await parent.removeEntry(from);}catch(error){if(!missing(error))throw error;}
  }
}

async function applyChange(root,change) {
  if(change.type==='rename')return applyRename(root,change);
  if(change.type==='folder'){
    const {parent,name}=await fileLocation(root,change.path,true);
    await parent.getDirectoryHandle(name,{create:true});
    return;
  }
  let location;
  try{location=await fileLocation(root,change.path,change.type!=='delete');}
  catch(error){if(change.type==='delete'&&missing(error))return;throw error;}
  const {parent,name}=location;
  const current=await getFile(parent,name);
  if(change.type==='delete'){
    if(!current)return;
    await checkCopy(current,change.previousSha,'The OneDrive copy was changed.');
    await parent.removeEntry(name);
    return;
  }
  const currentSha=current&&current.size<=maximumFileBytes?await gitBlobSha(current):null;
  if(currentSha===change.sha)return;
  if(current&&currentSha!==change.previousSha)throw Error('A different file already exists in OneDrive.');
  await writeFile(parent,name,change.blob);
}

export function createJobFileSync(login,jobId) {
  const key=JSON.stringify([login,jobId]);
  const read=()=>accessStore('readonly',store=>store.get(key));
  const save=state=>accessStore('readwrite',store=>store.put(state,key));
  const lock=callback=>navigator.locks.request(lockName,callback);
  return {
    read,
    connect:directory=>lock(async()=>{
      if(await read())throw Error('This Job already has a connected folder.');
      const accounts=await accessStore('readonly',store=>store.getAll());
      for(const other of accounts){
        if(await directory.isSameEntry(other.directory)||await directory.resolve(other.directory)||await other.directory.resolve(directory)){
          throw Error('Select a separate OneDrive folder for this Job.');
        }
      }
      await save({directory,pending:[]});
    }),
    disconnect:()=>lock(async()=>{
      const state=await read();
      if(state?.pending.length)throw Error('Retry pending changes or clear them before disconnecting.');
      await accessStore('readwrite',store=>store.delete(key));
    }),
    clear:()=>lock(async()=>{
      const state=await read();
      if(state)await save({...state,pending:[]});
    }),
    mutate:(saveJob,makeChanges,expectedDirectory)=>lock(async()=>{
      const state=await read();
      if(expectedDirectory&&(!state||!await expectedDirectory.isSameEntry(state.directory))){
        throw Error('The connected folder changed. Reopen this Job and try again.');
      }
      if(!state)return saveJob();
      const changes=await makeChanges();
      if(!changes.length)return saveJob();
      const item={changes,confirmed:false};
      state.pending.push(item);
      await save(state);
      let result;
      try{result=await saveJob();}
      catch(error){
        if(error.code>=400&&error.code<500){
          state.pending.pop();
          await save(state);
        }
        throw error;
      }
      item.confirmed=true;
      // The prepared entry remains recoverable if confirmation could not be stored.
      await save(state).catch(()=>{});
      return result;
    }),
    flush:(verify,active)=>lock(async()=>{
      const state=await read();
      if(!state?.pending.length)return '';
      if(await state.directory.queryPermission(readwrite)!=='granted')return 'Allow access to resume sync.';
      const blocked=new Set();
      let problem='';
      for(let index=0;index<state.pending.length;){
        if(!active())break;
        const item=state.pending[index];
        const paths=item.changes.flatMap(change=>[change.path,...(change.from?[change.from]:[])]).map(path=>path.toLowerCase());
        if(paths.some(path=>blocked.has(path))){paths.forEach(path=>blocked.add(path));index++;continue;}
        try{
          if(item.confirmed||await verify(item.changes)){
            for(const change of item.changes)await applyChange(state.directory,change);
          }
          state.pending.splice(index,1);
          await save(state);
        }catch(error){
          paths.forEach(path=>blocked.add(path));
          problem||=item.changes[0].path+' · '+error.message;
          index++;
        }
      }
      return problem;
    })
  };
}
