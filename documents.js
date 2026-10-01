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
  function bind(host, preview, ctx, profile, options, airlineNames) {
    host.addEventListener('input', event => {
      const target = event.target;
      const fields = { hfdAirline:'hfdAirlineOut', hfdContact:'hfdContactOut', hfdPhone:'hfdPhoneOut', hfdSigner:'hfdSignerOut' };
      const output = host.querySelector('#' + fields[target.id]);
      if (output) output.textContent = target.value || '[not set]';
      if (target.id === 'hfdAirline') ctx.airline = target.value;
      if (target.id === 'hfdIssueDate') { ctx.issueDate = target.value; host.querySelector('#hfdIssuedDate').textContent = displayDate(target.value); }
      if (target.id === 'hfdArrivalInput') { ctx.arrivalDate = target.value; for (const id of ['hfdArrivalDate','hfdEmbarkDate']) host.querySelector('#' + id).textContent = displayDate(target.value); }
    });
    host.addEventListener('change', async event => {
      const target = event.target;
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
    });
    host.addEventListener('click', async event => {
      const target = event.target.closest('button');
      if (!target) return;
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
      if (target.hasAttribute('data-document-retry')) mount(host, options);
    });
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
        options.type === 'oktb' ? get({action:'preferences'}) : Promise.resolve(null),
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
      host.innerHTML = '<div class="hfd-header"><h3>' + escape(labels[options.type]) + '</h3><span class="hfd-badge">Draft</span></div>' +
        (options.type === 'oktb' ? oktbPreview(data.preview, ctx, profile, airlineNames) : genericPreview(data.preview));
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

