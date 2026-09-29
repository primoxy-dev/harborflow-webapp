/* Trial document review. No person identifiers are returned by the preview API. */
(() => {
  const section = document.getElementById('documents');
  const nav = document.querySelector('[data-view="documents"]');
  if (!section || !nav) return;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let jobs = [], type = 'oktb', jobId = '', request = 0;
  const labels = { oktb: 'OKTB', permit: 'Terminal Permit', loi: 'LOI' };
  const row = (label, value) => `<div class="hfd-field"><span>${escape(label)}</span><strong>${escape(value || 'ยังไม่มีข้อมูล')}</strong></div>`;
  async function get(params) {
    const response = await fetch('/api/documents?' + new URLSearchParams(params), { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) { const error = new Error(body.error || 'โหลดข้อมูลไม่ได้'); error.status = response.status; throw error; }
    return body;
  }
  function base(message = '') {
    section.innerHTML = `<div class="panel hfd-panel"><div class="hfd-header"><div><h2>Documents &amp; Permits</h2><p class="small">OKTB · Terminal Permit · LOI — ตรวจร่างจากข้อมูล Job, รายชื่อ และ Travel ชุดเดียวกัน</p></div><span class="hfd-badge">Trial · masked</span></div>
      <p class="hfd-warning">ใช้ข้อมูลสมมติเท่านั้น · ข้อมูลบุคคลและเส้นทางถูกปกปิด · ร่างนี้ยังไม่อนุมัติและห้ามใช้ยื่นต่อหน่วยงาน</p>
      ${message ? `<div class="hfd-message" role="status">${escape(message)}</div>` : ''}
      <div class="hfd-controls"><label>Job <select id="hfdJob" aria-label="Select Job">${jobs.length ? jobs.map(job => `<option value="${escape(job.id)}" ${job.id === jobId ? 'selected' : ''}>${escape(job.jobNo || 'Draft')} · ${escape(job.vessel || 'Vessel not set')} · ${escape(job.port || 'Port not set')}</option>`).join('') : '<option value="">ไม่มี Job</option>'}</select></label>
      <label>ประเภทเอกสาร <select id="hfdType" aria-label="Document type">${Object.entries(labels).map(([key,value])=>`<option value="${key}" ${key===type?'selected':''}>${value}</option>`).join('')}</select></label>
      <button class="secondary" type="button" id="hfdPreview" ${jobs.length?'':'disabled'}>ตรวจร่าง</button></div>
      <div id="hfdResult" aria-live="polite"></div></div>`;
  }
  function show(preview) {
    const people = preview.people.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>ลำดับ</th><th>ประเภท</th><th>Passport</th><th>Seaman book</th><th>Flights</th></tr></thead><tbody>${preview.people.map((person,index)=>`<tr><td>${index+1}</td><td>${escape(person.category)}</td><td>${person.hasPassport?'มีข้อมูล (ปกปิด)':'ยังไม่มี'}</td><td>${person.hasSeamanBook?'มีข้อมูล (ปกปิด)':'ยังไม่มี'}</td><td>${person.flightCount}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small">ไม่มีรายชื่อสำหรับเอกสารประเภทนี้</p>';
    const travel = preview.travel.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>เที่ยว</th><th>รถ / เรือ</th><th>จำนวนผู้โดยสาร</th><th>เส้นทาง</th></tr></thead><tbody>${preview.travel.map(trip=>`<tr><td>${escape(trip.label)}</td><td>${escape(trip.kind)}</td><td>${trip.passengerCount}</td><td>ปกปิด</td></tr>`).join('')}</tbody></table></div>` : '<p class="small">ไม่มี Travel ที่เกี่ยวข้อง</p>';
    document.getElementById('hfdResult').innerHTML = `<div class="hfd-paper"><div class="hfd-paperhead"><div><small>DRAFT PREVIEW · NOT APPROVED</small><h2>${escape(preview.title)}</h2></div><span class="hfd-badge">ข้อมูลปกปิด</span></div>
      <div class="hfd-fields">${row('Job No.',preview.job.jobNo)}${row('Vessel',preview.job.vessel)}${row('Port',preview.job.port)}${row('ETA',preview.job.eta)}${row('Principal',preview.job.principal)}</div>
      <div class="hfd-counts">Crew ${preview.counts.crew} · Visitor ${preview.counts.visitors} · Car ${preview.counts.car} · Boat ${preview.counts.boat}</div>
      ${preview.type !== 'loi' ? `<h3>Crew members and Visitors</h3>${people}` : ''}
      ${preview.type === 'oktb' ? `<h3>Travel</h3>${travel}` : ''}
      <h3>ต้องตรวจสอบก่อนออกเอกสาร</h3><ul>${preview.requirements.map(item=>`<li>${escape(item)}</li>`).join('')}</ul>
      <p class="hfd-warning">${escape(preview.notice)}</p><button type="button" class="secondary" disabled>ดาวน์โหลด · รอขั้นอนุมัติจากเจ้าของ</button></div>`;
  }
  async function load() {
    const current = ++request; base('กำลังตรวจสิทธิ์และโหลด Job…');
    try {
      const data = await get({ action:'jobs' }); if(current!==request)return;
      jobs=data.jobs||[]; if(!jobs.some(job=>job.id===jobId))jobId=jobs[0]?.id||'';
      base(jobs.length?'เลือก Job และประเภทเอกสาร แล้วกดตรวจร่าง':'ยังไม่มี Job ในระบบทดลอง');
    } catch(error) {
      if(current!==request)return;
      jobs=[];jobId='';base(error.status===401?'กรุณาลงชื่อเข้าใช้ก่อนดูเอกสาร':error.status===403?'ต้องได้รับสิทธิ์ Crew และ Visitor แยกต่างหาก':error.message);
      if(error.status===401) document.getElementById('hfdResult').innerHTML='<a href="/api/auth?mode=start">ลงชื่อเข้าใช้</a>';
    }
  }
  nav.addEventListener('click', load);
  section.addEventListener('change',event=>{
    if(event.target.id==='hfdJob')jobId=event.target.value;
    else if(event.target.id==='hfdType')type=event.target.value;
    else return;
    request++;
    document.getElementById('hfdResult').replaceChildren();
  });
  section.addEventListener('click',async event=>{
    if(event.target.id!=='hfdPreview'||!jobId)return;
    const current=++request;
    document.getElementById('hfdResult').innerHTML='<p role="status">กำลังสร้างร่างสำหรับตรวจ…</p>';
    try {const data=await get({action:'preview',jobId,type});if(current===request)show(data.preview);}
    catch(error){if(current===request)document.getElementById('hfdResult').innerHTML=`<p role="alert">${escape(error.message)}</p>`;}
  });
})();

