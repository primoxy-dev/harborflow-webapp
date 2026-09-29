/* Trial document review. Person identifiers never enter this page from the preview API. */
(() => {
  const section = document.getElementById('documents');
  const nav = document.querySelector('[data-view="documents"]');
  if (!section || !nav) return;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateOnly = value => /^\d{4}-\d{2}-\d{2}/.test(String(value ?? '')) ? String(value).slice(0, 10) : '';
  const localDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const displayDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '[not set]';
    const [year, month, day] = value.split('-').map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '[not set]';
    return `${String(day).padStart(2, '0')}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]}-${String(year).slice(-2)}`;
  };
  const labels = { oktb: 'OKTB', permit: 'Terminal Permit', loi: 'LOI' };
  const row = (label, value) => `<div class="hfd-field"><span>${escape(label)}</span><strong>${escape(value || 'ยังไม่มีข้อมูล')}</strong></div>`;
  let jobs = [], type = 'oktb', jobId = '', request = 0, signatureUrl = '';

  function clearSignature() {
    if (signatureUrl) URL.revokeObjectURL(signatureUrl);
    signatureUrl = '';
  }
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
      <label>ประเภทเอกสาร <select id="hfdType" aria-label="Document type">${Object.entries(labels).map(([key, value]) => `<option value="${key}" ${key === type ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
      <button class="secondary" type="button" id="hfdPreview" ${jobs.length ? '' : 'disabled'}>ตรวจร่าง</button></div>
      <div id="hfdResult" aria-live="polite"></div></div>`;
  }
  function genericPreview(preview) {
    const people = preview.people.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>ลำดับ</th><th>ประเภท</th><th>Passport</th><th>Seaman book</th><th>Flights</th></tr></thead><tbody>${preview.people.map((person, index) => `<tr><td>${index + 1}</td><td>${escape(person.category)}</td><td>${person.hasPassport ? 'มีข้อมูล (ปกปิด)' : 'ยังไม่มี'}</td><td>${person.hasSeamanBook ? 'มีข้อมูล (ปกปิด)' : 'ยังไม่มี'}</td><td>${person.flightCount}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small">ไม่มีรายชื่อสำหรับเอกสารประเภทนี้</p>';
    return `<div class="hfd-paper"><div class="hfd-paperhead"><div><small>DRAFT PREVIEW · NOT APPROVED</small><h2>${escape(preview.title)}</h2></div><span class="hfd-badge">ข้อมูลปกปิด</span></div>
      <div class="hfd-fields">${row('Job No.', preview.job.jobNo)}${row('Vessel', preview.job.vessel)}${row('Port', preview.job.port)}${row('ETA', preview.job.eta)}${row('Principal', preview.job.principal)}</div>
      <div class="hfd-counts">Crew ${preview.counts.crew} · Visitor ${preview.counts.visitors} · Car ${preview.counts.car} · Boat ${preview.counts.boat}</div>
      ${preview.type !== 'loi' ? `<h3>Crew members and Visitors</h3>${people}` : ''}
      <h3>ต้องตรวจสอบก่อนออกเอกสาร</h3><ul>${preview.requirements.map(item => `<li>${escape(item)}</li>`).join('')}</ul>
      <p class="hfd-warning">${escape(preview.notice)}</p><button type="button" class="secondary" disabled>ดาวน์โหลด · รอขั้นอนุมัติจากเจ้าของ</button></div>`;
  }
  function oktbPreview(preview) {
    const issueDate = localDate();
    const arrivalDate = dateOnly(preview.job.eta);
    const vessel = escape(preview.job.vessel || '[Vessel from Job]');
    const port = escape((preview.job.port || '[Port from Job]').toUpperCase());
    const peopleRows = preview.people.length ? preview.people.map((person, index) => `<tr><td>${index + 1}</td><td>${escape(person.label)} (${escape(person.category)})</td><td>[masked]</td><td>[masked]</td><td>[masked]</td><td>${person.hasSeamanBook ? '[masked]' : '—'}</td><td>${person.hasPassport ? '[masked]' : '—'}</td><td>[masked]</td></tr>`).join('') : '<tr><td colspan="8">No crew or visitors recorded for this Job</td></tr>';
    const flights = preview.people.filter(person => person.flightCount > 0);
    const flightLines = flights.length ? flights.map(person => `<div>${escape(person.label)} · ${person.flightCount} flight(s) · [details masked]</div>`).join('') : '<div>No flights recorded</div>';
    return `<div class="hfd-oktb-editor" aria-label="OKTB draft details">
      <label>To · ชื่อสายการบิน<input id="hfdAirline" type="text" autocomplete="off" placeholder="Airline name"></label>
      <label>Date · วันที่ออกเอกสาร<input id="hfdIssueDate" type="date" value="${issueDate}"></label>
      <label>วันเรือเข้า · on<input id="hfdArrivalInput" type="date" value="${escape(arrivalDate)}"></label>
      <label>Contact person<input id="hfdContact" type="text" autocomplete="off" placeholder="Contact name"></label>
      <label>เบอร์โทร<input id="hfdPhone" type="tel" autocomplete="off" placeholder="Telephone"></label>
      <label>ชื่อผู้ลงนาม<input id="hfdSigner" type="text" autocomplete="off" placeholder="Authorized signatory"></label>
      <label>ภาพลายเซ็นสำหรับตรวจร่างเท่านั้น<input id="hfdSignature" type="file" accept="image/png,image/jpeg"></label>
      <p class="hfd-oktb-editor-note">Vessel และ Port มาจาก Job · Personal Details และ Flight Details มาจาก Crew members and Visitors โดยยังปกปิดข้อมูลอ่อนไหว · ช่องที่แก้ในหน้านี้ยังไม่บันทึกข้ามเครื่อง</p></div>
      <div class="hfd-oktb-sheet-wrap"><article class="hfd-oktb-page" aria-label="OKTB sample letter">
        <header class="hfd-oktb-letterhead"><span class="hfd-oktb-logo" role="img" aria-label="GAC logo"></span><div><h2>BANGKOK, THAILAND</h2><p>GULF AGENCY COMPANY (THAILAND) LTD.</p><p>26/30-31 9th Floor, Orakarn Building, Soi Chidlom, Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330</p><p>Tel +66-2-650 7400&nbsp; Fax +66-2-650 7401&nbsp; E-mail shipping.thailand@gac.com</p></div></header>
        <div class="hfd-oktb-field"><span>Date</span><span>:</span><span id="hfdIssuedDate">${displayDate(issueDate)}</span></div>
        <div class="hfd-oktb-field"><span>To</span><span>:</span><span id="hfdAirlineOut">[airline not set]</span></div>
        <div class="hfd-oktb-field"><span>Attn</span><span>:</span><span>All concern</span></div>
        <p class="hfd-oktb-re">Re&nbsp;&nbsp;&nbsp; : &nbsp; "OK TO BOARD MESSAGE/ GUARANTEE LETTER"</p>
        <p>Gulf Agency Company (Thailand) Ltd., as agent for Vessel "${vessel}"<br>The Vessel above will arrive at&nbsp; <b>${port}</b> on&nbsp; <span id="hfdArrivalDate">${displayDate(arrivalDate)}</span></p>
        <p>We would hereby confirm that the under mentioned person is/are scheduled to embark the said vessel on <span id="hfdEmbarkDate">${displayDate(arrivalDate)}</span>, we confirm meeting following personnel arriving Bangkok</p>
        <h3>Personal Details</h3><table aria-label="Personal Details"><colgroup><col style="width:6%"><col style="width:27%"><col style="width:10%"><col style="width:10%"><col style="width:13%"><col style="width:12%"><col style="width:11%"><col style="width:11%"></colgroup><thead><tr><th>No.</th><th>Name - Surname</th><th>Nationality</th><th>Rank</th><th>Date of Birth</th><th>Seaman Book</th><th>Passport</th><th>Expire</th></tr></thead><tbody>${peopleRows}</tbody></table>
        <div class="hfd-oktb-flights"><b>Flight Details:</b>${flightLines}</div>
        <p>Please provide with your valuable assistance for departure as per the above flight details<br>and should you require further clarification, please do not hesitate to contact<br><b id="hfdContactOut">[contact not set]</b> on Tel : <span id="hfdPhoneOut">[phone not set]</span></p>
        <p>Thank you for your kind co-operation.</p><p>Your faithfully</p>
        <div class="hfd-oktb-signature"><img id="hfdSignatureOut" alt="Draft signature preview" hidden><span id="hfdSignaturePlaceholder">Signature pending owner approval</span></div>
        <p class="hfd-oktb-signoff"><span id="hfdSignerOut">[signatory not set]</span><br>Gulf Agency Company (Thailand) Ltd.<br>As Agents Only</p>
        <div class="hfd-oktb-watermark">SAMPLE · NOT APPROVED</div>
      </article></div>
      <p class="hfd-warning">${escape(preview.notice)} ลายเซ็นที่เลือกแสดงเฉพาะในเบราว์เซอร์นี้และไม่ส่งไปเก็บบนเซิร์ฟเวอร์</p>
      <button type="button" class="secondary" disabled>ดาวน์โหลด · รอขั้นอนุมัติจากเจ้าของ</button>`;
  }
  function show(preview) {
    clearSignature();
    document.getElementById('hfdResult').innerHTML = preview.type === 'oktb' ? oktbPreview(preview) : genericPreview(preview);
  }
  async function load() {
    const current = ++request; clearSignature(); base('กำลังตรวจสิทธิ์และโหลด Job…');
    try {
      const data = await get({ action: 'jobs' }); if (current !== request) return;
      jobs = data.jobs || []; if (!jobs.some(job => job.id === jobId)) jobId = jobs[0]?.id || '';
      base(jobs.length ? 'เลือก Job และประเภทเอกสาร แล้วกดตรวจร่าง' : 'ยังไม่มี Job ในระบบทดลอง');
    } catch (error) {
      if (current !== request) return;
      jobs = []; jobId = ''; base(error.status === 401 ? 'กรุณาลงชื่อเข้าใช้ก่อนดูเอกสาร' : error.status === 403 ? 'ต้องได้รับสิทธิ์ Crew และ Visitor แยกต่างหาก' : error.message);
      if (error.status === 401) document.getElementById('hfdResult').innerHTML = '<a href="/api/auth?mode=start">ลงชื่อเข้าใช้</a>';
    }
  }
  nav.addEventListener('click', load);
  section.addEventListener('change', event => {
    if (event.target.id === 'hfdSignature') {
      clearSignature();
      const file = event.target.files?.[0];
      const image = document.getElementById('hfdSignatureOut');
      const placeholder = document.getElementById('hfdSignaturePlaceholder');
      if (!image || !placeholder) return;
      if (file && ['image/png', 'image/jpeg'].includes(file.type) && file.size <= 2000000) {
        signatureUrl = URL.createObjectURL(file);
        image.src = signatureUrl; image.hidden = false; placeholder.hidden = true;
      } else {
        image.removeAttribute('src'); image.hidden = true; placeholder.hidden = false;
        if (file) alert('ใช้ไฟล์ PNG/JPEG ขนาดไม่เกิน 2 MB');
      }
      return;
    }
    if (event.target.id === 'hfdJob') jobId = event.target.value;
    else if (event.target.id === 'hfdType') type = event.target.value;
    else return;
    request++; clearSignature(); document.getElementById('hfdResult').replaceChildren();
  });
  section.addEventListener('input', event => {
    const fields = { hfdAirline: 'hfdAirlineOut', hfdContact: 'hfdContactOut', hfdPhone: 'hfdPhoneOut', hfdSigner: 'hfdSignerOut' };
    const output = document.getElementById(fields[event.target.id]);
    if (output) output.textContent = event.target.value || '[not set]';
    if (event.target.id === 'hfdIssueDate') document.getElementById('hfdIssuedDate').textContent = displayDate(event.target.value);
    if (event.target.id === 'hfdArrivalInput') for (const id of ['hfdArrivalDate', 'hfdEmbarkDate']) document.getElementById(id).textContent = displayDate(event.target.value);
  });
  section.addEventListener('click', async event => {
    if (event.target.id !== 'hfdPreview' || !jobId) return;
    const current = ++request; clearSignature();
    document.getElementById('hfdResult').innerHTML = '<p role="status">กำลังสร้างร่างสำหรับตรวจ…</p>';
    try { const data = await get({ action: 'preview', jobId, type }); if (current === request) show(data.preview); }
    catch (error) { if (current === request) document.getElementById('hfdResult').innerHTML = `<p role="alert">${escape(error.message)}</p>`; }
  });
})();

