const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const join=(path,name)=>path?path+'/'+name:name;
const maximumBytes=3000000;
const previewTypes=new Map(Object.entries({
  pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
  webp:'image/webp', bmp:'image/bmp', avif:'image/avif',
  txt:'text/plain', csv:'text/plain', tsv:'text/plain', log:'text/plain', md:'text/plain',
  json:'text/plain', xml:'text/plain', html:'text/plain', svg:'text/plain'
}));
const fileSize=bytes=>bytes<1000?bytes+' B':bytes<1000000?(bytes/1000).toFixed(1)+' KB':(bytes/1000000).toFixed(1)+' MB';
const encodeFile=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result).split(',')[1]);
  reader.onerror=()=>reject(Error('Could not read '+file.name+'.'));
  reader.readAsDataURL(file);
});

export async function mountJobFiles(host,{jobId,api}) {
  let path='',entries=[],busy=false,loaded=false;
  const list=async path=>(await api('jobFiles',{jobId,path},'GET')).entries;
  const download=path=>'/api/operations?'+new URLSearchParams({action:'downloadJobFile',jobId,path});
  host.innerHTML=`<div class="hfo-toolbar"><nav data-file-path aria-label="File location"></nav>
    <div class="hfo-row hfo-file-tools">
      <button class="hfo-btn" type="button" data-new-folder>New folder</button>
      <button class="hfo-btn primary" type="button" data-upload-files>Upload files</button>
      <button class="hfo-btn" type="button" data-copy-onedrive>Sync to OneDrive</button>
      <button class="hfo-btn" type="button" data-refresh-files>Refresh</button>
      <input type="file" multiple hidden data-file-input>
    </div></div>
    <p data-file-status role="status"></p>
    <div class="hfo-job-file-drop" data-file-drop>
      <div data-file-list></div>
      <p class="hfo-file-drop-hint">Drop files here to upload · Up to 3 MB per file</p>
    </div>`;
  const crumbs=host.querySelector('[data-file-path]');
  const rows=host.querySelector('[data-file-list]');
  const dropZone=host.querySelector('[data-file-drop]');
  const status=host.querySelector('[data-file-status]');
  const fileInput=host.querySelector('[data-file-input]');
  const report=(message,error=false)=>{status.textContent=message;status.classList.toggle('hfo-alert',error);};
  function controls() {
    host.querySelectorAll('[data-new-folder],[data-upload-files],[data-copy-onedrive],[data-file-open],[data-file-view],[data-file-level],[data-refresh-files]').forEach(button=>{
      button.disabled=busy||(!loaded&&!button.hasAttribute('data-refresh-files'));
    });
  }
  async function refresh(next=path) {
    const nextEntries=await list(next);
    path=next;
    entries=nextEntries.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==='folder'?-1:1);
    const parts=path?path.split('/'):[];
    crumbs.innerHTML=['Files',...parts].map((label,i)=>`<button class="hfo-btn" type="button" data-file-level="${i}" ${i===parts.length?'aria-current="page"':''}>${escape(label)}</button>`).join('<span aria-hidden="true">/</span>');
    rows.innerHTML=entries.length?`<ul class="hfo-file-list">${entries.map((entry,index)=>{
      const name=escape(entry.name);
      if(entry.kind==='folder')return `<li class="hfo-file-tile">
        <button class="hfo-file-name" type="button" data-file-open="${index}">
          <span class="hfo-file-icon hfo-file-icon-folder" aria-hidden="true"></span>
          <span>${name}</span>
        </button>
        <small>Folder</small>
      </li>`;
      const suffix=entry.name.includes('.')?entry.name.split('.').at(-1).toUpperCase():'';
      const extension=/^[A-Z0-9]{1,5}$/.test(suffix)?suffix:'FILE';
      const url=escape(download(join(path,entry.name)));
      return `<li class="hfo-file-tile" draggable="true" data-file-drag="${index}">
        <a class="hfo-file-name" href="${url}" download="${name}" draggable="false" title="Download ${name}">
          <span class="hfo-file-icon hfo-file-icon-document" data-file-extension="${extension}" aria-hidden="true">${extension}</span>
          <span>${name}</span>
        </a>
        <div class="hfo-file-row-actions">
          <small>${fileSize(entry.size||0)}</small>
          <button type="button" class="hfo-btn" data-file-view="${index}" aria-label="View ${name}">View</button>
        </div>
      </li>`;
    }).join('')}</ul>`:'<p class="hfo-file-empty hfo-muted">This folder is empty.</p>';
    loaded=true;
  }
  async function run(action,{loading='Working…'}={}) {
    if(busy)return;
    busy=true;controls();report(loading);
    try{await action();}
    catch(error){if(error.name==='AbortError')report('');else report(error.message,true);}
    finally{busy=false;controls();}
  }
  function upload(files){
    if(!files.length||!loaded||busy)return;
    void run(async()=>{
      const failures=[];
      for(const file of files){
        if(!host.isConnected)break;
        try{
          if(file.size>maximumBytes)throw Error('File exceeds 3 MB');
          await api('uploadJobFile',{jobId,path,name:file.name,content:await encodeFile(file)});
        }catch(error){failures.push(file.name+' · '+error.message);}
      }
      await refresh();
      report('Uploaded '+(files.length-failures.length)+' of '+files.length+'. '+failures.join(' · '),Boolean(failures.length));
    },{loading:'Uploading files…'});
  }
  fileInput.onchange=()=>{
    const files=[...fileInput.files];fileInput.value='';
    upload(files);
  };
  host.addEventListener('dragover',event=>{
    if(!event.dataTransfer?.types.includes('Files'))return;
    event.preventDefault();
    event.dataTransfer.dropEffect=loaded&&!busy?'copy':'none';
    if(loaded&&!busy)dropZone.classList.add('is-dragging');
  });
  host.addEventListener('dragleave',event=>{
    if(!(event.relatedTarget instanceof Node)||!host.contains(event.relatedTarget))dropZone.classList.remove('is-dragging');
  });
  host.addEventListener('drop',event=>{
    if(!event.dataTransfer?.types.includes('Files'))return;
    event.preventDefault();dropZone.classList.remove('is-dragging');
    if([...event.dataTransfer.items].some(item=>item.webkitGetAsEntry?.()?.isDirectory)){
      report('Drop files into this folder. Use New folder to create folders in HarborFlow.',true);return;
    }
    upload([...event.dataTransfer.files]);
  });
  host.addEventListener('dragstart',event=>{
    const tile=event.target.closest('[data-file-drag]');
    if(!tile||!event.dataTransfer)return;
    const entry=entries[Number(tile.dataset.fileDrag)];
    const link=tile.querySelector('a[download]');
    event.dataTransfer.clearData();
    event.dataTransfer.effectAllowed='copy';
    event.dataTransfer.setData('DownloadURL','application/octet-stream:'+entry.name+':'+link.href);
  });
  async function copyToOneDrive() {
    if(typeof window.showDirectoryPicker!=='function')throw Error('Use desktop Chrome or Edge to select your synced OneDrive folder.');
    const destination=await window.showDirectoryPicker({mode:'readwrite'});
    if(!host.isConnected)return;
    if(!window.confirm('Copy the contents of this HarborFlow folder to “'+destination.name+'”? Choose a private folder in your synced OneDrive. Existing files will be skipped.')){report('');return;}
    let copied=0,skipped=0;
    const failures=[];
    async function copy(directory, source){
      for(const entry of await list(source)){
        if(!host.isConnected)return;
        const from=join(source,entry.name);
        report('Copying '+from+'…');
        try{
          if(entry.kind==='folder'){
            await copy(await directory.getDirectoryHandle(entry.name,{create:true}),from);
            continue;
          }
          try{await directory.getFileHandle(entry.name);skipped++;continue;}
          catch(error){if(error.name!=='NotFoundError')throw error;}
          const response=await fetch(download(from),{credentials:'same-origin'});
          if(!response.ok)throw Error('Could not download file');
          const bytes=await response.blob();
          if(!host.isConnected)return;
          try{await directory.getFileHandle(entry.name);skipped++;continue;}
          catch(error){if(error.name!=='NotFoundError')throw error;}
          const file=await directory.getFileHandle(entry.name,{create:true});
          const writer=await file.createWritable();
          try{await writer.write(bytes);await writer.close();}
          catch(error){await writer.abort().catch(()=>{});throw error;}
          copied++;
        }catch(error){failures.push(from+' · '+error.message);}
      }
    }
    await copy(destination,path);
    report('Copied '+copied+' · Skipped '+skipped+' existing · Failed '+failures.length+
      (failures.length?' · '+failures.join(' · '):''),Boolean(failures.length));
  }
  host.onclick=event=>{
    const button=event.target.closest('button');
    if(!button||busy)return;
    if(button.hasAttribute('data-file-view')){
      const entry=entries[Number(button.dataset.fileView)],filePath=join(path,entry.name);
      void viewJobFile(host,button,entry,download(filePath),()=>api('previewJobEmail',{jobId,path:filePath},'GET'));
      return;
    }
    if(button.hasAttribute('data-refresh-files')){void run(async()=>{await refresh();report('');});return;}
    if(button.hasAttribute('data-upload-files')){fileInput.click();return;}
    if(button.hasAttribute('data-copy-onedrive')){void run(copyToOneDrive);return;}
    if(button.hasAttribute('data-new-folder')){
      const name=window.prompt('Folder name')?.trim();
      if(!name)return;
      void run(async()=>{await api('createJobFileFolder',{jobId,path,name});await refresh();report('Folder created.');});return;
    }
    const next=button.hasAttribute('data-file-level')?path.split('/').slice(0,Number(button.dataset.fileLevel)).join('/'):
      button.hasAttribute('data-file-open')?join(path,entries[Number(button.dataset.fileOpen)].name):null;
    if(next!==null)void run(async()=>{await refresh(next);report('');});
  };
  controls();
  await run(async()=>{await refresh();report('');},{loading:'Loading files…'});
}

