/* Shared Operations trial. No Job or person record is cached in browser storage. */
(() => {
  const root = document.getElementById('operations');
  const createButton = document.getElementById('createJob');
  if (!root || !createButton) return;
  const TYPES = ['Port Clearance','Crew Change','Fresh Water','Garbage','CTM','Provisions','Launch Boat','Transport','Spare Parts/Customs','Medical','Inspection/Technical Visit','Other'];
  const JOB_STATUSES = ['Draft','Planned','Confirmed','In Progress','On Hold','Completed','Cancelled'];
  const SERVICE_STATUSES = ['Not Started','In Progress','Waiting','Completed','Cancelled'];
  const CATEGORIES = ['On-signers','Off-signers','Medical visitors','SIRE Inspectors','Surveyors','Service Engineers','Other'];
  const TYPE_FIELDS = {
    'Port Clearance': [['arrivalFormalities','Arrival formalities'],['departureFormalities','Departure formalities'],['authority','Authority'],['submissionDue','Submission due','datetime-local'],['submissionDate','Submitted','datetime-local'],['reference','Reference'],['approval','Approval']],
    'Crew Change': [['changeType','Change type'],['boardingPoint','Boarding point'],['crewNotes','Crew change notes']],
    'Fresh Water': [['requestedQuantity','Requested quantity','number'],['actualQuantity','Actual quantity','number'],['unit','Unit'],['deliveryPoint','Delivery point'],['deliveryTime','Delivery time','datetime-local'],['receipt','Receipt reference']],
    'Garbage': [['requestedQuantity','Requested quantity','number'],['actualQuantity','Actual quantity','number'],['unit','Unit'],['wasteType','Waste type'],['deliveryPoint','Collection point'],['deliveryTime','Collection time','datetime-local'],['disposalCertificate','Disposal certificate reference']],
    'CTM': [['amount','Transferred amount','number'],['currency','Currency'],['recipient','Recipient'],['handoverTime','Handover time','datetime-local'],['receipt','Receipt reference']],
    'Provisions': [['requestedQuantity','Requested quantity','number'],['actualQuantity','Actual quantity','number'],['unit','Unit'],['deliveryPoint','Delivery point'],['deliveryTime','Delivery time','datetime-local'],['receipt','Receipt reference']],
    'Launch Boat': [['boardingPoint','Boarding point'],['boatPurpose','Purpose']],
    'Transport': [['pickupPoint','Pickup point'],['transportPurpose','Purpose']],
    'Spare Parts/Customs': [['shipment','Shipment'],['awbBl','AWB / B/L'],['consignee','Consignee'],['customsDocuments','Customs documents'],['releaseState','Release state'],['deliveryToVessel','Delivery to vessel']],
    'Medical': [['appointment','Appointment','datetime-local'],['coordinator','Coordinator'],['travel','Travel reference'],['medicalStatus','Status'],['requiredDocuments','Necessary documents (no diagnosis)']],
    'Inspection/Technical Visit': [['visitType','Visit type'],['company','Company / authority'],['visitor','Visitor reference'],['appointment','Appointment','datetime-local'],['boarding','Boarding','datetime-local'],['disembarkation','Disembarkation','datetime-local'],['boardingPermission','Boarding permission'],['requiredDocuments','Required documents'],['outcomeReference','Outcome reference']],
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
  let state = { login: '', grant: null, public: false, jobs: [], services: [], people: [], trips: [], view: 'month', anchor: new Date(), callsOpen: true, openJobId: null, openServiceId: null, tab: 'details', busy: false, error: '', sync: '', conflict: null, personDraft: null, tripDraft: null, modal: null, history: [], portChoices: [], portStatus: 'Loading Port / Terminal…' };
  const isOwner = () => state.grant?.role === 'owner';
  const isEditor = () => isOwner() || state.grant?.role === 'editor';
  const job = () => state.jobs.find(x => x.id === state.openJobId);
  const service = () => state.services.find(x => x.id === state.openServiceId);
  const mayEditJob = j => isOwner() || state.grant?.role === 'editor' && j?.data.pic === state.login;
  const mayEditService = s => mayEditJob(job()) || state.grant?.role === 'editor' && s?.data.pic === state.login;
  const serviceList = j => state.services.filter(x => x.job_id === j.id && !x.removed_at).sort((a,b) => a.seq-b.seq);
  const anyPeopleView = () => state.grant?.crewView || state.grant?.visitorView;
  const canPeople = kind => kind === 'crew' ? state.grant?.crewView : state.grant?.visitorView;
  const canEditPeople = kind => kind === 'crew' ? state.grant?.crewEdit : state.grant?.visitorEdit;
  const dateOnly = value => value ? String(value).slice(0,10) : '';
  const formatDate = value => value ? escape(String(value).replace('T',' ').slice(0,16)) : '—';
  const announce = message => { state.error = message; const el = document.getElementById('hfoNotice'); if (el) { el.textContent = message; el.hidden = !message; } };
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
      const scopeChanged = Boolean(next.public) !== state.public;
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
    } catch (e) { state.grant = null; state.public = false; state.jobs = []; state.services = []; state.people = []; state.trips = []; state.openJobId = null; state.openServiceId = null; state.modal = null; state.sync = ''; state.error = e.message; render(); }
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
        months.push(`<div class="hfo-card"><b>${escape(d.toLocaleDateString('en',{month:'long',year:'numeric'}))}</b><p>${calls.length} Husbandry Calls</p>${calls.map(j=>`<button class="hfo-btn" data-open-job="${j.id}">${escape(j.data.vessel || 'Draft')} · ${escape(j.data.jobNo || 'No Job No.')}</button>`).join(' ')}</div>`);
        d.setMonth(d.getMonth()+1);
      }
      return `<div class="hfo-stats">${months.join('')}</div>`;
    }
    const first=state.view==='month' ? startOfWeek(start) : start, days=state.view==='month' ? 42 : 7;
    return `<div class="hfo-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<b class="hfo-weekday">${x}</b>`).join('')}${Array.from({length:days},(_,i)=>{ const d=new Date(first); d.setDate(first.getDate()+i); const calls=state.jobs.filter(j=>j.data.status!=='Cancelled' && matchesDate(j,d)); const outside=state.view==='month' && d.getMonth()!==start.getMonth(); return `<div class="hfo-cell${outside?' hfo-outside':''}"><small>${d.getDate()} ${state.view==='week'?escape(d.toLocaleDateString('en',{month:'short'})):''}</small>${calls.map(j=>`<button class="hfo-job-pill" data-open-job="${j.id}"><b>${escape(j.data.vessel||'Draft')}</b><span class="hfo-job-meta">${escape(j.data.port||'No port')} · ${escape(j.data.status)}</span></button>`).join('')}</div>`;}).join('')}</div>`;
  }
  function renderHome() {
    document.getElementById('title').textContent='Operations · Trial';
    createButton.textContent='+ Create Port Call'; createButton.hidden=!isOwner();
    root.innerHTML=`<div class="hfo-shell">
      <div class="hfo-banner">ระบบทดลองซิงค์ข้ามเครื่อง · ใช้ข้อมูลสมมติเท่านั้น ห้ามกรอกข้อมูลลูกเรือหรือผู้เยี่ยมจริง${state.public?' · ผู้ชมทั่วไปเห็นเฉพาะข้อมูลสรุป':''}</div>
      <div id="hfoNotice" class="hfo-alert" ${state.error?'':'hidden'}>${escape(state.error)}</div>
      ${!state.grant && !state.public ? `<div class="hfo-card"><h2>Operations unavailable</h2><p>${escape(state.error||'Unable to load Operations data right now.')}</p></div>` :
      `<div class="hfo-stats">${metrics().map(([label,value,indicator,trend])=>`<div class="hfo-card hfo-stat"><span>${escape(label)}</span><strong>${escape(value)}</strong>${indicator?`<small class="hfo-trend ${trend}">${escape(indicator)}</small><small class="hfo-muted">By ETA · excludes Cancelled</small>`:''}</div>`).join('')}</div>
       ${state.public?'<div class="hfo-info">ดู Job และ Service แบบสรุปได้โดยไม่ต้องลงชื่อเข้าใช้ · <a href="/api/auth?mode=start">ลงชื่อเข้าใช้เพื่อดูรายละเอียดและแก้ไขตามสิทธิ์</a></div>':''}
       <div class="hfo-card hfo-calendar-card"><div class="hfo-toolbar"><h2>Husbandry Call Calendar</h2><div class="hfo-row"><button class="hfo-btn" data-shift="-1" aria-label="Previous period">‹</button><b>${escape(period()[2])}</b><button class="hfo-btn" data-shift="1" aria-label="Next period">›</button><select id="hfoView" aria-label="Calendar view">${option(['week','month','quarter','year'],state.view)}</select></div></div><p class="hfo-muted">Jobs appear on their ETA date · port local time</p>${calendar()}</div>
       <details class="hfo-card hfo-calls" ${state.callsOpen?'open':''}><summary data-calls-toggle><span>All Husbandry Calls</span><span class="hfo-muted">${state.jobs.length} calls · ${escape(state.sync)}</span></summary><div class="hfo-list">${state.jobs.length ? state.jobs.map(j=>`<div class="hfo-list-row"><button data-open-job="${j.id}"><b>${escape(j.data.vessel||'Draft Port Call')}</b><small>${escape(j.data.jobNo||'No Job No.')} · ${escape(j.data.port||'No port')} · ${formatDate(j.data.eta)} – ${formatDate(j.data.etd)}</small></button><span>${escape(j.data.status)}</span></div>`).join(''):'<div class="hfo-empty">ยังไม่มี Port Call ในฐานข้อมูลทดลอง</div>'}</div></details>
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
    const j = job(); if (!j) return;
    const calls = serviceList(j);
    overlay(`<div class="hfo-banner">Public summary only · รายชื่อ Crew/Visitor และข้อมูลภายในต้องลงชื่อเข้าใช้</div>
      <div class="hfo-section"><h2>${escape(j.data.vessel||'Draft Port Call')}</h2>
      <p>Job No. ${escape(j.data.jobNo||'—')} · ${escape(j.data.port||'—')} · ${escape(j.data.status||'—')}</p>
      <p>Principal: ${escape(j.data.principal||'—')} · ETA: ${formatDate(j.data.eta)} · ETD: ${formatDate(j.data.etd)}</p></div>
      <div class="hfo-section"><h3>Services</h3><div class="hfo-list">${calls.length?calls.map(s=>`<div class="hfo-list-row"><button data-open-service="${s.id}">#${s.seq} · ${escape(s.data.type||'Service')}</button><span>${escape(s.data.status||'—')}</span></div>`).join(''):'<p class="hfo-muted">No Services yet.</p>'}</div></div>
      <a class="hfo-btn primary" href="/api/auth?mode=start">Sign in for permitted details and editing</a>`, j.data.vessel||'Port Call', j.data.jobNo||'Public view');
  }
  function renderPublicService() {
    const s = service(), j = job(); if (!s || !j) return;
    overlay(`<div class="hfo-banner">Public Service summary only · บุคคล เอกสาร และหมายเหตุไม่แสดง</div>
      <div class="hfo-section"><button class="hfo-btn" data-back-job>← Job</button>
      <h2>#${s.seq} · ${escape(s.data.type||'Service')}</h2><p>${escape(j.data.vessel||'Port Call')} · ${escape(s.data.status||'—')}</p>
      <div class="hfo-form-grid"><p>Planned: ${formatDate(s.data.plannedStart)} – ${formatDate(s.data.plannedEnd)}</p><p>Actual: ${formatDate(s.data.actualStart)} – ${formatDate(s.data.actualEnd)}</p></div></div>
      <a class="hfo-btn primary" href="/api/auth?mode=start">Sign in for permitted details and editing</a>`, `#${s.seq} · ${s.data.type||'Service'}`, j.data.jobNo||'Public view');
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
  function terminalStays(j) {
    const stays=Array.isArray(j.data.terminalStays)?j.data.terminalStays:[];
    return `<div class="hfo-section"><div class="hfo-toolbar"><h3>Terminal Stays</h3>${mayEditJob(j)?'<button class="hfo-btn" data-add-stay>+ Add terminal stay</button>':''}</div>
      <div class="hfo-table-wrap"><table class="hfo-table"><thead><tr><th>#</th><th>Terminal</th><th>Planned berth</th><th>Planned departure</th><th>Actual berth</th><th>Actual departure</th><th>Status</th><th></th></tr></thead><tbody>
      ${stays.map((x,i)=>`<tr><td>${i+1}</td><td>${escape(x.terminal||'')}</td><td>${formatDate(x.plannedBerth)}</td><td>${formatDate(x.plannedDeparture)}</td><td>${formatDate(x.actualBerth)}</td><td>${formatDate(x.actualDeparture)}</td><td>${escape(x.status||'Planned')}</td><td>${mayEditJob(j)?`<button class="hfo-btn" data-edit-stay="${i}">Edit</button> <button class="hfo-btn danger" data-remove-stay="${i}">Remove</button>`:''}</td></tr>`).join('')}
      </tbody></table></div>${!stays.length?'<p class="hfo-muted">No terminal stay recorded.</p>':''}</div>`;
  }
  function renderJob() {
    const j=job(); if (!j) return;
    const services=serviceList(j), editable=mayEditJob(j);
    const folderUrl=j.data.documentsPath?'https://github.com/primoxy-dev/harborflow-job-documents/tree/main/'+j.data.documentsPath.split('/').map(encodeURIComponent).join('/'):'';
    const folderControl=folderUrl?`<a class="hfo-btn" href="${escape(folderUrl)}" target="_blank" rel="noopener noreferrer">Open GitHub folder</a>${isOwner()?'<button class="hfo-btn" data-sync-job-folder>Sync GitHub folders</button>':''}<small class="hfo-muted">Folder follows Vessel, Job No., ETA and Cancelled status.</small>`:isOwner()?'<button class="hfo-btn" data-sync-job-folder>Create GitHub folder</button>':'<small class="hfo-muted">GitHub folder not created</small>';
    overlay(`<div class="hfo-banner">ข้อมูลทดลองเท่านั้น · ห้ามใช้ข้อมูลลูกเรือหรือผู้เยี่ยมจริง · Autosave เมื่อเปลี่ยนช่องข้อมูล</div>
      <div class="hfo-section"><div class="hfo-toolbar"><div><h2>${escape(j.data.vessel||'Draft Port Call')}</h2><span class="hfo-muted">${escape(j.data.jobNo||'No Job No.')} · ${escape(j.data.port||'No port')} · ${escape(j.data.status)}</span></div><span class="hfo-muted" id="hfoSync">${escape(state.sync)}</span></div>
      ${jobFields(j.data,editable)}<div class="hfo-actions">${folderControl}</div><p class="hfo-muted">Job ID: ${escape(j.id)} · assigned PIC does not automatically grant access</p></div>
      ${terminalStays(j)}
      <div class="hfo-section"><div class="hfo-toolbar"><h3>Services</h3>${editable?'<button class="hfo-btn primary" data-add-service>+ Add Service</button>':''}</div>
      <div class="hfo-list">${services.length?services.map(s=>`<div class="hfo-list-row"><button data-open-service="${s.id}"><b>#${s.seq} · ${escape(s.data.type)}</b><small>${escape(s.data.description||'No description')} · PIC ${escape(s.data.pic||'Unassigned')}</small></button><span>${escape(s.data.status)}</span>${mayEditService(s)?`<button class="hfo-btn danger" data-remove-service="${s.id}">Remove</button>`:''}</div>`).join(''):'<div class="hfo-empty">No Services yet.</div>'}</div></div>
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
  async function saveStay(stay,index) {
    const j=job(), old=Array.isArray(j.data.terminalStays)?j.data.terminalStays:[];
    const next=[...old]; if (index===null) next.push(stay); else if (stay) next[index]=stay; else next.splice(index,1);
    try { const out=await api('updateJob',{id:j.id,patch:{terminalStays:next},base:{terminalStays:old}}); Object.assign(j,out.record); state.error=''; render(); }
    catch(e){handleSaveError(e,{kind:'job',id:j.id,field:'terminalStays',value:next,old});}
  }
  function renderAddService() {
    const j=job(); if (!j) return;
    overlay(`<div class="hfo-banner">Each Service instance gets a permanent number. Repeated types are allowed.</div>
      <form class="hfo-section" id="hfoAddService"><h2>Add Service to ${escape(j.data.vessel||'Port Call')}</h2>
      <div class="hfo-form-grid">${sel('Service type','Port Clearance','type',TYPES)}${f('Description','','description')}${f('Service PIC (GitHub login)','','pic')}</div>
      <p class="hfo-muted">A PIC name does not grant account access. Other fields can be filled in the dedicated Service view.</p>
      <button class="hfo-btn primary">Add Service</button></form>`, 'Add Service', j.data.jobNo||j.id);
  }
  function serviceDetails(s, editable) {
    const d=s.data, dis=editable?'':'disabled';
    const attr='data-service-field';
    const specifics=(TYPE_FIELDS[d.type]||TYPE_FIELDS.Other).map(([name,label,type])=>f(label,d.details?.[name],name,type||'text',`${dis} data-detail-field`)).join('');
    return `<div class="hfo-section"><h3>Shared details</h3><div class="hfo-form-grid">
      ${sel('Type',d.type,'type',TYPES,`${dis} ${attr}`)}
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
      ${d.type==='Other'?'<p class="hfo-muted">Custom fields are instance-specific; standard templates need owner approval.</p>':''}</div>`;
  }
  function checklistHtml(s) {
    const list=Array.isArray(s.data.checklist)?s.data.checklist:[];
    return `<div class="hfo-section"><div class="hfo-toolbar"><h3>Checklist · SOP ${escape(s.data.sopVersion||'not set')}</h3>${mayEditService(s)?'<button class="hfo-btn" data-add-step>+ Add step</button>':''}</div>
      ${list.length?list.map((step,i)=>`<div class="hfo-checklist-row"><input type="checkbox" data-step="${i}" ${step.done?'checked':''} ${mayEditService(s)?'':'disabled'}><span style="flex:1">${escape(step.text)}</span><small class="hfo-muted">${step.done?`${escape(step.actor||'')} · ${formatDate(step.completedAt)}`:''}</small>${mayEditService(s)?`<button class="hfo-btn danger" data-remove-step="${i}">×</button>`:''}</div>`).join(''):'<p class="hfo-muted">No checklist steps yet.</p>'}</div>`;
  }
  function rosterHtml(s) {
    if (!anyPeopleView()) return '<div class="hfo-section hfo-alert">Separate Crew or Visitor view permission is required. Job/Service PIC alone does not grant it.</div>';
    const filtered=state.people.filter(p=>Array.isArray(p.data.serviceIds) && p.data.serviceIds.includes(s.id));
    return `<div class="hfo-section"><div class="hfo-banner">ข้อมูลบุคคลสมมติหรือปกปิดตัวตนเท่านั้น · อย่าใส่เลขเอกสารจริงในช่วงทดลอง</div>
      <div class="hfo-toolbar"><h3>Crew members and Visitors</h3><div class="hfo-row">${state.grant.crewEdit?'<button class="hfo-btn" data-add-person="crew">+ Crew</button>':''}${state.grant.visitorEdit?'<button class="hfo-btn" data-add-person="visitor">+ Visitor</button>':''}</div></div>
      ${CATEGORIES.map(category=>{ const list=filtered.filter(p=>p.data.category===category && canPeople(p.kind)); const kind=['On-signers','Off-signers'].includes(category)?'crew':'visitor';
        if (!canPeople(kind)) return ''; return `<details class="hfo-group" ${list.length?'open':''}><summary>${escape(category)} (${list.length})</summary><div class="hfo-table-wrap"><table class="hfo-table"><thead><tr><th>No.</th><th>Name – Surname</th><th>Nationality</th><th>Rank</th><th>Date of Birth</th><th>Seaman book</th><th>Passport</th><th>PP. EXP</th><th>Flight / Immigration</th></tr></thead><tbody>${list.map((p,i)=>`<tr><td>${i+1}</td><td>${escape(p.data.name)}</td><td>${escape(p.data.nationality)}</td><td>${escape(p.data.rank)}</td><td>${escape(p.data.dob)}</td><td>${escape(p.kind==='crew'?p.data.seamanBook:'')}</td><td>${escape(p.data.passport)}</td><td>${escape(p.data.passportExpiry)}</td><td><button class="hfo-btn" data-edit-person="${p.id}">Open</button> ${canEditPeople(p.kind)?`<button class="hfo-btn danger" data-remove-person="${p.id}">×</button>`:''}</td></tr>`).join('')}</tbody></table></div></details>`}).join('')}
      ${state.personDraft?personForm():''}</div>`;
  }
  function personForm() {
    const draft=state.personDraft, p=draft.data, edit=canEditPeople(draft.kind), flights=Array.isArray(p.flights)?p.flights:[];
    return `<form id="hfoPersonForm" class="hfo-section hfo-nested"><div class="hfo-toolbar"><h3>${draft.id?'Edit':'Add'} ${escape(draft.kind)}</h3><button type="button" class="hfo-btn" data-close-person>Close</button></div>
      <div class="hfo-form-grid">${sel('Change / visitor role',p.category,'category',draft.kind==='crew'?CATEGORIES.slice(0,2):CATEGORIES.slice(2),edit?'':'disabled')}
      ${f('Name – Surname',p.name,'name','text',edit?'':'disabled')}${f('Nationality',p.nationality,'nationality','text',edit?'':'disabled')}
      ${f('Rank / role',p.rank,'rank','text',edit?'':'disabled')}${f('Date of birth',p.dob,'dob','date',edit?'':'disabled')}
      ${f('Passport No.',p.passport,'passport','text',edit?'':'disabled')}${f('Passport expiry',p.passportExpiry,'passportExpiry','date',edit?'':'disabled')}
      ${draft.kind==='crew'?f('Seaman book No.',p.seamanBook,'seamanBook','text',edit?'':'disabled'):''}
      ${area('Notes',p.notes,'notes',edit?'':'disabled')}</div>
      ${draft.kind==='crew'?`<h4>Immigration · per person</h4><div class="hfo-form-grid">
       ${sel('Status',p.immigration?.status||'Not started','immigrationStatus',['Not started','Documents pending','Submitted','Approved','Rejected'],edit?'':'disabled')}
       ${f('Visa / permission',p.immigration?.visa,'immigrationVisa','text',edit?'':'disabled')}
       ${f('OKTB',p.immigration?.oktb,'immigrationOktb','text',edit?'':'disabled')}
       ${area('Immigration notes',p.immigration?.notes,'immigrationNotes',edit?'':'disabled')}</div>`:''}
      <div class="hfo-toolbar"><h4>Flights · ${flights.length}</h4>${edit?'<button type="button" class="hfo-btn" data-add-flight>+ Add flight</button>':''}</div>
      <div class="hfo-table-wrap"><table class="hfo-table"><thead><tr><th>#</th><th>Airline</th><th>Flight No.</th><th>Date</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>Booking</th><th></th></tr></thead><tbody>
      ${flights.map((fl,i)=>`<tr><td>${i+1}</td>${['airline','number','date','from','to','departure','arrival','booking'].map(key=>`<td><input style="max-width:110px" data-flight="${i}" data-flight-field="${key}" value="${escape(fl[key]||'')}" ${edit?'':'disabled'}></td>`).join('')}<td>${edit?`<button type="button" class="hfo-btn danger" data-remove-flight="${i}">×</button>`:''}</td></tr>`).join('')}</tbody></table></div>
      ${edit?'<div class="hfo-actions"><button class="hfo-btn primary">Save person</button></div>':''}</form>`;
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
    const tabs=['details','crew','travel','checklist','history'];
    overlay(`<div class="hfo-banner">Trial only · fictional/de-identified people. Terminal restrictions must be confirmed before execution.</div>
      <div class="hfo-toolbar"><div><h2>#${s.seq} · ${escape(s.data.type)}</h2><span class="hfo-muted">${escape(j.data.vessel||'Port Call')} · ${escape(j.data.jobNo||j.id)} · ${escape(s.data.status)}</span></div><button class="hfo-btn" data-back-job>← Job</button></div>
      <div class="hfo-tabs">${tabs.map(t=>`<button class="${state.tab===t?'active':''}" data-tab="${t}">${{details:'Service details',crew:'Crew members and Visitors',travel:'Travel',checklist:'Checklist',history:'History'}[t]}</button>`).join('')}</div>
      ${state.tab==='details'?serviceDetails(s,mayEditService(s)):state.tab==='crew'?rosterHtml(s):state.tab==='travel'?tripsHtml(s):state.tab==='checklist'?checklistHtml(s):`<div class="hfo-section"><button class="hfo-btn" data-history="service" data-history-id="${s.id}">Load history</button>${historyHtml()}</div>`}`, '#'+s.seq+' · '+s.data.type, j.data.vessel||'Port Call');
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
    if (e.code === 409 && e.detail?.conflicts?.length) {
      state.conflict={...context, conflicts:e.detail.conflicts, current:e.detail.current};
      const box=document.createElement('div'); box.className='hfo-section hfo-conflict'; box.id='hfoConflict';
      box.innerHTML=`<h3>Concurrent edit · review each field</h3><p>No value was overwritten.</p>
        ${state.conflict.conflicts.map(c=>`<div class="hfo-nested"><b>${escape(c.field)}</b><p>Original: ${escape(JSON.stringify(c.original))}</p><p>Shared now: ${escape(JSON.stringify(c.shared))}</p><p>Your value: ${escape(JSON.stringify(c.local))}</p></div>`).join('')}
        <div class="hfo-actions"><button class="hfo-btn" data-resolve="shared">Use shared value</button><button class="hfo-btn primary" data-resolve="mine">Save my value after review</button></div>`;
      document.querySelector('.hfo-overlay-body')?.prepend(box);
    } else announce(e.message);
  }
  async function resolveConflict(choice) {
    const c=state.conflict; if (!c) return;
    if (choice==='shared') {
      const list=c.kind==='job'?state.jobs:state.services, item=list.find(x=>x.id===c.id);
      if (item) Object.assign(item,c.current);
      state.conflict=null; state.error=''; render(); return;
    }
    const conflict=c.conflicts[0]; if (!conflict) return;
    const nested=c.field.startsWith('details.');
    const name=nested?c.field.slice(8):c.field;
    const patch=nested?{details:{[name]:c.value}}:{[name]:c.value};
    const base=nested?{details:{[name]:conflict.shared}}:{[name]:conflict.shared};
    try {
      const out=await api(c.kind==='job'?'updateJob':'updateService',{id:c.id,patch,base,reason:c.reason||''});
      const item=(c.kind==='job'?state.jobs:state.services).find(x=>x.id===c.id);
      if (item) Object.assign(item,out.record);
      state.conflict=null; state.error=''; render();
    } catch(e){state.conflict=null; document.getElementById('hfoConflict')?.remove(); handleSaveError(e,c);}
  }
  async function loadPeople() {
    if (!job() || !anyPeopleView()) return;
    try {const out=await api('people',{jobId:job().id},'GET');state.people=out.people;state.error='';render();}
    catch(e){state.people=[];announce(e.message);}
  }
  async function loadTrips() {
    if (!job() || !state.grant.crewView || !state.grant.visitorView) return;
    try {const out=await api('trips',{jobId:job().id},'GET');state.trips=out.trips;state.error='';render();}
    catch(e){state.trips=[];announce(e.message);}
  }
  function capturePersonForm() {
    const draft=state.personDraft, form=document.getElementById('hfoPersonForm'); if (!draft || !form) return;
    const d=new FormData(form);
    for (const name of ['category','name','nationality','rank','dob','passport','passportExpiry','seamanBook','notes']) if (d.has(name)) draft.data[name]=String(d.get(name)||'');
    if (draft.kind==='crew') draft.data.immigration={status:String(d.get('immigrationStatus')||''),visa:String(d.get('immigrationVisa')||''),oktb:String(d.get('immigrationOktb')||''),notes:String(d.get('immigrationNotes')||'')};
    form.querySelectorAll('[data-flight]').forEach(input=>{const i=Number(input.dataset.flight);draft.data.flights[i][input.dataset.flightField]=input.value;});
  }
  async function savePerson() {
    capturePersonForm();
    const draft=state.personDraft, old=draft.id && state.people.find(p=>p.id===draft.id);
    try {
      const data={...draft.data,kind:draft.kind,serviceIds:[...new Set([...(draft.data.serviceIds||[]),service().id])]};
      if (old) {
        const patch=Object.fromEntries(Object.entries(data).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(old.data[key])));
        if (Object.keys(patch).length) {const out=await api('updatePerson',{id:old.id,kind:draft.kind,patch,base:old.data});Object.assign(old,out.record);}
      } else {
        const out=await api('createPerson',{jobId:job().id,kind:draft.kind,data}); state.people.push(out.person);
      }
      state.personDraft=null;state.error='';render();
    } catch(e){handleSaveError(e,{kind:'person',id:draft.id});}
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
    if(event.target.closest('[data-calls-toggle]')){state.callsOpen=!state.callsOpen;return;}
    const b=event.target.closest('[data-open-job],[data-open-service],[data-shift],[data-grants],[data-close],[data-back-job],[data-add-service],[data-remove-service],[data-restore-service],[data-add-stay],[data-edit-stay],[data-remove-stay],[data-tab],[data-add-step],[data-remove-step],[data-add-person],[data-edit-person],[data-remove-person],[data-close-person],[data-add-flight],[data-remove-flight],[data-add-trip],[data-edit-trip],[data-remove-trip],[data-close-trip],[data-history],[data-resolve],[data-revoke],[data-lookup-imo],[data-imo-choice],[data-sync-job-folder]');
    if(!b)return;
    if(b.dataset.openJob){state.openJobId=b.dataset.openJob;state.openServiceId=null;state.modal=null;state.history=[];state.error='';render();if(!state.public)await loadPortChoices();return;}
    if(b.hasAttribute('data-lookup-imo')){await lookupImo(b);return;}
    if(b.hasAttribute('data-sync-job-folder')){await perform('syncJobFolder',{id:job().id},out=>{Object.assign(job(),out.record);render();});return;}
    if(b.dataset.imoChoice){const grid=b.closest('.hfo-form-grid'),input=grid?.querySelector('[name="imo"]');if(input){input.value=b.dataset.imoChoice;grid.querySelector('[data-imo-feedback]').textContent='IMO selected. Verify with ship documents.';if(input.hasAttribute('data-job-field'))input.dispatchEvent(new Event('change',{bubbles:true}));}return;}
    if(b.dataset.openService){state.openServiceId=b.dataset.openService;state.tab='details';state.history=[];state.error='';render();return;}
    if(b.dataset.shift){shift(Number(b.dataset.shift));return;}
    if(b.hasAttribute('data-grants')){state.modal='grants';state.openJobId=null;state.openServiceId=null;render();return;}
    if(b.hasAttribute('data-close')){state.modal=null;state.openJobId=null;state.openServiceId=null;state.people=[];state.trips=[];state.personDraft=null;state.tripDraft=null;state.history=[];state.error='';render();await refresh();return;}
    if(b.hasAttribute('data-back-job')){state.openServiceId=null;state.people=[];state.trips=[];state.personDraft=null;state.tripDraft=null;state.history=[];render();return;}
    if(b.hasAttribute('data-add-service')){state.modal='addService';render();return;}
    if(b.dataset.removeService){const reason=prompt('Reason for removing this erroneous Service entry:');if(reason)await perform('removeService',{id:b.dataset.removeService,reason},out=>{const x=state.services.find(s=>s.id===out.service.id);Object.assign(x,out.service);render();});return;}
    if(b.dataset.restoreService){const reason=prompt('Reason for restoring this Service:');if(reason)await perform('restoreService',{id:b.dataset.restoreService,reason},out=>{const x=state.services.find(s=>s.id===out.service.id);Object.assign(x,out.service);render();});return;}
    if(b.hasAttribute('data-add-stay')||b.hasAttribute('data-edit-stay')){const i=b.hasAttribute('data-edit-stay')?Number(b.dataset.editStay):null;const old=i===null?{}:(job().data.terminalStays||[])[i];const terminal=prompt('Terminal name:',old.terminal||'');if(terminal===null)return;const plannedBerth=prompt('Planned berth (YYYY-MM-DDTHH:MM):',old.plannedBerth||'');if(plannedBerth===null)return;const plannedDeparture=prompt('Planned departure (YYYY-MM-DDTHH:MM):',old.plannedDeparture||'');if(plannedDeparture===null)return;await saveStay({...old,terminal,plannedBerth,plannedDeparture,status:old.status||'Planned'},i);return;}
    if(b.hasAttribute('data-remove-stay')){const i=Number(b.dataset.removeStay);if(confirm('Remove this terminal stay?'))await saveStay(null,i);return;}
    if(b.dataset.tab){state.tab=b.dataset.tab;state.personDraft=null;state.tripDraft=null;state.history=[];render();if(state.tab==='crew')await loadPeople();if(state.tab==='travel'){await loadPeople();await loadTrips();}return;}
    if(b.hasAttribute('data-add-step')){const text=prompt('Checklist step:');if(text?.trim())await saveChecklist([...(service().data.checklist||[]),{text:text.trim(),done:false}]);return;}
    if(b.hasAttribute('data-remove-step')){const i=Number(b.dataset.removeStep);const next=[...(service().data.checklist||[])];next.splice(i,1);await saveChecklist(next);return;}
    if(b.dataset.addPerson){state.personDraft={kind:b.dataset.addPerson,data:{category:b.dataset.addPerson==='crew'?'On-signers':'Medical visitors',name:'',flights:[],serviceIds:[service().id]}};render();return;}
    if(b.dataset.editPerson){const p=state.people.find(x=>x.id===b.dataset.editPerson);state.personDraft={id:p.id,kind:p.kind,data:structuredClone(p.data)};render();return;}
    if(b.dataset.removePerson){const p=state.people.find(x=>x.id===b.dataset.removePerson),reason=prompt('Reason for removing this person:');if(reason)await perform('removePerson',{id:p.id,kind:p.kind,reason},()=>{state.people=state.people.filter(x=>x.id!==p.id);render();});return;}
    if(b.hasAttribute('data-close-person')){state.personDraft=null;render();return;}
    if(b.hasAttribute('data-add-flight')){capturePersonForm();state.personDraft.data.flights.push({airline:'',number:'',date:'',from:'',to:'',departure:'',arrival:'',booking:''});render();return;}
    if(b.hasAttribute('data-remove-flight')){capturePersonForm();state.personDraft.data.flights.splice(Number(b.dataset.removeFlight),1);render();return;}
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
    if(t.hasAttribute('data-service-field')||t.hasAttribute('data-detail-field')){await saveServiceField(t);return;}
    if(t.hasAttribute('data-service-check')){await saveServiceField(t,true);return;}
    if(t.hasAttribute('data-step')){const next=structuredClone(service().data.checklist||[]),i=Number(t.dataset.step);next[i]={...next[i],done:t.checked,actor:state.login,completedAt:t.checked?new Date().toISOString():null};await saveChecklist(next);}
  });
  document.body.addEventListener('submit',async event=>{
    const form=event.target;
    if(!['hfoCreateJob','hfoAddService','hfoPersonForm','hfoTripForm','hfoGrantForm'].includes(form.id))return;
    event.preventDefault();const d=new FormData(form);
    if(form.id==='hfoCreateJob'){const data=Object.fromEntries(d.entries());await perform('createJob',{data},out=>{state.jobs.unshift(out.job);state.modal=null;state.openJobId=out.job.id;render();});}
    if(form.id==='hfoAddService'){await perform('addService',{jobId:job().id,data:Object.fromEntries(d.entries())},out=>{state.services.push(out.service);state.modal=null;state.openServiceId=out.service.id;state.tab='details';render();});}
    if(form.id==='hfoPersonForm')await savePerson();
    if(form.id==='hfoTripForm')await saveTrip();
    if(form.id==='hfoGrantForm'){const data=Object.fromEntries(d.entries());for(const key of ['crewView','crewEdit','visitorView','visitorEdit'])data[key]=d.has(key);await perform('grant',data,()=>renderGrants());}
  });
  refresh();
  setInterval(refresh,15000);
})();

