/* Interactive demo state. No crew identity data is written to browser storage. */
(() => {
  const jobDrawer = document.getElementById('drawer');
  const detailDrawer = document.getElementById('crewDrawer');
  const jobs = new Map();
  let activeJob;
  let activeService;
  let activeTab = 'crew';
  let editingService = null;
  let nextId = 1;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const id = () => String(nextId++);
  const makeService = (name, note, status) => ({ id: id(), name, note, status });
  const makeCrew = (data = {}) => ({
    id: id(), change: 'Sign-on', name: '', nationality: '', rank: '', dob: '',
    passport: '', seamanBook: '', status: 'Not started', flight: '', arrival: '',
    pickup: '', hotel: '', visa: '', bg: '', immigrationStatus: 'Not started',
    submitted: '', immigrationNotes: '', ...data
  });
  const field = (label, value, data, type = 'text') =>
    `<label class="hf-field"><span>${label}</span><input type="${type}" ${data} value="${escapeHtml(value)}"></label>`;
  const select = (value, options, data) =>
    `<select ${data}>${options.map(option => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;

  function getJob(button) {
    const key = `${button.dataset.name}|${button.dataset.port}`;
    if (!jobs.has(key)) {
      const oceanPride = button.dataset.name === 'MT Ocean Pride';
      jobs.set(key, {
        name: button.dataset.name, port: button.dataset.port, status: button.dataset.status,
        jobNo: oceanPride ? 'GAC-260922-001' : '',
        services: oceanPride ? [
          makeService('Port clearance', 'Operations', 'Done'),
          makeService('Crew change', '2 crew members · Immigration documents', 'Pending'),
          makeService('Fresh water', '100 MT · Supplier confirmed', 'Confirmed'),
          makeService('CTM', 'Prefund verification', 'Action needed')
        ] : [],
        crew: oceanPride ? [
          makeCrew({ name: 'John Smith', nationality: 'Filipino', rank: 'Master', change: 'Sign-off', passport: 'P1234567', status: 'Docs pending' }),
          makeCrew({ name: 'Raj Kumar', nationality: 'Indian', rank: '2nd Engineer', change: 'Sign-on', passport: 'N7654321', status: 'Submitted' })
        ] : [],
        checklist: [false, false, false, false]
      });
    }
    return jobs.get(key);
  }

  // Clone calendar buttons to replace the original read-only demo click handlers.
  document.querySelectorAll('.job').forEach(original => {
    const button = original.cloneNode(true);
    original.replaceWith(button);
    button.addEventListener('click', () => {
      activeJob = getJob(button);
      editingService = null;
      renderJob();
      jobDrawer.classList.add('open');
    });
  });

  function renderJob() {
    jobDrawer.innerHTML = `
      <button type="button" class="close" data-action="close-job" aria-label="Close job details">×</button>
      <h2>${escapeHtml(activeJob.name)}</h2>
      <div class="meta">${escapeHtml(activeJob.port)} · PTTLNG LMPT1</div>
      <label class="hf-field hf-job-number"><span>Job No.</span><input id="hfJobNo" aria-label="Job number" placeholder="Enter job number" value="${escapeHtml(activeJob.jobNo)}"></label>
      <span class="tag green">${escapeHtml(activeJob.status)}</span>
      <div class="detail-grid">
        <div class="detail"><label>ETA / ETB</label><b>22 Sep · 08:00 / 12:00</b></div>
        <div class="detail"><label>ETD</label><b>24 Sep · 18:00</b></div>
        <div class="detail"><label>PIC</label><b>Thanaphon</b></div>
        <div class="detail"><label>Principal</label><b>Ocean Shipping Ltd.</b></div>
      </div>
      <div class="panel-head"><h3>Services</h3><button type="button" class="secondary" data-action="add-service">+ Add</button></div>
      <div id="hfServices">${activeJob.services.length ? activeJob.services.map(service => `
        <div class="hf-service-row">
          <button type="button" class="hf-service-open" data-action="open-service" data-id="${service.id}">
            <b>${escapeHtml(service.name)}</b><small>${escapeHtml(service.note)}</small>
          </button>
          <span class="tag ${service.status === 'Done' || service.status === 'Confirmed' ? 'green' : 'amber'}">${escapeHtml(service.status)}</span>
          <button type="button" class="hf-plain" data-action="edit-service" data-id="${service.id}" aria-label="Edit ${escapeHtml(service.name)}">Edit</button>
          <button type="button" class="hf-plain hf-danger" data-action="delete-service" data-id="${service.id}" aria-label="Delete ${escapeHtml(service.name)}">×</button>
        </div>`).join('') : '<p class="small">No services yet. Select + Add to create one.</p>'}</div>
      <form id="hfServiceForm" class="hf-editor" ${editingService === null ? 'hidden' : ''}>
        <h3>${editingService && editingService !== 'new' ? 'Edit service' : 'Add service'}</h3>
        ${field('Service name', editingService && editingService !== 'new' ? editingService.name : '', 'name="name" required')}
        ${field('Details', editingService && editingService !== 'new' ? editingService.note : '', 'name="note"')}
        <label class="hf-field"><span>Status</span>${select(editingService && editingService !== 'new' ? editingService.status : 'Pending', ['Pending', 'Confirmed', 'Action needed', 'In progress', 'Done'], 'name="status"')}</label>
        <div class="hf-actions"><button type="button" class="secondary" data-action="cancel-service">Cancel</button><button type="submit" class="primary">Save service</button></div>
      </form>
      <h3>Tasks, documents & timeline</h3>
      <div class="line-item"><b>Tasks: 8 / 11 complete</b><span>Visa confirmation overdue · Supplier follow-up due 23 Sep</span></div>
      <div class="line-item"><b>Documents: 7 / 8 received</b><span>Missing: immigration confirmation</span></div>
      <div class="line-item"><b>Latest activity</b><span>22 Sep 14:05 — ETA amended by Thanaphon</span></div>
    `;
  }

  jobDrawer.addEventListener('input', event => {
    if (event.target.id === 'hfJobNo') activeJob.jobNo = event.target.value;
  });
  jobDrawer.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const service = activeJob.services.find(item => item.id === button.dataset.id);
    switch (button.dataset.action) {
      case 'close-job': jobDrawer.classList.remove('open'); break;
      case 'add-service': editingService = 'new'; renderJob(); jobDrawer.querySelector('[name="name"]').focus(); break;
      case 'edit-service': editingService = service; renderJob(); jobDrawer.querySelector('[name="name"]').focus(); break;
      case 'cancel-service': editingService = null; renderJob(); break;
      case 'delete-service':
        if (service && window.confirm(`Delete service “${service.name}” from this job?`)) {
          activeJob.services = activeJob.services.filter(item => item !== service);
          renderJob();
        }
        break;
      case 'open-service':
        if (!service) break;
        activeService = service;
        if (service.name.trim().toLowerCase() === 'crew change') {
          activeTab = 'crew';
          renderCrew();
          detailDrawer.classList.add('open');
        } else {
          editingService = service;
          renderJob();
          jobDrawer.querySelector('[name="name"]').focus();
        }
        break;
    }
  });
  jobDrawer.addEventListener('submit', event => {
    if (event.target.id !== 'hfServiceForm') return;
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get('name') || '').trim();
    if (!name) return;
    if (editingService === 'new') activeJob.services.push(makeService(name, String(data.get('note') || '').trim(), String(data.get('status'))));
    else Object.assign(editingService, { name, note: String(data.get('note') || '').trim(), status: String(data.get('status')) });
    editingService = null;
    renderJob();
  });

  const crewInput = (crew, property, type = 'text') =>
    `<input type="${type}" data-crew-id="${crew.id}" data-field="${property}" aria-label="${escapeHtml(property)} for ${escapeHtml(crew.name || 'new crew member')}" value="${escapeHtml(crew[property])}">`;
  const crewSelect = (crew, property, options) =>
    select(crew[property], options, `data-crew-id="${crew.id}" data-field="${property}" aria-label="${escapeHtml(property)} for ${escapeHtml(crew.name || 'new crew member')}"`);
  function crewTable(change) {
    const list = activeJob.crew.filter(crew => crew.change === change);
    return `<section class="hf-crew-group"><div class="hf-group-head"><h3>${change} <span class="small">(${list.length})</span></h3><button type="button" class="secondary" data-action="add-crew" data-change="${change}">+ Add row</button></div>
      <div class="table-wrap"><table class="table hf-crew-table"><thead><tr><th>No.</th><th>Name</th><th>Nationality</th><th>Rank</th><th>Change</th><th>Date of birth</th><th>Passport No.</th><th>Seaman Book No.</th><th>Status</th><th>Remove</th></tr></thead>
      <tbody>${list.length ? list.map((crew, index) => `<tr><td>${index + 1}</td><td>${crewInput(crew, 'name')}</td><td>${crewInput(crew, 'nationality')}</td><td>${crewInput(crew, 'rank')}</td><td>${crewSelect(crew, 'change', ['Sign-on', 'Sign-off'])}</td><td>${crewInput(crew, 'dob', 'date')}</td><td>${crewInput(crew, 'passport')}</td><td>${crewInput(crew, 'seamanBook')}</td><td>${crewSelect(crew, 'status', ['Not started', 'Docs pending', 'Submitted', 'Confirmed', 'Completed'])}</td><td><button type="button" class="hf-plain hf-danger" data-action="delete-crew" data-id="${crew.id}" aria-label="Remove crew member ${escapeHtml(crew.name || String(index + 1))}">×</button></td></tr>`).join('') : '<tr><td colspan="10" class="small">No crew members in this change type.</td></tr>'}</tbody></table></div></section>`;
  }
  function travelTable() {
    return `<div class="hf-group-head"><h3>Travel arrangements</h3></div><div class="table-wrap"><table class="table hf-crew-table"><thead><tr><th>Crew member</th><th>Change</th><th>Flight</th><th>Arrival / Departure</th><th>Pickup / Transport</th><th>Hotel</th></tr></thead><tbody>${activeJob.crew.map(crew => `<tr><td>${escapeHtml(crew.name || 'New crew member')}</td><td>${escapeHtml(crew.change)}</td><td>${crewInput(crew, 'flight')}</td><td>${crewInput(crew, 'arrival', 'datetime-local')}</td><td>${crewInput(crew, 'pickup')}</td><td>${crewInput(crew, 'hotel')}</td></tr>`).join('') || '<tr><td colspan="6">Add crew members first.</td></tr>'}</tbody></table></div>`;
  }
  function immigrationTable() {
    return `<div class="hf-group-head"><h3>Immigration</h3></div><div class="table-wrap"><table class="table hf-crew-table"><thead><tr><th>Crew member</th><th>Change</th><th>Visa / permission</th><th>BG / OKTB</th><th>Status</th><th>Submitted date</th><th>Notes</th></tr></thead><tbody>${activeJob.crew.map(crew => `<tr><td>${escapeHtml(crew.name || 'New crew member')}</td><td>${escapeHtml(crew.change)}</td><td>${crewInput(crew, 'visa')}</td><td>${crewInput(crew, 'bg')}</td><td>${crewSelect(crew, 'immigrationStatus', ['Not started', 'Documents pending', 'Submitted', 'Approved', 'Completed'])}</td><td>${crewInput(crew, 'submitted', 'date')}</td><td>${crewInput(crew, 'immigrationNotes')}</td></tr>`).join('') || '<tr><td colspan="7">Add crew members first.</td></tr>'}</tbody></table></div>`;
  }
  const checks = ['Passport and seaman book verified', 'Flight / hotel confirmed', 'Immigration submitted', 'Transport / launch boat arranged'];
  function checklist() {
    return `<h3>Crew-change checklist</h3><p class="small">${activeJob.checklist.filter(Boolean).length} of ${checks.length} complete</p>${checks.map((label, index) => `<label class="hf-check"><input type="checkbox" data-check="${index}" ${activeJob.checklist[index] ? 'checked' : ''}><span>${label}</span></label>`).join('')}`;
  }
  function renderCrew() {
    detailDrawer.innerHTML = `
      <button type="button" class="close" data-action="close-crew" aria-label="Close service details">×</button>
      <div class="meta">Job / ${escapeHtml(activeJob.name)} / Service</div>
      <h2>${escapeHtml(activeService.name)}</h2>
      <div class="meta">Sign-on & Sign-off · ${escapeHtml(activeJob.port)} · PIC: Thanaphon</div>
      <div class="tabs hf-tabs" role="tablist" aria-label="Crew change sections">${[['crew', 'Crew members'], ['travel', 'Travel'], ['immigration', 'Immigration'], ['checklist', 'Checklist']].map(([key, label]) => `<button type="button" role="tab" aria-selected="${activeTab === key}" class="tab ${activeTab === key ? 'active' : ''}" data-action="tab" data-tab="${key}">${label}</button>`).join('')}</div>
      <div role="tabpanel" class="hf-tab-panel">${activeTab === 'crew' ? crewTable('Sign-on') + crewTable('Sign-off') : activeTab === 'travel' ? travelTable() : activeTab === 'immigration' ? immigrationTable() : checklist()}</div>
      <p class="hf-demo-note">Demo only — crew details are kept in this page until it is refreshed. Do not enter real personal documents here.</p>
    `;
  }
  detailDrawer.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'close-crew') detailDrawer.classList.remove('open');
    if (button.dataset.action === 'tab') { activeTab = button.dataset.tab; renderCrew(); }
    if (button.dataset.action === 'add-crew') {
      const crew = makeCrew({ change: button.dataset.change });
      activeJob.crew.push(crew);
      renderCrew();
      detailDrawer.querySelector(`[data-crew-id="${crew.id}"][data-field="name"]`)?.focus();
    }
    if (button.dataset.action === 'delete-crew') {
      activeJob.crew = activeJob.crew.filter(crew => crew.id !== button.dataset.id);
      renderCrew();
    }
  });
  detailDrawer.addEventListener('input', event => {
    const { crewId, field } = event.target.dataset;
    if (!crewId || !field) return;
    const crew = activeJob.crew.find(item => item.id === crewId);
    if (crew) crew[field] = event.target.value;
  });
  detailDrawer.addEventListener('change', event => {
    const { crewId, field } = event.target.dataset;
    if (crewId && field) {
      const crew = activeJob.crew.find(item => item.id === crewId);
      if (crew) crew[field] = event.target.value;
    }
    if (event.target.dataset.field === 'change') renderCrew();
    if (event.target.dataset.check !== undefined) {
      activeJob.checklist[Number(event.target.dataset.check)] = event.target.checked;
      renderCrew();
    }
  });
})();

