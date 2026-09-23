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
  const categories = ['On-signers', 'Off-signers', 'Medical visitors', 'SIRE Inspectors', 'Surveyors', 'Service Engineers'];

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const id = () => String(nextId++);
  const makeService = (name, note, status) => ({ id: id(), name, note, status });
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const folderName = value => String(value || '').trim().replace(/[\\/<>:"|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ').replace(/^\.+|\.+$/g, '').slice(0, 80) || 'Unnamed';
  function jobPath(job) {
    const date = new Date(job.eta);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `Jobs/${year}/${month}. ${monthNames[date.getMonth()]}/${day}. ${folderName(job.name)} - ${folderName(job.jobNo)}`;
  }
  const servicePaths = job => [...new Set([
    ...job.services.map(service => folderName(service.name)), 'General'
  ])].map(name => `${job.githubPath || jobPath(job)}/${name}`);
  const makeCrew = (data = {}) => ({
    id: id(), change: 'On-signers', name: '', nationality: '', rank: '', dob: '',
    passport: '', passportExpiry: '', seamanBook: '', status: 'Not started',
    visa: '', bg: '', immigrationStatus: 'Not started', submitted: '',
    immigrationNotes: '', flights: [], ...data
  });
  const makeFlight = () => ({ id: id(), number: '', from: '', to: '', departure: '', arrival: '', booking: '' });
  const makeTransport = () => ({ id: id(), passenger: '', date: '', from: '', to: '', supplier: '', reference: '' });
  const field = (label, value, data, type = 'text') =>
    `<label class="hf-field"><span>${label}</span><input type="${type}" ${data} value="${escapeHtml(value)}"></label>`;
  const select = (value, options, data) =>
    `<select ${data}>${options.map(option => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;

  function getJob(button) {
    const key = button.dataset.jobId || `${button.dataset.name}|${button.dataset.port}|${button.closest('.day')?.querySelector('.num')?.textContent || ''}`;
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
          makeCrew({ name: 'John Smith', nationality: 'Filipino', rank: 'Master', change: 'Off-signers', passport: 'P1234567', status: 'Docs pending' }),
          makeCrew({ name: 'Raj Kumar', nationality: 'Indian', rank: '2nd Engineer', change: 'On-signers', passport: 'N7654321', status: 'Submitted' })
        ] : [],
        groupOpen: Object.fromEntries(categories.map(category => [category, category === 'On-signers' || category === 'Off-signers'])),
        personOpen: {},
        cars: [],
        boats: [],
        checklist: [false, false, false, false]
      });
    }
    return jobs.get(key);
  }

  // Clone calendar buttons to replace the original read-only demo click handlers.
  function openJob(button) {
      activeJob = getJob(button);
      editingService = null;
      renderJob();
      jobDrawer.classList.add('open');
  }
  document.querySelectorAll('.job').forEach(original => {
    const button = original.cloneNode(true);
    original.replaceWith(button);
    button.addEventListener('click', () => {
      openJob(button);
    });
  });

  const createdJobsPanel = document.createElement('div');
  createdJobsPanel.className = 'panel';
  createdJobsPanel.style.marginTop = '18px';
  createdJobsPanel.innerHTML = '<div class="panel-head"><h2>Jobs created this session</h2><span class="small">Demo data resets on reload</span></div><div id="hfCreatedJobs"></div>';
  document.querySelector('#operations').appendChild(createdJobsPanel);
  const createdJobs = createdJobsPanel.querySelector('#hfCreatedJobs');
  function renderCreatedJobs() {
    createdJobs.innerHTML = [...jobs.entries()].filter(([key]) => key.startsWith('created-')).map(([key, job]) =>
      `<button type="button" class="job blue" data-job-id="${escapeHtml(key)}" data-name="${escapeHtml(job.name)}" data-port="${escapeHtml(job.port)}" data-status="${escapeHtml(job.status)}"><b>${escapeHtml(job.name)}</b><small>${escapeHtml(job.port)} · ${escapeHtml(job.eta.replace('T', ' '))} · ${escapeHtml(job.services.map(service => service.name).join(', '))}</small></button>`
    ).join('') || '<p class="small">No jobs created yet.</p>';
    createdJobs.querySelectorAll('.job').forEach(button => button.addEventListener('click', () => openJob(button)));
  }
  renderCreatedJobs();

  document.querySelector('#entryForm').addEventListener('submit', event => {
    if (document.querySelector('#modalTitle').textContent !== 'Create new job') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('vessel') || '').trim();
    const eta = String(data.get('eta') || '');
    const principal = String(data.get('principal') || '').trim();
    if (!name || !eta || !principal) return;
    const jobId = 'created-' + id();
    const date = new Date(eta);
    const jobNo = `HF-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${jobId.slice(8).padStart(3, '0')}`;
    jobs.set(jobId, {
      name, eta, principal, imo: String(data.get('imo') || '').trim(),
      port: String(data.get('port') || ''), notes: String(data.get('notes') || '').trim(),
      status: 'Planned', jobNo, githubPath: jobPath({ name, eta, jobNo }),
      services: [makeService(String(data.get('service') || 'General'), '', 'Pending')],
      crew: [], groupOpen: Object.fromEntries(categories.map(category => [category, true])),
      personOpen: {}, cars: [], boats: [], checklist: [false, false, false, false]
    });
    renderCreatedJobs();
    event.currentTarget.reset();
    document.querySelector('#modal').classList.remove('open');
    notify('Job created in this session');
  }, true);

  function renderJob() {
    jobDrawer.innerHTML = `
      <button type="button" class="close" data-action="close-job" aria-label="Close job details">×</button>
      <h2>${escapeHtml(activeJob.name)}</h2>
      <div class="meta">${escapeHtml(activeJob.port)}${activeJob.eta ? ' · ' + escapeHtml(activeJob.eta.replace('T', ' ')) : ' · PTTLNG LMPT1'}</div>
      <label class="hf-field hf-job-number"><span>Job No.</span><input id="hfJobNo" aria-label="Job number" placeholder="Enter job number" value="${escapeHtml(activeJob.jobNo)}"></label>
      <span class="tag green">${escapeHtml(activeJob.status)}</span>
      <div class="detail-grid">
        <div class="detail"><label>ETA / ETB</label><b>${escapeHtml(activeJob.eta ? activeJob.eta.replace('T', ' ') : '22 Sep · 08:00 / 12:00')}</b></div>
        <div class="detail"><label>ETD</label><b>${activeJob.githubPath ? 'Not set' : '24 Sep · 18:00'}</b></div>
        <div class="detail"><label>PIC</label><b>${activeJob.githubPath ? 'Not assigned' : 'Thanaphon'}</b></div>
        <div class="detail"><label>Principal</label><b>${escapeHtml(activeJob.principal || 'Ocean Shipping Ltd.')}</b></div>
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
      ${activeJob.eta ? `<h3>Planned GitHub folders</h3><p class="small">Path preview only. No files have been synced.</p><code>${escapeHtml(activeJob.githubPath || jobPath(activeJob))}</code><ul>${servicePaths(activeJob).map(path => `<li><code>${escapeHtml(path)}</code></li>`).join('')}</ul>` : ''}
      <h3>Tasks, documents & timeline</h3>
      ${activeJob.githubPath ? '<p class="small">No tasks or documents have been recorded for this job.</p>' : `
      <div class="line-item"><b>Tasks: 8 / 11 complete</b><span>Visa confirmation overdue · Supplier follow-up due 23 Sep</span></div>
      <div class="line-item"><b>Documents: 7 / 8 received</b><span>Missing: immigration confirmation</span></div>
      <div class="line-item"><b>Latest activity</b><span>22 Sep 14:05 — ETA amended by Thanaphon</span></div>`}
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
    renderCreatedJobs();
  });

  const crewInput = (crew, property, type = 'text') =>
    `<input type="${type}" data-kind="crew" data-id="${crew.id}" data-field="${property}" aria-label="${escapeHtml(property)} for ${escapeHtml(crew.name || 'new person')}" value="${escapeHtml(crew[property])}">`;
  const crewSelect = (crew, property, options) =>
    select(crew[property], options, `data-kind="crew" data-id="${crew.id}" data-field="${property}" aria-label="${escapeHtml(property)} for ${escapeHtml(crew.name || 'new person')}"`);
  const recordInput = (kind, record, property, type = 'text') =>
    `<input type="${type}" data-kind="${kind}" data-id="${record.id}" data-field="${property}" aria-label="${escapeHtml(property)}" value="${escapeHtml(record[property])}">`;

  function flightTable(crew) {
    return `<div class="hf-subhead"><b>Flights for ${escapeHtml(crew.name || 'this person')}</b><button type="button" class="secondary" data-action="add-flight" data-id="${crew.id}">+ Add flight</button></div>
      <table class="table hf-nested-table"><thead><tr><th>No.</th><th>Flight No.</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>Booking ref.</th><th></th></tr></thead><tbody>
      ${crew.flights.length ? crew.flights.map((flight, index) => `<tr><td>${index + 1}</td><td>${recordInput('flight', flight, 'number')}</td><td>${recordInput('flight', flight, 'from')}</td><td>${recordInput('flight', flight, 'to')}</td><td>${recordInput('flight', flight, 'departure', 'datetime-local')}</td><td>${recordInput('flight', flight, 'arrival', 'datetime-local')}</td><td>${recordInput('flight', flight, 'booking')}</td><td><button type="button" class="hf-plain hf-danger" data-action="delete-flight" data-id="${flight.id}" data-person="${crew.id}" aria-label="Remove flight ${index + 1}">×</button></td></tr>`).join('') : '<tr><td colspan="8" class="small">No flights added for this person.</td></tr>'}
      </tbody></table>`;
  }
  function personDetails(crew) {
    return `<tr class="hf-person-details"><td colspan="10"><div class="hf-person-grid">
      <div><h4>Details & Immigration · ${escapeHtml(crew.name || 'New person')}</h4><div class="hf-immigration-grid">
        <label>Category ${crewSelect(crew, 'change', categories)}</label>
        <label>Visa / permission ${crewInput(crew, 'visa')}</label><label>BG / OKTB ${crewInput(crew, 'bg')}</label>
        <label>Status ${crewSelect(crew, 'immigrationStatus', ['Not started', 'Documents pending', 'Submitted', 'Approved', 'Completed'])}</label>
        <label>Submitted date ${crewInput(crew, 'submitted', 'date')}</label><label class="hf-wide">Notes ${crewInput(crew, 'immigrationNotes')}</label>
      </div></div><div class="hf-flight-area">${flightTable(crew)}</div></div></td></tr>`;
  }
  function crewTable(change) {
    const list = activeJob.crew.filter(crew => crew.change === change);
    const open = activeJob.groupOpen[change];
    return `<section class="hf-crew-group"><div class="hf-group-head"><button type="button" class="hf-group-toggle" data-action="toggle-group" data-change="${escapeHtml(change)}" aria-expanded="${Boolean(open)}"><span class="hf-chevron">${open ? '▾' : '▸'}</span>${escapeHtml(change)} <span class="small">(${list.length})</span></button><button type="button" class="secondary" data-action="add-crew" data-change="${escapeHtml(change)}">+ Add</button></div>
      ${open ? `<div class="table-wrap"><table class="table hf-crew-table"><thead><tr><th>No.</th><th>Name · Surname</th><th>Nationality</th><th>Rank</th><th>Date of Birth</th><th>Seaman Book</th><th>Passport</th><th>PP. Exp.</th><th>Details</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((crew, index) => `<tr><td>${index + 1}</td><td>${crewInput(crew, 'name')}</td><td>${crewInput(crew, 'nationality')}</td><td>${crewInput(crew, 'rank')}</td><td>${crewInput(crew, 'dob', 'date')}</td><td>${crewInput(crew, 'seamanBook')}</td><td>${crewInput(crew, 'passport')}</td><td>${crewInput(crew, 'passportExpiry', 'date')}</td><td><button type="button" class="hf-plain" data-action="toggle-person" data-id="${crew.id}" aria-expanded="${Boolean(activeJob.personOpen[crew.id])}">${activeJob.personOpen[crew.id] ? 'Hide' : 'Flight / Immigration'}</button></td><td><button type="button" class="hf-plain hf-danger" data-action="delete-crew" data-id="${crew.id}" aria-label="Remove ${escapeHtml(crew.name || 'person ' + (index + 1))}">×</button></td></tr>${activeJob.personOpen[crew.id] ? personDetails(crew) : ''}`).join('') : '<tr><td colspan="10" class="small">No people in this group yet.</td></tr>'}</tbody></table></div>` : ''}</section>`;
  }
  function transportTable(kind, title) {
    const list = kind === 'car' ? activeJob.cars : activeJob.boats;
    return `<section class="hf-transport"><div class="hf-group-head"><h3>${title} <span class="small">(${list.length})</span></h3><button type="button" class="secondary" data-action="add-transport" data-kind="${kind}">+ Add ${kind === 'car' ? 'car' : 'boat'} trip</button></div>
      <div class="table-wrap"><table class="table hf-transport-table"><thead><tr><th>No.</th><th>Person / Passengers</th><th>Date & time</th><th>From</th><th>To</th><th>${kind === 'car' ? 'Driver / Vehicle' : 'Boat / Supplier'}</th><th>Reference / Notes</th><th></th></tr></thead><tbody>
      ${list.length ? list.map((record, index) => `<tr><td>${index + 1}</td><td>${recordInput(kind, record, 'passenger')}</td><td>${recordInput(kind, record, 'date', 'datetime-local')}</td><td>${recordInput(kind, record, 'from')}</td><td>${recordInput(kind, record, 'to')}</td><td>${recordInput(kind, record, 'supplier')}</td><td>${recordInput(kind, record, 'reference')}</td><td><button type="button" class="hf-plain hf-danger" data-action="delete-transport" data-kind="${kind}" data-id="${record.id}" aria-label="Remove ${kind} trip ${index + 1}">×</button></td></tr>`).join('') : `<tr><td colspan="8" class="small">No ${kind} trips added.</td></tr>`}</tbody></table></div></section>`;
  }
  function travelTable() {
    return `<p class="small">Flight details are recorded under each person in Crew members and Visitors. Record road and boat transfers below.</p>${transportTable('car', 'Car / Transport')}${transportTable('boat', 'Boat / Launch')}`;
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
      <div class="meta">Crew members and visitors · ${escapeHtml(activeJob.port)} · PIC: Thanaphon</div>
      <div class="tabs hf-tabs" role="tablist" aria-label="Crew change sections">${[['crew', 'Crew members and Visitors'], ['travel', 'Travel'], ['checklist', 'Checklist']].map(([key, label]) => `<button type="button" role="tab" aria-selected="${activeTab === key}" class="tab ${activeTab === key ? 'active' : ''}" data-action="tab" data-tab="${key}">${label}</button>`).join('')}</div>
      <div role="tabpanel" class="hf-tab-panel">${activeTab === 'crew' ? categories.map(crewTable).join('') : activeTab === 'travel' ? travelTable() : checklist()}</div>
      <p class="hf-demo-note">Demo only — details are kept in this page until it is refreshed. Do not enter real personal documents here.</p>
    `;
  }
  detailDrawer.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'close-crew') detailDrawer.classList.remove('open');
    if (button.dataset.action === 'tab') { activeTab = button.dataset.tab; renderCrew(); }
    if (button.dataset.action === 'toggle-group') {
      activeJob.groupOpen[button.dataset.change] = !activeJob.groupOpen[button.dataset.change];
      renderCrew();
    }
    if (button.dataset.action === 'toggle-person') {
      activeJob.personOpen[button.dataset.id] = !activeJob.personOpen[button.dataset.id];
      renderCrew();
    }
    if (button.dataset.action === 'add-crew') {
      const crew = makeCrew({ change: button.dataset.change });
      activeJob.crew.push(crew);
      activeJob.groupOpen[button.dataset.change] = true;
      renderCrew();
      detailDrawer.querySelector(`[data-kind="crew"][data-id="${crew.id}"][data-field="name"]`)?.focus();
    }
    if (button.dataset.action === 'delete-crew') {
      activeJob.crew = activeJob.crew.filter(crew => crew.id !== button.dataset.id);
      renderCrew();
    }
    if (button.dataset.action === 'add-flight') {
      const crew = activeJob.crew.find(person => person.id === button.dataset.id);
      if (crew) { crew.flights.push(makeFlight()); renderCrew(); }
    }
    if (button.dataset.action === 'delete-flight') {
      const crew = activeJob.crew.find(person => person.id === button.dataset.person);
      if (crew) { crew.flights = crew.flights.filter(flight => flight.id !== button.dataset.id); renderCrew(); }
    }
    if (button.dataset.action === 'add-transport') {
      (button.dataset.kind === 'car' ? activeJob.cars : activeJob.boats).push(makeTransport());
      renderCrew();
    }
    if (button.dataset.action === 'delete-transport') {
      const list = button.dataset.kind === 'car' ? activeJob.cars : activeJob.boats;
      const index = list.findIndex(record => record.id === button.dataset.id);
      if (index !== -1) { list.splice(index, 1); renderCrew(); }
    }
  });
  function updateRecord(event) {
    const { kind, id: recordId, field } = event.target.dataset;
    if (!kind || !recordId || !field) return;
    const list = kind === 'crew' ? activeJob.crew : kind === 'car' ? activeJob.cars : kind === 'boat' ? activeJob.boats : activeJob.crew.flatMap(person => person.flights);
    const record = list.find(item => item.id === recordId);
    if (record) record[field] = event.target.value;
  }
  detailDrawer.addEventListener('input', updateRecord);
  detailDrawer.addEventListener('change', event => {
    updateRecord(event);
    if (event.target.dataset.field === 'change') {
      activeJob.groupOpen[event.target.value] = true;
      renderCrew();
    }
    if (event.target.dataset.check !== undefined) {
      activeJob.checklist[Number(event.target.dataset.check)] = event.target.checked;
      renderCrew();
    }
  });
})();