async function viewJobFile(host,trigger,entry,url,loadEmail) {
  const dialog=document.createElement('dialog');
  dialog.className='hfo-job-file-view';
  dialog.setAttribute('aria-label','File preview');
  dialog.innerHTML='<form method="dialog" class="hfo-toolbar"><h3></h3><button class="hfo-btn">Close</button></form><p role="status">Loading preview…</p><div data-preview-body></div><a class="hfo-btn" download>Download</a>';
  dialog.querySelector('h3').textContent=entry.name;
  const download=dialog.querySelector('a');
  download.href=url;download.download=entry.name;
  const status=dialog.querySelector('[role="status"]'),body=dialog.querySelector('[data-preview-body]');
  let objectUrl;
  const controller=new AbortController();
  dialog.addEventListener('close',()=>{
    controller.abort();
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    dialog.remove();trigger.focus();
  },{once:true});
  host.append(dialog);
  dialog.showModal();
  const extension=entry.name.split('.').at(-1).toLowerCase();
  const type=previewTypes.get(extension);
  try {
    if(extension==='msg'){
      const {message}=await loadEmail();
      if(!dialog.open)return;
      const title=document.createElement('h4');title.textContent=message.subject||'No subject';body.append(title);
      const metadata=document.createElement('p');
      metadata.textContent=[message.from&&'From: '+message.from,message.to&&'To: '+message.to,message.cc&&'CC: '+message.cc,message.date&&'Date: '+message.date].filter(Boolean).join('\n');
      if(metadata.textContent)body.append(metadata);
      appendPlainText(body,message.body||'Download the original email to read its full content in Outlook.');
    }else{
      if(!type){status.textContent='Download this file and open it in its desktop app.';return;}
      if(entry.size>maximumBytes)throw Error('This file exceeds the preview size limit.');
      const response=await fetch(url,{credentials:'same-origin',signal:controller.signal});
      if(!response.ok)throw Error('Could not load the preview.');
      const bytes=await response.blob();
      if(!dialog.open)return;
      if(type==='text/plain')appendPlainText(body,await bytes.text());
      else{
        if(type==='application/pdf' && await bytes.slice(0,5).text()!=='%PDF-')throw Error('This file is not a PDF.');
        if(!dialog.open)return;
        objectUrl=URL.createObjectURL(new Blob([bytes],{type}));
        const preview=document.createElement(type.startsWith('image/')?'img':'iframe');
        if(type.startsWith('image/')){
          preview.alt=entry.name;
          preview.addEventListener('error',()=>{preview.remove();status.hidden=false;status.textContent='This image could not be previewed.';},{once:true});
        }else preview.title=entry.name;
        preview.src=objectUrl;body.append(preview);
      }
    }
    status.hidden=true;
  }catch(error){if(dialog.open)status.textContent=error.message;}
}
function appendPlainText(parent,text){
  const content=document.createElement('pre');
  content.textContent=text;
  parent.append(content);
}
