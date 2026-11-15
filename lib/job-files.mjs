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

async function createEntry({root, jobId, target, content, git}) {
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
    const parent=target.slice(0,target.lastIndexOf('/'));
    if(entries.some(entry=>entry.path===parent && entry.type!=='tree') || (parent!==root+'/Files' && !entries.some(entry=>entry.path===parent && entry.type==='tree')))return json({error:'Folder not found.'},404);
    const sameName=entries.find(entry=>entry.path.slice(0,entry.path.lastIndexOf('/'))===parent &&
      entry.path.toLowerCase()===target.toLowerCase());
    if(sameName)return json({error:'An item with that name already exists.'},409);
    const folder=content===null;
    const tree=await git('POST','trees',{base_tree:commit.tree.sha,tree:[{
      path:target+(folder?'/'+markerName:''),mode:'100644',type:'blob',
      ...(folder?{content:'HarborFlow folder\n'}:{sha:(await git('POST','blobs',{content,encoding:'base64'})).sha})
    }]});
    const next=await git('POST','commits',{message:folder?'Create Job file folder':'Upload Job file',tree:tree.sha,parents:[head]});
    try { await git('PATCH','refs/heads/main',{sha:next.sha,force:false});return json({created:true},201); }
    catch(error){if(![409,422].includes(error.status))throw error;}
  }
  return json({error:'The file list changed. Try again.'},409);
}

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
          name:item.name,kind:item.type==='dir'?'folder':'file',size:item.size
        }))});
      }
      if(!relative)return fail('File not found.',404);
      const parent=await contents('GET',path.slice(0,path.lastIndexOf('/')));
      const name=relative.split('/').at(-1);
      const entry=Array.isArray(parent)?parent.find(item=>item.type==='file' && item.name===name):null;
      if(!entry || !/^[a-f0-9]{40}$/.test(entry.sha))return fail('File not found.',404);
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
    if(relative.length+input.name?.length+1>1000 || !validName(input.name))return fail('Enter a valid Windows and OneDrive file or folder name.');
    const folder=input.action==='createJobFileFolder';
    if(!folder && (typeof input.content!=='string'||input.content.length>4000000||(input.content.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.content))
      ||Buffer.byteLength(input.content,'base64')>maximumBytes))return fail('Choose a file up to 3 MB.');
    return await createEntry({root,jobId:job.id,target:path+'/'+input.name,content:folder?null:input.content,git});
  }catch{
    return fail('The private Job file store is unavailable. Try again.',502);
  }
}
