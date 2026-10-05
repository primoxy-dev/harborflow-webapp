/* Crew Change document drafts. Private data stays behind current account permissions. */
(() => {

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
  const contexts = new Map();
  const activeBindings = new Set();
  let account = null, generation = 0;
  const keys = { hfdContact: 'contact', hfdPhone: 'phone', hfdSigner: 'signer' };
  async function get(params) {
    const response = await fetch('/api/documents?' + new URLSearchParams(params), { credentials: 'same-origin', cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) { const error = new Error(body.error || 'โหลดข้อมูลไม่ได้'); error.status = response.status; throw error; }
    return body;
  }
  function message(host, text, failed = false) {
    const el = host.querySelector('#hfdSaveStatus');
    if (el) { el.textContent = text; el.classList.toggle('hfd-save-error', failed); }
  }
  function accountState(login) {
    if (account?.login !== login) account = { login, values: {}, saved: {}, queue: Promise.resolve(), canSave: false, blocked: false, pending: 0, loaded: false };
    return account;
  }
  function remember(host, profile, patch) {
    Object.assign(profile.values, patch);
    if (!profile.loaded || !profile.canSave || profile.blocked) return;
    message(host, 'กำลังบันทึก…');
    profile.pending++;
    const gen = generation;
    profile.queue = profile.queue.then(async () => {
      if (generation !== gen || account !== profile || profile.blocked) return;
      const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => value !== (profile.saved[key] || '')));
      if (!Object.keys(changed).length) return;
      const base = Object.fromEntries(Object.keys(changed).map(key => [key, profile.saved[key] || '']));
      const response = await fetch('/api/documents', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'savePreferences', login: profile.login, patch: changed, base}) });
      const data = await response.json();
      if (!response.ok) {
        profile.blocked = true;
        if ([401,403].includes(response.status)) { clear(); host.replaceChildren(); }
        throw Error(data.error || 'บันทึกไม่สำเร็จ');
      }
      if (generation === gen && account === profile) Object.assign(profile.saved, data.preferences);
    }).catch(error => { profile.blocked = true; message(host, error.message + ' · กรุณาเปิดแท็บใหม่ก่อนลองอีกครั้ง', true); }).finally(() => {
      profile.pending--;
      if (generation === gen && account === profile && !profile.blocked && profile.pending === 0) message(host, 'บันทึกข้อมูลผู้ติดต่อและลายเซ็นแล้ว · ใช้อัตโนมัติครั้งต่อไป');
    });
  }
  function flightKey(flight) {
    return JSON.stringify(['airline','number','date','from','to','departure','arrival'].map(key => (flight[key] || '').toUpperCase()));
  }
  function groups(people) {
    const result = new Map();
    for (const person of people) for (const flight of person.flights || []) {
      if (!Object.values(flight).some(Boolean)) continue;
      const key = flightKey(flight);
      if (!result.has(key)) result.set(key, { flight, ids: [], names: [], bookings: [] });
      const group = result.get(key);
      if (!group.ids.includes(person.id)) { group.ids.push(person.id); group.names.push(person.name); }
      if (flight.booking && !group.bookings.includes(flight.booking)) group.bookings.push(flight.booking);
    }
    return [...result.values()];
  }
  let airlineNamesPromise;
  function loadAirlineNames() {
    if (!airlineNamesPromise) airlineNamesPromise=fetch('/data/flight-codes.json',{cache:'force-cache'})
      .then(response=>response.ok?response.json():null)
      .then(data=>new Map((data?.airlines||[]).map(row=>[String(row[0]).toUpperCase(),String(row[1]||row[0])])))
      .catch(()=>new Map());
    return airlineNamesPromise;
  }
  function selectedAirline(preview, ctx, names) {
    const selected=preview.people.filter(person=>ctx.selected.has(person.id));
    const airlines=[...new Set(selected.flatMap(person=>person.flights||[]).map(flight=>String(flight.airline||'').trim().toUpperCase()).filter(Boolean))];
    return airlines.map(code=>names.get(code)||code).join(' / ');
  }
  function personSelection(preview, ctx) {
    const flightGroups = groups(preview.people);
    return '<fieldset class="hfd-crew-select"><legend>เลือกลูกเรือสำหรับ OKTB</legend><div class="hfd-selection-actions"><button type="button" class="hfo-btn" data-select-crew="all">เลือกทั้งหมด</button><button type="button" class="hfo-btn" data-select-crew="none">ล้างการเลือก</button></div>' +
      preview.people.map(person => '<label><input type="checkbox" data-oktb-person="' + escape(person.id) + '" ' + (ctx.selected.has(person.id) ? 'checked' : '') + '><span>' + escape(person.name) + ' · ' + escape(person.category) + '</span></label>').join('') +
      (preview.people.length ? '' : '<p>ยังไม่มีลูกเรือใน Crew members ของ Service นี้</p>') +
      (flightGroups.length ? '<div class="hfd-flight-groups"><span>เลือกผู้โดยสารเที่ยวบินเดียวกัน</span>' + flightGroups.map((group, i) => '<button type="button" class="hfo-btn" data-flight-group="' + i + '">' + escape([group.flight.airline, group.flight.number, group.flight.date, group.flight.from + ' → ' + group.flight.to].filter(Boolean).join(' · ')) + ' (' + group.ids.length + ' คน)</button>').join('') + '</div>' : '') +
      '<p id="hfdSelectionCount">' + ctx.selected.size + ' คนที่เลือก</p></fieldset>';
  }
  function personalRows(people) {
    return people.length ? people.map((person, index) => '<tr><td>' + (index + 1) + '</td><td>' + escape(person.name) + '</td><td>' + escape(person.nationality) + '</td><td>' + escape(person.rank) + '</td><td>' + displayDate(dateOnly(person.dob)) + '</td><td>' + escape(person.seamanBook) + '</td><td>' + escape(person.passport) + '</td><td>' + displayDate(dateOnly(person.passportExpiry)) + '</td></tr>').join('') : '<tr><td colspan="8">กรุณาเลือกลูกเรือเพื่อทำ OKTB</td></tr>';
  }
  function flightRows(people) {
    const flights = groups(people);
    return flights.length ? '<table aria-label="Flight Details"><thead><tr><th>Airline / Flight</th><th>Date</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>PNR</th></tr></thead><tbody>' +
      flights.map(({flight, bookings}) => '<tr><td>' + escape([flight.airline, flight.number].filter(Boolean).join(' ')) + '</td><td>' + escape(/^\d{4}-/.test(flight.date) ? displayDate(dateOnly(flight.date)) : flight.date) + '</td><td>' + escape(flight.from) + '</td><td>' + escape(flight.to) + '</td><td>' + escape(flight.departure) + '</td><td>' + escape(flight.arrival) + '</td><td>' + escape(bookings.join(' / ')) + '</td></tr>').join('') + '</tbody></table>' : '<p>No flights recorded for selected crew</p>';
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
  function oktbPreview(preview, ctx, profile, airlineNames) {
    const issueDate = ctx.issueDate || localDate();
    const arrivalDate = ctx.arrivalDate || dateOnly(preview.job.eta);
    ctx.issueDate = issueDate; ctx.arrivalDate = arrivalDate;
    const vessel = escape(preview.job.vessel || '[Vessel from Job]');
    const port = escape((preview.job.port || '[Port from Job]').toUpperCase());
    const selectedPeople = preview.people.filter(person => ctx.selected.has(person.id));
    ctx.airline = selectedAirline(preview, ctx, airlineNames);
    const peopleRows = personalRows(selectedPeople);
    const flightLines = flightRows(selectedPeople);
    const saved = profile.values;
    const disabled = profile.canSave ? '' : 'disabled';
    return `${personSelection(preview, ctx)}<details class="hfd-oktb-settings"><summary>รายละเอียดเอกสาร OKTB</summary><div class="hfd-oktb-editor" aria-label="OKTB draft details">
      <label>To · ชื่อสายการบิน<input id="hfdAirline" type="text" readonly placeholder="Select crew with flight details" value="${escape(ctx.airline || '')}"></label>
      <label>Date · วันที่ออกเอกสาร<input id="hfdIssueDate" type="date" value="${issueDate}"></label>
      <label>วันเรือเข้า · on<input id="hfdArrivalInput" type="date" value="${escape(arrivalDate)}"></label>
      <label>Contact person<input id="hfdContact" type="text" autocomplete="off" placeholder="Contact name" maxlength="200" value="${escape(saved.contact || '')}" ${disabled}></label>
      <label>เบอร์โทร<input id="hfdPhone" type="tel" autocomplete="off" placeholder="Telephone" maxlength="200" value="${escape(saved.phone || '')}" ${disabled}></label>
      <label>ชื่อผู้ลงนาม<input id="hfdSigner" type="text" autocomplete="off" placeholder="Authorized signatory" maxlength="200" value="${escape(saved.signer || '')}" ${disabled}></label>
      <label>ภาพลายเซ็นสำหรับตรวจร่างเท่านั้น<input id="hfdSignature" type="file" accept="image/png,image/jpeg" ${disabled}>${profile.canSave?'<button type="button" class="hfo-btn" data-clear-signature>ลบลายเซ็นที่จำไว้</button>':''}</label>
      <p class="hfd-oktb-editor-note">Vessel และ Port มาจาก Job · Personal Details และ Flight Details มาจากลูกเรือที่เลือกใน Crew members · ข้อมูลผู้ติดต่อและลายเซ็นจำตามบัญชี</p><p id="hfdSaveStatus" role="status" class="hfd-oktb-editor-note">ใช้ข้อมูลผู้ติดต่อและลายเซ็นที่บันทึกไว้ล่าสุด</p></div></details>
      <div class="hfd-oktb-sheet-wrap"><article class="hfd-oktb-page" aria-label="OKTB sample letter">
        <header class="hfd-oktb-letterhead"><span class="hfd-oktb-logo" role="img" aria-label="GAC logo"></span><div><h2>BANGKOK, THAILAND</h2><p>GULF AGENCY COMPANY (THAILAND) LTD.</p><p class="hfd-oktb-address">26/30-31 9th Floor, Orakarn Building, Soi Chidlom, Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330</p><p>Tel +66-2-650 7400&nbsp; Fax +66-2-650 7401&nbsp; E-mail shipping.thailand@gac.com</p></div></header>
        <div class="hfd-oktb-field"><span>Date</span><span>:</span><span id="hfdIssuedDate">${displayDate(issueDate)}</span></div>
        <div class="hfd-oktb-field"><span>To</span><span>:</span><span id="hfdAirlineOut">${escape(ctx.airline || '[airline not set]')}</span></div>
        <div class="hfd-oktb-field"><span>Attn</span><span>:</span><span>All concern</span></div>
        <p class="hfd-oktb-re">Re&nbsp;&nbsp;&nbsp; : &nbsp; "OK TO BOARD MESSAGE/ GUARANTEE LETTER"</p>
        <p>Gulf Agency Company (Thailand) Ltd., as agent for Vessel "${vessel}"<br>The Vessel above will arrive at&nbsp; <b>${port}</b> on&nbsp; <span id="hfdArrivalDate">${displayDate(arrivalDate)}</span></p>
        <p>We would hereby confirm that the under mentioned person is/are scheduled to embark the said vessel on <span id="hfdEmbarkDate">${displayDate(arrivalDate)}</span>, we confirm meeting following personnel arriving Bangkok</p>
        <h3>Personal Details</h3><table class="hfd-personal-table" aria-label="Personal Details"><colgroup><col style="width:6%"><col style="width:27%"><col style="width:10%"><col style="width:10%"><col style="width:13%"><col style="width:12%"><col style="width:11%"><col style="width:11%"></colgroup><thead><tr><th>No.</th><th>Name - Surname</th><th>Nationality</th><th>Rank</th><th>Date of Birth</th><th>Seaman Book</th><th>Passport</th><th>Expire</th></tr></thead><tbody id="hfdPersonalRows">${peopleRows}</tbody></table>
        <div class="hfd-oktb-flights"><b>Flight Details:</b><div id="hfdFlightRows">${flightLines}</div></div>
        <p>Please provide with your valuable assistance for departure as per the above flight details<br>and should you require further clarification, please do not hesitate to contact<br><b id="hfdContactOut">${escape(saved.contact || '[contact not set]')}</b> on Tel : <span id="hfdPhoneOut">${escape(saved.phone || '[phone not set]')}</span></p>
        <p>Thank you for your kind co-operation.</p><p>Your faithfully</p>
        <div class="hfd-oktb-signature"><img id="hfdSignatureOut" alt="Draft signature preview" ${saved.signature?`src="${escape(saved.signature)}"`:'hidden'}><span id="hfdSignaturePlaceholder" ${saved.signature?'hidden':''}>Signature pending owner approval</span></div>
        <p class="hfd-oktb-signoff"><span id="hfdSignerOut">${escape(saved.signer || '[signatory not set]')}</span><br>Gulf Agency Company (Thailand) Ltd.<br>As Agents Only</p>
        <div class="hfd-oktb-watermark">SAMPLE · NOT APPROVED</div>
      </article></div>
      <p class="hfd-warning">${escape(preview.notice)} ข้อมูลผู้ติดต่อและลายเซ็นบันทึกส่วนตัวตามบัญชีผู้ใช้</p>
      <button type="button" class="secondary" data-download-oktb ${selectedPeople.length?'':'disabled'}>ดาวน์โหลด PDF (ร่าง)</button>`;
  }
  function clear() {
    for(const controller of activeBindings)controller.abort();
    activeBindings.clear();
    generation++;
    contexts.clear();
    account = null;
  }
  function updateSelected(host, preview, ctx, airlineNames) {
    const selected = preview.people.filter(person => ctx.selected.has(person.id));
    host.querySelector('#hfdPersonalRows').innerHTML = personalRows(selected);
    host.querySelector('#hfdFlightRows').innerHTML = flightRows(selected);
    host.querySelector('#hfdSelectionCount').textContent = selected.length + ' คนที่เลือก';
    ctx.airline=selectedAirline(preview,ctx,airlineNames);
    host.querySelector('#hfdAirline').value=ctx.airline;
    host.querySelector('#hfdAirlineOut').textContent=ctx.airline||'[airline not set]';
    host.querySelector('[data-download-oktb]').disabled=!selected.length;
    host.querySelectorAll('[data-oktb-person]').forEach(input => { input.checked = ctx.selected.has(input.dataset.oktbPerson); });
  }
  function showSignature(host, signature) {
    const image = host.querySelector('#hfdSignatureOut');
    const placeholder = host.querySelector('#hfdSignaturePlaceholder');
    if (!image) return;
    if (signature) image.src = signature; else image.removeAttribute('src');
    image.hidden = !signature; placeholder.hidden = Boolean(signature);
  }
  async function readSignature(file) {
    if (!['image/png','image/jpeg'].includes(file.type) || file.size > 2000000) throw Error('ใช้ไฟล์ PNG/JPEG ขนาดไม่เกิน 2 MB');
    const bitmap = await createImageBitmap(file);
    try {
      if (!bitmap.width || !bitmap.height) throw Error('อ่านภาพลายเซ็นไม่ได้');
      const scale = Math.min(1, 900 / bitmap.width, 350 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/png');
      if (data.length > 700000) throw Error('ภาพลายเซ็นใหญ่เกินไป กรุณาเลือกภาพที่เล็กลง');
      return data;
    } finally { bitmap.close(); }
  }
  // A curated starter list, not a complete consular directory. No visa rules implied.
  const embassies = [
    ['Colombo, Sri Lanka','https://colombo.thaiembassy.org/en/page/contact'],
    ['Manila, Philippines','https://thaiembassymnl.ph/index.html'],
    ['Moscow, Russia','https://moscow.thaiembassy.org/en/'],
    ['New Delhi, India','https://newdelhi.thaiembassy.org/en/'],
    ['Singapore','https://singapore.thaiembassy.org/en/']
  ].map(([city,source])=>({name:'Royal Thai Embassy, '+city,source}));
  const loiFields = [['surname','Surname'],['givenName','Given name'],['dob','Date of Birth'],['placeOfBirth','Place of Birth'],['nationality','Nationality'],['passport','Passport No.'],['passportIssued','Issued (Passport)'],['passportExpiry','Expiry'],['seamanBook','Seamans book'],['seamanBookIssued','Issued (Seamans book)']];
  let permitModel;
  function permitPaperTables(ctx) {
    return permitModel.visiblePermitTables(ctx.permitDraft).map(table=>`<section class="hfd-permit-table-block"><h3>${escape(table.title)}</h3><table><thead><tr>${table.headers.map(h=>'<th>'+escape(h)+'</th>').join('')}</tr></thead><tbody>${table.rows.map(r=>'<tr>'+r.cells.map(c=>'<td>'+escape(c||'\u00a0')+'</td>').join('')+'</tr>').join('')}</tbody></table></section>`).join('');
  }
  function permitEditors(preview,ctx) {
    return ctx.permitDraft.tables.map(table=>{
      const choices=permitModel.tablePeople(table,preview.people);
      return `<details class="hfd-permit-editor-table" open><summary>${escape(table.title||'Boarding Officer / Driver')} · ${table.rows.length} แถว</summary><label>ชื่อหัวข้อของตาราง<input data-permit-title="${table.key}" maxlength="120" value="${escape(table.title)}"></label><div class="hfd-permit-edit-scroll"><table><thead><tr>${table.headers.map((h,i)=>'<th><input aria-label="'+escape(table.key+' header '+(i+1))+'" data-permit-header="'+table.key+'" data-col="'+i+'" maxlength="80" value="'+escape(h)+'"></th>').join('')}<th>แถว</th></tr></thead><tbody>${table.rows.map((r,n)=>'<tr>'+r.cells.map((c,i)=>'<td>'+(table.fields[i]==='name'?'<select aria-label="เลือกคน '+escape(table.key)+' แถว '+(n+1)+'" data-permit-person="'+table.key+'" data-row="'+r.id+'"><option value="">เลือกคน / กรอกเอง</option>'+choices.map(p=>'<option value="'+escape(p.id)+'" '+(p.id===r.personId?'selected':'')+'>'+escape(p.name+' · '+p.category)+'</option>').join('')+'</select>':'')+'<input aria-label="'+escape(table.key+' row '+r.id+' column '+(i+1))+'" data-permit-cell="'+table.key+'" data-row="'+r.id+'" data-col="'+i+'" maxlength="300" value="'+escape(c)+'"></td>').join('')+'<td><button type="button" class="hfo-btn danger" data-permit-remove="'+table.key+'" data-row="'+r.id+'" aria-label="ลบ '+escape(table.title||table.key)+' แถว '+(n+1)+'">− ลบ</button></td></tr>').join('')}</tbody></table></div><button type="button" class="hfo-btn" data-permit-add="${table.key}">+ เพิ่มแถว</button></details>`;
    }).join('');
  }
  function refreshPermit(host,ctx){
    host.querySelector('#hfdPermitTables').innerHTML=permitPaperTables(ctx);
    host.querySelector('#hfdPermitSubjectOut').textContent=ctx.permitDraft.subject;
  }
  function permitPreview(preview,ctx,profile) {
    ctx.issueDate ||= localDate();ctx.permitDate ||= dateOnly(preview.job.eta);
    const scope=JSON.stringify(preview.scope);
    if(ctx.permitScope!==scope){ctx.permitDraft=permitModel.applyPermitDefaults(permitModel.newPermitDraft(),preview.scope?.visitorView?ctx.permitDefaults?.defaults:null);ctx.permitScope=scope;}
    ctx.permitDraft=permitModel.revalidateDraft(ctx.permitDraft||permitModel.newPermitDraft(),preview.people);
    const saved=profile.values,disabled=profile.canSave?'':'disabled';
    return `<p class="hfd-notice">ร่างทดลอง · ใช้รายชื่อสมมติที่ได้รับสิทธิ์ดู · การแก้ตารางไม่เปลี่ยน Crew members หรือ Job</p>
      <div class="hfd-oktb-editor hfd-permit-editor">
        <label class="hfd-permit-subject">Subject<input id="hfdPermitSubject" maxlength="500" value="${escape(ctx.permitDraft.subject)}"></label>
        <label>Vessel · มาจาก Job<input readonly value="${escape(preview.job.vessel)}"></label>
        <label>at · Port / Terminal จาก Job<input readonly value="${escape(permitModel.permitLocation(preview.job))}"></label>
        <label>Date · วันที่ออกเอกสาร<input id="hfdIssueDate" type="date" value="${escape(ctx.issueDate)}"></label>
        <label>on · วันที่เข้าดำเนินการ<input id="hfdPermitDate" type="date" value="${escape(ctx.permitDate)}"></label>
        <label>Contact person<input id="hfdContact" maxlength="200" value="${escape(saved.contact||'')}" ${disabled}></label>
        <label>เบอร์โทร<input id="hfdPhone" maxlength="200" value="${escape(saved.phone||'')}" ${disabled}></label>
        <label>ชื่อผู้ลงนาม<input id="hfdSigner" maxlength="200" value="${escape(saved.signer||'')}" ${disabled}></label>
        <label>ภาพลายเซ็นสำหรับตรวจร่าง<input id="hfdSignature" type="file" accept="image/png,image/jpeg" ${disabled}>${profile.canSave?'<button type="button" class="hfo-btn" data-clear-signature>ลบลายเซ็นที่จำไว้</button>':''}</label>
      </div><p id="hfdSaveStatus" role="status">ข้อมูลผู้ติดต่อใช้ค่าที่จำไว้ตามบัญชี · ตารางแก้เฉพาะร่างนี้</p>
      <details class="hfd-oktb-settings" open><summary>เลือกคน / แก้ไขหัวข้อและรายละเอียดตาราง</summary><div id="hfdPermitEditors">${permitEditors(preview,ctx)}</div></details>
      <div class="hfd-oktb-sheet-wrap"><article class="hfd-oktb-page hfd-permit-page" aria-label="Terminal Permit draft">
        <div class="hfd-loi-letterhead"><div class="hfd-oktb-logo" role="img" aria-label="GAC"></div><div><b>บริษัท กัลฟ เอเจนซี่ คัมปะนี (ประเทศไทย) จำกัด</b><p>GULF AGENCY COMPANY (THAILAND) LTD.</p><p>26/30-31 9th Floor, Orakarn Building, Soi Chidlom, Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330</p><p>Tel +66-2-650 7400 &nbsp; Fax +66-2-650 7401 &nbsp; E-mail shipping.thailand@gac.com</p></div></div>
        <p class="hfd-permit-issued"><span id="hfdIssuedDate">${displayDate(ctx.issueDate)}</span></p>
        <p>Subject: <span id="hfdPermitSubjectOut">${escape(ctx.permitDraft.subject)}</span></p><p>Dear Marine Operation Division</p>
        <p class="hfd-permit-intro">Gulf Agency Company (Thailand) LTD. has been appointed of the subject vessel "${escape(preview.job.vessel||'[Vessel not set in Job]')}"</p>
        <p>at ${escape(permitModel.permitLocation(preview.job))} on <span id="hfdPermitDateOut">${displayDate(ctx.permitDate)}</span> during her operations</p>
        <div id="hfdPermitTables">${permitPaperTables(ctx)}</div>
        <p class="hfd-permit-closing">We would be grateful to terminal approve permission.</p>
        <div class="hfd-permit-signoff"><p>Thank you &amp; Best regards,</p><div class="hfd-oktb-signature"><img id="hfdSignatureOut" alt="Draft signature preview" ${saved.signature?`src="${escape(saved.signature)}"`:'hidden'}><span id="hfdSignaturePlaceholder" ${saved.signature?'hidden':''}>Signature pending owner approval</span></div><p>(<span id="hfdSignerOut">${escape(saved.signer||'[signatory not set]')}</span>)<br>Operations Coordinator, Shipping Services<br>Mobile: <span id="hfdPhoneOut">${escape(saved.phone||'[phone not set]')}</span><br>As Agents Only</p></div>
        <div class="hfd-oktb-watermark">SAMPLE · NOT APPROVED</div>
      </article></div><p class="hfd-warning">ร่างยังไม่อนุมัติ ห้ามใช้ยื่นจริง · หัวข้อและแถวที่แก้ใช้ในร่างนี้ ไม่บันทึกข้อมูลบุคคลกลับ Job</p>
      <button type="button" class="secondary" data-download-permit>ดาวน์โหลด PDF (ร่าง)</button>`;
  }
  function loiPerson(preview,ctx) {
    const person=preview.people.find(person=>person.id===ctx.loiPersonId);
    return person?{...person,...ctx.loiDetails?.[person.id]}:null;
  }
  function loiPreview(preview,ctx,profile) {
    ctx.issueDate ||= localDate();
    if(!preview.people.some(person=>person.id===ctx.loiPersonId))ctx.loiPersonId=preview.people.find(person=>person.category==='On-signers')?.id||preview.people[0]?.id||'';
    ctx.loiDetails ||= {};
    const person=loiPerson(preview,ctx),saved=profile.values,disabled=profile.canSave?'':'disabled';
    // Reuse only the logo markup; the LOI letterhead follows the uploaded template.
    const logo='<div class="hfd-oktb-logo" role="img" aria-label="GAC"></div>';
    const value=key=>escape(person?.[key]||'[not set]');
    return `<p class="hfd-notice">${escape(preview.notice)}</p>
      <div class="hfd-oktb-editor hfd-loi-editor">
        <label>To · สถานทูตไทย<select id="hfdEmbassy"><option value="">เลือกสถานทูต</option>${embassies.map(item=>`<option value="${escape(item.name)}" ${ctx.embassy===item.name?'selected':''}>${escape(item.name)}</option>`).join('')}<option value="other" ${ctx.embassy==='other'?'selected':''}>สถานทูตอื่น · ระบุชื่อ</option></select></label>
        <label id="hfdCustomEmbassyLabel" ${ctx.embassy==='other'?'':'hidden'}>ชื่อสถานทูตและเมือง/ประเทศ<input id="hfdCustomEmbassy" maxlength="200" value="${escape(ctx.customEmbassy||'')}"></label>
        <label>ลูกเรือสำหรับ LOI · หนึ่งคนต่อฉบับ<select id="hfdLoiPerson"><option value="">เลือกลูกเรือ</option>${preview.people.map(p=>`<option value="${escape(p.id)}" ${p.id===ctx.loiPersonId?'selected':''}>${escape(p.name)} · ${escape(p.category)}</option>`).join('')}</select></label>
        <label>Date · วันที่ออกเอกสาร<input id="hfdIssueDate" type="date" value="${ctx.issueDate}"></label>
        <label>Contact person<input id="hfdContact" maxlength="200" value="${escape(saved.contact||'')}" ${disabled}></label>
        <label>เบอร์โทร<input id="hfdPhone" maxlength="200" value="${escape(saved.phone||'')}" ${disabled}></label>
        <label>ชื่อผู้ลงนาม<input id="hfdSigner" maxlength="200" value="${escape(saved.signer||'')}" ${disabled}></label>
        <label>ตำแหน่งผู้ลงนาม<input id="hfdLoiTitle" maxlength="200" value="${escape(ctx.loiTitle||'Operations Coordinator, Shipping Services')}"></label>
        <label>ภาพลายเซ็นสำหรับตรวจร่าง<input id="hfdSignature" type="file" accept="image/png,image/jpeg" ${disabled}>${profile.canSave?'<button type="button" class="hfo-btn" data-clear-signature>ลบลายเซ็นที่จำไว้</button>':''}</label>
      </div>
      <p class="hfd-notice">รายชื่อสถานทูตชุดเริ่มต้น · เลือก “สถานทูตอื่น” หากไม่มีในรายการ · ตรวจเขตรับผิดชอบกับสถานทูตก่อนใช้</p>
      <a id="hfdEmbassySource" target="_blank" rel="noopener noreferrer" ${embassies.find(e=>e.name===ctx.embassy)?`href="${embassies.find(e=>e.name===ctx.embassy).source}"`:'hidden'}>เว็บไซต์ทางการของสถานทูตที่เลือก</a>
      <details class="hfd-oktb-settings"><summary>ตรวจ Personal Detail · ${escape(person?.name||'ยังไม่ได้เลือก')}</summary>
        <p>กรอก Surname และ Given name ให้ตรงหนังสือเดินทาง ไม่แยกชื่ออัตโนมัติ · ช่องเพิ่มเติมใช้ในร่างนี้ ไม่แก้ Crew members</p>
        <div class="hfd-oktb-editor">${loiFields.map(([key,label])=>`<label>${label}<input data-loi-field="${key}" maxlength="200" value="${escape(person?.[key]||'')}" ${person?'':'disabled'}></label>`).join('')}</div>
      </details>
      <p id="hfdSaveStatus" class="hfd-save-status" role="status">${profile.canSave?'ข้อมูลผู้ติดต่อและลายเซ็นจะจำไว้ในบัญชีนี้':'ดูร่างเท่านั้น · ไม่มีสิทธิ์แก้ค่าเริ่มต้น'}</p>
      <div class="hfd-oktb-sheet-wrap"><article class="hfd-oktb-page hfd-loi-page">
        <div class="hfd-loi-letterhead">${logo}<div><b>บริษัท กัลฟ เอเจนซี่ คัมปะนี (ประเทศไทย) จำกัด</b><p>GULF AGENCY COMPANY (THAILAND) LTD.</p><p>26/30-31 9th Floor, Orakarn Building, Soi Chidlom, Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330</p><p>Tel +66-2-650 7400 &nbsp; Fax +66-2-650 7401 &nbsp; E-mail &nbsp; shipping.thailand@gac.com</p></div></div>
        <h2 class="hfd-loi-heading">INVITATION LETTER</h2>
        <p>Date : <span id="hfdIssuedDate">${displayDate(ctx.issueDate)}</span><br>To : <span id="hfdEmbassyOut">${escape(ctx.embassy==='other'?ctx.customEmbassy:ctx.embassy||'[select embassy]')}</span></p>
        <div class="hfd-loi-addressee-gap"></div>
        <p>From : Gulf Agency Company (Thailand) Ltd.</p><p>Subject : VISA Issuance</p><br>
        <p>Dear Sirs,</p><p class="hfd-loi-intro">This is to advise that the following person is arriving to Thailand for visit the vessel "${escape(preview.job.vessel||'[Vessel from Job]')}"<br>Thailand, ${escape((preview.job.port||'[Port from Job]').toUpperCase())}</p>
        <h3>Personal Detail :</h3><div class="hfd-loi-personal">${loiFields.map(([key,label])=>`<div>${label.replace(' (Passport)','').replace(' (Seamans book)','')} : <span data-loi-out="${key}">${value(key)}</span></div>`).join('')}</div>
        <p class="hfd-loi-undertaking">On arrival in Thailand, We will meet the above named and assist them in joining the vessel. We will also be responsible for the maintenance and hotel arrangement during his stays in Thailand prior join vessel and arrange for his repatriation to home town in case he is unbable to join vessel.</p>
        <p>We, Gulf Agency Company(Thailand) Ltd. Are sponsoring him at the airport<br>Expenses to be incurred during his stays in Thailand, it will be responed by our company</p>
        <div class="hfd-loi-signoff"><p>Yours Faithfully,</p><div class="hfd-oktb-signature"><img id="hfdSignatureOut" alt="Draft signature preview" ${saved.signature?`src="${escape(saved.signature)}"`:'hidden'}><span id="hfdSignaturePlaceholder" ${saved.signature?'hidden':''}>Signature pending owner approval</span></div>
        <p>(<span id="hfdSignerOut">${escape(saved.signer||'[signatory not set]')}</span>)</p><p><span id="hfdLoiTitleOut">${escape(ctx.loiTitle||'Operations Coordinator, Shipping Services')}</span><br>Mobile: <span id="hfdPhoneOut">${escape(saved.phone||'[phone not set]')}</span><br>As Agents Only, E.&amp;.O.E.</p></div>
        <div class="hfd-oktb-watermark">SAMPLE · NOT APPROVED</div>
      </article></div>
      <p class="hfd-notice">ข้อความรับผิดชอบตามต้นแบบ LOI ต้องให้เจ้าของตรวจและอนุมัติ · ห้ามใช้ร่างยื่นจริง</p>
      <button type="button" class="secondary" data-download-loi ${person&&ctx.embassy&&(ctx.embassy!=='other'||ctx.customEmbassy)?'':'disabled'}>ดาวน์โหลด PDF (ร่าง)</button>`;
  }
  function updateLoiEmbassy(host,ctx) {
    const custom=ctx.embassy==='other',text=custom?ctx.customEmbassy:ctx.embassy;
    host.querySelector('#hfdCustomEmbassyLabel').hidden=!custom;
    host.querySelector('#hfdEmbassyOut').textContent=text||'[select embassy]';
    const source=host.querySelector('#hfdEmbassySource'),entry=embassies.find(e=>e.name===ctx.embassy);
    source.hidden=!entry; if(entry)source.href=entry.source;else source.removeAttribute('href');
    host.querySelector('[data-download-loi]').disabled=!ctx.loiPersonId||!text;
  }
  function bind(host, preview, ctx, profile, options, airlineNames) {
    if(host._hfdBindings){host._hfdBindings.abort();activeBindings.delete(host._hfdBindings);}
    const controller=new AbortController();host._hfdBindings=controller;activeBindings.add(controller);
    host.addEventListener('input', event => {
      const target = event.target;
      if(options.type==='permit'){
        if(target.id==='hfdPermitSubject'){ctx.permitDraft.subject=target.value;refreshPermit(host,ctx);}
        if(target.id==='hfdPermitDate'){ctx.permitDate=target.value;host.querySelector('#hfdPermitDateOut').textContent=displayDate(target.value);}
        const key=target.dataset.permitTitle||target.dataset.permitHeader||target.dataset.permitCell;
        if(key){const table=ctx.permitDraft.tables.find(t=>t.key===key);if(target.dataset.permitTitle)table.title=target.value;
          else if(target.dataset.permitHeader)table.headers[Number(target.dataset.col)]=target.value;
          else table.rows.find(r=>r.id===target.dataset.row).cells[Number(target.dataset.col)]=target.value;
          refreshPermit(host,ctx);
        }
      }
      const fields = { hfdAirline:'hfdAirlineOut', hfdContact:'hfdContactOut', hfdPhone:'hfdPhoneOut', hfdSigner:'hfdSignerOut' };
      const output = host.querySelector('#' + fields[target.id]);
      if (output) output.textContent = target.value || '[not set]';
      if (target.id === 'hfdAirline') ctx.airline = target.value;
      if (target.id === 'hfdCustomEmbassy') { ctx.customEmbassy=target.value.trim(); updateLoiEmbassy(host,ctx); }
      if (target.id === 'hfdLoiTitle') { ctx.loiTitle=target.value;host.querySelector('#hfdLoiTitleOut').textContent=target.value||'[not set]'; }
      if (target.dataset.loiField) {
        ctx.loiDetails[ctx.loiPersonId] ||= {};
        ctx.loiDetails[ctx.loiPersonId][target.dataset.loiField]=target.value;
        host.querySelector('[data-loi-out="'+target.dataset.loiField+'"]').textContent=target.value||'[not set]';
      }
      if (target.id === 'hfdIssueDate') { ctx.issueDate = target.value; host.querySelector('#hfdIssuedDate').textContent = displayDate(target.value); }
      if (target.id === 'hfdArrivalInput') { ctx.arrivalDate = target.value; for (const id of ['hfdArrivalDate','hfdEmbarkDate']) host.querySelector('#' + id).textContent = displayDate(target.value); }
    },{signal:controller.signal});
    host.addEventListener('change', async event => {
      const target = event.target;
      if(target.dataset.permitPerson){const table=ctx.permitDraft.tables.find(t=>t.key===target.dataset.permitPerson),r=table.rows.find(r=>r.id===target.dataset.row),person=permitModel.tablePeople(table,preview.people).find(p=>p.id===target.value);permitModel.choosePerson(table,r,person);host.querySelector('#hfdPermitEditors').innerHTML=permitEditors(preview,ctx);refreshPermit(host,ctx);}
      if (target.id === 'hfdEmbassy') {ctx.embassy=target.value;updateLoiEmbassy(host,ctx);}
      if (target.id === 'hfdLoiPerson') {ctx.loiPersonId=target.value;mount(host,options);return;}
      if (keys[target.id]) remember(host, profile, { [keys[target.id]]:target.value });
      if (target.dataset.oktbPerson) {
        if (target.checked) ctx.selected.add(target.dataset.oktbPerson); else ctx.selected.delete(target.dataset.oktbPerson);
        updateSelected(host, preview, ctx, airlineNames);
      }
      if (target.id === 'hfdSignature' && profile.canSave) {
        const file = target.files?.[0];
        if (!file) return;
        const gen = generation;
        try {
          const signature = await readSignature(file);
          if (gen !== generation || !host.isConnected || account !== profile) return;
          showSignature(host, signature);
          remember(host, profile, { signature });
        } catch(error) { message(host, error.message, true); }
      }
    },{signal:controller.signal});
    host.addEventListener('click', async event => {
      const target = event.target.closest('button');
      if (!target) return;
      if(target.dataset.permitAdd||target.dataset.permitRemove){
        const table=ctx.permitDraft.tables.find(t=>t.key===(target.dataset.permitAdd||target.dataset.permitRemove));
        if(target.dataset.permitAdd){if(table.rows.length>=100){message(host,'จำกัด 100 แถวต่อกลุ่มในช่วงทดลอง',true);return;}table.rows.push(permitModel.blankRow(table,table.rows.length));}
        else table.rows=table.rows.filter(r=>r.id!==target.dataset.row);
        host.querySelector('#hfdPermitEditors').innerHTML=permitEditors(preview,ctx);refreshPermit(host,ctx);return;
      }
      if(target.hasAttribute('data-download-permit')){
        try{
          await profile.queue;
          const fresh=await get({action:'preview',jobId:options.jobId,serviceId:options.serviceId,type:'permit'});
          if(account!==profile||fresh.login!==options.login)throw Error('บัญชีเปลี่ยน กรุณาเปิดเอกสารใหม่');
          if(JSON.stringify(fresh.preview.scope)!==JSON.stringify(preview.scope)){
            clear();host.replaceChildren();throw Error('สิทธิ์ Crew/Visitor เปลี่ยน กรุณาเปิดเอกสารใหม่');
          }
          if(JSON.stringify(fresh.preview.job)!==JSON.stringify(preview.job)||JSON.stringify(fresh.preview.people)!==JSON.stringify(preview.people))throw Error('ข้อมูล Job หรือรายชื่อเปลี่ยน กรุณาเปิดแท็บใหม่และตรวจตารางก่อนดาวน์โหลด');
          if(preview.scope?.visitorView){const current=await get({action:'permitDefaults'});if(current.login!==options.login||current.version!==ctx.permitDefaults.version)throw Error('ค่าเริ่มต้นเปลี่ยน กรุณาเปิดเอกสารใหม่และตรวจร่างก่อนดาวน์โหลด');}
          await window.HarborFlowOktbPdf.downloadPermit({preview,ctx,profile:profile.values,logo:host.querySelector('.hfd-oktb-logo')});message(host,'ดาวน์โหลด PDF ร่างแล้ว');
        }catch(error){if([401,403].includes(error.status)){clear();host.innerHTML='<p role="alert">สิทธิ์ถูกถอน กรุณาลงชื่อเข้าใช้และตรวจสิทธิ์อีกครั้ง</p>';}else if(host.querySelector('#hfdSaveStatus'))message(host,error.message||'สร้าง PDF ไม่สำเร็จ',true);else host.textContent=error.message;}
        return;
      }
      if (target.dataset.selectCrew) {
        ctx.selected = target.dataset.selectCrew === 'all' ? new Set(preview.people.map(person => person.id)) : new Set();
        updateSelected(host, preview, ctx, airlineNames);
      }
      if (target.hasAttribute('data-flight-group')) {
        const group = groups(preview.people)[Number(target.dataset.flightGroup)];
        ctx.selected = new Set(group.ids);
        updateSelected(host, preview, ctx, airlineNames);
      }
      if (target.hasAttribute('data-clear-signature') && profile.canSave) { showSignature(host, ''); remember(host, profile, {signature:''}); }
      if (target.hasAttribute('data-download-oktb')) {
        const selected=preview.people.filter(person=>ctx.selected.has(person.id));
        if(!selected.length)return;
        try {await window.HarborFlowOktbPdf.download({preview,people:selected,ctx,profile:profile.values,logo:host.querySelector('.hfd-oktb-logo')});message(host,'ดาวน์โหลด PDF ร่างแล้ว');}
        catch(error){message(host,error.message||'สร้าง PDF ไม่สำเร็จ',true);}
      }
      if (target.hasAttribute('data-download-loi')) {
        const person=loiPerson(preview,ctx),embassy=ctx.embassy==='other'?ctx.customEmbassy:ctx.embassy;
        if(!person||!embassy)return;
        try {
          const fresh=await get({action:'preview',jobId:options.jobId,serviceId:options.serviceId,type:'loi'});
          if(account!==profile||fresh.login!==options.login)throw Error('บัญชีเปลี่ยน กรุณาเปิดเอกสารใหม่');
          const original=preview.people.find(p=>p.id===ctx.loiPersonId),current=fresh.preview.people.find(p=>p.id===ctx.loiPersonId);
          if(!current||JSON.stringify(current)!==JSON.stringify(original)||JSON.stringify(fresh.preview.job)!==JSON.stringify(preview.job))throw Error('ข้อมูล Job หรือลูกเรือเปลี่ยน กรุณาเปิดแท็บใหม่และตรวจร่างก่อนดาวน์โหลด');
          await window.HarborFlowOktbPdf.downloadLoi({preview,person,ctx:{...ctx,embassy},profile:profile.values,logo:host.querySelector('.hfd-oktb-logo')});message(host,'ดาวน์โหลด PDF ร่างแล้ว');
        }
        catch(error){
          if([401,403].includes(error.status)){clear();host.innerHTML='<p role="alert">สิทธิ์ Crew ถูกถอน กรุณาลงชื่อเข้าใช้และตรวจสิทธิ์อีกครั้ง</p>';}
          else message(host,error.message||'สร้าง PDF ไม่สำเร็จ',true);
        }
      }
      if (target.hasAttribute('data-document-retry')) mount(host, options);
    },{signal:controller.signal});
  }
  async function mount(host, options) {
    if (!host) return;
    const gen = generation;
    const profile = accountState(options.login);
    const key = [options.login, options.jobId, options.serviceId, options.type].join(':');
    if (!contexts.has(key)) contexts.set(key, {});
    const ctx = contexts.get(key);
    host.innerHTML = '<p role="status">กำลังโหลด ' + escape(labels[options.type]) + '…</p>';
    try {
      // Finish this account's pending saves before reloading its defaults.
      await profile.queue;
      const [data, prefs, airlineNames] = await Promise.all([
        get({action:'preview', jobId:options.jobId, serviceId:options.serviceId, type:options.type}),
        ['oktb','loi','permit'].includes(options.type) ? get({action:'preferences'}).catch(error=>{if(options.type==='permit' && error.status===403)return {login:options.login,preferences:{},canSave:false};throw error;}) : Promise.resolve(null),
        options.type === 'oktb' ? loadAirlineNames() : Promise.resolve(new Map())
      ]);
      if (gen !== generation || !host.isConnected || account !== profile) return;
      if (data.login !== options.login || (prefs && prefs.login !== options.login)) throw Error('บัญชีเปลี่ยน กรุณาเปิดเอกสารใหม่');
      if (prefs) {
        profile.values = { ...prefs.preferences }; profile.saved = { ...prefs.preferences };
        profile.canSave = prefs.canSave; profile.loaded = true; profile.blocked = false;
        const available = new Set(data.preview.people.map(person => person.id));
        ctx.selected = ctx.selected ? new Set([...ctx.selected].filter(id => available.has(id))) : new Set(data.preview.people.filter(person => person.category === 'On-signers').map(person => person.id));
      }
      if(options.type==='permit')permitModel=await import('./permit-draft.mjs');
      if(options.type==='permit'&&data.preview.scope?.visitorView){
        const defaults=await get({action:'permitDefaults'});
        if(defaults.login!==options.login)throw Error('บัญชีเปลี่ยน กรุณาเปิดเอกสารใหม่');
        ctx.permitDefaults=defaults;
      }
      if(gen!==generation||!host.isConnected||account!==profile)return;
      host.innerHTML = '<div class="hfd-header"><h3>' + escape(labels[options.type]) + '</h3><span class="hfd-badge">Draft</span></div>' +
        (options.type === 'oktb' ? oktbPreview(data.preview, ctx, profile, airlineNames) : options.type === 'loi' ? loiPreview(data.preview,ctx,profile) : options.type==='permit'?permitPreview(data.preview,ctx,profile):genericPreview(data.preview));
      bind(host, data.preview, ctx, profile, options, airlineNames);
    } catch(error) {
      if (gen !== generation || !host.isConnected) return;
      if ([401,403].includes(error.status)) { clear(); }
      host.innerHTML = '<p role="alert">' + escape(error.message) + '</p><button type="button" class="hfo-btn" data-document-retry>ลองใหม่</button>';
      host.querySelector('[data-document-retry]').addEventListener('click', () => mount(host, options));
    }
  }
  window.HarborFlowDocuments = { mount, clear };
})();