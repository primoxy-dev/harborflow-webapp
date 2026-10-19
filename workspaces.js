/* Workspace navigation and read-only Service report. */
(() => {
  const sidebar = document.getElementById('primaryNav');
  if (!sidebar) return;
  const groups = [
    ['Operations', [['operations','Port Call Calendar','▦'],['allservices','Summary report','☷'],['alerts','Smart Alerts','⚑'],['outlook','Outlook','✉']]],
    ['Quotation & Payments', [['commercial','Quotation / PDA / FDA','◫'],['pv','Payment Voucher','▧'],['price','Price Master','¤'],['approvals','Approvals','✓']]]
  ];
  const title = document.getElementById('title');
  const crumb = document.getElementById('crumb');
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const empty = (heading, note) => `<div class="panel"><h2>${heading}</h2><p>ยังไม่มีตัวอย่างเผยแพร่</p><p class="small">${note}</p></div>`;
  const views = {
    commercial: '<div class="tabs" aria-label="Document types"><button type="button" class="tab active" data-doc-type="Quotation">Quotation</button><button type="button" class="tab" data-doc-type="PDA">PDA</button><button type="button" class="tab" data-doc-type="FDA">FDA</button></div>' + empty('Quotation / PDA / FDA','อนุมัติเอกสารและเผยแพร่ตัวอย่างเป็นคนละขั้นตอน · ฟอร์มและ workflow จะเพิ่มในระยะที่ 2'),
    pv: empty('Payment Voucher','สาธารณะเห็นเฉพาะตัวอย่างที่เจ้าของเลือกเผยแพร่ · ผู้รับเงิน บัญชีธนาคาร ต้นทุน และหลักฐานจ่ายไม่เปิดสาธารณะ · ดาวน์โหลด PV ต้องลงชื่อเข้าใช้'),
    price: empty('Published selling rates','เผยแพร่เฉพาะราคาขายที่เจ้าของตรวจ · ต้นทุน Supplier, Margin และกฎส่วนลดไม่เปิดสาธารณะ'),
    approvals: empty('Approvals','ข้อมูลการอนุมัติภายในต้องลงชื่อเข้าใช้ · ช่วงทดลองให้เจ้าของอนุมัติเท่านั้น'),
    allservices: '<div class="panel" role="status">กำลังโหลด Summary report…</div>'
  };
  for (const [id, html] of Object.entries(views)) {
    let section = document.getElementById(id);
    if (!section) { section = document.createElement('section'); section.id=id; section.className='view'; document.querySelector('.content').append(section); }
    section.innerHTML=html;
  }
  const anchor = sidebar.querySelector('.group');
  for (const [name, items] of groups) {
    const details=document.createElement('details'); details.className='workspace-group'; details.open=true;
    const summary=document.createElement('summary'); summary.textContent=name; details.append(summary);
    for (const [id,label,icon] of items) {
      let button=sidebar.querySelector(`[data-view="${id}"]`);
      if (!button) { button=document.createElement('button'); button.type='button'; button.className='nav'; button.dataset.view=id; }
      button.innerHTML=`<i aria-hidden="true">${icon}</i><span class="nav-label">${label}</span>`; button.setAttribute('aria-label',label); button.title=label;
      button.addEventListener('click',()=>{
        if(id==='outlook') { window.HarborFlowOutlook.open(); return; }
        document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
        sidebar.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b===button));
        title.textContent=label; crumb.textContent=name+' / '+label;
        if(id!=='operations') document.getElementById('createJob').hidden=true;
        if(id==='allservices') loadReport();
        if(window.matchMedia('(max-width: 900px)').matches) document.getElementById('closeNav').click();
      });
      details.append(button);
    }
    anchor.after(details);
  }
  // Insertion after the same anchor reverses order; put Operations first.
  anchor.after(sidebar.querySelectorAll('.workspace-group')[1]);
  const offlineLink=document.createElement('a');offlineLink.className='nav';offlineLink.href='/offline/';offlineLink.textContent='▧ Documents · Online / Offline';offlineLink.title='แบบฟอร์มบนเครื่อง · ข้อมูลสมมติเท่านั้น';
  sidebar.querySelector('.workspace-group').append(offlineLink);
  const marketing=sidebar.querySelector('[data-view="marketing"]');
  const business=document.createElement('div'); business.className='group'; business.textContent='Business Development';
  const last=sidebar.querySelectorAll('.workspace-group')[1]; last.after(business); business.after(marketing);
  document.getElementById('commercial').addEventListener('click',e=>{const b=e.target.closest('[data-doc-type]');if(!b)return;document.querySelectorAll('[data-doc-type]').forEach(x=>x.classList.toggle('active',x===b));document.querySelector('#commercial h2').textContent=b.dataset.docType;});
  let request=0, reportData=null, selectedJobId='', linked={people:[],trips:[]}, currentReport=null;
  const reportSection=document.getElementById('allservices');
  const reportApi=async(action,jobId)=>{
    const response=await fetch('/api/operations?'+new URLSearchParams({action,...(jobId ? {jobId} : {})}),{credentials:'same-origin',cache:'no-store'});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(Error(result.error||'โหลดข้อมูลไม่ได้ กรุณาลองใหม่'),{status:response.status});
    return result;
  };
  const availableJobs=()=>[...(reportData?.jobs||[])].sort((a,b)=>String(b.data?.eta||'').localeCompare(String(a.data?.eta||''))||String(a.data?.vessel||'').localeCompare(String(b.data?.vessel||'')));
  function renderReport(){
    if(!reportData)return;
    const jobs=availableJobs();
    if(!jobs.length){reportSection.innerHTML='<div class="panel hfs-report-shell"><h2>Summary report</h2><p>ยังไม่มี Port Call ในระบบ</p></div>';return;}
    if(!jobs.some(job=>job.id===selectedJobId))selectedJobId=jobs[0].id;
    currentReport=window.HarborFlowSummaryReport.build(reportData,selectedJobId,linked);
    const options=jobs.map(job=>`<option value="${escape(job.id)}" ${job.id===selectedJobId?'selected':''}>${escape([job.data?.vessel||'Unnamed vessel',job.data?.jobNo,job.data?.port,job.data?.eta?.slice(0,10)].filter(Boolean).join(' · '))}</option>`).join('');
    reportSection.innerHTML=`<div class="hfs-report-shell"><div class="hfs-report-toolbar"><div><span class="hfs-eyebrow">OPERATIONS</span><h2>Summary report</h2><p>ภาพรวม Service ทั้งหมดของหนึ่ง Port Call</p></div><div class="hfs-report-actions"><button type="button" class="secondary" data-report-refresh>↻ Refresh</button><button type="button" class="primary" data-report-download>↓ Download PDF</button></div></div><label class="hfs-job-selector"><span>เลือกเรือ / Port Call</span><select id="hfsReportJob" aria-label="Select vessel and Port Call">${options}</select></label><div class="hfs-report-paper">${window.HarborFlowSummaryReport.render(currentReport)}</div></div>`;
  }
  async function loadLinked(own){
    linked={people:[],trips:[]};
    if(reportData?.public)return;
    const grant=reportData.grant||{};
    const calls=[];
    if(grant.crewView||grant.visitorView)calls.push(reportApi('people',selectedJobId).then(data=>{if(own===request)linked.people=data.people||[];}));
    if(grant.crewView&&grant.visitorView)calls.push(reportApi('trips',selectedJobId).then(data=>{if(own===request)linked.trips=data.trips||[];}));
    await Promise.allSettled(calls);
  }
  async function chooseJob(jobId){
    if(!reportData?.jobs?.some(job=>job.id===jobId))return;
    selectedJobId=jobId;const own=++request;
    reportSection.querySelector('.hfs-report-paper').innerHTML='<div class="hfs-report-loading" role="status">กำลังโหลดรายละเอียด Port Call…</div>';
    await loadLinked(own);if(own===request)renderReport();
  }
  reportSection.addEventListener('change',event=>{if(event.target.id==='hfsReportJob')void chooseJob(event.target.value);});
  reportSection.addEventListener('click',event=>{
    if(event.target.closest('[data-report-refresh]')){void loadReport();return;}
    if(!event.target.closest('[data-report-download]')||!currentReport)return;
    try{window.HarborFlowSummaryReport.downloadPdf(currentReport);}catch(error){
      const note=document.createElement('div');note.className='hfs-report-error';note.setAttribute('role','alert');note.textContent=error.message;
      reportSection.querySelector('.hfs-report-toolbar')?.after(note);
    }
  });
  async function loadReport(){
    const own=++request;reportData=null;currentReport=null;linked={people:[],trips:[]};reportSection.innerHTML=views.allservices;
    try{
      let data;
      try{data=await reportApi('state');}
      catch(error){if(![401,403,503].includes(error.status))throw error;data=await reportApi('publicState');}
      if(own!==request)return;
      reportData=data;
      const jobs=availableJobs();
      if(!jobs.some(job=>job.id===selectedJobId))selectedJobId=jobs[0]?.id||'';
      if(selectedJobId)await loadLinked(own);
      if(own===request)renderReport();
    }catch(error){if(own===request)reportSection.innerHTML='<div class="panel hfs-report-error" role="alert">'+escape(error.message)+' <button type="button" class="secondary" data-report-refresh>ลองอีกครั้ง</button></div>';}
  }
})();
