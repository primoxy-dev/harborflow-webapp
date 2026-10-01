/* Shared Operations trial. No Job or person record is cached in browser storage. */
(() => {
  const root = document.getElementById('operations');
  const createButton = document.getElementById('createJob');
  if (!root || !createButton) return;
  const nationalities = document.createElement('datalist');
  nationalities.id = 'hfoNationalities';
  const demonyms = 'AFGHAN,ALBANIAN,ALGERIAN,AMERICAN,ANGOLAN,ARGENTINIAN,ARMENIAN,AUSTRALIAN,AUSTRIAN,AZERBAIJANI,BAHRAINI,BANGLADESHI,BELARUSIAN,BELGIAN,BOLIVIAN,BOSNIAN,BRAZILIAN,BRITISH,BULGARIAN,CAMBODIAN,CAMEROONIAN,CANADIAN,CHILEAN,CHINESE,COLOMBIAN,CROATIAN,CUBAN,CYPRIOT,CZECH,DANISH,DUTCH,ECUADORIAN,EGYPTIAN,EMIRATI,ESTONIAN,ETHIOPIAN,FIJIAN,FILIPINO,FINNISH,FRENCH,GEORGIAN,GERMAN,GHANAIAN,GREEK,HUNGARIAN,ICELANDIC,INDIAN,INDONESIAN,IRANIAN,IRAQI,IRISH,ISRAELI,ITALIAN,JAMAICAN,JAPANESE,JORDANIAN,KAZAKH,KENYAN,KOREAN,KUWAITI,LAO,LATVIAN,LEBANESE,LIBERIAN,LITHUANIAN,MALAGASY,MALAYSIAN,MALDIVIAN,MALTESE,MEXICAN,MONGOLIAN,MOROCCAN,MOZAMBICAN,MYANMAR,NEPALESE,NEW ZEALANDER,NIGERIAN,NORWEGIAN,OMANI,PAKISTANI,PANAMANIAN,PERUVIAN,POLISH,PORTUGUESE,QATARI,ROMANIAN,RUSSIAN,SAUDI,SENEGALESE,SERBIAN,SINGAPOREAN,SLOVAK,SLOVENIAN,SOUTH AFRICAN,SPANISH,SRI LANKAN,SUDANESE,SWEDISH,SWISS,SYRIAN,TAIWANESE,TANZANIAN,THAI,TUNISIAN,TURKISH,UGANDAN,UKRAINIAN,URUGUAYAN,UZBEK,VENEZUELAN,VIETNAMESE,YEMENI,ZAMBIAN,ZIMBABWEAN'.split(',');
  for (const value of [...new Set(demonyms)].sort()) {
    const choice = document.createElement('option'); choice.value = value; nationalities.appendChild(choice);
  }
  document.body.appendChild(nationalities);
  const TYPES = ['Crew Change','Visitor','SIRE Inspector','Surveyor','Provision & Store','Ship Spare & Courier & Offland','Cash to Master','Medical Visit','SSCEC','Fresh Water','Garbage & Sludge','UWI & UWC','Others'];
  const LEGACY_TYPES = ['Port Clearance','Garbage','CTM','Provisions','Launch Boat','Transport','Spare Parts/Customs','Medical','Inspection/Technical Visit','Other'];
  const SERVICE_ICONS = {
    'Crew Change':'👥','Visitor':'🪪','SIRE Inspector':'🔍','Surveyor':'📐',
    'Provision & Store':'📦','Ship Spare & Courier & Offland':'🚚','Cash to Master':'💵',
    'Medical Visit':'🩺','SSCEC':'🛡️','Fresh Water':'💧','Garbage & Sludge':'♻️',
    'UWI & UWC':'⚓','Others':'⋯','Port Clearance':'🛂','Garbage':'♻️',
    'CTM':'💵','Provisions':'📦','Launch Boat':'🚤','Transport':'🚐',
    'Spare Parts/Customs':'🚚','Medical':'🩺','Inspection/Technical Visit':'🔍','Other':'⋯'
  };
  const JOB_STATUSES = ['Draft','Planned','Confirmed','In Progress','On Hold','Completed','Cancelled'];
  const SERVICE_STATUSES = ['Not Started','In Progress','Waiting','Completed','Cancelled'];
  const CATEGORIES = ['On-signers','Off-signers','Medical visitors','SIRE Inspectors','Surveyors','Service Engineers','Other'];
  const TYPE_FIELDS = {
    'Crew Change': [['changeType','Change type'],['boardingPoint','Boarding point'],['crewNotes','Crew change notes']],
    'Visitor': [['purpose','Visit purpose'],['boardingPoint','Boarding point']],
    'SIRE Inspector': [['inspectionDate','Inspection date','datetime-local'],['company','Company'],['boardingPoint','Boarding point']],
    'Surveyor': [['surveyType','Survey type'],['company','Company'],['boardingPoint','Boarding point']],
    'Provision & Store': [['requestedQuantity','Requested quantity','number'],['actualQuantity','Actual quantity','number'],['unit','Unit'],['deliveryPoint','Delivery point'],['receipt','Receipt reference']],
    'Ship Spare & Courier & Offland': [['shipment','Shipment'],['awbBl','AWB / B/L'],['consignee','Consignee'],['deliveryToVessel','Delivery / offland details']],
    'Cash to Master': [['amount','Transferred amount','number'],['currency','Currency'],['recipient','Recipient'],['receipt','Receipt reference']],
    'Medical Visit': [['appointment','Appointment','datetime-local'],['coordinator','Coordinator'],['requiredDocuments','Required documents (no diagnosis)']],
    'SSCEC': [['inspectionDate','Inspection date','datetime-local'],['certificateReference','Certificate reference']],
    'Fresh Water': [['requestedQuantity','Requested quantity','number'],['actualQuantity','Actual quantity','number'],['unit','Unit'],['deliveryPoint','Delivery point'],['receipt','Receipt reference']],
    'Garbage & Sludge': [['requestedQuantity','Requested quantity','number'],['actualQuantity','Actual quantity','number'],['wasteType','Waste type'],['disposalCertificate','Disposal certificate']],
    'UWI & UWC': [['workScope','Work scope'],['contractor','Contractor'],['permitReference','Permit reference']],
    'Others': [['customDetails','Custom details']],
    'Port Clearance': [['arrivalFormalities','Arrival formalities'],['departureFormalities','Departure formalities'],['authority','Authority']],
    'Garbage': [['requestedQuantity','Requested quantity','number'],['actualQuantity','Actual quantity','number'],['wasteType','Waste type']],
    'CTM': [['amount','Transferred amount','number'],['currency','Currency'],['recipient','Recipient']],
    'Provisions': [['requestedQuantity','Requested quantity','number'],['actualQuantity','Actual quantity','number']],
    'Launch Boat': [['boardingPoint','Boarding point'],['boatPurpose','Purpose']],
    'Transport': [['pickupPoint','Pickup point'],['transportPurpose','Purpose']],
    'Spare Parts/Customs': [['shipment','Shipment'],['awbBl','AWB / B/L'],['consignee','Consignee']],
    'Medical': [['appointment','Appointment','datetime-local'],['coordinator','Coordinator']],
    'Inspection/Technical Visit': [['visitType','Visit type'],['company','Company / authority']],
    'Other': [['customDetails','Custom details']]
  };

  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const option = (values, current) => values.map(v => `<option value="${escape(v)}" ${v === current ? 'selected' : ''}>${escape(v)}</option>`).join('');
  const f = (label, value, name, type = 'text', extra = '') => `<label class="hfo-field"><span>${escape(label)}</span><input type="${type}" name="${escape(name)}" value="${escape(value || '')}" ${extra}></label>`;
  const sel = (label, value, name, values, extra = '') => `<label class="hfo-field"><span>${escape(label)}</span><select name="${escape(name)}" ${extra}>${option(values, value)}</select></label>`;
  const area = (label, value, name, extra = '') => `<label class="hfo-field"><span>${escape(label)}</span><textarea name="${escape(name)}" ${extra}>${escape(value || '')}</textarea></label>`;
  const portOptions = current => {
    const choices = [...new Set([current, ...state.portChoices].filter(Boolean))];
    return '<option value="">Select Port / Terminal</option>' + option(choices, current);
  };
  const portSelect = (current, extra) => '<label class="hfo-field"><span>Port / Terminal</span><select name="port" ' + extra + '>' + portOptions(current) + '</select><small class="hfo-muted" data-port-status>' + escape(state.portStatus) + '</small></label>';
  let state = { login: '', grant: null, public: false, jobs: [], services: [], people: [], peopleLoadedFor: null, trips: [], view: 'month', anchor: new Date(), callsOpen: true, openJobId: null, openServiceId: null, tab: 'details', busy: false, error: '', sync: '', conflict: null, personDraft: null, tripDraft: null, modal: null, history: [], portChoices: [], portStatus: 'Loading Port / Terminal…' };
  let personSaveTimer = null, personSaveQueue = Promise.resolve(), personCreateInFlight = false;
  const isOwner = () => state.grant?.role === 'owner';
  const isEditor = () => isOwner() || state.grant?.role === 'editor';
  const job = () => state.jobs.find(x => x.id === state.openJobId);
  const service = () => state.services.find(x => x.id === state.openServiceId);
  const mayEditJob = j => isOwner() || state.grant?.role === 'editor' && j?.data.pic === state.login;
  const mayEditService = s => mayEditJob(job()) || state.grant?.role === 'editor' && s?.data.pic === state.login;
  const serviceList = j => state.services.filter(x => x.job_id === j.id && !x.removed_at).sort((a,b) => a.seq-b.seq);
  const anyPeopleView = () => state.grant?.crewView || state.grant?.visitorView;
  const canPeople = kind => kind === 'crew' ? state.grant?.crewView : state.grant?.visitorView;
  const canEditPeople = kind => isEditor() && mayEditService(service()) && (kind === 'crew' ? state.grant?.crewEdit : state.grant?.visitorEdit);
  const dateOnly = value => value ? String(value).slice(0,10) : '';
  const formatDate = value => value ? escape(String(value).replace('T',' ').slice(0,16)) : '—';
  function formatDdMmm(value) {
  const d=dateOnly(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'DDMMM';
  const date=new Date(d+'T00:00:00Z');
  return Number.isNaN(date.getTime())?'DDMMM':String(date.getUTCDate()).padStart(2,'0')+date.toLocaleString('en',{month:'short',timeZone:'UTC'}).toUpperCase();
}
  const announce = message => { state.error = message; const el = document.querySelector('.hfo-overlay #hfoNotice') || document.querySelector('#operations #hfoNotice'); if (el) { el.textContent = message; el.hidden = !message; } };
  async function api(action, payload, method = 'POST') {
    const url = method === 'GET' ? '/api/operations?' + new URLSearchParams({ action, ...payload }) : '/api/operations';
    const response = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store',
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
      body: method === 'POST' ? JSON.stringify({ action, ...payload }) : undefined });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (action !== 'state' && response.status === 401) {
        state.jobs = []; state.services = []; state.people = []; state.trips = []; state.openJobId = null; state.openServiceId = null;
        render();
      }
      const err = new Error(body.error || 'Request failed');
      err.code = response.status; err.detail = body; throw err;
    }
    return body;
  }
  async function refresh() {
    if (state.busy) return;
    const editing = Boolean(state.modal || state.openJobId || state.openServiceId || state.personDraft || state.tripDraft);
    try {
      let next;
      try { next = await api('state', {}, 'GET'); }
      catch (authError) {
        if (![401,403,503].includes(authError.code)) throw authError;
        next = await api('publicState', {}, 'GET');
      }
      const scopeChanged = Boolean(next.public) !== state.public || (next.login||'') !== state.login || JSON.stringify(next.grant||null) !== JSON.stringify(state.grant);
      if (scopeChanged) { window.HarborFlowDocuments?.clear(); state.people=[]; state.peopleLoadedFor=null; state.trips=[]; state.personDraft=null; }
      state.public = Boolean(next.public);
      state.login = next.login || ''; state.grant = next.grant || null;
      state.sync = 'Synced ' + new Date().toLocaleTimeString();
      if (state.public) { state.people = []; state.trips = []; state.history = []; state.personDraft = null; state.tripDraft = null; state.modal = null; }
      // Keep the original field values in an open editor so a concurrent write
      // is compared against the user's true base, not silently replaced by polling.
      if (editing && !scopeChanged) return;
      state.jobs = next.jobs; state.services = next.services;
      if (state.openJobId && !job()) { state.openJobId = null; state.openServiceId = null; state.people = []; state.trips = []; }
      render();
    } catch (e) { window.HarborFlowDocuments?.clear(); state.grant = null; state.public = false; state.jobs = []; state.services = []; state.people = []; state.trips = []; state.openJobId = null; state.openServiceId = null; state.modal = null; state.sync = ''; state.error = e.message; render(); }
  }
  function metrics() {
    const now = Date.now();
    const completed = state.services.filter(s => !s.removed_at && s.data.status === 'Completed' && s.data.baselineDue);
    const onTime = completed.filter(s => s.data.actualEnd && Date.parse(s.data.actualEnd) <= Date.parse(s.data.baselineDue));
    const overdue = state.services.filter(s => !s.removed_at && !['Completed','Cancelled'].includes(s.data.status) && s.data.plannedEnd && Date.parse(s.data.plannedEnd) < now);
    const [start, end] = period();
    const previousStart = new Date(start);
    previousStart.setDate(previousStart.getDate() - 1);
    const [priorStart, priorEnd] = periodFor(state.view, previousStart);
    const currentCalls = countHusbandryCalls(start, end);
    const priorCalls = countHusbandryCalls(priorStart, priorEnd);
    const change = currentCalls - priorCalls;
    const previous = { week: 'previous week', month: 'previous month', quarter: 'previous quarter', year: 'previous year' }[state.view];
    const percentage = priorCalls ? ' (' + (change > 0 ? '+' : '') + Math.round(change / priorCalls * 100) + '%)' : change ? ' (from 0)' : ' (0%)';
    const trend = (change > 0 ? '↑ +' : change < 0 ? '↓ ' : '→ ') + change + percentage + ' vs ' + previous;
    return [
      ['Husbandry calls', currentCalls, trend, change > 0 ? 'up' : change < 0 ? 'down' : 'flat'],
      ['On-time services', completed.length ? Math.round(onTime.length / completed.length * 100) + '%' : 'No data'],
      ['Overdue services', overdue.length]
    ];
  }
  function startOfWeek(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function periodFor(view, anchor) {
    const d = new Date(anchor), year = d.getFullYear(), month = d.getMonth();
    if (view === 'week') { const a = startOfWeek(d), b = new Date(a); b.setDate(a.getDate() + 6); return [a, b, a.toLocaleDateString() + ' – ' + b.toLocaleDateString()]; }
    if (view === 'month') return [new Date(year, month, 1), new Date(year, month + 1, 0), d.toLocaleDateString('en', { month: 'long', year: 'numeric' })];
    if (view === 'quarter') { const q = Math.floor(month / 3); return [new Date(year, q * 3, 1), new Date(year, q * 3 + 3, 0), 'Q' + (q + 1) + ' ' + year]; }
    return [new Date(year, 0, 1), new Date(year, 11, 31), String(year)];
  }
  function period() { return periodFor(state.view, state.anchor); }
  function shift(delta) {
    const [start] = period(), d = new Date(start);
    if (state.view === 'week') d.setDate(d.getDate() + 7 * delta);
    else if (state.view === 'month') d.setMonth(d.getMonth() + delta);
    else if (state.view === 'quarter') d.setMonth(d.getMonth() + 3 * delta);
    else d.setFullYear(d.getFullYear() + delta);
    state.anchor = d; render();
  }
  function localKey(date) { return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
  function countHusbandryCalls(start, end) {
    const first = localKey(start), last = localKey(end);
    return state.jobs.filter(j => j.data.status !== 'Cancelled' && j.data.eta && dateOnly(j.data.eta) >= first && dateOnly(j.data.eta) <= last).length;
  }
  function matchesDate(j, date) { return j.data.eta && dateOnly(j.data.eta) === localKey(date); }
  function calendar() {
    const [start,end,label]=period();
    if (state.view === 'quarter' || state.view === 'year') {
      const months=[]; let d=new Date(start);
      while (d<=end) { const y=d.getFullYear(), m=d.getMonth(), first=new Date(y,m,1), last=new Date(y,m+1,0);
        const calls=state.jobs.filter(j=>j.data.status!=='Cancelled' && j.data.eta && dateOnly(j.data.eta)>=localKey(first) && dateOnly(j.data.eta)<=localKey(last));
        months.push(`<div class="hfo-card"><b>${escape(d.toLocaleDateString('en',{month:'long',year:'numeric'}))}</b><p>${calls.length} Husbandry Calls</p>${calls.map(j=>`<button class="hfo-btn" data-open-job="${j.id}">${escape(j.data.vessel || 'Draft')}${state.public?'':' · '+escape(j.data.jobNo || 'No Job No.')}</button>`).join(' ')}</div>`);
        d.setMonth(d.getMonth()+1);
      }
      return `<div class="hfo-stats">${months.join('')}</div>`;
    }
    const first=state.view==='month' ? startOfWeek(start) : start, days=state.view==='month' ? 42 : 7;
    return `<div class="hfo-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<b class="hfo-weekday">${x}</b>`).join('')}${Array.from({length:days},(_,i)=>{ const d=new Date(first); d.setDate(first.getDate()+i); const calls=state.jobs.filter(j=>j.data.status!=='Cancelled' && matchesDate(j,d)); const outside=state.view==='month' && d.getMonth()!==start.getMonth(); return `<div class="hfo-cell${outside?' hfo-outside':''}"><small>${d.getDate()} ${state.view==='week'?escape(d.toLocaleDateString('en',{month:'short'})):''}</small>${calls.map(j=>`<button class="hfo-job-pill" data-open-job="${j.id}"><b>${escape(j.data.vessel||'Draft')}</b><span class="hfo-job-meta">${escape(j.data.port||'No port')} · ${escape(j.data.status)}</span></button>`).join('')}</div>`;}).join('')}</div>`;
  }
  function renderHome() {
    if (root.classList.contains('active')) document.getElementById('title').textContent='Operations · Trial';
    createButton.textContent='+ Create Port Call'; createButton.hidden=!isOwner() || !root.classList.contains('active');
    root.innerHTML=`<div class="hfo-shell">
      <div class="hfo-banner">ระบบทดลองซิงค์ข้ามเครื่อง · ใช้ข้อมูลสมมติเท่านั้น ห้ามกรอกข้อมูลลูกเรือหรือผู้เยี่ยมจริง${state.public?' · ผู้ชมทั่วไปเห็นเฉพาะข้อมูลสรุป':''}</div>
      <div id="hfoNotice" class="hfo-alert" ${state.error?'':'hidden'}>${escape(state.error)}</div>
      ${!state.grant && !state.public ? `<div class="hfo-card"><h2>Operations unavailable</h2><p>${escape(state.error||'Unable to load Operations data right now.')}</p></div>` :
      `<div class="hfo-stats">${metrics().map(([label,value,indicator,trend])=>`<div class="hfo-card hfo-stat"><span>${escape(label)}</span><strong>${escape(value)}</strong>${indicator?`<small class="hfo-trend ${trend}">${escape(indicator)}</small><small class="hfo-muted">By ETA · excludes Cancelled</small>`:''}</div>`).join('')}</div>
       ${state.public?'<div class="hfo-info">ดู Job และ Service แบบสรุปได้โดยไม่ต้องลงชื่อเข้าใช้ · <a href="/api/auth?mode=start">ลงชื่อเข้าใช้เพื่อดูรายละเอียดและแก้ไขตามสิทธิ์</a></div>':''}
       <div class="hfo-card hfo-calendar-card"><div class="hfo-toolbar"><h2>Husbandry Call Calendar</h2><div class="hfo-row"><button class="hfo-btn" data-shift="-1" aria-label="Previous period">‹</button><b>${escape(period()[2])}</b><button class="hfo-btn" data-shift="1" aria-label="Next period">›</button><select id="hfoView" aria-label="Calendar view">${option(['week','month','quarter','year'],state.view)}</select></div></div><p class="hfo-muted">Jobs appear on their ETA date · port local time</p>${calendar()}</div>
       <details class="hfo-card hfo-calls" ${state.callsOpen?'open':''}><summary data-calls-toggle><span>All Husbandry Calls</span><span class="hfo-muted">${state.jobs.length} calls · ${escape(state.sync)}</span></summary><div class="hfo-list">${state.jobs.length ? state.jobs.map(j=>`<div class="hfo-list-row"><button data-open-job="${j.id}"><b>${escape(j.data.vessel||'Draft Port Call')}</b><small>${state.public?'':escape((j.data.jobNo||'No Job No.')+' · ')}${escape(j.data.port||'No port')} · ETA ${formatDate(j.data.eta)}${state.public?'':' – ETD '+formatDate(j.data.etd)}</small></button><span>${escape(j.data.status)}</span></div>`).join(''):'<div class="hfo-empty">ยังไม่มี Port Call ในฐานข้อมูลทดลอง</div>'}</div></details>
       ${isOwner()?'<button class="hfo-btn" data-grants>Manage Operations access</button>':''}`}
    </div>`;
    document.querySelector('.top .actions select').style.display='none';
  }
  function overlay(content, title, subtitle='') {
    document.querySelector('.hfo-overlay')?.remove();
    const el=document.createElement('div'); el.className='hfo-overlay';
    el.innerHTML=`<div class="hfo-overlay-head"><div><b>${escape(title)}</b><small class="hfo-muted" style="display:block">${escape(subtitle)}</small></div><button class="hfo-btn" data-close>Close ×</button></div><div class="hfo-overlay-body"><div id="hfoNotice" class="hfo-alert" ${state.error?'':'hidden'}>${escape(state.error)}</div>${content}</div>`;
    document.body.appendChild(el);
  }
  function renderPublicJob() {
  const j=job(); if (!j) return;
  const calls=serviceList(j);
  overlay(`<div class="hfo-banner">Public summary only · รายชื่อ Crew/Visitor และข้อมูลภายในต้องลงชื่อเข้าใช้</div>
    <div class="hfo-section"><h2>${escape(j.data.vessel||'Draft Port Call')}</h2><p>${escape(j.data.port||'—')} · ${escape(j.data.status||'—')}</p><p>ETA: ${formatDate(j.data.eta)}</p></div>
    <div class="hfo-section"><h3>Services</h3><div class="hfo-service-grid">${calls.length?calls.map(s=>serviceTile(s,true)).join(''):'<p class="hfo-muted">No Services yet.</p>'}</div></div>
    <a class="hfo-btn primary" href="/api/auth?mode=start">Sign in for permitted details and editing</a>`,j.data.vessel||'Port Call','Public view');
}
  function renderPublicService() {
    const s = service(), j = job(); if (!s || !j) return;
    overlay(`<div class="hfo-banner">Public Service summary only · บุคคล เอกสาร และหมายเหตุไม่แสดง</div>
      <div class="hfo-section"><button class="hfo-btn" data-back-job>← Job</button>
      <h2>#${s.seq} · ${escape(s.data.type||'Service')}</h2><p>${escape(j.data.vessel||'Port Call')} · ${escape(s.data.status||'—')}</p></div>
      <a class="hfo-btn primary" href="/api/auth?mode=start">Sign in for permitted details and editing</a>`, `#${s.seq} · ${s.data.type||'Service'}`, 'Public view');
  }
  function render() {
    renderHome();
    if (state.public && state.openServiceId) renderPublicService();
    else if (state.public && state.openJobId) renderPublicJob();
    else if (state.modal === 'grants') renderGrants();
    else if (state.modal === 'create') renderCreate();
    else if (state.modal === 'addService') renderAddService();
    else if (state.openServiceId) renderService();
    else if (state.openJobId) renderJob();
    else document.querySelector('.hfo-overlay')?.remove();
  }
  function jobFields(data, editable, create=false) {
    const disable=editable?'':'disabled';
    const attr=create ? '' : 'data-job-field';
    return `<div class="hfo-form-grid">
      ${f('Job No.',data.jobNo,'jobNo','text',`${disable} ${attr} ${create?'required':''}`)}
      ${f('Vessel',data.vessel,'vessel','text',`${disable} ${attr} ${create?'required':''}`)}
      ${f('IMO',data.imo,'imo','text',`${disable} ${attr}`)}
      <div class="hfo-field"><span>Find IMO from vessel name</span><button type="button" class="hfo-btn" data-lookup-imo ${disable}>Search IMO</button><small class="hfo-muted" data-imo-feedback>Suggestions from Wikidata; verify before use.</small><div class="hfo-imo-results" data-imo-results></div></div>
      ${portSelect(data.port,`${disable} ${attr}`)}
      ${f('Principal',data.principal,'principal','text',`${disable} ${attr}`)}
      ${f('ETA',data.eta,'eta','datetime-local',`${disable} ${attr} ${create?'required':''}`)}
      ${f('ETD',data.etd,'etd','datetime-local',`${disable} ${attr}`)}
      ${sel('Status',data.status,'status',JOB_STATUSES,`${disable} ${attr}`)}
      ${f('Job PIC (GitHub login)',data.pic,'pic','text',`${isOwner()?'': 'disabled'} ${attr}`)}
      ${area('Notes',data.notes,'notes',`${disable} ${attr}`)}
    </div>`;
  }
  function renderCreate() {
    overlay(`<div class="hfo-banner">Create Draft requires Vessel, Job No. and ETA to create its private GitHub folder · Planned also requires Port · Confirmed also requires Principal and Job PIC.</div>
      <form id="hfoCreateJob" class="hfo-section"><h2>New Port Call</h2>${jobFields({status:'Draft'},true,true)}
      <div class="hfo-actions" style="margin-top:16px"><button class="hfo-btn primary">Create Draft</button></div></form>`, 'Create Port Call', 'Trial data only');
  }
  function serviceTile(s, publicView=false) {
  const type=s.data.type||'Service';
  const icon=SERVICE_ICONS[type]||'⚙️';
  const label=escape(type);
  const status=escape(s.data.status||'—');
  const personType=['Crew Change','Visitor','SIRE Inspector','Surveyor','Medical Visit','Inspection/Technical Visit','Medical'].includes(type);
  const personKind=type==='Crew Change'?'crew':'visitor';
  const count=state.peopleLoadedFor===s.job_id && !publicView && personType && canPeople(personKind)
    ? state.people.filter(p=>p.kind===personKind && Array.isArray(p.data.serviceIds) && p.data.serviceIds.includes(s.id)).length : null;
  return `<div class="hfo-service-card"><button class="hfo-service-tile" type="button" data-open-service="${s.id}" aria-label="Open ${label}, ${status}">
    <span class="hfo-service-icon" aria-hidden="true">${icon}<small class="hfo-service-count">${personType && count!==null?count+'p':'1s'}</small></span><span class="hfo-service-name">${label}</span>
    <span class="hfo-service-meta"><small>#${s.seq}</small><small class="hfo-status">${status}</small>${personType && count!==null?`<small>${count} people</small>`:''}</span>
    </button>${!publicView && mayEditService(s)?`<button class="hfo-btn danger hfo-remove-service" type="button" data-remove-service="${s.id}" aria-label="Remove ${label}">×</button>`:''}</div>`;
}
  function renderJob() {
  const j=job(); if (!j) return;
  const services=serviceList(j), editable=mayEditJob(j);
  const folderUrl=j.data.documentsPath?'https://github.com/primoxy-dev/harborflow-job-documents/tree/main/'+j.data.documentsPath.split('/').map(encodeURIComponent).join('/'):'';
  const folderControl=folderUrl?`<a class="hfo-btn" href="${escape(folderUrl)}" target="_blank" rel="noopener noreferrer">Open GitHub folder</a>${isOwner()?'<button class="hfo-btn" data-sync-job-folder>Sync GitHub folders</button>':''}<small class="hfo-muted">Folder follows Vessel, Job No., ETA and Cancelled status.</small>`:isOwner()?'<button class="hfo-btn" data-sync-job-folder>Create GitHub folder</button>':'<small class="hfo-muted">GitHub folder not created</small>';
  overlay(`<div class="hfo-banner">ข้อมูลทดลองเท่านั้น · ห้ามใช้ข้อมูลลูกเรือหรือผู้เยี่ยมจริง · Autosave เมื่อเปลี่ยนช่องข้อมูล</div>
    <div class="hfo-section"><div class="hfo-toolbar"><div><h2>${escape(j.data.vessel||'Draft Port Call')}</h2><span class="hfo-muted">${escape(j.data.jobNo||'No Job No.')} · ${escape(j.data.port||'No port')} · ${escape(j.data.status)}</span></div><span class="hfo-muted" id="hfoSync">${escape(state.sync)}</span></div>
    ${jobFields(j.data,editable)}<div class="hfo-actions">${folderControl}</div><p class="hfo-muted">Job ID: ${escape(j.id)} · assigned PIC does not automatically grant access</p></div>
    <div class="hfo-section"><div class="hfo-toolbar"><h3>Services</h3>${editable?'<button class="hfo-btn primary" data-add-service>+ Add Service</button>':''}</div>
    <div class="hfo-service-grid">${services.length?services.map(s=>serviceTile(s)).join(''):'<div class="hfo-empty">No Services yet.</div>'}</div></div>
    <div class="hfo-section"><div class="hfo-toolbar"><h3>Activity</h3><button class="hfo-btn" data-history="job" data-history-id="${j.id}">View history</button></div><div id="hfoHistory">${historyHtml()}</div></div>
    ${isOwner()?removedServices(j):''}`, j.data.vessel||'Draft Port Call', j.data.jobNo||j.id);
}
  function removedServices(j) {
    const removed=state.services.filter(s=>s.job_id===j.id && s.removed_at);
    return removed.length?`<div class="hfo-section"><h3>Removed Services · owner restore</h3>${removed.map(s=>`<div class="hfo-list-row">#${s.seq} ${escape(s.data.type)} · ${escape(s.removed_reason)}<button class="hfo-btn" data-restore-service="${s.id}">Restore</button></div>`).join('')}</div>`:'';
  }
  function historyHtml() { return state.history.map(e=>`<div class="hfo-list-row"><b>${escape(e.action)}</b><small>${escape(e.actor)} · ${formatDate(e.created_at)} · ${escape(e.reason||'')}</small></div>`).join('') || '<p class="hfo-muted">Select View history.</p>'; }
  async function saveJobField(target) {
    const j=job(); if (!j || !mayEditJob(j)) return;
    const field=target.name, value=target.value, old=j.data[field]??'';
    if (value===old) return;
    let reason='';
    if (field==='status' && value==='Completed') reason=prompt('If any Service is unfinished, owner exception reason is required:')||'';
    try {
      const out=await api('updateJob',{id:j.id,patch:{[field]:value},base:{[field]:old},reason});
      Object.assign(j,out.record); state.sync='Saved '+new Date().toLocaleTimeString(); state.error='';
      render();
    } catch(e) { handleSaveError(e,{kind:'job',id:j.id,field,value,old,reason}); }
  }

  function renderAddService() {
    const j=job(); if (!j) return;
    overlay(`<div class="hfo-banner">Each Service instance gets a permanent number. Repeated types are allowed.</div>
      <form class="hfo-section" id="hfoAddService"><h2>Add Service to ${escape(j.data.vessel||'Port Call')}</h2>
       <div class="hfo-form-grid">${sel('Service type','Crew Change','type',TYPES)}${f('Description','','description')}${f('Service PIC (GitHub login)','','pic')}</div>
      <p class="hfo-muted">A PIC name does not grant account access. Other fields can be filled in the dedicated Service view.</p>
      <button class="hfo-btn primary">Add Service</button></form>`, 'Add Service', j.data.jobNo||j.id);
  }
  function serviceDetails(s, editable) {
    const d=s.data, dis=editable?'':'disabled';
    const attr='data-service-field';
    const specifics=(TYPE_FIELDS[d.type]||TYPE_FIELDS.Others).map(([name,label,type])=>f(label,d.details?.[name],name,type||'text',`${dis} data-detail-field`)).join('');
    return `<div class="hfo-section"><h3>Shared details</h3><div class="hfo-form-grid">
       ${sel('Type',d.type,'type',TYPES.includes(d.type)?TYPES:[d.type,...TYPES],`${dis} ${attr}`)}
      ${sel('Status',d.status,'status',SERVICE_STATUSES,`${dis} ${attr}`)}
      ${f('Description',d.description,'description','text',`${dis} ${attr}`)}
      ${f('Service PIC (GitHub login)',d.pic,'pic','text',`${isOwner()||mayEditJob(job())?'':'disabled'} ${attr}`)}
      ${f('Supplier',d.supplier,'supplier','text',`${dis} ${attr}`)}
      ${f('Planned start',d.plannedStart,'plannedStart','datetime-local',`${dis} ${attr}`)}
      ${f('Planned end',d.plannedEnd,'plannedEnd','datetime-local',`${dis} ${attr}`)}
      ${f('Actual start',d.actualStart,'actualStart','datetime-local',`${dis} ${attr}`)}
      ${f('Actual end',d.actualEnd,'actualEnd','datetime-local',`${dis} ${attr}`)}
      ${sel('Terminal condition',d.terminalCondition||'Unverified','terminalCondition',['Unverified','Allowed','Restricted'],`${dis} ${attr}`)}
      ${f('Terminal confirmation',d.terminalConfirmation,'terminalConfirmation','text',`${dis} ${attr}`)}
      ${f('Restriction / unverified reason',d.restrictionReason,'restrictionReason','text',`${dis} ${attr}`)}
      ${area('Notes',d.notes,'notes',`${dis} ${attr}`)}
      </div><div class="hfo-row" style="margin-top:12px"><label class="hfo-checkbox"><input type="checkbox" name="planConfirmed" data-service-check ${d.planConfirmed?'checked':''} ${dis}> Plan confirmed</label>
      <label class="hfo-checkbox"><input type="checkbox" name="supplierConfirmed" data-service-check ${d.supplierConfirmed?'checked':''} ${dis}> Supplier confirmed</label></div>
      <p class="hfo-muted">Baseline due: ${formatDate(d.baselineDue)}. Once locked, a deadline change needs a reason.</p></div>
      <div class="hfo-section"><h3>${escape(d.type)} · specific form</h3><div class="hfo-form-grid">${specifics}</div>
       ${['Other','Others'].includes(d.type)?'<p class="hfo-muted">Custom fields are instance-specific; standard templates need owner approval.</p>':''}</div>`;
  }
  function checklistHtml(s) {
    const list=Array.isArray(s.data.checklist)?s.data.checklist:[];
    return `<div class="hfo-section"><div class="hfo-toolbar"><h3>Checklist · SOP ${escape(s.data.sopVersion||'not set')}</h3>${mayEditService(s)?'<button class="hfo-btn" data-add-step>+ Add step</button>':''}</div>
      ${list.length?list.map((step,i)=>`<div class="hfo-checklist-row"><input type="checkbox" data-step="${i}" ${step.done?'checked':''} ${mayEditService(s)?'':'disabled'}><span style="flex:1">${escape(step.text)}</span><small class="hfo-muted">${step.done?`${escape(step.actor||'')} · ${formatDate(step.completedAt)}`:''}</small>${mayEditService(s)?`<button class="hfo-btn danger" data-remove-step="${i}">×</button>`:''}</div>`).join(''):'<p class="hfo-muted">No checklist steps yet.</p>'}</div>`;
  }
  function crewTableInput(p, field, label, type='text', editable=false) {
  return `<input data-person-field="${field}" data-person-id="${p.id}" aria-label="${escape(label)} for ${escape(p.data.name||'crew member')}" type="${type}" value="${escape(p.data[field]||'')}" ${field==='nationality'?'list="hfoNationalities" autocomplete="off"':''} ${editable?'':'disabled'}>`;
}
  function personRow(p, i, kind) {
  const edit=canEditPeople(kind), expanded=state.personDraft?.id===p.id;
  const fields=[['nationality','Nationality'],['rank','Rank'],['dob','Date of Birth','date'],['seamanBook','Seaman book'],['passport','Passport'],['passportExpiry','PP. EXP','date']];
  const nameCell=`<input data-person-field="name" data-person-id="${p.id}" aria-label="Name – Surname" value="${escape(p.data.name||'')}" ${edit?'':'disabled'}><button type="button" class="hfo-name-link" data-edit-person="${p.id}" aria-expanded="${expanded}">Immigration & flight details <span aria-hidden="true">${expanded?'▴':'▾'}</span></button>`;
  return `<tr class="hfo-person-row"><td data-label="No.">${i+1}</td><td data-label="Name – Surname">${nameCell}</td>${fields.map(([key,label,type])=>`<td data-label="${label}">${crewTableInput(p,key,label,type||'text',edit)}</td>`).join('')}
    <td data-label="Actions">${edit?`<button type="button" class="hfo-btn danger" data-remove-person="${p.id}" aria-label="Remove ${escape(p.data.name)}">×</button>`:''}</td></tr>
    ${expanded?`<tr class="hfo-person-details-row"><td colspan="9">${personForm()}</td></tr>`:''}`;
}
  function newPersonRow(category, kind) {
  const draft=state.personDraft;
  if (!draft?.newRow || draft.data.category!==category) return '';
  const input=(field,label,type='text')=>`<input data-new-person-field="${field}" aria-label="${label}" type="${type}" placeholder="${label}" value="${escape(draft.data[field]||'')}" ${field==='nationality'?'list="hfoNationalities" autocomplete="off"':''}>`;
  return `<tr class="hfo-person-row hfo-new-person"><td data-label="No.">New</td>
    <td data-label="Name – Surname">${input('name','Name – Surname')}</td>
    <td data-label="Nationality">${input('nationality','Nationality')}</td>
    <td data-label="Rank">${input('rank','Rank')}</td>
    <td data-label="Date of Birth">${input('dob','Date of Birth','date')}</td>
    <td data-label="Seaman book">${input('seamanBook','Seaman book')}</td>
    <td data-label="Passport">${input('passport','Passport')}</td>
    <td data-label="PP. EXP">${input('passportExpiry','PP. EXP','date')}</td>
    <td data-label="Actions"><small data-person-save-status role="status">Enter a name to save automatically</small></td></tr>`;
}
  function rosterHtml(s) {
  const crew=s.data.type==='Crew Change';
  const kind=crew?'crew':'visitor';
  if (!canPeople(kind)) return `<div class="hfo-section hfo-alert">Separate ${crew?'Crew':'Visitor'} view permission is required. Job/Service PIC alone does not grant it.</div>`;
  const categories=crew?CATEGORIES.slice(0,2):CATEGORIES.slice(2);
  const filtered=state.people.filter(p=>p.kind===kind && Array.isArray(p.data.serviceIds) && p.data.serviceIds.includes(s.id));
  return `<div class="hfo-section"><div class="hfo-banner">ข้อมูลบุคคลสมมติหรือปกปิดตัวตนเท่านั้น · อย่าใส่เลขเอกสารจริงในช่วงทดลอง</div>
    <div class="hfo-toolbar"><h3>${crew?'Crew members':'Visitors'}</h3><small class="hfo-muted">${filtered.length} people · คลิก Immigration & flight details to expand</small></div>
    ${categories.map(category=>{const list=filtered.filter(p=>p.data.category===category);
      return `<details class="hfo-group" ${crew||list.length||state.personDraft?.data.category===category?'open':''}><summary>${escape(category)} (${list.length})</summary>
        <div class="hfo-table-wrap"><table class="hfo-table hfo-roster-table"><thead><tr><th>No.</th><th>Name – Surname</th><th>Nationality</th><th>Rank</th><th>Date of Birth</th><th>Seaman book</th><th>Passport</th><th>PP. EXP</th><th></th></tr></thead>
        <tbody>${list.map((p,i)=>personRow(p,i,kind)).join('')}${newPersonRow(category,kind)}</tbody>
        ${canEditPeople(kind)?`<tfoot><tr><td colspan="9"><button type="button" class="hfo-btn" data-add-person="${kind}" data-person-category="${escape(category)}">+ Add ${escape(category)}</button></td></tr></tfoot>`:''}
        </table></div></details>`}).join('')}</div>`;
}

  let flightCodes={airlines:[],airports:[]},flightCodesPromise,flightCodesFailed=false;
  async function loadFlightCodes() {
    if(!flightCodesPromise)flightCodesPromise=(async()=>{
      try {
        const response=await fetch('/data/flight-codes.json',{cache:'no-cache'});
        if(!response.ok)throw Error('Code list unavailable');
        const body=await response.json();
        if(!Array.isArray(body.airlines)||!Array.isArray(body.airports))throw Error('Invalid code list');
        flightCodes={airlines:body.airlines,airports:body.airports};
      } catch {
        flightCodesFailed=true;
      }
      return flightCodes;
    })();
    return flightCodesPromise;
  }
  function closeCodeSuggestions(input) {
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
    const list=document.getElementById(input.getAttribute('aria-controls'));
    if(list)list.hidden=true;
  }
  function codeLabel(row,kind) {
    return kind==='airlines'?[row[1],row[2],row[3]].filter(Boolean).join(' · '):[row[1],row[2],row[3]].filter(Boolean).join(' · ');
  }
  function updateCodeCaption(input) {
    const row=(flightCodes[input.dataset.codeKind]||[]).find(item=>item[0]===input.value.trim().toUpperCase());
    const caption=input.closest('.hfo-code-field')?.querySelector('.hfo-code-caption');
    if(caption)caption.textContent=row?codeLabel(row,input.dataset.codeKind):'';
  }
  function showCodeSuggestions(input) {
    const list=document.getElementById(input.getAttribute('aria-controls'));
    if(!list)return;
    const query=input.value.trim().toUpperCase();
    if(!query){closeCodeSuggestions(input);return;}
    const rows=flightCodes[input.dataset.codeKind]||[];
    const rank=row=>row[0]===query?0:row[0].startsWith(query)?1:row[1]?.startsWith(query)?2:row[2]?.startsWith(query)?3:4;
    const matches=rows.filter(row=>row.some(value=>String(value||'').includes(query))).sort((a,b)=>rank(a)-rank(b)||a[1].localeCompare(b[1])).slice(0,8);
    list.innerHTML=matches.length?matches.map((row,index)=>{
      const label=codeLabel(row,input.dataset.codeKind);
      return `<button type="button" role="option" aria-selected="${index===0}" tabindex="-1" id="${list.id}-${index}" data-flight-code="${escape(row[0])}" data-code-label="${escape(label)}"><b>${escape(row[0])}</b><span>${escape(label)}</span></button>`;
    }).join(''):`<div class="hfo-code-empty">${rows.length?'ไม่พบรายการ · กรอกรหัสเองได้':flightCodesFailed?'โหลดข้อมูลแนะนำไม่ได้ · กรอกรหัสเองได้':'กำลังโหลดข้อมูลแนะนำ…'}</div>`;
    list.hidden=false;
    input.setAttribute('aria-expanded','true');
    if(matches.length)input.setAttribute('aria-activedescendant',list.id+'-0');
    else input.removeAttribute('aria-activedescendant');
  }
  function chooseFlightCode(choice) {
    const wrap=choice.closest('.hfo-code-field'),input=wrap?.querySelector('input');
    if(!input)return;
    input.value=choice.dataset.flightCode;
    input.setCustomValidity('');
    wrap.querySelector('.hfo-code-caption').textContent=choice.dataset.codeLabel||'';
    closeCodeSuggestions(input);
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function flightCell(fl,i,key,label,editable) {
    const kind=key==='airline'?'airlines':['from','to'].includes(key)?'airports':'';
    const raw=fl[key]||'',formattedDate=key==='date'?formatDdMmm(raw):'';
    const value=key==='date'&&formattedDate!=='DDMMM'?formattedDate:String(raw).toUpperCase();
    const placeholder=key==='date'?'DDMMM':['departure','arrival'].includes(key)?'HH:MM':'';
    const id='hfo-code-'+i+'-'+key;
    const lookupAttrs=kind?`data-code-kind="${kind}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}" autocomplete="off" spellcheck="false"`:'';
    const input=`<input data-flight="${i}" data-flight-field="${key}" aria-label="${label}, flight ${i+1}" type="text" ${placeholder?`placeholder="${placeholder}"`:''} ${lookupAttrs} value="${escape(value)}" ${editable?'':'disabled'}>`;
    const row=kind?(flightCodes[kind]||[]).find(item=>item[0]===value):null;
    return `<td data-label="${label}">${kind?`<div class="hfo-code-field">${input}<div id="${id}" class="hfo-code-results" role="listbox" aria-label="${label} suggestions" hidden></div><small class="hfo-code-caption">${escape(row?codeLabel(row,kind):'')}</small></div>`:input}</td>`;
  }
  function personForm() {
  const draft=state.personDraft,p=draft.data,edit=canEditPeople(draft.kind),flights=Array.isArray(p.flights)?p.flights:[],displayFlights=flights.length?flights:edit?[{}]:[];
  const codes=['VISA','VISA-C','VOA','BG','OKTB','EX'];
  const current=p.immigration?.codes||{};
  const checked=code=>Boolean(current[code]||code==='VISA'&&p.immigration?.visa||code==='OKTB'&&p.immigration?.oktb);

  const dis=edit?'':'disabled';
  return `<form id="hfoPersonForm" class="hfo-person-expanded"><div class="hfo-toolbar"><h4>Immigration & flight details · ${escape(p.name)}</h4><button type="button" class="hfo-btn" data-close-person>Close</button></div>
    <div class="hfo-immigration-row">
      ${sel(draft.kind==='crew'?'Change role':'Visitor role',p.category,'category',draft.kind==='crew'?CATEGORIES.slice(0,2):CATEGORIES.slice(2),dis)}
      <fieldset class="hfo-immigration-compact"><legend>Immigration</legend><div class="hfo-immigration-codes">${codes.map(code=>`<label><input type="checkbox" name="immigration-${code}" ${checked(code)?'checked':''} ${dis}><span>${code}</span></label>`).join('')}</div></fieldset>
        ${sel('Status',p.immigration?.status||'Not started','immigrationStatus',['Not started','Documents pending','Submitted','Approved','Rejected'],dis)}
        <label class="hfo-field hfo-immigration-notes"><span>Notes</span><textarea name="immigrationNotes" rows="1" ${dis}>${escape(p.immigration?.notes||'')}</textarea></label>
    </div>
    <div class="hfo-toolbar"><h4>Flights · ${flights.length}</h4>${edit?'<button type="button" class="hfo-btn" data-add-flight>+ Add flight</button>':''}</div>
    <div class="hfo-table-wrap"><table class="hfo-table hfo-flight-table"><thead><tr><th>#</th><th>Airline</th><th>Flight No.</th><th>Date (DDMMM)</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>PNR</th><th></th></tr></thead><tbody>
    ${displayFlights.map((fl,i)=>`<tr><td data-label="#">${i+1}</td>
      ${[['airline','Airline'],['number','Flight No.'],['date','Date (DDMMM)'],['from','From'],['to','To'],['departure','Departure'],['arrival','Arrival'],['booking','PNR']].map(([key,label])=>flightCell(fl,i,key,label,edit)).join('')}
      <td data-label="Remove">${edit&&flights.length?`<button type="button" class="hfo-btn danger" data-remove-flight="${i}" aria-label="Remove flight ${i+1}">×</button>`:''}</td></tr>`).join('')}
    </tbody></table></div>${edit?'<small data-person-save-status role="status" class="hfo-muted">Changes save automatically</small>':''}</form>`;
}
  function tripsHtml(s) {
    if (!state.grant?.crewView || !state.grant?.visitorView) return '<div class="hfo-section hfo-alert">Travel with linked passengers requires both separate Crew and Visitor view grants.</div>';
    const list=state.trips.filter(t=>t.service_id===s.id), edit=mayEditService(s)&&state.grant.crewEdit&&state.grant.visitorEdit;
    return `<div class="hfo-section"><div class="hfo-toolbar"><h3>Car and Boat Travel</h3>${edit?'<button class="hfo-btn" data-add-trip>+ Add trip</button>':''}</div>
      ${['car','boat'].map(kind=>`<h4>${kind==='car'?'Cars':'Boats'}</h4><div class="hfo-table-wrap"><table class="hfo-table"><thead><tr><th>#</th><th>Origin → destination</th><th>Planned departure</th><th>Provider</th><th>Vehicle / boat</th><th>Passengers / cargo</th><th>Status</th><th></th></tr></thead><tbody>
       ${list.filter(t=>t.data.kind===kind).map((t,i)=>`<tr><td>${i+1}</td><td>${escape(t.data.origin)} → ${escape(t.data.destination)}</td><td>${formatDate(t.data.plannedDeparture)}</td><td>${escape(t.data.provider)}</td><td>${escape(t.data.vehicle)}</td><td>${(t.data.personIds||[]).length} people · ${escape(t.data.cargo||'')}</td><td>${escape(t.data.status||'Planned')}</td><td><button class="hfo-btn" data-edit-trip="${t.id}">Open</button> ${edit?`<button class="hfo-btn danger" data-remove-trip="${t.id}">×</button>`:''}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      ${state.tripDraft?tripForm():''}</div>`;
  }
  function tripForm() {
    const t=state.tripDraft, d=t.data, edit=mayEditService(service())&&state.grant.crewEdit&&state.grant.visitorEdit;
    return `<form id="hfoTripForm" class="hfo-section hfo-nested"><div class="hfo-toolbar"><h3>${t.id?'Edit':'Add'} trip</h3><button type="button" class="hfo-btn" data-close-trip>Close</button></div>
      <div class="hfo-form-grid">${sel('Type',d.kind||'car','kind',['car','boat'],edit?'':'disabled')}
      ${f('Origin',d.origin,'origin','text',edit?'':'disabled')}${f('Destination',d.destination,'destination','text',edit?'':'disabled')}
      ${f('Planned departure',d.plannedDeparture,'plannedDeparture','datetime-local',edit?'':'disabled')}
      ${f('Planned arrival',d.plannedArrival,'plannedArrival','datetime-local',edit?'':'disabled')}
      ${f('Actual departure',d.actualDeparture,'actualDeparture','datetime-local',edit?'':'disabled')}
      ${f('Actual arrival',d.actualArrival,'actualArrival','datetime-local',edit?'':'disabled')}
      ${f('Provider',d.provider,'provider','text',edit?'':'disabled')}${f('Vehicle / boat',d.vehicle,'vehicle','text',edit?'':'disabled')}
      ${f('Purpose',d.purpose,'purpose','text',edit?'':'disabled')}${f('Status',d.status,'status','text',edit?'':'disabled')}
      ${f('Cargo',d.cargo,'cargo','text',edit?'':'disabled')}${area('Notes',d.notes,'notes',edit?'':'disabled')}</div>
      <label class="hfo-field"><span>Passengers (linked roster)</span><select name="personIds" multiple size="5" ${edit?'':'disabled'}>${state.people.map(p=>`<option value="${p.id}" ${(d.personIds||[]).includes(p.id)?'selected':''}>${escape(p.data.name)} · ${escape(p.kind)}</option>`).join('')}</select></label>
      ${edit?'<button class="hfo-btn primary">Save trip</button>':''}</form>`;
  }
  function renderService() {
  const s=service(), j=job(); if (!s || !j) return;
  const isCrew=s.data.type==='Crew Change';
  const isVisitorService=s.data.type==='Visitor';
  const isVisitor=['Visitor','SIRE Inspector','Surveyor','Medical Visit','Medical','Inspection/Technical Visit'].includes(s.data.type);
  const tabs=isCrew?['crew','oktb','permit','loi','travel','checklist','history']:isVisitorService?['visitors','travel','checklist','history']:isVisitor?['details','visitors','travel','checklist','history']:['details','travel','checklist','history'];
  if (!tabs.includes(state.tab)) state.tab=tabs[0];
  const label={details:'Service details',crew:'Crew members',oktb:'OKTB',permit:'Terminal Permit',loi:'LOI',visitors:'Visitors',travel:'Travel',checklist:'Checklist',history:'History'};
  const documentTab=['oktb','permit','loi'].includes(state.tab);
  overlay(`<div class="hfo-banner">Trial only · fictional/de-identified people. Terminal restrictions must be confirmed before execution.</div>
    <div class="hfo-toolbar"><div><h2>#${s.seq} · ${escape(s.data.type)}</h2><span class="hfo-muted">${escape(j.data.vessel||'Port Call')} · ${escape(j.data.jobNo||j.id)}</span></div><button class="hfo-btn" data-back-job>← Job</button></div>
    ${isCrew||isVisitorService?`<div class="hfo-service-status">${sel('Service status',s.data.status,'status',SERVICE_STATUSES,`${mayEditService(s)?'':'disabled'} data-service-field`)}</div>`:''}
    <div class="hfo-tabs">${tabs.map(t=>`<button class="${state.tab===t?'active':''}" data-tab="${t}">${label[t]}</button>`).join('')}</div>
    ${documentTab?'<div class="hfo-section" id="hfoDocument"><p role="status">กำลังโหลดเอกสาร…</p></div>':state.tab==='details'?serviceDetails(s,mayEditService(s)):['crew','visitors'].includes(state.tab)?rosterHtml(s):state.tab==='travel'?tripsHtml(s):state.tab==='checklist'?checklistHtml(s):`<div class="hfo-section"><button class="hfo-btn" data-history="service" data-history-id="${s.id}">Load history</button>${historyHtml()}</div>`}`,
    '#'+s.seq+' · '+s.data.type,j.data.vessel||'Port Call');
  if (documentTab) window.HarborFlowDocuments?.mount(document.getElementById('hfoDocument'),{jobId:j.id,serviceId:s.id,type:state.tab,login:state.login});
}
  async function saveServiceField(target, checked=false) {
    const s=service(); if (!s || !mayEditService(s)) return;
    const name=target.name, value=checked?target.checked:target.value, detail=target.hasAttribute('data-detail-field');
    const old=detail?s.data.details?.[name]??'':s.data[name]??'';
    if (value===old) return;
    const patch=detail?{details:{[name]:value}}:{[name]:value};
    const base=detail?{details:{[name]:old}}:{[name]:old};
    let reason='';
    if (name==='plannedEnd' && s.data.baselineDue) reason=prompt('Reason for changing a locked deadline:')||'';
    if (name==='status' && value==='Cancelled') reason=prompt('Reason for cancelling this requested Service:')||'';
    try { const out=await api('updateService',{id:s.id,patch,base,reason}); Object.assign(s,out.record); state.sync='Saved '+new Date().toLocaleTimeString(); state.error=''; render(); }
    catch(e){handleSaveError(e,{kind:'service',id:s.id,field:detail?'details.'+name:name,value,old,reason});}
  }
  async function saveChecklist(next) {
    const s=service(), old=Array.isArray(s.data.checklist)?s.data.checklist:[];
    try {const out=await api('updateService',{id:s.id,patch:{checklist:next},base:{checklist:old}});Object.assign(s,out.record);state.error='';render();}
    catch(e){handleSaveError(e,{kind:'service',id:s.id,field:'checklist',value:next,old});}
  }
  function handleSaveError(e, context) {
  if (e.code===409 && e.detail?.conflicts?.length) {
    state.conflict={...context,conflicts:e.detail.conflicts,current:e.detail.current};
    document.getElementById('hfoConflict')?.remove();
    const box=document.createElement('div');box.className='hfo-section hfo-conflict';box.id='hfoConflict';
    box.innerHTML=`<h3>Concurrent edit · review each field</h3><p>No value was overwritten.</p>
      ${state.conflict.conflicts.map(c=>`<div class="hfo-nested"><b>${escape(c.field)}</b><p>Original: ${escape(JSON.stringify(c.original))}</p><p>Shared now: ${escape(JSON.stringify(c.shared))}</p><p>Your value: ${escape(JSON.stringify(c.local))}</p></div>`).join('')}
      <div class="hfo-actions"><button class="hfo-btn" data-resolve="shared">Use shared value</button><button class="hfo-btn primary" data-resolve="mine">Save my value after review</button></div>`;
    document.querySelector('.hfo-overlay-body')?.prepend(box);
  } else announce(e.message);
}
  async function resolveConflict(choice) {
  const c=state.conflict;if(!c)return;
  const list=c.kind==='job'?state.jobs:c.kind==='person'?state.people:state.services;
  const item=list.find(x=>x.id===c.id);
  if(choice==='shared'){if(item)Object.assign(item,c.current);state.conflict=null;state.personDraft=null;state.error='';render();return;}
  const conflict=c.conflicts[0];if(!conflict)return;
  let patch,base,action,payload;
  if(c.kind==='person'){
    patch=c.patch;
    base=Object.fromEntries(Object.keys(patch).map(key=>[key,c.current.data[key]]));
    action='updatePerson';payload={id:c.id,kind:c.personKind,patch,base};
  } else {
    const nested=c.field.startsWith('details.'),name=nested?c.field.slice(8):c.field;
    patch=nested?{details:{[name]:c.value}}:{[name]:c.value};
    base=nested?{details:{[name]:conflict.shared}}:{[name]:conflict.shared};
    action=c.kind==='job'?'updateJob':'updateService';payload={id:c.id,patch,base,reason:c.reason||''};
  }
  try {
    const out=await api(action,payload);
    if(item)Object.assign(item,out.record);
    state.conflict=null;state.personDraft=null;state.error='';render();
  } catch(e){state.conflict=null;document.getElementById('hfoConflict')?.remove();handleSaveError(e,c);}
}
  function loadPeople() {
  if (!job() || !anyPeopleView()) return;
  const id=job().id;
  return api('people',{jobId:id},'GET').then(out=>{
    if (job()?.id!==id) return;
    state.people=out.people;state.peopleLoadedFor=id;state.error='';render();
  }).catch(e=>{state.people=[];state.peopleLoadedFor=null;announce(e.message);});
}
  async function loadTrips() {
    if (!job() || !state.grant.crewView || !state.grant.visitorView) return;
    try {const out=await api('trips',{jobId:job().id},'GET');state.trips=out.trips;state.error='';render();}
    catch(e){state.trips=[];announce(e.message);}
  }
  function personSaveStatus(message, failed = false) {
    const status=document.querySelector('[data-person-save-status]');
    if (status) {status.textContent=message;status.classList.toggle('hfo-save-error',failed);}
  }
  function capturePersonForm() {
    const draft=state.personDraft,form=document.getElementById('hfoPersonForm');if(!draft?.id||!form)return;
    const d=new FormData(form);
    if(d.has('category'))draft.data.category=String(d.get('category')||'');
    const codes=Object.fromEntries(['VISA','VISA-C','VOA','BG','OKTB','EX'].map(code=>[code,d.has('immigration-'+code)]));
    draft.data.immigration={...(draft.data.immigration||{}),status:String(d.get('immigrationStatus')||'Not started'),codes,notes:String(d.get('immigrationNotes')||'')};
    delete draft.data.immigration.visa;delete draft.data.immigration.oktb;
    if(!Array.isArray(draft.data.flights))draft.data.flights=[];
    form.querySelectorAll('[data-flight]').forEach(input=>{
      const i=Number(input.dataset.flight),key=input.dataset.flightField;
      if(!draft.data.flights[i])draft.data.flights[i]={airline:'',number:'',date:'',from:'',to:'',departure:'',arrival:'',booking:''};
      draft.data.flights[i][key]=input.value.toUpperCase();
    });
  }
  function captureNewPersonRow() {
    const draft=state.personDraft,row=document.querySelector('.hfo-new-person');
    if(!draft?.newRow||!row)return;
    row.querySelectorAll('[data-new-person-field]').forEach(input=>{draft.data[input.dataset.newPersonField]=input.value;});
  }
  function schedulePersonSave(delay=650) {
    if(!state.personDraft?.id||state.conflict)return;
    clearTimeout(personSaveTimer);personSaveStatus('Saving automatically…');
    personSaveTimer=setTimeout(()=>{void savePerson();},delay);
  }
  function scheduleNewPersonSave(delay=850) {
    if(!state.personDraft?.newRow)return;
    captureNewPersonRow();clearTimeout(personSaveTimer);
    personSaveStatus(state.personDraft.data.name?.trim()?'Saving automatically…':'Enter a name to save automatically');
    if(state.personDraft.data.name?.trim())personSaveTimer=setTimeout(()=>{void saveNewPerson();},delay);
  }
  async function savePerson() {
    clearTimeout(personSaveTimer);personSaveTimer=null;
    capturePersonForm();
    const draft=state.personDraft;
    if(state.conflict)return false;
    if(!draft?.id)return personSaveQueue.then(()=>true);
    personSaveQueue=personSaveQueue.catch(()=>{}).then(async()=>{
      if(state.conflict)return false;
      const old=state.people.find(p=>p.id===draft.id);
      if(!old)return false;
      const data={...structuredClone(draft.data),kind:draft.kind,serviceIds:[...new Set([...(draft.data.serviceIds||[]),service().id])]};
      data.flights=(data.flights||[]).filter(flight=>Object.values(flight).some(value=>String(value||'').trim()));
      const patch=Object.fromEntries(Object.entries(data).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(old.data[key])));
      if(!Object.keys(patch).length){if(state.personDraft===draft)personSaveStatus('Saved automatically');return true;}
      const base=Object.fromEntries(Object.keys(patch).map(key=>[key,old.data[key]]));
      try{
        const out=await api('updatePerson',{id:old.id,kind:draft.kind,patch,base});
        Object.assign(old,out.record);state.sync='Saved '+new Date().toLocaleTimeString();state.error='';
        if(state.personDraft===draft)personSaveStatus('Saved automatically');
        return true;
      }catch(e){
        if(state.personDraft===draft)personSaveStatus(e.message,true);
        handleSaveError(e,{kind:'person',personKind:draft.kind,id:draft.id,patch,base});
        return false;
      }
    });
    return personSaveQueue;
  }
  async function saveNewPerson() {
    clearTimeout(personSaveTimer);personSaveTimer=null;
    const draft=state.personDraft;
    if(!draft?.newRow||!canEditPeople(draft.kind))return true;
    captureNewPersonRow();
    if(!draft.data.name?.trim()){
      const hasInput=['nationality','rank','dob','seamanBook','passport','passportExpiry'].some(key=>String(draft.data[key]||'').trim());
      if(hasInput)personSaveStatus('Enter a name before leaving to save this row',true);
      return !hasInput;
    }
    if(personCreateInFlight)return false;
    personCreateInFlight=true;
    const data=structuredClone(draft.data);
    try{
      const out=await api('createPerson',{jobId:job().id,kind:draft.kind,data});
      state.people.push(out.person);state.peopleLoadedFor=job().id;state.error='';
      if(state.personDraft===draft){
        const focusField=document.activeElement?.dataset.newPersonField;
        const scrollTop=document.querySelector('.hfo-overlay')?.scrollTop||0;
        state.personDraft={id:out.person.id,kind:draft.kind,data:draft.data};
        render();
        const currentOverlay=document.querySelector('.hfo-overlay');if(currentOverlay)currentOverlay.scrollTop=scrollTop;
        if(focusField)document.querySelector(`[data-person-id="${out.person.id}"][data-person-field="${focusField}"]`)?.focus();
        schedulePersonSave(0);
        return await savePerson();
      }
      return true;
    }catch(e){if(state.personDraft===draft)personSaveStatus(e.message,true);return false;}
    finally{personCreateInFlight=false;}
  }
  async function saveInlinePerson(target) {
  const p=state.people.find(x=>x.id===target.dataset.personId), field=target.dataset.personField;
  if (!p || !canEditPeople(p.kind)) return;
  const value=target.value, old=p.data[field]??'';
  if (value===old) return;
  const patch={[field]:value},base={[field]:old};
  try {
    const out=await api('updatePerson',{id:p.id,kind:p.kind,patch,base});
    Object.assign(p,out.record);
    if (state.personDraft?.id===p.id) state.personDraft.data[field]=value;
    state.sync='Saved '+new Date().toLocaleTimeString();state.error='';
  } catch(e){handleSaveError(e,{kind:'person',personKind:p.kind,id:p.id,field,value,old,patch,base});}
}
  async function saveTrip() {
    const form=document.getElementById('hfoTripForm'), draft=state.tripDraft, d=new FormData(form), data={};
    for (const name of ['kind','origin','destination','plannedDeparture','plannedArrival','actualDeparture','actualArrival','provider','vehicle','purpose','status','cargo','notes']) data[name]=String(d.get(name)||'');
    data.personIds=d.getAll('personIds').map(String);
    try {
      if (draft.id) {
        const old=state.trips.find(t=>t.id===draft.id), patch=Object.fromEntries(Object.entries(data).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(old.data[key])));
        if (Object.keys(patch).length) {const out=await api('updateTrip',{id:old.id,patch,base:old.data});Object.assign(old,out.record);}
      } else {const out=await api('createTrip',{jobId:job().id,serviceId:service().id,data});state.trips.push(out.trip);}
      state.tripDraft=null;state.error='';render();
    } catch(e){announce(e.message);}
  }
  async function loadHistory(scope,id) {
    try {const out=await api('history',{scope,id},'GET');state.history=out.events;state.error='';render();}
    catch(e){announce(e.message);}
  }
  async function renderGrants() {
    overlay(`<div class="hfo-banner">Owner-only · verify the exact GitHub username out of band. PIC assignment does not grant access.</div>
      <div class="hfo-section"><h2>Operations access</h2><div id="hfoGrantList" class="hfo-list"></div></div>
      <form id="hfoGrantForm" class="hfo-section"><h3>Add / update grant</h3><div class="hfo-form-grid">
      ${f('GitHub login','','login')}${f('Re-enter exact login','','confirmLogin')}
      ${sel('Operations role','viewer','role',['viewer','editor'])}</div>
      ${['crewView','crewEdit','visitorView','visitorEdit'].map(x=>`<label class="hfo-checkbox"><input type="checkbox" name="${x}">${escape(x)}</label>`).join('')}
      <button class="hfo-btn primary">Save grant</button></form>`, 'Manage Operations access', 'Owner only');
    try {const out=await api('grants',{},'GET'); const el=document.getElementById('hfoGrantList'); if(el) el.innerHTML=out.grants.map(g=>`<div class="hfo-list-row"><b>${escape(g.login)}</b><span>${escape(g.role)} · Crew ${g.crew_view?'V':''}${g.crew_edit?'E':''} · Visitor ${g.visitor_view?'V':''}${g.visitor_edit?'E':''}</span><button class="hfo-btn danger" data-revoke="${escape(g.login)}">Revoke</button></div>`).join('')||'<p class="hfo-muted">Only owner has access.</p>'; }
    catch(e){announce(e.message);}
  }
  async function perform(action,payload,onSuccess) {
    try {const out=await api(action,payload);state.error='';await onSuccess?.(out);return out;}
    catch(e){announce(e.message);return null;}
  }
  async function loadPortChoices() {
    state.portStatus = 'Loading Port / Terminal…';
    try {
      const response = await fetch('/api/knowledge?area=restrictions', { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Port list unavailable');
      state.portChoices = [...new Set((body.data?.terminals || [])
        .filter(row => typeof row.port === 'string' && row.port.trim() && typeof row.terminal === 'string' && row.terminal.trim())
        .map(row => row.port.trim() + ' / ' + row.terminal.trim()))].sort((a, b) => a.localeCompare(b));
      state.portStatus = state.portChoices.length ? 'From Terminal Restriction' : 'No Port / Terminal rows in Terminal Restriction';
    } catch {
      state.portStatus = 'Port list unavailable. Close and reopen to retry.';
    }
    const select = document.querySelector('.hfo-overlay select[name="port"]');
    if (select) {
      const current = select.value;
      select.innerHTML = portOptions(current);
      select.value = current;
      select.closest('.hfo-field').querySelector('[data-port-status]').textContent = state.portStatus;
    }
  }
  async function lookupImo(button) {
    const grid = button.closest('.hfo-form-grid');
    const vessel = grid?.querySelector('[name="vessel"]')?.value.trim() || '';
    const feedback = grid?.querySelector('[data-imo-feedback]');
    const results = grid?.querySelector('[data-imo-results]');
    if (!feedback || !results) return;
    results.replaceChildren();
    if (vessel.length < 3) { feedback.textContent = 'Enter at least 3 letters of the vessel name.'; return; }
    feedback.textContent = 'Searching IMO…';
    button.disabled = true;
    try {
      const response = await fetch('/api/vessel?name=' + encodeURIComponent(vessel), { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'IMO lookup unavailable');
      const matches = Array.isArray(body.matches) ? body.matches : [];
      feedback.textContent = matches.length ? 'Choose a vessel and verify its IMO with ship documents.' : 'No matching IMO found. Enter it manually and verify.';
      for (const match of matches) {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'hfo-btn';
        choice.dataset.imoChoice = match.imo;
        choice.textContent = match.name + ' · IMO ' + match.imo;
        if (match.description) choice.title = match.description;
        results.appendChild(choice);
      }
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  }
  createButton.onclick=async()=>{if(!isOwner())return;state.modal='create';state.error='';render();await loadPortChoices();};
  document.body.addEventListener('click',async event=>{

    const codeChoice=event.target.closest('[data-flight-code]');if(codeChoice){chooseFlightCode(codeChoice);return;}
    document.querySelectorAll('[data-code-kind]').forEach(input=>{if(!input.closest('.hfo-code-field').contains(event.target))closeCodeSuggestions(input);});
    if(event.target.closest('[data-calls-toggle]')){state.callsOpen=!state.callsOpen;return;}
    const b=event.target.closest('[data-open-job],[data-open-service],[data-shift],[data-grants],[data-close],[data-back-job],[data-add-service],[data-remove-service],[data-restore-service],[data-tab],[data-add-step],[data-remove-step],[data-add-person],[data-save-new-person],[data-edit-person],[data-remove-person],[data-close-person],[data-add-flight],[data-remove-flight],[data-add-trip],[data-edit-trip],[data-remove-trip],[data-close-trip],[data-history],[data-resolve],[data-revoke],[data-lookup-imo],[data-imo-choice],[data-sync-job-folder]');
    if(!b)return;
if(b.dataset.openJob){state.openJobId=b.dataset.openJob;state.openServiceId=null;state.modal=null;state.people=[];state.peopleLoadedFor=null;state.history=[];state.error='';render();if(!state.public){await loadPortChoices();await loadPeople();}return;}
    if(b.hasAttribute('data-lookup-imo')){await lookupImo(b);return;}
    if(b.hasAttribute('data-sync-job-folder')){await perform('syncJobFolder',{id:job().id},out=>{Object.assign(job(),out.record);render();});return;}
    if(b.dataset.imoChoice){const grid=b.closest('.hfo-form-grid'),input=grid?.querySelector('[name="imo"]');if(input){input.value=b.dataset.imoChoice;grid.querySelector('[data-imo-feedback]').textContent='IMO selected. Verify with ship documents.';if(input.hasAttribute('data-job-field'))input.dispatchEvent(new Event('change',{bubbles:true}));}return;}
if(b.dataset.openService){state.openServiceId=b.dataset.openService;state.tab=service()?.data.type==='Crew Change'?'crew':service()?.data.type==='Visitor'?'visitors':'details';state.history=[];state.error='';render();if(!state.public && anyPeopleView() && state.peopleLoadedFor!==job()?.id)await loadPeople();return;}
    if(b.dataset.shift){shift(Number(b.dataset.shift));return;}
    if(b.hasAttribute('data-grants')){state.modal='grants';state.openJobId=null;state.openServiceId=null;render();return;}
    if(b.hasAttribute('data-close')){if(await savePerson()===false)return;if(await saveNewPerson()===false)return;state.modal=null;state.openJobId=null;state.openServiceId=null;state.people=[];state.peopleLoadedFor=null;state.trips=[];state.personDraft=null;state.tripDraft=null;state.history=[];state.error='';render();await refresh();return;}
    if(b.hasAttribute('data-back-job')){if(await savePerson()===false)return;if(await saveNewPerson()===false)return;state.openServiceId=null;state.trips=[];state.personDraft=null;state.tripDraft=null;state.history=[];render();return;}
    if(b.hasAttribute('data-add-service')){state.modal='addService';render();return;}
    if(b.dataset.removeService){const reason=prompt('Reason for removing this erroneous Service entry:');if(reason)await perform('removeService',{id:b.dataset.removeService,reason},out=>{const x=state.services.find(s=>s.id===out.service.id);Object.assign(x,out.service);render();});return;}
    if(b.dataset.restoreService){const reason=prompt('Reason for restoring this Service:');if(reason)await perform('restoreService',{id:b.dataset.restoreService,reason},out=>{const x=state.services.find(s=>s.id===out.service.id);Object.assign(x,out.service);render();});return;}
    if(b.dataset.tab){if(await savePerson()===false)return;if(await saveNewPerson()===false)return;state.tab=b.dataset.tab;state.personDraft=null;state.tripDraft=null;state.history=[];render();if(['crew','visitors'].includes(state.tab))await loadPeople();if(state.tab==='travel'){await loadPeople();await loadTrips();}return;}
    if(b.hasAttribute('data-add-step')){const text=prompt('Checklist step:');if(text?.trim())await saveChecklist([...(service().data.checklist||[]),{text:text.trim(),done:false}]);return;}
    if(b.hasAttribute('data-remove-step')){const i=Number(b.dataset.removeStep);const next=[...(service().data.checklist||[])];next.splice(i,1);await saveChecklist(next);return;}
    if(b.dataset.addPerson){if(await savePerson()===false)return;if(await saveNewPerson()===false)return;state.personDraft={kind:b.dataset.addPerson,newRow:true,data:{category:b.dataset.personCategory,name:'',flights:[],serviceIds:[service().id]}};render();return;}
    if(b.dataset.editPerson){if(await savePerson()===false)return;if(await saveNewPerson()===false)return;const p=state.people.find(x=>x.id===b.dataset.editPerson);state.personDraft=state.personDraft?.id===p.id?null:{id:p.id,kind:p.kind,data:structuredClone(p.data)};render();return;}
    if(b.dataset.removePerson){const p=state.people.find(x=>x.id===b.dataset.removePerson),reason=prompt('Reason for removing this person:');if(reason)await perform('removePerson',{id:p.id,kind:p.kind,reason},()=>{state.people=state.people.filter(x=>x.id!==p.id);render();});return;}
    if(b.hasAttribute('data-close-person')){if(await savePerson()===false)return;state.personDraft=null;render();return;}
    if(b.hasAttribute('data-save-new-person')){await saveNewPerson();return;}
    if(b.hasAttribute('data-add-flight')){capturePersonForm();state.personDraft.data.flights.push({airline:'',number:'',date:'',from:'',to:'',departure:'',arrival:'',booking:''});render();schedulePersonSave(0);return;}
    if(b.hasAttribute('data-remove-flight')){capturePersonForm();state.personDraft.data.flights.splice(Number(b.dataset.removeFlight),1);render();schedulePersonSave(0);return;}
    if(b.hasAttribute('data-add-trip')){state.tripDraft={data:{kind:'car',origin:'',destination:'',personIds:[]}};render();return;}
    if(b.dataset.editTrip){const t=state.trips.find(x=>x.id===b.dataset.editTrip);state.tripDraft={id:t.id,data:structuredClone(t.data)};render();return;}
    if(b.dataset.removeTrip){const reason=prompt('Reason for removing this trip:');if(reason)await perform('removeTrip',{id:b.dataset.removeTrip,reason},()=>{state.trips=state.trips.filter(x=>x.id!==b.dataset.removeTrip);render();});return;}
    if(b.hasAttribute('data-close-trip')){state.tripDraft=null;render();return;}
    if(b.dataset.history){await loadHistory(b.dataset.history,b.dataset.historyId);return;}
    if(b.dataset.resolve){await resolveConflict(b.dataset.resolve);return;}
    if(b.dataset.revoke){if(confirm('Revoke '+b.dataset.revoke+' on the next request?'))await perform('revoke',{login:b.dataset.revoke},()=>renderGrants());}
  });
  document.body.addEventListener('change',async event=>{
    const t=event.target;
    if(t.id==='hfoView'){state.view=t.value;render();return;}
    if(t.hasAttribute('data-job-field')){await saveJobField(t);return;}
    if(t.hasAttribute('data-person-field')){await saveInlinePerson(t);return;}
    if(t.hasAttribute('data-new-person-field')){scheduleNewPersonSave(0);return;}
    if(t.closest('#hfoPersonForm')){schedulePersonSave(0);return;}
    if(t.hasAttribute('data-service-field')||t.hasAttribute('data-detail-field')){await saveServiceField(t);return;}
    if(t.hasAttribute('data-service-check')){await saveServiceField(t,true);return;}
    if(t.hasAttribute('data-step')){const next=structuredClone(service().data.checklist||[]),i=Number(t.dataset.step);next[i]={...next[i],done:t.checked,actor:state.login,completedAt:t.checked?new Date().toISOString():null};await saveChecklist(next);}
  });
  document.body.addEventListener('input',event=>{
    const t=event.target;
    if(t.hasAttribute('data-new-person-field')){scheduleNewPersonSave();return;}
    if(t.hasAttribute('data-flight-field')){
      t.setCustomValidity('');
      const pos=t.selectionStart;t.value=t.value.toUpperCase();if(pos!==null)t.setSelectionRange(pos,pos);
      if(t.dataset.codeKind){updateCodeCaption(t);showCodeSuggestions(t);}
    }
    if(t.closest('#hfoPersonForm'))schedulePersonSave();
  });
  document.body.addEventListener('focusin',event=>{
    const t=event.target;
    if(t.dataset.codeKind){
      showCodeSuggestions(t);
      loadFlightCodes().then(()=>{if(t.isConnected&&document.activeElement===t){updateCodeCaption(t);showCodeSuggestions(t);}});
    }
  });
  document.body.addEventListener('focusout',event=>{
    const t=event.target;
    if(t.dataset.codeKind&&!t.closest('.hfo-code-field').contains(event.relatedTarget))closeCodeSuggestions(t);
  });
  document.body.addEventListener('pointerdown',event=>{if(event.target.closest('[data-flight-code]'))event.preventDefault();});
  document.body.addEventListener('keydown',event=>{
    const t=event.target;
    if(!t.dataset.codeKind)return;
    const list=document.getElementById(t.getAttribute('aria-controls'));
    if(event.key==='Escape'||event.key==='Tab'){closeCodeSuggestions(t);return;}
    if(!list||list.hidden)return;
    const choices=[...list.querySelectorAll('[role="option"]')];if(!choices.length)return;
    let index=choices.findIndex(choice=>choice.getAttribute('aria-selected')==='true');
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      index=(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
      choices.forEach((choice,i)=>choice.setAttribute('aria-selected',String(i===index)));
      t.setAttribute('aria-activedescendant',choices[index].id);
      choices[index].scrollIntoView({block:'nearest'});
    } else if(event.key==='Enter'){
      event.preventDefault();
      chooseFlightCode(choices[Math.max(index,0)]);
    }
  });
  document.body.addEventListener('submit',async event=>{
    const form=event.target;
    if(!['hfoCreateJob','hfoAddService','hfoPersonForm','hfoTripForm','hfoGrantForm'].includes(form.id))return;
    event.preventDefault();const d=new FormData(form);
    if(form.id==='hfoCreateJob'){const data=Object.fromEntries(d.entries());await perform('createJob',{data},out=>{state.jobs.unshift(out.job);state.modal=null;state.openJobId=out.job.id;render();});}
    if(form.id==='hfoAddService'){await perform('addService',{jobId:job().id,data:Object.fromEntries(d.entries())},out=>{state.services.push(out.service);state.modal=null;state.openServiceId=out.service.id;state.tab=out.service.data.type==='Crew Change'?'crew':out.service.data.type==='Visitor'?'visitors':'details';render();});}
    if(form.id==='hfoPersonForm')await savePerson();
    if(form.id==='hfoTripForm')await saveTrip();
    if(form.id==='hfoGrantForm'){const data=Object.fromEntries(d.entries());for(const key of ['crewView','crewEdit','visitorView','visitorEdit'])data[key]=d.has(key);await perform('grant',data,()=>renderGrants());}
  });
  refresh();
  setInterval(refresh,15000);
})();

