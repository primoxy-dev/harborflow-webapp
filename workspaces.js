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
    commercial: '<div class="panel" role="status">กำลังโหลด Quotation…</div>',
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
        if(id==='commercial') window.HarborFlowQuotation?.open();
        if(window.matchMedia('(max-width: 900px)').matches) document.getElementById('closeNav').click();
      });
      details.append(button);
    }
    anchor.after(details);
  }
  // Insertion after the same anchor reverses order; put Operations first.
  anchor.after(sidebar.querySelectorAll('.workspace-group')[1]);
  const n8nLink=document.createElement('a'); n8nLink.className='nav'; n8nLink.href='http://localhost:5678/'; n8nLink.target='_blank'; n8nLink.rel='noopener noreferrer'; n8nLink.innerHTML='<i aria-hidden="true">⚙</i><span class="nav-label">n8n</span>'; n8nLink.title='เปิด n8n ที่ติดตั้งบนเครื่องนี้'; n8nLink.setAttribute('aria-label','เปิด n8n ที่ติดตั้งบนเครื่องนี้'); sidebar.querySelector('.workspace-group').append(n8nLink);
  const offlineLink=document.createElement('a');offlineLink.className='nav';offlineLink.href='/offline/';offlineLink.textContent='▧ Documents · Online / Offline';offlineLink.title='แบบฟอร์มบนเครื่อง · ข้อมูลสมมติเท่านั้น';
  sidebar.querySelector('.workspace-group').append(offlineLink);
  const marketing=sidebar.querySelector('[data-view="marketing"]');
  const business=document.createElement('div'); business.className='group'; business.textContent='Business Development';
  const last=sidebar.querySelectorAll('.workspace-group')[1]; last.after(business); business.after(marketing);
  let request=0, reportData=null, selectedJobId='', selectedYear='', selectedMonth='', linked={people:[],trips:[]}, currentReport=null;
  const reportSection=document.getElementById('allservices');
  const reportApi=async(action,jobId)=>{
    const response=await fetch('/api/operations?'+new URLSearchParams({action,...(jobId ? {jobId} : {})}),{credentials:'same-origin',cache:'no-store'});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(Error(result.error||'โหลดข้อมูลไม่ได้ กรุณาลองใหม่'),{status:response.status});
    return result;
  };
  const availableJobs=()=>[...(reportData?.jobs||[])].sort((a,b)=>String(b.data?.eta||'').localeCompare(String(a.data?.eta||''))||String(a.data?.vessel||'').localeCompare(String(b.data?.vessel||'')));
  const jobPeriod=job=>{const match=String(job?.data?.eta||'').match(/^(\d{4})-(\d{2})/);return {year:match?.[1]||'Unknown',month:match?.[2]||'Unknown'};};
  const monthLabel=value=>value==='Unknown'?'ไม่ระบุเดือน':new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(new Date(`2020-${value}-01T00:00:00Z`));
  const jobsInPeriod=()=>availableJobs().filter(job=>{const period=jobPeriod(job);return period.year===selectedYear&&period.month===selectedMonth;});
  function renderReport(){
    if(!reportData)return;
    const allJobs=availableJobs();
    if(!allJobs.length){reportSection.innerHTML='<div class="panel hfs-report-shell"><h2>Summary report</h2><p>ยังไม่มี Port Call ในระบบ</p></div>';return;}
    const selected=allJobs.find(job=>job.id===selectedJobId)||allJobs[0],selectedPeriod=jobPeriod(selected);
    if(!selectedYear)selectedYear=selectedPeriod.year;
    const yearJobs=allJobs.filter(job=>jobPeriod(job).year===selectedYear);
    const months=[...new Set(yearJobs.map(job=>jobPeriod(job).month))].sort((a,b)=>b.localeCompare(a));
    if(!months.includes(selectedMonth))selectedMonth=selectedPeriod.year===selectedYear&&months.includes(selectedPeriod.month)?selectedPeriod.month:months[0];
    const jobs=jobsInPeriod();
    if(!jobs.some(job=>job.id===selectedJobId))selectedJobId=jobs[0].id;
    currentReport=window.HarborFlowSummaryReport.build(reportData,selectedJobId,linked);
    const years=[...new Set(allJobs.map(job=>jobPeriod(job).year))].sort((a,b)=>b.localeCompare(a));
    const yearOptions=years.map(year=>`<option value="${escape(year)}" ${year===selectedYear?'selected':''}>${escape(year)} (${allJobs.filter(job=>jobPeriod(job).year===year).length})</option>`).join('');
    const monthOptions=months.map(month=>`<option value="${escape(month)}" ${month===selectedMonth?'selected':''}>${escape(monthLabel(month))} (${yearJobs.filter(job=>jobPeriod(job).month===month).length})</option>`).join('');
    const options=jobs.map(job=>`<option value="${escape(job.id)}" ${job.id===selectedJobId?'selected':''}>${escape([job.data?.vessel||'Unnamed vessel',job.data?.jobNo,job.data?.port,job.data?.eta?.slice(0,10)].filter(Boolean).join(' · '))}</option>`).join('');
    reportSection.innerHTML=`<div class="hfs-report-shell"><div class="hfs-report-toolbar"><div><span class="hfs-eyebrow">OPERATIONS</span><h2>Summary report</h2><p>ภาพรวม Service ทั้งหมดของหนึ่ง Port Call</p></div><div class="hfs-report-actions"><button type="button" class="secondary" data-report-refresh>↻ Refresh</button><label class="hfs-export-format"><span>Export</span><select data-report-format aria-label="Export format"><option value="pdf">PDF</option><option value="xlsx">Excel (.xlsx)</option><option value="png">Image (.png)</option></select></label><button type="button" class="primary" data-report-download>↓ Download</button></div></div><div class="hfs-report-filters"><label><span>ปี</span><select id="hfsReportYear" aria-label="Select year">${yearOptions}</select></label><label><span>เดือน</span><select id="hfsReportMonth" aria-label="Select month">${monthOptions}</select></label><label class="hfs-job-selector"><span>เลือกเรือ / Port Call</span><select id="hfsReportJob" aria-label="Select vessel and Port Call">${options}</select></label></div><div class="hfs-report-paper">${window.HarborFlowSummaryReport.render(currentReport)}</div></div>`;
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
  async function choosePeriod(year,month){
    selectedYear=year||selectedYear;const yearMonths=[...new Set(availableJobs().filter(job=>jobPeriod(job).year===selectedYear).map(job=>jobPeriod(job).month))].sort((a,b)=>b.localeCompare(a));
    selectedMonth=yearMonths.includes(month)?month:yearMonths[0]||'';const next=jobsInPeriod()[0];if(next)await chooseJob(next.id);else renderReport();
  }
  reportSection.addEventListener('change',event=>{
    if(event.target.id==='hfsReportJob'){void chooseJob(event.target.value);return;}
    if(event.target.id==='hfsReportYear'){void choosePeriod(event.target.value,'');return;}
    if(event.target.id==='hfsReportMonth')void choosePeriod(selectedYear,event.target.value);
  });
  reportSection.addEventListener('click',event=>{
    if(event.target.closest('[data-report-refresh]')){void loadReport();return;}
    if(!event.target.closest('[data-report-download]')||!currentReport)return;
    const format=reportSection.querySelector('[data-report-format]')?.value||'pdf';
    void window.HarborFlowSummaryReport.download(currentReport,format).catch(error=>{
      const note=document.createElement('div');note.className='hfs-report-error';note.setAttribute('role','alert');note.textContent=error.message;
      reportSection.querySelector('.hfs-report-toolbar')?.after(note);
    });
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
      if(selectedJobId){const period=jobPeriod(jobs.find(job=>job.id===selectedJobId));selectedYear=period.year;selectedMonth=period.month;}
      if(selectedJobId)await loadLinked(own);
      if(own===request)renderReport();
    }catch(error){if(own===request)reportSection.innerHTML='<div class="panel hfs-report-error" role="alert">'+escape(error.message)+' <button type="button" class="secondary" data-report-refresh>ลองอีกครั้ง</button></div>';}
  }
})();
