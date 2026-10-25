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
  const JOB_STATUSES = ['Arrived','Awaiting Customer PO','Cancelled','Invoiced','Open','Ops Closed/Awaiting Invoices','Partial Invoiced','Ready For DA','Sailed'];
  const LEGACY_JOB_STATUS = {'Draft':'Open','Planned':'Open','Confirmed':'Open','In Progress':'Open','On Hold':'Open','Completed':'Ops Closed/Awaiting Invoices'};
  const SERVICE_STATUSES = ['Not Started','In Progress','Waiting','Completed','Cancelled'];
  const VESSEL_TYPES = ['Container Ship','LNG/LPG Carrier','Oil/Chemical Tanker','Bulk Carrier','General Cargo','Ro-Ro','Passenger/Cruise','Tug/Offshore','Other'];
  const FLAT_VISITORS = {'Visitor':'Visitors','SIRE Inspector':'SIRE Inspector','Surveyor':'Surveyor'};
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
  const portSelect = (current, extra) => '<label class="hfo-field"><span>Port / Terminal</span><select name="port" ' + extra + '>' + portOptions(current) + '</select></label>';
  let state = { login: '', grant: null, public: false, jobs: [], services: [], people: [], peopleLoadedFor: null, trips: [], view: 'month', anchor: new Date(), openJobId: null, openServiceId: null, tab: 'details', busy: false, error: '', sync: '', conflict: null, personDraft: null, tripDraft: null, modal: null, history: [], portChoices: [], portStatus: 'Loading Port / Terminal…', documentBatch:{busy:false,category:'On-signers',completed:0,total:0,results:[]} };
  let personSaveTimer = null, personSaveQueue = Promise.resolve(), personCreateInFlight = false;
  const isOwner = () => state.grant?.role === 'owner';
  const isEditor = () => isOwner() || state.grant?.role === 'editor';
  const job = () => state.jobs.find(x => x.id === state.openJobId);
  const service = () => state.services.find(x => x.id === state.openServiceId);
  const mayEditJob = j => isOwner() || state.grant?.role === 'editor' && j?.data.pic === state.login;
  const mayEditService = s => mayEditJob(job()) || state.grant?.role === 'editor' && s?.data.pic === state.login;
  const jobStatus = value => LEGACY_JOB_STATUS[value] || value || 'Open';
  function portClass(value) {
    const port=String(value||'').toLowerCase();
    if(port.includes('map ta phut'))return 'port-map-ta-phut';
    if(port.includes('laem chabang'))return 'port-laem-chabang';
    if(port.includes('sriracha')||port.includes('sri racha'))return 'port-sriracha';
    return 'port-other';
  }
  function vesselIcon(type) {
    const details={
      'Container Ship':'<rect x="7" y="7" width="4" height="3"/><rect x="12" y="7" width="4" height="3"/><rect x="17" y="7" width="4" height="3"/><rect x="9" y="3" width="4" height="3"/><rect x="14" y="3" width="4" height="3"/>',
      'LNG/LPG Carrier':'<circle cx="10" cy="8" r="3"/><circle cx="17" cy="8" r="3"/>',
      'Oil/Chemical Tanker':'<rect x="7" y="6" width="13" height="4" rx="2"/><path d="M10 6V4m7 2V4"/>',
      'Bulk Carrier':'<path d="M7 9l2-4h4l2 4m0 0 2-4h4l2 4"/>',
      'General Cargo':'<path d="M9 10V4h7m-4 0 5 5M7 10h13"/>',
      'Ro-Ro':'<path d="M7 5h13v5H7zM9 7h2m2 0h2m2 0h2"/>',
      'Passenger/Cruise':'<path d="M7 4h11l3 6H7zM9 6h1m2 0h1m2 0h1m2 0h1"/>',
      'Tug/Offshore':'<path d="M10 10V5h7l3 5M13 5V2h3v3"/>',
      'Other':'<path d="M9 10V5h8l3 5M12 5V3h3v2"/>'
    };
    const key=details[type]?type:'Other';
    return `<svg class="hfo-vessel-icon" viewBox="0 0 28 22" aria-hidden="true" data-vessel-type="${escape(key)}"><g class="hfo-vessel-detail">${details[key]}</g><path class="hfo-vessel-hull" d="M3 11h22l-3.5 6H7z"/><path class="hfo-vessel-wave" d="M3 20c2-1.4 4-1.4 6 0 2-1.4 4-1.4 6 0 2-1.4 4-1.4 6 0 1.4-1 2.7-1.2 4-.6"/></svg>`;
  }
  const vesselName=(j,fallback='Port Call')=>`<span class="hfo-vessel-name">${vesselIcon(j.data.vesselType)}<span>${escape(j.data.vessel||fallback)}</span></span>`;
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
    return ['Husbandry calls', currentCalls, trend, change > 0 ? 'up' : change < 0 ? 'down' : 'flat'];
  }
  function monthJobs(anchor=state.anchor,offset=0) {
    const start=new Date(anchor.getFullYear(),anchor.getMonth()+offset,1);
    const end=new Date(anchor.getFullYear(),anchor.getMonth()+offset+1,0);
    const first=localKey(start),last=localKey(end);
    return state.jobs.filter(j=>j.data.eta&&dateOnly(j.data.eta)>=first&&dateOnly(j.data.eta)<=last);
  }
  function countBy(list,key) {
    const counts=new Map();
    for(const item of list){const value=key(item)||'No data';counts.set(value,(counts.get(value)||0)+1);}
    return counts;
  }
  function monthlyChartData() {
    const current=monthJobs(),previous=monthJobs(state.anchor,-1);
    const activeCurrent=current.filter(j=>jobStatus(j.data.status)!=='Cancelled');
    const activePrevious=previous.filter(j=>jobStatus(j.data.status)!=='Cancelled');
    const currentLabel=state.anchor.toLocaleDateString('en',{month:'long',year:'numeric'});
    const previousDate=new Date(state.anchor.getFullYear(),state.anchor.getMonth()-1,1);
    const previousLabel=previousDate.toLocaleDateString('en',{month:'long',year:'numeric'});
    const currentPorts=countBy(activeCurrent,j=>j.data.port||'No Port / Terminal');
    const previousPorts=countBy(activePrevious,j=>j.data.port||'No Port / Terminal');
    const ports=[...new Set([...currentPorts.keys(),...previousPorts.keys()])].sort((a,b)=>(currentPorts.get(b)||0)-(currentPorts.get(a)||0)||(previousPorts.get(b)||0)-(previousPorts.get(a)||0)||a.localeCompare(b));
    const types=[...countBy(activeCurrent,j=>j.data.vesselType||'Other').entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    const statuses=[...countBy(current,j=>jobStatus(j.data.status)).entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    return {current,previous,activeCurrent,activePrevious,currentLabel,previousLabel,currentPorts,previousPorts,ports,types,statuses};
  }
  function monthlyCharts() {
    const {current,activeCurrent,activePrevious,currentLabel,previousLabel,currentPorts,previousPorts,ports,types,statuses}=monthlyChartData();
    const vesselList=list=>list.length?list.sort((a,b)=>String(a.data.eta||'').localeCompare(String(b.data.eta||''))||String(a.data.vessel||'').localeCompare(String(b.data.vessel||''))).map(j=>`<button type="button" class="hfo-status-vessel" data-open-job="${escape(j.id)}"><b>${escape(j.data.vessel||'Port Call')}</b><small>${state.public?'':`${escape(j.data.jobNo||'No Job No.')} · `}${escape(j.data.port||'No port')} · ETA ${formatDate(j.data.eta)}</small></button>`).join(''):'<small class="hfo-chart-no-vessels">No Port Calls</small>';
    const portMax=Math.max(1,...ports.flatMap(port=>[currentPorts.get(port)||0,previousPorts.get(port)||0]));
    const portRows=ports.length?ports.map(port=>{
      const now=currentPorts.get(port)||0,prior=previousPorts.get(port)||0;
      return `<details class="hfo-chart-group" data-port-chart-row data-current="${now}" data-previous="${prior}"><summary class="hfo-chart-row" aria-label="${escape(port)}: ${now} vessels in ${escape(currentLabel)}, ${prior} in ${escape(previousLabel)}; show lists"><span class="hfo-chart-label" title="${escape(port)}"><i class="hfo-status-caret" aria-hidden="true">▸</i>${escape(port)}</span><span class="hfo-chart-pair">
        <span class="hfo-chart-track"><i class="hfo-bar current" style="width:${Math.round(now/portMax*100)}%"></i><b>${now}</b></span>
        <span class="hfo-chart-track"><i class="hfo-bar previous" style="width:${Math.round(prior/portMax*100)}%"></i><b>${prior}</b></span>
      </span></summary><div class="hfo-status-vessels"><div class="hfo-chart-month"><strong>${escape(currentLabel)} · ${now}</strong>${vesselList(activeCurrent.filter(j=>(j.data.port||'No Port / Terminal')===port))}</div><div class="hfo-chart-month"><strong>${escape(previousLabel)} · ${prior}</strong>${vesselList(activePrevious.filter(j=>(j.data.port||'No Port / Terminal')===port))}</div></div></details>`;
    }).join(''):'<div class="hfo-empty">No Port Calls in these two months.</div>';
    const typeMax=Math.max(1,...types.map(([,count])=>count));
    const typeRows=types.length?types.map(([type,count],index)=>`<details class="hfo-chart-group" data-vessel-chart-row data-count="${count}"><summary class="hfo-status-row" aria-label="${escape(type)}: ${count} vessels, show list"><span class="hfo-chart-label" title="${escape(type)}"><i class="hfo-status-caret" aria-hidden="true">▸</i>${escape(type)}</span><span class="hfo-chart-track"><i class="hfo-bar vessel-type type-${index%6}" style="width:${Math.round(count/typeMax*100)}%"></i><b>${count}</b></span></summary><div class="hfo-status-vessels">${vesselList(activeCurrent.filter(j=>(j.data.vesselType||'Other')===type))}</div></details>`).join(''):`<div class="hfo-empty">No Port Calls in ${escape(currentLabel)}.</div>`;
    const statusMax=Math.max(1,...statuses.map(([,count])=>count));
    const statusRows=statuses.map(([status,count],index)=>{
      const vessels=current.filter(j=>jobStatus(j.data.status)===status);
      return `<details class="hfo-status-group" data-status-chart-row data-count="${count}"><summary class="hfo-status-row" aria-label="${escape(status)}: ${count} vessels, show list"><span class="hfo-chart-label" title="${escape(status)}"><i class="hfo-status-caret" aria-hidden="true">▸</i>${escape(status)}</span><span class="hfo-chart-track"><i class="hfo-bar status status-${index%6}" style="width:${Math.round(count/statusMax*100)}%"></i><b>${count}</b></span></summary><div class="hfo-status-vessels">${vesselList(vessels)}</div></details>`;
    }).join('');
    return `<section class="hfo-card hfo-analysis-card" data-chart="port-terminal"><div class="hfo-chart-head"><div><span>Port / Terminal volume</span><small>${escape(currentLabel)} vs ${escape(previousLabel)} · excludes Cancelled · Click a row to see vessels</small></div><div class="hfo-chart-legend"><span><i class="current"></i>${escape(currentLabel)}</span><span><i class="previous"></i>${escape(previousLabel)}</span></div></div><div class="hfo-chart-list">${portRows}</div></section>
      <section class="hfo-card hfo-analysis-card" data-chart="vessel-type"><div class="hfo-chart-head"><div><span>Vessel type</span><small>${escape(currentLabel)} · ${activeCurrent.length} Port Calls · excludes Cancelled · Click a type to see vessels</small></div></div><div class="hfo-vessel-chart">${typeRows}</div></section>
      <section class="hfo-card hfo-analysis-card" data-chart="status"><div class="hfo-chart-head"><div><span>Vessel status</span><small>${escape(currentLabel)} · ${current.length} Port Calls · Click a status to see vessels</small></div></div><div class="hfo-status-chart">${statusRows||`<div class="hfo-empty">No Port Calls in ${escape(currentLabel)}.</div>`}</div></section>`;
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
        months.push(`<div class="hfo-card"><b>${escape(d.toLocaleDateString('en',{month:'long',year:'numeric'}))}</b><p>${calls.length} Husbandry Calls</p>${calls.map(j=>`<button class="hfo-btn hfo-job-pill ${portClass(j.data.port)}" data-open-job="${j.id}">${vesselName(j)}${state.public?'':`<span class="hfo-job-meta">${escape(j.data.jobNo || 'No Job No.')}</span>`}</button>`).join(' ')}</div>`);
        d.setMonth(d.getMonth()+1);
      }
      return `<div class="hfo-stats">${months.join('')}</div>`;
    }
    const first=state.view==='month' ? startOfWeek(start) : start, days=state.view==='month' ? 42 : 7;
    return `<div class="hfo-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<b class="hfo-weekday">${x}</b>`).join('')}${Array.from({length:days},(_,i)=>{ const d=new Date(first); d.setDate(first.getDate()+i); const calls=state.jobs.filter(j=>j.data.status!=='Cancelled' && matchesDate(j,d)); const outside=state.view==='month' && d.getMonth()!==start.getMonth(); return `<div class="hfo-cell${outside?' hfo-outside':''}"><small>${d.getDate()} ${state.view==='week'?escape(d.toLocaleDateString('en',{month:'short'})):''}</small>${calls.map(j=>`<button class="hfo-job-pill ${portClass(j.data.port)}" data-open-job="${j.id}"><b>${vesselName(j)}</b><span class="hfo-job-meta">${escape(j.data.port||'No port')} · ${escape(jobStatus(j.data.status))}</span></button>`).join('')}</div>`;}).join('')}</div>`;
  }
  function reportCanvas() {
    const width=1800,pad=54,gap=22,cardWidth=(width-pad*2-gap*3)/4;
    const chart=monthlyChartData(),maxRows=Math.max(5,chart.ports.length,chart.types.length,chart.statuses.length);
    const chartHeight=112+Math.min(maxRows,16)*34+(maxRows>16?26:0);
    const [start,end,label]=period();
    const jobsOnDate=date=>state.jobs.filter(j=>j.data.status!=='Cancelled'&&matchesDate(j,date));
    const jobBoxHeight=47;
    let calendarHeight;
    if(state.view==='month'||state.view==='week'){
      const first=state.view==='month'?startOfWeek(start):start,days=state.view==='month'?42:7,rows=Math.ceil(days/7),counts=Array.from({length:days},(_,index)=>{const d=new Date(first);d.setDate(first.getDate()+index);return jobsOnDate(d).length;});
      calendarHeight=38+rows*Math.max(state.view==='week'?210:118,39+Math.max(1,...counts)*jobBoxHeight);
    }else{
      const columns=state.view==='quarter'?3:4,months=[];let d=new Date(start);while(d<=end){months.push(new Date(d));d.setMonth(d.getMonth()+1);}const rows=Math.ceil(months.length/columns),maxMonthJobs=Math.max(1,...months.map(month=>monthJobs(month).filter(j=>j.data.status!=='Cancelled').length));
      calendarHeight=rows*(82+maxMonthJobs*jobBoxHeight)+gap*(rows-1);
    }
    const height=150+chartHeight+90+calendarHeight+70;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.textBaseline='top';
    const font=(size,weight=400)=>{ctx.font=`${weight} ${size}px Arial, sans-serif`;};
    const roundRect=(x,y,w,h,r=14,fill='#fff',stroke='#dbe3ed')=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();};
    const fitText=(text,maxWidth)=>{let value=String(text||'');if(ctx.measureText(value).width<=maxWidth)return value;while(value.length&&ctx.measureText(value+'…').width>maxWidth)value=value.slice(0,-1);return value+'…';};
    const barList=(rows,x,y,w,color,compare=false)=>{const shown=rows.slice(0,16),max=Math.max(1,...rows.flatMap(row=>compare?[row[1],row[2]]:[row[1]]));shown.forEach((row,index)=>{const yy=y+index*34,labelWidth=Math.min(170,w*.42);font(15,400);ctx.fillStyle='#334155';ctx.fillText(fitText(row[0],labelWidth-8),x,yy+2);const bx=x+labelWidth,bw=w-labelWidth-30;ctx.fillStyle='#eef2f6';ctx.fillRect(bx,yy+3,bw,compare?10:18);ctx.fillStyle=color;ctx.fillRect(bx,yy+3,bw*row[1]/max,compare?10:18);font(13,700);ctx.fillStyle='#475569';ctx.fillText(String(row[1]),bx+bw+7,yy+3);if(compare){ctx.fillStyle='#eef2f6';ctx.fillRect(bx,yy+18,bw,10);ctx.fillStyle='#f59e0b';ctx.fillRect(bx,yy+18,bw*row[2]/max,10);ctx.fillStyle='#475569';ctx.fillText(String(row[2]),bx+bw+7,yy+16);}});if(rows.length>16){font(13,400);ctx.fillStyle='#64748b';ctx.fillText(`+ ${rows.length-16} more`,x,y+16*34);}};
    font(32,700);ctx.fillStyle='#10233d';ctx.fillText('HarborFlow · Port Call Calendar',pad,40);
    font(18,400);ctx.fillStyle='#64748b';ctx.fillText(`${label} · Jobs by ETA · port local time`,pad,86);
    const generated=new Date().toLocaleString('en-GB',{hour12:false});font(14,400);ctx.textAlign='right';ctx.fillText(`Downloaded ${generated}`,width-pad,48);ctx.textAlign='left';
    const [metricLabel,metricValue,metricTrend]=metrics();
    const cards=[
      {title:metricLabel,subtitle:metricTrend,kind:'metric'},
      {title:'Port / Terminal volume',subtitle:`${chart.currentLabel} vs ${chart.previousLabel}`,kind:'ports'},
      {title:'Vessel type',subtitle:`${chart.currentLabel} · ${chart.activeCurrent.length} Port Calls`,kind:'types'},
      {title:'Vessel status',subtitle:`${chart.currentLabel} · ${chart.current.length} Port Calls`,kind:'statuses'}
    ];
    cards.forEach((card,index)=>{const x=pad+index*(cardWidth+gap),y=130;roundRect(x,y,cardWidth,chartHeight);font(20,700);ctx.fillStyle='#172033';ctx.fillText(card.title,x+20,y+20);font(14,400);ctx.fillStyle='#64748b';ctx.fillText(fitText(card.subtitle,cardWidth-40),x+20,y+50);if(card.kind==='metric'){font(50,700);ctx.fillStyle='#10233d';ctx.fillText(String(metricValue),x+20,y+94);font(14,400);ctx.fillStyle='#64748b';ctx.fillText('Excludes Cancelled',x+20,y+158);}else if(card.kind==='ports'){barList(chart.ports.map(port=>[port,chart.currentPorts.get(port)||0,chart.previousPorts.get(port)||0]),x+20,y+86,cardWidth-40,'#0f8a78',true);}else if(card.kind==='types'){barList(chart.types,x+20,y+86,cardWidth-40,'#4978c8');}else{barList(chart.statuses,x+20,y+86,cardWidth-40,'#7857d8');}});
    let cy=150+chartHeight;font(26,700);ctx.fillStyle='#10233d';ctx.fillText('Calendar',pad,cy);font(16,400);ctx.fillStyle='#64748b';ctx.fillText(label,pad+125,cy+5);cy+=48;
    const portColors={'port-map-ta-phut':['#d8f3e6','#15583e'],'port-laem-chabang':['#dcecff','#214f82'],'port-sriracha':['#eee4ff','#654194'],'port-other':['#e8f0f5','#3e5361']};
    const drawVesselMark=(type,x,y,color)=>{ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5;ctx.lineCap='round';ctx.lineJoin='round';const rect=(rx,ry,rw,rh)=>ctx.fillRect(rx,ry,rw,rh);switch(type){case'Container Ship':rect(6,7,5,4);rect(12,7,5,4);rect(18,7,5,4);rect(9,2,5,4);rect(15,2,5,4);break;case'LNG/LPG Carrier':ctx.beginPath();ctx.arc(10,8,4,Math.PI,0);ctx.arc(19,8,4,Math.PI,0);ctx.stroke();break;case'Oil/Chemical Tanker':ctx.beginPath();ctx.roundRect(7,5,15,6,3);ctx.stroke();ctx.beginPath();ctx.moveTo(11,5);ctx.lineTo(11,2);ctx.moveTo(18,5);ctx.lineTo(18,2);ctx.stroke();break;case'Bulk Carrier':ctx.beginPath();ctx.moveTo(6,10);ctx.lineTo(10,3);ctx.lineTo(14,10);ctx.moveTo(14,10);ctx.lineTo(18,3);ctx.lineTo(23,10);ctx.stroke();break;case'General Cargo':ctx.beginPath();ctx.moveTo(9,10);ctx.lineTo(9,3);ctx.lineTo(17,3);ctx.moveTo(13,3);ctx.lineTo(20,10);ctx.moveTo(7,10);ctx.lineTo(22,10);ctx.stroke();break;case'Ro-Ro':ctx.strokeRect(7,3,15,8);rect(9,6,3,2);rect(14,6,3,2);rect(19,6,2,2);break;case'Passenger/Cruise':ctx.beginPath();ctx.moveTo(7,10);ctx.lineTo(9,3);ctx.lineTo(20,3);ctx.lineTo(23,10);ctx.stroke();[10,14,18].forEach(px=>rect(px,5,2,2));break;case'Tug/Offshore':ctx.beginPath();ctx.moveTo(9,10);ctx.lineTo(9,4);ctx.lineTo(18,4);ctx.lineTo(22,10);ctx.stroke();ctx.strokeRect(12,0,5,4);break;default:ctx.beginPath();ctx.moveTo(8,10);ctx.lineTo(9,4);ctx.lineTo(19,4);ctx.lineTo(22,10);ctx.stroke();ctx.strokeRect(12,1,5,3);}ctx.beginPath();ctx.moveTo(3,12);ctx.lineTo(26,12);ctx.lineTo(22,18);ctx.lineTo(7,18);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(3,21);ctx.bezierCurveTo(6,18,9,23,12,20);ctx.bezierCurveTo(15,18,18,23,21,20);ctx.bezierCurveTo(23,19,25,19,27,20);ctx.stroke();ctx.restore();};
    const drawJob=(j,x,y,w)=>{const colors=portColors[portClass(j.data.port)]||portColors['port-other'];ctx.fillStyle=colors[0];ctx.fillRect(x,y,w,jobBoxHeight-4);drawVesselMark(j.data.vesselType,x+5,y+8,colors[1]);font(14,700);ctx.fillStyle=colors[1];ctx.fillText(fitText(j.data.vessel||'Port Call',w-44),x+39,y+6);font(10,400);ctx.fillText(fitText(`${j.data.port||'No port'} · ${jobStatus(j.data.status)}`,w-44),x+39,y+25);};
    if(state.view==='month'||state.view==='week'){
      const first=state.view==='month'?startOfWeek(start):start,days=state.view==='month'?42:7,cols=7,cellW=(width-pad*2)/cols,rows=Math.ceil(days/cols),cellH=(calendarHeight-38)/rows;
      ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((day,index)=>{font(15,700);ctx.textAlign='center';ctx.fillStyle='#64748b';ctx.fillText(day,pad+index*cellW+cellW/2,cy);});ctx.textAlign='left';cy+=30;
      Array.from({length:days},(_,index)=>{const d=new Date(first);d.setDate(first.getDate()+index);const x=pad+(index%cols)*cellW,y=cy+Math.floor(index/cols)*cellH,outside=state.view==='month'&&d.getMonth()!==start.getMonth();ctx.fillStyle=outside?'#f1f4f8':'#ffffff';ctx.strokeStyle='#dbe3ed';ctx.lineWidth=1;ctx.fillRect(x,y,cellW-4,cellH-4);ctx.strokeRect(x,y,cellW-4,cellH-4);font(13,400);ctx.fillStyle=outside?'#94a3b8':'#475569';ctx.fillText(`${d.getDate()}${state.view==='week'?' '+d.toLocaleDateString('en',{month:'short'}):''}`,x+9,y+8);jobsOnDate(d).forEach((j,i)=>drawJob(j,x+7,y+31+i*jobBoxHeight,cellW-18));});
    }else{
      const columns=state.view==='quarter'?3:4,months=[];let d=new Date(start);while(d<=end){months.push(new Date(d));d.setMonth(d.getMonth()+1);}const rows=Math.ceil(months.length/columns),cellW=(width-pad*2-gap*(columns-1))/columns,cellH=(calendarHeight-gap*(rows-1))/rows;
      months.forEach((month,index)=>{const x=pad+(index%columns)*(cellW+gap),y=cy+Math.floor(index/columns)*(cellH+gap);roundRect(x,y,cellW,cellH,12);font(18,700);ctx.fillStyle='#172033';ctx.fillText(month.toLocaleDateString('en',{month:'long',year:'numeric'}),x+16,y+15);const jobs=monthJobs(month).filter(j=>j.data.status!=='Cancelled');font(14,400);ctx.fillStyle='#64748b';ctx.fillText(`${jobs.length} Port Calls`,x+16,y+44);jobs.forEach((j,i)=>drawJob(j,x+14,y+72+i*jobBoxHeight,cellW-28));});
    }
    font(13,400);ctx.fillStyle='#64748b';ctx.fillText('Generated from the HarborFlow calendar view. Verify operational details before use.',pad,height-34);
    return canvas;
  }
  const canvasBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Unable to create download file')),type,quality));
  function saveBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  async function canvasPdfBlob(canvas){
    const jpeg=new Uint8Array(await (await canvasBlob(canvas,'image/jpeg',.93)).arrayBuffer()),encoder=new TextEncoder(),pageW=Math.round(canvas.width/2),pageH=Math.round(canvas.height/2);
    const ascii=value=>encoder.encode(value),content=ascii(`q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`);
    const objects=[null,ascii('<< /Type /Catalog /Pages 2 0 R >>'),ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),[ascii(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,ascii('\nendstream')],[ascii(`<< /Length ${content.length} >>\nstream\n`),content,ascii('\nendstream')]];
    const chunks=[ascii('%PDF-1.4\n%HFLOW\n')],offsets=[0];let length=chunks[0].length;
    for(let i=1;i<objects.length;i++){offsets[i]=length;const parts=Array.isArray(objects[i])?objects[i]:[objects[i]],head=ascii(`${i} 0 obj\n`),tail=ascii('\nendobj\n');chunks.push(head,...parts,tail);length+=head.length+parts.reduce((sum,part)=>sum+part.length,0)+tail.length;}
    const xref=length,xrefText=`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([...chunks,ascii(xrefText)],{type:'application/pdf'});
  }
  async function downloadCalendarReport(format){
    const button=document.querySelector(`[data-download="${format}"]`);if(button)button.disabled=true;
    try{const canvas=reportCanvas(),slug=period()[2].replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase(),name=`harborflow-calendar-${slug}`;if(format==='png')saveBlob(await canvasBlob(canvas,'image/png'),name+'.png');else saveBlob(await canvasPdfBlob(canvas),name+'.pdf');}
    catch(error){announce(error.message||'Unable to download Calendar report.');}
    finally{if(button)button.disabled=false;}
  }
  function renderHome() {
    if (root.classList.contains('active')) document.getElementById('title').textContent='Operations · Trial';
    createButton.textContent='+ Create Port Call'; createButton.hidden=!isOwner() || !root.classList.contains('active');
    root.innerHTML=`<div class="hfo-shell">
      <div class="hfo-banner">ระบบทดลองซิงค์ข้ามเครื่อง · ใช้ข้อมูลสมมติเท่านั้น ห้ามกรอกข้อมูลลูกเรือหรือผู้เยี่ยมจริง${state.public?' · ผู้ชมทั่วไปเห็นเฉพาะข้อมูลสรุป':''}</div>
      <div id="hfoNotice" class="hfo-alert" ${state.error?'':'hidden'}>${escape(state.error)}</div>
      ${!state.grant && !state.public ? `<div class="hfo-card"><h2>Operations unavailable</h2><p>${escape(state.error||'Unable to load Operations data right now.')}</p></div>` :
      `${(()=>{const [label,value,indicator,trend]=metrics();return `<div class="hfo-overview-grid"><div class="hfo-card hfo-stat"><span>${escape(label)}</span><strong>${escape(value)}</strong><small class="hfo-trend ${trend}">${escape(indicator)}</small><small class="hfo-muted">By ETA · excludes Cancelled</small></div>${monthlyCharts()}</div>`;})()}
       ${state.public?'<div class="hfo-info">ดู Job และ Service แบบสรุปได้โดยไม่ต้องลงชื่อเข้าใช้ · <a href="/api/auth?mode=start">ลงชื่อเข้าใช้เพื่อดูรายละเอียดและแก้ไขตามสิทธิ์</a></div>':''}
       <div class="hfo-card hfo-calendar-card"><div class="hfo-toolbar"><h2>Husbandry Call Calendar</h2><div class="hfo-row"><div class="hfo-download"><button class="hfo-btn" data-download-toggle aria-haspopup="true" aria-expanded="false">Download ▾</button><div class="hfo-download-menu" data-download-menu hidden><button type="button" data-download="png">Image (PNG)</button><button type="button" data-download="pdf">PDF</button></div></div><button class="hfo-btn" data-shift="-1" aria-label="Previous period">‹</button><b>${escape(period()[2])}</b><button class="hfo-btn" data-shift="1" aria-label="Next period">›</button><select id="hfoView" aria-label="Calendar view">${option(['week','month','quarter','year'],state.view)}</select></div></div><p class="hfo-muted">Jobs appear on their ETA date · port local time</p>${calendar()}</div>
       <details class="hfo-card hfo-calls"><summary><span>All Husbandry Calls</span><span class="hfo-muted">${state.jobs.length} calls · ${escape(state.sync)}</span></summary><div class="hfo-list">${state.jobs.length ? state.jobs.map(j=>`<div class="hfo-list-row"><button data-open-job="${j.id}"><b>${escape(j.data.vessel||'Port Call')}</b><small>${state.public?'':escape((j.data.jobNo||'No Job No.')+' · ')}${escape(j.data.port||'No port')} · ETA ${formatDate(j.data.eta)}${state.public?'':' – ETD '+formatDate(j.data.etd)}</small></button><span>${escape(jobStatus(j.data.status))}</span></div>`).join(''):'<div class="hfo-empty">ยังไม่มี Port Call ในฐานข้อมูลทดลอง</div>'}</div></details>
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
    <div class="hfo-section"><h2>${escape(j.data.vessel||'Port Call')}</h2><p>${escape(j.data.port||'—')} · ${escape(jobStatus(j.data.status))}</p><p>ETA: ${formatDate(j.data.eta)}</p></div>
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
    return `<div class="hfo-form-grid hfo-job-form-grid">
      ${f('Job No.',data.jobNo,'jobNo','text',`${disable} ${attr} ${create?'required':''}`)}
      ${f('Vessel',data.vessel,'vessel','text',`${disable} ${attr} ${create?'required':''}`)}
      ${f('IMO',data.imo,'imo','text',`${disable} ${attr}`)}
      <div class="hfo-field"><span>Find IMO from vessel name</span><button type="button" class="hfo-btn" data-lookup-imo ${disable}>Search IMO</button><small class="hfo-muted" data-imo-feedback></small><div class="hfo-imo-results" data-imo-results></div></div>
      ${portSelect(data.port,`${disable} ${attr}`)}
      ${f('Principal',data.principal,'principal','text',`${disable} ${attr}`)}
      ${jobDateTimeField('ETA',data.eta,'eta',disable,attr,create)}
      ${jobDateTimeField('ETD',data.etd,'etd',disable,attr,false)}
      ${sel('Status',jobStatus(data.status),'status',JOB_STATUSES,`${disable} ${attr}`)}
      ${f('Job PIC (GitHub login)',data.pic,'pic','text',`${isOwner()?'': 'disabled'} ${attr}`)}
      ${sel('Vessel type',data.vesselType||'','vesselType',['',...VESSEL_TYPES],`${disable} ${attr}`)}
      ${area('Notes',data.notes,'notes',`${disable} ${attr}`)}
    </div>`;
  }
  const clockOptions=(length,current)=>Array.from({length},(_,index)=>String(index).padStart(2,'0')).map(item=>`<option value="${item}" ${item===current?'selected':''}>${item}</option>`).join('');
  function jobDateTimeField(label,value,name,disable,attr,required=false) {
    const raw=String(value||'');
    const [date='',timePart='']=raw.split('T');
    const time=(timePart.match(/^(\d{2}:\d{2})/)||[])[1]||'';
    const [hour='',minute='']=time.split(':');
    return `<label class="hfo-field hfo-job-datetime"><span>${escape(label)}</span><span class="hfo-datetime-24">
      <input type="date" data-job-date="${name}" value="${escape(date)}" ${disable} ${required?'required':''} aria-label="${label} date">
      <span class="hfo-time-entry"><input type="text" data-job-time="${name}" value="${escape(time)}" placeholder="HH:MM" inputmode="numeric" maxlength="5" pattern="(?:[01]\\d|2[0-3]):[0-5]\\d" ${disable} ${required?'required':''} aria-label="${label} time (24 hours)">${editableClock(disable)?`<button type="button" data-open-time-picker="${name}" aria-label="Choose ${label} time in 24 hour format">◷</button><span class="hfo-time-picker" data-time-picker-panel="${name}" hidden><select data-time-hour="${name}" aria-label="Hour, 00 to 23">${clockOptions(24,hour||'00')}</select><b>:</b><select data-time-minute="${name}" aria-label="Minute, 00 to 59">${clockOptions(60,minute||'00')}</select></span>`:''}</span>
      </span><input type="hidden" name="${name}" value="${escape(raw)}" ${attr}></label>`;
  }
  function editableClock(disable) { return !String(disable||'').includes('disabled'); }
  function syncJobDateTime(target) {
    const wrap=target.closest('.hfo-job-datetime');
    const name=target.dataset.jobDate||target.dataset.jobTime;
    const date=wrap?.querySelector(`[data-job-date="${name}"]`);
    const time=wrap?.querySelector(`[data-job-time="${name}"]`);
    const hidden=wrap?.querySelector(`input[type="hidden"][name="${name}"]`);
    if(!date||!time||!hidden)return null;
    time.setCustomValidity('');
    if(!date.value&&!time.value){hidden.value='';return hidden;}
    if(!date.value||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time.value)){
      time.setCustomValidity('Enter time as HH:mm in 24-hour format.');
      time.reportValidity();
      return null;
    }
    hidden.value=`${date.value}T${time.value}`;
    return hidden;
  }
  function renderCreate() {
    overlay(`<div class="hfo-banner">Create an Open Port Call with Vessel, Job No., Port and ETA. Principal and Job PIC can be completed later.</div>
      <form id="hfoCreateJob" class="hfo-section"><h2>New Port Call</h2>${jobFields({status:'Open'},true,true)}
      <div class="hfo-actions" style="margin-top:16px"><button class="hfo-btn primary">Create Port Call</button></div></form>`, 'Create Port Call', 'Trial data only');
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
    <div class="hfo-section"><div class="hfo-toolbar"><div><h2>${escape(j.data.vessel||'Port Call')}</h2><span class="hfo-muted">${escape(j.data.jobNo||'No Job No.')} · ${escape(j.data.port||'No port')} · ${escape(jobStatus(j.data.status))}</span></div><span class="hfo-muted" id="hfoSync">${escape(state.sync)}</span></div>
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
  const fields=[['nationality','Nationality'],['rank','Rank'],['dob','Date of Birth','date'],['seamanBook','Seaman book'],['passport','Passport'],['passportExpiry','PP. EXP','date']].filter(([key])=>kind==='crew'||key!=='seamanBook');
  const nameCell=`<input data-person-field="name" data-person-id="${p.id}" aria-label="Name – Surname" value="${escape(p.data.name||'')}" ${edit?'':'disabled'}><button type="button" class="hfo-name-link" data-edit-person="${p.id}" aria-expanded="${expanded}">${kind==='crew'?'Immigration & flight details':'Flight details'} <span aria-hidden="true">${expanded?'▴':'▾'}</span></button>`;
  return `<tr class="hfo-person-row"><td data-label="No.">${i+1}</td><td data-label="Name – Surname">${nameCell}</td>${fields.map(([key,label,type])=>`<td data-label="${label}">${crewTableInput(p,key,label,type||'text',edit)}</td>`).join('')}
    <td data-label="Actions">${edit?`<button type="button" class="hfo-btn danger" data-remove-person="${p.id}" aria-label="Remove ${escape(p.data.name)}">×</button>`:''}</td></tr>
    ${expanded?`<tr class="hfo-person-details-row"><td colspan="${kind==='crew'?9:8}">${personForm()}</td></tr>`:''}`;
}
  function newPersonRow(category, kind) {
  const draft=state.personDraft;
  if (!draft?.newRow || (!FLAT_VISITORS[service()?.data.type] && draft.data.category!==category)) return '';
  const input=(field,label,type='text')=>`<input data-new-person-field="${field}" aria-label="${label}" type="${type}" placeholder="${label}" value="${escape(draft.data[field]||'')}" ${field==='nationality'?'list="hfoNationalities" autocomplete="off"':''}>`;
  return `<tr class="hfo-person-row hfo-new-person"><td data-label="No.">New</td>
    <td data-label="Name – Surname">${input('name','Name – Surname')}</td>
    <td data-label="Nationality">${input('nationality','Nationality')}</td>
    <td data-label="Rank">${input('rank','Rank')}</td>
    <td data-label="Date of Birth">${input('dob','Date of Birth','date')}</td>
    ${kind==='crew'?`<td data-label="Seaman book">${input('seamanBook','Seaman book')}</td>`:''}
    <td data-label="Passport">${input('passport','Passport')}</td>
    <td data-label="PP. EXP">${input('passportExpiry','PP. EXP','date')}</td>
    <td data-label="Actions"><small data-person-save-status role="status">Enter a name to save automatically</small></td></tr>`;
}
  function rosterHtml(s) {
    const crew=s.data.type==='Crew Change',kind=crew?'crew':'visitor',title=crew?'Crew members':(FLAT_VISITORS[s.data.type]||'Visitors');
    if(!canPeople(kind))return '<div class="hfo-section hfo-alert">Separate person view permission required.</div>';
    const list=state.people.filter(p=>p.kind===kind&&p.data.serviceIds?.includes(s.id));
    const table=(people,category)=>`<div class="hfo-table-wrap"><table class="hfo-table hfo-roster-table"><thead><tr><th>No.</th><th>Name – Surname</th><th>Nationality</th><th>Rank</th><th>Date of Birth</th>${crew?'<th>Seaman book</th>':''}<th>Passport</th><th>PP. EXP</th><th></th></tr></thead>
      <tbody>${people.map((p,i)=>personRow(p,i,kind)).join('')}${newPersonRow(category,kind)}</tbody>
      ${canEditPeople(kind)?`<tfoot><tr><td colspan="${crew?9:8}"><button type="button" class="hfo-btn" data-add-person="${kind}" data-person-category="${escape(category)}">+ Add ${escape(FLAT_VISITORS[s.data.type]||category)}</button></td></tr></tfoot>`:''}</table></div>`;
    const flat=FLAT_VISITORS[s.data.type];
    const category=s.data.type==='SIRE Inspector'?'SIRE Inspectors':s.data.type==='Surveyor'?'Surveyors':'Other';
    return `<div class="hfo-section"><div class="hfo-toolbar"><h3>${escape(title)}</h3><small class="hfo-muted">${list.length} people · ${crew?'Immigration & flight details':'Flight details'}</small></div>
      ${crew||flat?documentBatchHtml(canEditPeople(kind)&&state.peopleLoadedFor===s.job_id,kind,crew?'Crew':title):''}
      ${flat?table(list,category):(crew?CATEGORIES.slice(0,2):CATEGORIES.slice(2)).map(cat=>`<details class="hfo-group" open><summary>${escape(cat)} (${list.filter(p=>p.data.category===cat).length})</summary>${table(list.filter(p=>p.data.category===cat),cat)}</details>`).join('')}</div>`;
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
  const DOCUMENT_TYPES=[
    ['passport','Passport','Passport no., name, nationality, date of birth and expiry'],
    ['seamanBook','Seaman book','Book no., name and expiry'],
    ['flightTicket','Flight ticket','Airline, flight, date, route, time and PNR']
  ];
  function documentCheckHtml(check) {
    if(!check)return '<small class="hfo-doc-empty">No document checked yet</small>';
    const label=check.status==='ok'?'Checked — no warning':'Needs review';
    const messages=Array.isArray(check.messages)?check.messages:[];
    const changes=Array.isArray(check.changes)?check.changes:[];
    return `<div class="hfo-doc-result ${check.status==='ok'?'ok':'warning'}">
      <b>${escape(label)}</b><small>${escape(check.fileName||'Document')} · confidence ${escape(check.confidence??'—')}%</small>
      ${changes.length?`<small>Filled: ${escape(changes.join(', '))}</small>`:''}
      ${messages.length?`<ul>${messages.map(message=>`<li>${escape(message)}</li>`).join('')}</ul>`:''}
    </div>`;
  }
  function documentBatchHtml(editable,kind='crew',title='Crew') {
    const batch=state.documentBatch||{busy:false,category:'On-signers',completed:0,total:0,results:[]};
    const results=batch.results||[];
    const crew=kind==='crew',types=crew?DOCUMENT_TYPES:DOCUMENT_TYPES.filter(([type])=>type!=='seamanBook');
    return `<section class="hfo-doc-import hfo-doc-batch" aria-labelledby="hfoDocImportTitle">
      <div class="hfo-toolbar"><div><h4 id="hfoDocImportTitle">Read ${escape(title)} documents</h4><p class="hfo-muted">Upload several files at once. HarborFlow matches names in this service, fills blank fields only, and adds a new row when no matching name exists.</p></div>
      ${editable&&crew?sel('New crew group',batch.category||'On-signers','documentBatchCategory',CATEGORIES.slice(0,2),batch.busy?'disabled':''):''}</div>
      <div class="hfo-doc-privacy" role="note">🔒 Original files and full text stay on this device. PDF, JPG, PNG, WebP or BMP · up to 20 files per batch · 30 MB per file.</div>
      <div class="hfo-doc-grid">${types.map(([type,label,description])=>`<article class="hfo-doc-card">
        <div><b>${escape(label)}</b><small>${escape(description)}</small></div>
        <div class="hfo-doc-drop" data-doc-drop="${type}">
          ${editable?`<input type="file" data-doc-file="${type}" accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,application/pdf,image/*" multiple hidden ${batch.busy?'disabled':''}><button type="button" class="hfo-btn" data-doc-choose="${type}" ${batch.busy?'disabled':''}>Choose files</button><span>or drop multiple files</span>`:'<span>View only</span>'}
        </div><div data-doc-progress="${type}" role="status"></div>
      </article>`).join('')}</div>
      ${batch.total?`<div class="hfo-doc-batch-progress" role="status"><b>${batch.busy?'Reading documents':'Batch complete'}</b><span>${batch.completed} / ${batch.total}</span></div>`:''}
      ${results.length?`<div class="hfo-doc-batch-results">${results.map((item,index)=>`<div class="hfo-doc-batch-result ${item.error?'error':item.warnings?.length||item.needsTitle?'warning':'ok'}"><b>${escape(item.fileName)}</b><span>${escape(item.name||'Name not found')} · ${escape(item.outcome||'Needs review')}</span>${item.changes?.length?`<small>Filled: ${escape(item.changes.join(', '))}</small>`:''}${item.error?`<small>${escape(item.error)}</small>`:''}${item.needsTitle?`<div class="hfo-doc-title-choice"><span>เลือกคำนำหน้าตาม Passport:</span><button type="button" class="hfo-btn" data-doc-title="MR." data-doc-result="${index}">MR.</button><button type="button" class="hfo-btn" data-doc-title="MS." data-doc-result="${index}">MS.</button></div>`:''}${item.warnings?.length?`<ul>${item.warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul>`:''}</div>`).join('')}</div>`:''}
      <p class="hfo-doc-rule">Passport must remain valid for more than 6 months. Review every extracted value against the original before operational use.</p>
    </section>`;
  }
  function personForm() {
  const draft=state.personDraft,p=draft.data,edit=canEditPeople(draft.kind),flights=Array.isArray(p.flights)?p.flights:[],displayFlights=flights.length?flights:edit?[{}]:[];
  const codes=['VISA','VISA-C','VOA','BG','OKTB','EX'];
  const current=p.immigration?.codes||{};
  const checked=code=>Boolean(current[code]||code==='VISA'&&p.immigration?.visa||code==='OKTB'&&p.immigration?.oktb);

  const dis=edit?'':'disabled';
  return `<form id="hfoPersonForm" class="hfo-person-expanded"><div class="hfo-toolbar"><h4>${draft.kind==='crew'?'Immigration & flight details':'Flight details'} · ${escape(p.name)}</h4><button type="button" class="hfo-btn" data-close-person>Close</button></div>
    ${draft.kind==='crew'?`<div class="hfo-immigration-row">
      ${FLAT_VISITORS[service()?.data.type]?'':sel(draft.kind==='crew'?'Change role':'Visitor role',p.category,'category',draft.kind==='crew'?CATEGORIES.slice(0,2):CATEGORIES.slice(2),dis)}
      <fieldset class="hfo-immigration-compact"><legend>Immigration</legend><div class="hfo-immigration-codes">${codes.map(code=>`<label><input type="checkbox" name="immigration-${code}" ${checked(code)?'checked':''} ${dis}><span>${code}</span></label>`).join('')}</div></fieldset>
        ${sel('Status',p.immigration?.status||'Not started','immigrationStatus',['Not started','Documents pending','Submitted','Approved','Rejected'],dis)}
        <label class="hfo-field hfo-immigration-notes"><span>Notes</span><textarea name="immigrationNotes" rows="1" ${dis}>${escape(p.immigration?.notes||'')}</textarea></label>
    </div>`:''}
    <div class="hfo-toolbar"><h4>Flights · ${flights.length}</h4>${edit?'<button type="button" class="hfo-btn" data-add-flight>+ Add flight</button>':''}</div>
    <div class="hfo-table-wrap"><table class="hfo-table hfo-flight-table"><thead><tr><th>#</th><th>Airline</th><th>Flight No.</th><th>Date (DDMMM)</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>PNR</th><th></th></tr></thead><tbody>
    ${displayFlights.map((fl,i)=>`<tr><td data-label="#">${i+1}</td>
      ${[['airline','Airline'],['number','Flight No.'],['date','Date (DDMMM)'],['from','From'],['to','To'],['departure','Departure'],['arrival','Arrival'],['booking','PNR']].map(([key,label])=>flightCell(fl,i,key,label,edit)).join('')}
      <td data-label="Remove">${edit&&flights.length?`<button type="button" class="hfo-btn danger" data-remove-flight="${i}" aria-label="Remove flight ${i+1}">×</button>`:''}</td></tr>`).join('')}
    </tbody></table></div>${edit?'<small data-person-save-status role="status" class="hfo-muted">Changes save automatically</small>':''}</form>`;
}
  let tripMap=null,tripMarkers={},tripRouteLayer=null,tripPinTarget='origin',leafletPromise=null,placeSearchTimer=null;
  const validCoordinate=value=>value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value));
  const tripPersonName=id=>state.people.find(person=>person.id===id)?.data.name||'';
  function tripLoadText(data) {
    const names=(data.personIds||[]).map(tripPersonName).filter(Boolean);
    const cargoItems=Array.isArray(data.cargoItems)?data.cargoItems.filter(Boolean):String(data.cargo||'').trim()?[String(data.cargo).trim()]:[];
    const parts=[];
    if(names.length)parts.push(names.join(', '));
    if(cargoItems.length)parts.push('Cargo: '+cargoItems.join(', '));
    return parts.join(' · ')||'—';
  }
  function placeParts(data,target) {
    if(data[target+'Name']||data[target+'Address'])return {name:data[target+'Name']||data[target]||'—',address:data[target+'Address']||''};
    const parts=String(data[target]||'').split(',').map(value=>value.trim()).filter(Boolean);
    return {name:parts.shift()||'—',address:parts.join(', ')};
  }
  function routePlaces(data) {
    const origin=placeParts(data,'origin'),destination=placeParts(data,'destination');
    const place=value=>`<span class="hfo-route-place"><b>${escape(value.name)}</b>${value.address?`<small>${escape(value.address)}</small>`:''}</span>`;
    return `<div class="hfo-route-places">${place(origin)}<i aria-hidden="true">→</i>${place(destination)}</div>`;
  }
  function routeText(data) {
    const distance=Number(data.routeDistanceMeters),duration=Number(data.routeDurationSeconds);
    if(!distance&&!duration)return 'Pin both places to calculate driving distance and estimated time.';
    const km=distance?`${(distance/1000).toFixed(distance>=10000?0:1)} km`:'';
    const minutes=duration?Math.round(duration/60):0;
    const time=minutes>=60?`${Math.floor(minutes/60)} hr ${minutes%60} min`:`${minutes} min`;
    return [km,time].filter(Boolean).join(' · ');
  }
  function formatTravelDateTime(value) {
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)/);
    if(!match)return '—';
    const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${match[3]}-${months[Number(match[2])-1]}-${match[1].slice(2)} ${match[4]}:${match[5]}`;
  }
  function plannedDateTime(label,value,name,editable) {
    const [date='',time='']=String(value||'').split('T');
    const [hour='',minute='']=time.slice(0,5).split(':');
    return `<label class="hfo-field hfo-trip-datetime"><span>${escape(label)} · 24 hr</span><div><input type="date" data-trip-date="${name}" value="${escape(date)}" ${editable?'':'disabled'}><span class="hfo-time-entry"><input type="text" inputmode="numeric" maxlength="5" pattern="(?:[01]\\d|2[0-3]):[0-5]\\d" placeholder="HH:MM" aria-label="${escape(label)} time in 24 hour format" data-trip-time="${name}" value="${escape(time.slice(0,5))}" ${editable?'':'disabled'}>${editable?`<button type="button" data-open-time-picker="${name}" aria-label="Choose ${escape(label)} time in 24 hour format">◷</button><span class="hfo-time-picker" data-time-picker-panel="${name}" hidden><select data-time-hour="${name}" aria-label="Hour, 00 to 23">${clockOptions(24,hour||'00')}</select><b>:</b><select data-time-minute="${name}" aria-label="Minute, 00 to 59">${clockOptions(60,minute||'00')}</select></span>`:''}</span></div><input type="hidden" name="${name}" value="${escape(value||'')}"></label>`;
  }
  function placeField(label,target,value,editable) {
    return `<div class="hfo-place-field"><label class="hfo-field"><span>${label}</span><input name="${target}" data-place-field="${target}" value="${escape(value||'')}" placeholder="Search a place or pin it on the map" autocomplete="off" ${editable?'':'disabled'}></label>${editable?`<div class="hfo-place-actions"><button type="button" class="hfo-btn" data-place-search="${target}">Search</button><button type="button" class="hfo-btn" data-pin-target="${target}">Pin ${label}</button></div><div class="hfo-place-results" data-place-results="${target}" hidden></div>`:''}</div>`;
  }
  function tripsHtml(s) {
    if (!state.grant?.crewView || !state.grant?.visitorView) return '<div class="hfo-section hfo-alert">Travel with linked passengers requires both separate Crew and Visitor view grants.</div>';
    const list=state.trips.filter(t=>t.service_id===s.id), edit=mayEditService(s)&&state.grant.crewEdit&&state.grant.visitorEdit;
    return `<div class="hfo-section"><div class="hfo-toolbar"><h3>Car and Boat Travel</h3>${edit?'<button class="hfo-btn" data-add-trip>+ Add trip</button>':''}</div>
      ${['car','boat'].map(kind=>`<h4>${kind==='car'?'Cars':'Boats'}</h4><div class="hfo-table-wrap"><table class="hfo-table hfo-travel-table"><thead><tr><th>#</th><th>Origin → destination</th><th>Planned departure<small>DD-MMM-YY · 24 hr</small></th><th>Planned arrival<small>DD-MMM-YY · 24 hr</small></th><th>Distance / time</th><th>Provider</th><th>Vehicle / boat</th><th>Passengers / cargo</th><th>Status</th><th></th></tr></thead><tbody>
       ${list.filter(t=>t.data.kind===kind).map((t,i)=>`<tr><td>${i+1}</td><td>${routePlaces(t.data)}</td><td class="hfo-travel-datetime">${escape(formatTravelDateTime(t.data.plannedDeparture))}</td><td class="hfo-travel-datetime">${escape(formatTravelDateTime(t.data.plannedArrival))}</td><td>${escape(routeText(t.data))}</td><td>${escape(t.data.provider)}</td><td>${escape(t.data.vehicle)}</td><td>${escape(tripLoadText(t.data))}</td><td>${escape(t.data.status||'Planned')}</td><td><button class="hfo-btn" data-edit-trip="${t.id}">Open</button> ${edit?`<button class="hfo-btn danger" data-remove-trip="${t.id}">×</button>`:''}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      ${state.tripDraft?tripForm():''}</div>`;
  }
  function tripForm() {
    const t=state.tripDraft, d=t.data, edit=mayEditService(service())&&state.grant.crewEdit&&state.grant.visitorEdit;
    const cargoItems=Array.isArray(d.cargoItems)?d.cargoItems:(d.cargo?[d.cargo]:edit?['']:[]);
    return `<form id="hfoTripForm" class="hfo-section hfo-nested"><div class="hfo-toolbar"><h3>${t.id?'Edit':'Add'} trip</h3><button type="button" class="hfo-btn" data-close-trip>Close</button></div>
      <div class="hfo-form-grid">${sel('Type',d.kind||'car','kind',['car','boat'],edit?'':'disabled')}
      ${placeField('Origin','origin',d.origin,edit)}${placeField('Destination','destination',d.destination,edit)}
      ${plannedDateTime('Planned departure',d.plannedDeparture,'plannedDeparture',edit)}
      ${plannedDateTime('Planned arrival',d.plannedArrival,'plannedArrival',edit)}
      ${f('Provider',d.provider,'provider','text',edit?'':'disabled')}${f('Vehicle / boat',d.vehicle,'vehicle','text',edit?'':'disabled')}
      ${f('Purpose',d.purpose,'purpose','text',edit?'':'disabled')}${f('Status',d.status,'status','text',edit?'':'disabled')}
      ${area('Notes',d.notes,'notes',edit?'':'disabled')}</div>
      ${['originLat','originLon','destinationLat','destinationLon','routeDistanceMeters','routeDurationSeconds'].map(name=>`<input type="hidden" name="${name}" value="${escape(d[name]??'')}">`).join('')}
      <div class="hfo-route-summary"><b>Route</b><output id="hfoRouteSummary">${escape(routeText(d))}</output></div>
      <div class="hfo-trip-map-tools"><button type="button" class="hfo-btn active" data-pin-target="origin">Pin Origin</button><button type="button" class="hfo-btn" data-pin-target="destination">Pin Destination</button><span>Choose a pin button, then tap the map.</span></div>
      <div id="hfoTripMap" class="hfo-trip-map" aria-label="Travel route map"></div><small class="hfo-map-attribution">Place suggestions via Photon · map © OpenStreetMap contributors · route estimate via OSRM; verify before dispatch.</small>
      <fieldset class="hfo-multi-picker"><legend>Passengers · select multiple</legend>${state.people.length?state.people.map(p=>`<label><input type="checkbox" name="personIds" value="${p.id}" ${(d.personIds||[]).includes(p.id)?'checked':''} ${edit?'':'disabled'}><span><b>${escape(p.data.name)}</b><small>${escape(p.data.category||p.kind)}</small></span></label>`).join(''):'<small>No Crew/Visitor records available.</small>'}</fieldset>
      <fieldset class="hfo-cargo-picker"><legend>Cargo · add multiple items</legend><div data-cargo-items>${cargoItems.map((item,index)=>`<div class="hfo-cargo-row"><input name="cargoItems" value="${escape(item)}" placeholder="Cargo / quantity / reference" ${edit?'':'disabled'}>${edit?`<button type="button" class="hfo-btn danger" data-remove-cargo-item="${index}" aria-label="Remove cargo item ${index+1}">×</button>`:''}</div>`).join('')}</div>${edit?'<button type="button" class="hfo-btn" data-add-cargo-item>+ Add cargo</button>':''}</fieldset>
      <div class="hfo-selected-load"><b>Passengers / cargo</b><output id="hfoPassengerCargoSummary">${escape(tripLoadText(d))}</output></div>
      ${edit?'<button class="hfo-btn primary">Save trip</button>':''}</form>`;
  }
  async function mapApi(action,params={}) {
    const response=await fetch('/api/maps?'+new URLSearchParams({action,...params}),{credentials:'same-origin'});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(body.error||'Map request failed');
    return body;
  }
  function tripFormValue(name,value) {
    const input=document.querySelector(`#hfoTripForm [name="${name}"]`);
    if(input)input.value=value??'';
    if(state.tripDraft)state.tripDraft.data[name]=value??'';
  }
  function updatePinButtons() {
    document.querySelectorAll('[data-pin-target]').forEach(button=>button.classList.toggle('active',button.dataset.pinTarget===tripPinTarget));
  }
  function updateTripLoadSummary() {
    const form=document.getElementById('hfoTripForm'),output=document.getElementById('hfoPassengerCargoSummary');
    if(!form||!output)return;
    const data=new FormData(form);
    output.textContent=tripLoadText({personIds:data.getAll('personIds').map(String),cargoItems:data.getAll('cargoItems').map(String).filter(value=>value.trim())});
  }
  function captureTripDraft() {
    const form=document.getElementById('hfoTripForm'),draft=state.tripDraft;if(!form||!draft)return;
    const data=new FormData(form);
    for(const name of ['kind','origin','destination','originLat','originLon','destinationLat','destinationLon','plannedDeparture','plannedArrival','routeDistanceMeters','routeDurationSeconds','provider','vehicle','purpose','status','notes'])draft.data[name]=String(data.get(name)||'');
    draft.data.personIds=data.getAll('personIds').map(String);
    draft.data.cargoItems=data.getAll('cargoItems').map(String).filter(value=>value.trim());
    draft.data.cargo=draft.data.cargoItems.join(', ');
  }
  function drawTripMarkers() {
    if(!tripMap||!state.tripDraft)return;
    const data=state.tripDraft.data;
    for(const target of ['origin','destination']){
      if(!validCoordinate(data[target+'Lat'])||!validCoordinate(data[target+'Lon']))continue;
      const lat=Number(data[target+'Lat']),lon=Number(data[target+'Lon']);
      if(tripMarkers[target])tripMarkers[target].setLatLng([lat,lon]);
      else tripMarkers[target]=window.L.marker([lat,lon],{draggable:true}).addTo(tripMap).bindTooltip(target==='origin'?'Origin':'Destination');
      tripMarkers[target].off('dragend').on('dragend',event=>void setTripPlace(target,{lat:event.target.getLatLng().lat,lon:event.target.getLatLng().lng},true));
    }
    const pins=Object.values(tripMarkers);
    if(pins.length===2)tripMap.fitBounds(window.L.featureGroup(pins).getBounds().pad(.25),{maxZoom:14});
    else if(pins.length===1)tripMap.setView(pins[0].getLatLng(),14);
  }
  async function calculateTripRoute() {
    const data=state.tripDraft?.data;if(!data)return;
    const keys=['originLat','originLon','destinationLat','destinationLon'];
    if(keys.some(key=>!validCoordinate(data[key]))){const output=document.getElementById('hfoRouteSummary');if(output)output.textContent=routeText({});return;}
    const values=keys.map(key=>Number(data[key]));
    const output=document.getElementById('hfoRouteSummary');if(output)output.textContent='Calculating route…';
    try{
      const body=await mapApi('route',Object.fromEntries(['originLat','originLon','destinationLat','destinationLon'].map((key,index)=>[key,values[index]])));
      tripFormValue('routeDistanceMeters',body.route.distanceMeters);tripFormValue('routeDurationSeconds',body.route.durationSeconds);
      if(output)output.textContent=routeText(state.tripDraft.data);
      if(tripRouteLayer){tripRouteLayer.remove();tripRouteLayer=null;}
      if(tripMap&&body.route.geometry){tripRouteLayer=window.L.geoJSON(body.route.geometry,{style:{color:'#107a72',weight:5,opacity:.8}}).addTo(tripMap);tripMap.fitBounds(tripRouteLayer.getBounds().pad(.18),{maxZoom:14});}
    }catch(error){if(output)output.textContent=error.message;}
  }
  async function setTripPlace(target,place,reverse=false) {
    if(!state.tripDraft)return;
    tripFormValue(target+'Lat',Number(place.lat));tripFormValue(target+'Lon',Number(place.lon));
    let label=place.label||'',name=place.name||'',address=place.address||'';
    if(reverse){try{label=(await mapApi('reverse',{lat:place.lat,lon:place.lon})).result.label;}catch{label=`${Number(place.lat).toFixed(5)}, ${Number(place.lon).toFixed(5)}`;}}
    if(!name){const parts=label.split(',').map(value=>value.trim()).filter(Boolean);name=parts.shift()||label;address=parts.join(', ');}
    state.tripDraft.data[target]=label;
    state.tripDraft.data[target+'Name']=name;state.tripDraft.data[target+'Address']=address;
    const input=document.querySelector(`[data-place-field="${target}"]`);if(input)input.value=label;
    drawTripMarkers();await calculateTripRoute();
  }
  async function searchTripPlace(target) {
    const input=document.querySelector(`[data-place-field="${target}"]`),results=document.querySelector(`[data-place-results="${target}"]`);
    if(!input||!results)return;
    results.hidden=false;results.innerHTML='<div class="hfo-place-message">Searching…</div>';
    try{
      const body=await mapApi('search',{q:input.value});
      results.innerHTML=body.results.length?body.results.map((place,index)=>`<button type="button" data-place-choice="${target}" data-place-index="${index}"><b>${escape(place.name||place.label.split(',')[0])}</b><span>${escape(place.address||place.label)}</span></button>`).join(''):'<div class="hfo-place-message">No places found.</div>';
      results._places=body.results;
    }catch(error){results.innerHTML=`<div class="hfo-place-message">${escape(error.message)}</div>`;}
  }
  function scheduleTripPlaceSearch(target) {
    clearTimeout(placeSearchTimer);
    const input=document.querySelector(`[data-place-field="${target}"]`),results=document.querySelector(`[data-place-results="${target}"]`);
    if(!input||!results||input.value.trim().length<3){if(results)results.hidden=true;return;}
    results.hidden=false;results.innerHTML='<div class="hfo-place-message">Type to search…</div>';
    placeSearchTimer=setTimeout(()=>void searchTripPlace(target),450);
  }
  function loadLeaflet() {
    if(window.L)return Promise.resolve(window.L);
    if(leafletPromise)return leafletPromise;
    leafletPromise=new Promise((resolve,reject)=>{
      if(!document.querySelector('link[data-hfo-leaflet]')){const link=document.createElement('link');link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';link.crossOrigin='';link.dataset.hfoLeaflet='';document.head.appendChild(link);}
      const existing=document.querySelector('script[data-hfo-leaflet]');
      if(existing){existing.addEventListener('load',()=>resolve(window.L),{once:true});existing.addEventListener('error',()=>reject(Error('Map library unavailable')),{once:true});return;}
      const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.crossOrigin='';script.dataset.hfoLeaflet='';script.onload=()=>resolve(window.L);script.onerror=()=>reject(Error('Map library unavailable'));document.head.appendChild(script);
    });
    return leafletPromise;
  }
  async function mountTripMap() {
    const container=document.getElementById('hfoTripMap');if(!container||!state.tripDraft)return;
    try{await loadLeaflet();}catch{container.textContent='Map could not be loaded. Place search remains available.';return;}
    if(!container.isConnected||!state.tripDraft)return;
    if(tripMap){tripMap.remove();tripMap=null;}tripMarkers={};tripRouteLayer=null;
    tripMap=window.L.map(container,{zoomControl:true}).setView([13.2,100.9],7);
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(tripMap);
    tripMap.on('click',event=>void setTripPlace(tripPinTarget,{lat:event.latlng.lat,lon:event.latlng.lng},true));
    drawTripMarkers();
    if(validCoordinate(state.tripDraft.data.originLat)&&validCoordinate(state.tripDraft.data.destinationLat))void calculateTripRoute();
    setTimeout(()=>tripMap?.invalidateSize(),0);
  }
  function renderService() {
  const s=service(), j=job(); if (!s || !j) return;
  if(tripMap){tripMap.remove();tripMap=null;}tripMarkers={};tripRouteLayer=null;
  const isCrew=s.data.type==='Crew Change';
  const isVisitorService=Boolean(FLAT_VISITORS[s.data.type]);
  const isVisitor=['Visitor','SIRE Inspector','Surveyor','Medical Visit','Medical','Inspection/Technical Visit'].includes(s.data.type);
  const tabs=isCrew?['crew','oktb','permit','loi','hotel','travel','checklist','history']:isVisitorService?['visitors','hotel','travel','checklist','history']:isVisitor?['details','visitors','travel','checklist','history']:['details','travel','checklist','history'];
  if (!tabs.includes(state.tab)) state.tab=tabs[0];
  const label={details:'Service details',crew:'Crew members',oktb:'OKTB',permit:'Terminal Permit',loi:'LOI',visitors:FLAT_VISITORS[s.data.type]||'Visitors',hotel:'Hotel',travel:'Travel',checklist:'Checklist',history:'History'};
  const documentTab=['oktb','permit','loi'].includes(state.tab);
  overlay(`<div class="hfo-banner">Trial only · fictional/de-identified people. Terminal restrictions must be confirmed before execution.</div>
    <div class="hfo-toolbar"><div><h2>#${s.seq} · ${escape(s.data.type)}</h2><span class="hfo-muted">${escape(j.data.vessel||'Port Call')} · ${escape(j.data.jobNo||j.id)}</span></div><button class="hfo-btn" data-back-job>← Job</button></div>
    ${isCrew||isVisitorService?`<div class="hfo-service-status">${sel('Service status',s.data.status,'status',SERVICE_STATUSES,`${mayEditService(s)?'':'disabled'} data-service-field`)}</div>`:''}
    <div class="hfo-tabs">${tabs.map(t=>`<button class="${state.tab===t?'active':''}" data-tab="${t}">${label[t]}</button>`).join('')}</div>
    ${state.tab==='hotel'?'<div id="hfoHotel" class="hfo-section">Loading hotel bookings…</div>':documentTab?'<div class="hfo-section" id="hfoDocument"><p role="status">กำลังโหลดเอกสาร…</p></div>':state.tab==='details'?serviceDetails(s,mayEditService(s)):['crew','visitors'].includes(state.tab)?rosterHtml(s):state.tab==='travel'?tripsHtml(s):state.tab==='checklist'?checklistHtml(s):`<div class="hfo-section"><button class="hfo-btn" data-history="service" data-history-id="${s.id}">Load history</button>${historyHtml()}</div>`}`,
    '#'+s.seq+' · '+s.data.type,j.data.vessel||'Port Call');
  if(state.tab==='hotel')window.HarborFlowHotels?.mount(document.getElementById('hfoHotel'),{serviceId:s.id,api});
  if (documentTab) window.HarborFlowDocuments?.mount(document.getElementById('hfoDocument'),{jobId:j.id,serviceId:s.id,type:state.tab,login:state.login});
  if(state.tab==='travel'&&state.tripDraft)setTimeout(mountTripMap,0);
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
    if(draft.kind==='crew'&&d.has('immigrationStatus')){
      const codes=Object.fromEntries(['VISA','VISA-C','VOA','BG','OKTB','EX'].map(code=>[code,d.has('immigration-'+code)]));
      draft.data.immigration={...(draft.data.immigration||{}),status:String(d.get('immigrationStatus')||'Not started'),codes,notes:String(d.get('immigrationNotes')||'')};
      delete draft.data.immigration.visa;delete draft.data.immigration.oktb;
    }
    if(!Array.isArray(draft.data.flights))draft.data.flights=[];
    form.querySelectorAll('[data-flight]').forEach(input=>{
      const i=Number(input.dataset.flight),key=input.dataset.flightField;
      if(!draft.data.flights[i])draft.data.flights[i]={airline:'',number:'',date:'',from:'',to:'',departure:'',arrival:'',booking:''};
      draft.data.flights[i][key]=input.value.toUpperCase();
    });
    draft.data.flights=draft.data.flights.filter(flight=>Object.values(flight).some(value=>String(value||'').trim()));
  }
  function documentProgress(type,message,failed=false) {
    const output=document.querySelector(`[data-doc-progress="${type}"]`);
    if(output){output.textContent=message;output.classList.toggle('hfo-doc-error',failed);}
  }
  const normalizedCrewName=value=>String(value||'').toUpperCase().replace(/\b(?:MR|MRS|MS|MISS|CAPT|CAPTAIN)\b\.?/g,' ').replace(/[^A-Z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
  const crewNameTokens=value=>String(value||'').toUpperCase().replace(/\b(?:MR|MRS|MS|MISS|CAPT|CAPTAIN)\b\.?/g,' ').replace(/[^A-Z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  function matchesGivenSurname(documentName,crewName) {
    const documentTokens=crewNameTokens(documentName),crewTokens=crewNameTokens(crewName);if(documentTokens.length<2||crewTokens.length<2)return false;
    const surname=documentTokens.at(-1);if(crewTokens.at(-1)!==surname)return false;
    const given=documentTokens.slice(0,-1);return given.every((token,index)=>crewTokens[index]===token);
  }
  async function saveImportedPerson(person,nextData) {
    const data={...nextData,serviceIds:[...new Set([...(nextData.serviceIds||[]),service().id])]};
    const patch=Object.fromEntries(Object.entries(data).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(person.data[key])));
    if(!Object.keys(patch).length)return person;
    const base=Object.fromEntries(Object.keys(patch).map(key=>[key,person.data[key]]));
    const out=await api('updatePerson',{id:person.id,kind:person.kind,patch,base});
    Object.assign(person,out.record);
    if(state.personDraft?.id===person.id)state.personDraft.data=structuredClone(person.data);
    return person;
  }
  async function applyImportedResult(result,item) {
    const reader=window.HarborFlowDocumentImport,detectedName=String(result.nameWithoutTitle||result.fields?.name||'').trim();
    const currentService=service(),kind=currentService?.data.type==='Crew Change'?'crew':'visitor';
    if(!currentService||(kind==='visitor'&&!FLAT_VISITORS[currentService.data.type]))throw Error('Open a supported service before importing documents.');
    if(kind==='visitor'&&result.type==='seamanBook')throw Error('Seaman book import is only available in Crew Change.');
    item.fileName=result.fileName||item.fileName;item.name=detectedName;
    if(result.nameNeedsTitle&&detectedName){item.needsTitle=true;item.pendingResult=result;item.outcome='Choose MR. or MS.';item.warnings=['อ่านเพศจาก Passport ไม่ชัดเจน ระบบยังไม่กรอกชื่อหรือข้อมูลจนกว่าจะเลือกคำนำหน้า'];return;}
    const key=normalizedCrewName(result.fields?.name||detectedName);
    if(!key){item.outcome='Needs review';item.error='No readable crew name was found. Nothing was added.';return;}
    const givenSurnameOnly=result.matchStrategy==='given-surname';
    const scopedPeople=state.people.filter(candidate=>candidate.kind===kind&&(kind==='crew'||candidate.data.serviceIds?.includes(currentService.id)));
    const nameMatches=scopedPeople.filter(candidate=>givenSurnameOnly?matchesGivenSurname(result.fields?.name||detectedName,candidate.data.name):normalizedCrewName(candidate.data.name)===key);
    if(nameMatches.length>1){item.outcome='Needs review';item.error='More than one person in this service has the same name. Nothing was added.';return;}
    let person=nameMatches[0];
    const passportMatches=!person&&result.type==='passport'&&result.fields?.passport?scopedPeople.filter(candidate=>String(candidate.data.passport||'').toUpperCase()===String(result.fields.passport).toUpperCase()):[];
    const matchedByPassport=passportMatches.length===1;if(matchedByPassport)person=passportMatches[0];
    if(person){
      const safeResult=structuredClone(result);safeResult.fields={...(safeResult.fields||{}),name:person.data.name};
      const applied=reader.applyToPerson(person.data,safeResult);
      await saveImportedPerson(person,applied.person);
      const nameWarning=matchedByPassport?`Passport matches an existing person. Review Name - Surname: saved “${person.data.name}”, document “${result.fields.name}”.`:'';
      Object.assign(item,{name:person.data.name,outcome:matchedByPassport?'Matched by Passport · Review name':'Matched existing person',changes:applied.changes,warnings:[...applied.warnings,...(nameWarning?[nameWarning]:[])],needsTitle:false,pendingResult:null,error:''});
    }else if(passportMatches.length>1){
      item.outcome='Needs review';item.error='More than one person in this service has this Passport number. Nothing was added.';return;
    }else if(givenSurnameOnly){
      item.outcome='Needs review';item.error='No existing person matched the Given name and Surname. Nothing was added.';return;
    }else{
      const category=kind==='crew'?state.documentBatch.category||'On-signers':currentService.data.type==='SIRE Inspector'?'SIRE Inspectors':currentService.data.type==='Surveyor'?'Surveyors':'Other';
      const seed={name:String(result.fields?.name||detectedName).toUpperCase(),category,serviceIds:[currentService.id],flights:[]};
      const applied=reader.applyToPerson(seed,result),out=await api('createPerson',{jobId:job().id,kind,data:applied.person});
      person=out.person;state.people.push(person);
      Object.assign(item,{name:person.data.name,outcome:'Added new person',changes:applied.changes,warnings:applied.warnings,needsTitle:false,pendingResult:null,error:''});
    }
    state.peopleLoadedFor=job().id;
  }
  async function importPersonDocuments(files,type) {
    const reader=window.HarborFlowDocumentImport,batch=state.documentBatch;
    const currentService=service(),kind=currentService?.data.type==='Crew Change'?'crew':'visitor';
    if(!reader||!currentService||(kind==='visitor'&&!FLAT_VISITORS[currentService.data.type])||!canEditPeople(kind)||state.peopleLoadedFor!==currentService.job_id||batch.busy)return;
    if(kind==='visitor'&&type==='seamanBook')return;
    const serviceId=currentService.id,jobId=job()?.id;
    const chosen=[...files],limit=reader.limits?.maxBatchFiles||20,queue=chosen.slice(0,limit);
    batch.busy=true;batch.completed=0;batch.total=queue.length;batch.results=[];
    if(chosen.length>limit)batch.results.push({fileName:`${chosen.length-limit} file(s)`,error:`Only the first ${limit} files were accepted.`,outcome:'Not processed'});
    render();
    const batchReader=reader.createBatchReader?.()||reader;
    try{
      for(const file of queue){
        if(service()?.id!==serviceId||job()?.id!==jobId){batch.results.push({fileName:file.name,outcome:'Not processed',error:'Service changed during import. Reopen the original service and retry.'});batch.completed+=1;continue;}
        documentProgress(type,`Reading ${file.name}…`);
        try{
          const result=await batchReader.read(file,type,progress=>documentProgress(type,`Reading ${file.name}… ${progress||0}%`));
          if(service()?.id!==serviceId||job()?.id!==jobId)throw Error('Service changed during import. Nothing was saved.');
          const item={fileName:file.name,name:'',outcome:'Needs review'};batch.results.push(item);await applyImportedResult(result,item);
        }catch(error){batch.results.push({fileName:file.name,name:'',outcome:'Not processed',error:error.message||'Document could not be read.'});}
        batch.completed+=1;render();
      }
    }finally{
      try{await batchReader.close?.();}finally{batch.busy=false;state.sync='Saved '+new Date().toLocaleTimeString();render();}
    }
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
    const draft=state.tripDraft;
    captureTripDraft();
    const data=structuredClone(draft.data);
    for(const target of ['origin','destination']){
      if(!data[target+'Name']){const parts=String(data[target]||'').split(',').map(value=>value.trim()).filter(Boolean);data[target+'Name']=parts.shift()||'';data[target+'Address']=parts.join(', ');}
    }
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
      state.portStatus = state.portChoices.length ? '' : 'No Port / Terminal rows in Terminal Restriction';
    } catch {
      state.portStatus = 'Port list unavailable. Close and reopen to retry.';
    }
    const select = document.querySelector('.hfo-overlay select[name="port"]');
    if (select) {
      const current = select.value;
      select.innerHTML = portOptions(current);
      select.value = current;
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
    const placeChoice=event.target.closest('[data-place-choice]');if(placeChoice){const results=placeChoice.closest('[data-place-results]'),place=results?._places?.[Number(placeChoice.dataset.placeIndex)];if(place){await setTripPlace(placeChoice.dataset.placeChoice,place);results.hidden=true;}return;}
    document.querySelectorAll('[data-time-picker-panel]').forEach(panel=>{if(!panel.closest('.hfo-time-entry')?.contains(event.target))panel.hidden=true;});
    document.querySelectorAll('[data-code-kind]').forEach(input=>{if(!input.closest('.hfo-code-field').contains(event.target))closeCodeSuggestions(input);});
    const downloadMenu=document.querySelector('[data-download-menu]');if(downloadMenu&&!event.target.closest('.hfo-download')){downloadMenu.hidden=true;document.querySelector('[data-download-toggle]')?.setAttribute('aria-expanded','false');}
    const b=event.target.closest('[data-open-job],[data-open-service],[data-shift],[data-download-toggle],[data-download],[data-grants],[data-close],[data-back-job],[data-add-service],[data-remove-service],[data-restore-service],[data-tab],[data-add-step],[data-remove-step],[data-add-person],[data-save-new-person],[data-edit-person],[data-remove-person],[data-close-person],[data-add-flight],[data-remove-flight],[data-add-trip],[data-edit-trip],[data-remove-trip],[data-close-trip],[data-history],[data-resolve],[data-revoke],[data-lookup-imo],[data-imo-choice],[data-sync-job-folder],[data-place-search],[data-pin-target],[data-open-time-picker],[data-add-cargo-item],[data-remove-cargo-item],[data-doc-choose],[data-doc-title]');
    if(!b)return;
    if(b.dataset.docChoose){document.querySelector(`[data-doc-file="${b.dataset.docChoose}"]`)?.click();return;}
    if(b.dataset.docTitle){
      const item=state.documentBatch.results[Number(b.dataset.docResult)],result=item?.pendingResult;if(!item||!result)return;
      result.fields={...(result.fields||{}),name:`${b.dataset.docTitle} ${result.nameWithoutTitle||result.fields?.name||''}`.trim().toUpperCase()};result.nameNeedsTitle=false;result.sex=b.dataset.docTitle==='MR.'?'M':'F';
      item.needsTitle=false;item.warnings=[];item.error='';item.outcome='Saving…';render();
      try{await applyImportedResult(result,item);state.sync='Saved '+new Date().toLocaleTimeString();}catch(error){item.error=error.message||'Document could not be saved.';item.outcome='Not processed';}render();return;
    }
    if(b.hasAttribute('data-download-toggle')){const menu=b.parentElement.querySelector('[data-download-menu]'),open=menu.hidden;menu.hidden=!open;b.setAttribute('aria-expanded',String(open));return;}
    if(b.dataset.download){b.closest('[data-download-menu]').hidden=true;await downloadCalendarReport(b.dataset.download);return;}
if(b.dataset.openJob){state.openJobId=b.dataset.openJob;state.openServiceId=null;state.documentBatch={busy:false,category:'On-signers',completed:0,total:0,results:[]};state.modal=null;state.people=[];state.peopleLoadedFor=null;state.history=[];state.error='';render();if(!state.public){await loadPortChoices();await loadPeople();}return;}
    if(b.hasAttribute('data-lookup-imo')){await lookupImo(b);return;}
    if(b.hasAttribute('data-sync-job-folder')){await perform('syncJobFolder',{id:job().id},out=>{Object.assign(job(),out.record);render();});return;}
    if(b.dataset.imoChoice){const grid=b.closest('.hfo-form-grid'),input=grid?.querySelector('[name="imo"]');if(input){input.value=b.dataset.imoChoice;grid.querySelector('[data-imo-feedback]').textContent='IMO selected. Verify with ship documents.';if(input.hasAttribute('data-job-field'))input.dispatchEvent(new Event('change',{bubbles:true}));}return;}
if(b.dataset.openService){state.openServiceId=b.dataset.openService;state.documentBatch={busy:false,category:'On-signers',completed:0,total:0,results:[]};state.tab=service()?.data.type==='Crew Change'?'crew':FLAT_VISITORS[service()?.data.type]?'visitors':'details';state.history=[];state.error='';render();if(!state.public && anyPeopleView() && state.peopleLoadedFor!==job()?.id)await loadPeople();return;}
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
    if(b.dataset.placeSearch){await searchTripPlace(b.dataset.placeSearch);return;}
    if(b.dataset.pinTarget){tripPinTarget=b.dataset.pinTarget;updatePinButtons();return;}
    if(b.dataset.openTimePicker){const picker=document.querySelector(`[data-time-picker-panel="${b.dataset.openTimePicker}"]`);if(picker)picker.hidden=!picker.hidden;return;}
    if(b.hasAttribute('data-add-cargo-item')){captureTripDraft();state.tripDraft.data.cargoItems.push('');render();return;}
    if(b.hasAttribute('data-remove-cargo-item')){captureTripDraft();state.tripDraft.data.cargoItems.splice(Number(b.dataset.removeCargoItem),1);render();return;}
    if(b.hasAttribute('data-add-trip')){state.tripDraft={data:{kind:'car',origin:'',destination:'',personIds:[],cargoItems:['']}};render();return;}
    if(b.dataset.editTrip){const t=state.trips.find(x=>x.id===b.dataset.editTrip);state.tripDraft={id:t.id,data:structuredClone(t.data)};render();return;}
    if(b.dataset.removeTrip){const reason=prompt('Reason for removing this trip:');if(reason)await perform('removeTrip',{id:b.dataset.removeTrip,reason},()=>{state.trips=state.trips.filter(x=>x.id!==b.dataset.removeTrip);render();});return;}
    if(b.hasAttribute('data-close-trip')){state.tripDraft=null;render();return;}
    if(b.dataset.history){await loadHistory(b.dataset.history,b.dataset.historyId);return;}
    if(b.dataset.resolve){await resolveConflict(b.dataset.resolve);return;}
    if(b.dataset.revoke){if(confirm('Revoke '+b.dataset.revoke+' on the next request?'))await perform('revoke',{login:b.dataset.revoke},()=>renderGrants());}
  });
  document.body.addEventListener('change',async event=>{
    const t=event.target;
    if(t.dataset.docFile){const files=[...(t.files||[])];if(files.length)await importPersonDocuments(files,t.dataset.docFile);t.value='';return;}
    if(t.name==='documentBatchCategory'){state.documentBatch.category=t.value;return;}
    if(t.id==='hfoView'){state.view=t.value;render();return;}
    if(t.dataset.jobDate||t.dataset.jobTime){const hidden=syncJobDateTime(t);if(hidden?.hasAttribute('data-job-field'))await saveJobField(hidden);return;}
    if(t.hasAttribute('data-job-field')){await saveJobField(t);return;}
    if(t.hasAttribute('data-person-field')){await saveInlinePerson(t);return;}
    if(t.hasAttribute('data-new-person-field')){scheduleNewPersonSave(0);return;}
    if(t.closest('#hfoPersonForm')){schedulePersonSave(0);return;}
    if(t.hasAttribute('data-service-field')||t.hasAttribute('data-detail-field')){await saveServiceField(t);return;}
    if(t.hasAttribute('data-service-check')){await saveServiceField(t,true);return;}
    if(t.dataset.timeHour||t.dataset.timeMinute){const name=t.dataset.timeHour||t.dataset.timeMinute,panel=t.closest('[data-time-picker-panel]'),hour=panel?.querySelector(`[data-time-hour="${name}"]`)?.value||'00',minute=panel?.querySelector(`[data-time-minute="${name}"]`)?.value||'00',manual=document.querySelector(`[data-trip-time="${name}"],[data-job-time="${name}"]`);if(manual){manual.value=hour+':'+minute;manual.dispatchEvent(new Event('input',{bubbles:true}));if(manual.dataset.jobTime){const hidden=syncJobDateTime(manual);if(hidden?.hasAttribute('data-job-field'))await saveJobField(hidden);}}return;}
    if(t.closest('#hfoTripForm')){if(t.matches('[name="personIds"],[name="cargoItems"]'))updateTripLoadSummary();return;}
    if(t.hasAttribute('data-step')){const next=structuredClone(service().data.checklist||[]),i=Number(t.dataset.step);next[i]={...next[i],done:t.checked,actor:state.login,completedAt:t.checked?new Date().toISOString():null};await saveChecklist(next);}
  });
  document.body.addEventListener('input',event=>{
    const t=event.target;
    if(t.dataset.jobTime){t.value=t.value.replace(/[^0-9:]/g,'').slice(0,5);t.setCustomValidity('');return;}
    if(t.hasAttribute('data-new-person-field')){scheduleNewPersonSave();return;}
    if(t.dataset.tripTime){t.value=t.value.replace(/[^0-9:]/g,'').slice(0,5);const form=t.closest('form'),date=form?.querySelector(`[data-trip-date="${t.dataset.tripTime}"]`)?.value||'';tripFormValue(t.dataset.tripTime,date&&t.value?date+'T'+t.value:'');return;}
    if(t.dataset.tripDate){const form=t.closest('form'),time=form?.querySelector(`[data-trip-time="${t.dataset.tripDate}"]`)?.value||'';tripFormValue(t.dataset.tripDate,t.value&&time?t.value+'T'+time:'');return;}
    if(t.dataset.placeField){const target=t.dataset.placeField;if(state.tripDraft){state.tripDraft.data[target]=t.value;state.tripDraft.data[target+'Name']='';state.tripDraft.data[target+'Address']='';for(const suffix of ['Lat','Lon'])tripFormValue(target+suffix,'');tripFormValue('routeDistanceMeters','');tripFormValue('routeDurationSeconds','');}const output=document.getElementById('hfoRouteSummary');if(output)output.textContent=routeText({});scheduleTripPlaceSearch(target);return;}
    if(t.closest('#hfoTripForm')&&t.name==='cargoItems'){updateTripLoadSummary();return;}
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
  document.body.addEventListener('dragover',event=>{const drop=event.target.closest('[data-doc-drop]');if(!drop)return;event.preventDefault();drop.classList.add('is-dragging');});
  document.body.addEventListener('dragleave',event=>{const drop=event.target.closest('[data-doc-drop]');if(drop&&!drop.contains(event.relatedTarget))drop.classList.remove('is-dragging');});
  document.body.addEventListener('drop',event=>{const drop=event.target.closest('[data-doc-drop]');if(!drop)return;event.preventDefault();drop.classList.remove('is-dragging');const files=[...(event.dataTransfer?.files||[])];if(files.length)void importPersonDocuments(files,drop.dataset.docDrop);});
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
    if(form.id==='hfoAddService'){await perform('addService',{jobId:job().id,data:Object.fromEntries(d.entries())},out=>{state.services.push(out.service);state.modal=null;state.openServiceId=out.service.id;state.tab=out.service.data.type==='Crew Change'?'crew':FLAT_VISITORS[out.service.data.type]?'visitors':'details';render();});}
    if(form.id==='hfoPersonForm')await savePerson();
    if(form.id==='hfoTripForm')await saveTrip();
    if(form.id==='hfoGrantForm'){const data=Object.fromEntries(d.entries());for(const key of ['crewView','crewEdit','visitorView','visitorEdit'])data[key]=d.has(key);await perform('grant',data,()=>renderGrants());}
  });
  refresh();
  setInterval(refresh,15000);
})();

