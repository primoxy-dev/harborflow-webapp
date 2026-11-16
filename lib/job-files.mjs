import { gh, gitData, json, readJson } from './harborflow.mjs';
import { canEditJob } from './operations.mjs';

const markerName='.harborflow-folder';
const maximumBytes=3000000;
const validName=name=>typeof name==='string' && name.length>0 && name.length<=160 &&
  name===name.trim() && !name.startsWith('.') && !name.endsWith('.') &&
  !/[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
export function jobFilePath(path='') {
  if (typeof path!=='string' || path.length>1000 || (path && !path.split('/').every(validName))) throw Error('Invalid file or folder path.');
  return path;
}

async function updateEntries({root, jobId, git, message, changes, success, status}) {
  for(let attempt=0;attempt<3;attempt++){
    const head=(await git('GET','ref/heads/main')).object.sha;
    const commit=await git('GET','commits/'+head);
    const snapshot=await git('GET','trees/'+commit.tree.sha+'?recursive=1');
    if(snapshot.truncated)return json({error:'The document index is too large to update safely.'},503);
    const entries=snapshot.tree;
    const marker=entries.find(entry=>entry.path===root+'/General/job.json');
    if(!marker)return json({error:'The Job folder moved. Reopen the Job and try again.'},409);
    const jobMarker=await git('GET','blobs/'+marker.sha);
    if(JSON.parse(Buffer.from(jobMarker.content,'base64').toString()).operationJobId!==jobId)return json({error:'Job folder mismatch.'},409);
    const edits=await changes(entries);
    if(edits instanceof Response)return edits;
    const tree=await git('POST','trees',{base_tree:commit.tree.sha,tree:edits});
    const next=await git('POST','commits',{message,tree:tree.sha,parents:[head]});
    try { await git('PATCH','refs/heads/main',{sha:next.sha,force:false});return json(success,status); }
    catch(error){if(![409,422].includes(error.status))throw error;}
  }
  return json({error:'The file list changed. Try again.'},409);
}

const parentPath=path=>path.slice(0,path.lastIndexOf('/'));
const takenName=(entries,path,except)=>entries.some(entry=>entry.path!==except && parentPath(entry.path)===parentPath(path) &&
  entry.path.toLowerCase()===path.toLowerCase());
const nameConflict=()=>json({error:'An item with that name already exists.'},409);
const folderMarker=parent=>({path:parent+'/'+markerName,mode:'100644',type:'blob',content:'HarborFlow folder\n'});
const fileSha=value=>typeof value==='string' && /^[a-f0-9]{40}$/.test(value);

export async function jobFilesRoute({job,grant,login,input, contents=gh, git=gitData, marker=readJson}) {
  const fail=(message,status=400)=>json({error:message},status);
  if(!job)return fail('Job not found.',404);
  if(!canEditJob(grant,login,job))return fail('Job file access requires the owner or assigned Job editor.',403);
  const root=job.data.documentsPath;
  if(!root?.startsWith('Jobs/'))return fail('Create the GitHub Job folder before adding files.',409);
  let relative;
  try{relative=jobFilePath(input.path??'');}catch(error){return fail(error.message);}
  const base=root+'/Files', path=base+(relative?'/'+relative:'');
  try {
    if(['jobFiles','downloadJobFile','previewJobEmail'].includes(input.action)){
      if((await marker(root+'/General/job.json'))?.data.operationJobId!==job.id)return fail('Job folder mismatch. Reopen the Job.',409);
      if(input.action==='jobFiles'){
        const entry=await contents('GET',path);
        if(!entry&&!relative)return json({entries:[]});
        if(!Array.isArray(entry))return fail('Folder not found.',404);
        return json({entries:entry.filter(item=>['dir','file'].includes(item.type)&&validName(item.name)).map(item=>({
          name:item.name,kind:item.type==='dir'?'folder':'file',size:item.size,sha:item.type==='file'?item.sha:undefined
        }))});
      }
      if(!relative)return fail('File not found.',404);
      const parent=await contents('GET',path.slice(0,path.lastIndexOf('/')));
      const name=relative.split('/').at(-1);
      const entry=Array.isArray(parent)?parent.find(item=>item.type==='file' && item.name===name):null;
      if(!entry || !fileSha(entry.sha))return fail('File not found.',404);
      if(entry.size>maximumBytes)return fail('Download files larger than 3 MB from the private GitHub folder.',413);
      const blob=await git('GET','blobs/'+entry.sha);
      if(blob.encoding!=='base64')return fail('File could not be read.',502);
      const bytes=Buffer.from(blob.content,'base64');
      if(bytes.length>maximumBytes)return fail('File exceeds the 3 MB limit.',413);
      if(input.action==='previewJobEmail'){
        if(!/\.msg$/i.test(name))return fail('Select an Outlook .msg file.');
        try{
          const {readMessagePreview}=await import('./provision-email-preview.mjs');
          const {html,...message}=readMessagePreview(bytes);
          return json({message});
        }catch{return fail('This email cannot be previewed. Download the original and open it in Outlook.',422);}
      }
      const filename=encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
      return new Response(bytes,{headers:{
        'Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff',
        'Cache-Control':'private, no-store','Content-Disposition':"attachment; filename*=UTF-8''"+filename
      }});
    }
    const rename=input.action==='renameJobFile', remove=input.action==='deleteJobFile';
    if(rename||remove){
      if(!relative||!fileSha(input.expectedSha))return fail('Refresh the file list and try again.');
      const parent=parentPath(path);
      const destination=rename?parent+'/'+input.name:'';
      if(rename && (!validName(input.name)||destination.length-base.length-1>1000))return fail('Enter a valid Windows and OneDrive file name.');
      return await updateEntries({root,jobId:job.id,git,message:rename?'Rename Job file':'Delete Job file',
        success:rename?{renamed:true}:{deleted:true},status:200,
        changes:entries=>{
          const source=entries.find(entry=>entry.path===path && entry.type==='blob' && ['100644','100755'].includes(entry.mode));
          if(!source||source.sha!==input.expectedSha)return fail('The file changed. Refresh the file list and try again.',409);
          if(rename && destination===path)return json({renamed:true});
          if(rename && takenName(entries,destination,path))return nameConflict();
          const edits=[{path,mode:source.mode,type:'blob',sha:null}];
          if(rename)edits.push({path:destination,mode:source.mode,type:'blob',sha:source.sha});
          else if(parent!==base && !entries.some(entry=>entry.path!==path && entry.path.startsWith(parent+'/')))edits.push(folderMarker(parent));
          return edits;
        }});
    }
    if(relative.length+input.name?.length+1>1000 || !validName(input.name))return fail('Enter a valid Windows and OneDrive file or folder name.');
    const folder=input.action==='createJobFileFolder';
    if(!folder && (typeof input.content!=='string'||input.content.length>4000000||(input.content.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.content))
      ||Buffer.byteLength(input.content,'base64')>maximumBytes))return fail('Choose a file up to 3 MB.');
    const target=path+'/'+input.name;
    return await updateEntries({root,jobId:job.id,git,message:folder?'Create Job file folder':'Upload Job file',success:{created:true},status:201,
      changes:async entries=>{
        if(entries.some(entry=>entry.path===path && entry.type!=='tree') ||
          (path!==base && !entries.some(entry=>entry.path===path && entry.type==='tree')))return fail('Folder not found.',404);
        if(takenName(entries,target))return nameConflict();
        return [folder?folderMarker(target):{path:target,mode:'100644',type:'blob',
          sha:(await git('POST','blobs',{content:input.content,encoding:'base64'})).sha}];
      }});
  }catch{
    return fail('The private Job file store is unavailable. Try again.',502);
  }
}
