/* Interactive demo state. No crew identity data is written to browser storage. */
(() => {
  const jobDrawer = document.getElementById('drawer');
  const detailDrawer = document.getElementById('crewDrawer');
  const jobs = new Map();
  const jobStorageKey = 'harborflow-job-metadata-v1';
  let savedJobs = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(jobStorageKey) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) savedJobs = parsed;
  } catch { /* Private browsing or invalid saved data: keep the in-memory demo usable. */ }
  const savedFields = ['jobNo', 'eta', 'etb', 'etd', 'principal'];
  function persistJob(job) {
    const data = Object.fromEntries(savedFields.map(field => [field, job[field] || '']));
    if (job.key.startsWith('created-')) {
      Object.assign(data, {
        name: job.name, port: job.port, status: job.status,
        githubPath: job.githubPath, services: job.services.map(service => ({
          name: service.name, status: service.status
        }))
      });
    }
    savedJobs[job.key] = data;
    try { localStorage.setItem(jobStorageKey, JSON.stringify(savedJobs)); return true; }
    catch { return false; }
  }
  let activeJob;
  let activeService;
  let activeTab = 'crew';
  let editingService = null;
  let auth = { configured: false, authenticated: false };
  let syncMessage = 'Checking GitHub access…';
  const loadedCrew = new Set();
  let nextId = 1;
  const categories = ['On-signers', 'Off-signers', 'Medical visitors', 'SIRE Inspectors', 'Surveyors', 'Service Engineers', 'Other'];

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const id = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + String(nextId++);
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
    passport: '', passportIssue: '', passportExpiry: '',
    seamanBook: '', seamanBookIssue: '', seamanBookExpiry: '', status: 'Not started',
    otherCategory: '', visaTr: false, visaC: false, visaArrival: false,
    oktb: false, bg: false, ex: false, immigrationStatus: 'Not started',
    immigrationNotes: '', attachments: {}, flights: [], ...data
  });
  const makeFlight = () => ({ id: id(), airline: '', number: '', date: '', from: '', to: '', departure: '', arrival: '', booking: '', attachments: {} });
  const makeTransport = () => ({ id: id(), passenger: '', date: '', from: '', to: '', supplier: '', reference: '' });
  const field = (label, value, data, type = 'text') =>
    `<label class="hf-field"><span>${label}</span><input type="${type}" ${data} value="${escapeHtml(value)}"></label>`;
  const select = (value, options, data) =>
    `<select ${data}>${options.map(option => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;

  function getJob(button) {
    const key = button.dataset.jobId || `${button.dataset.name}|${button.dataset.port}|${button.closest('.day')?.querySelector('.num')?.textContent || ''}`;
    if (!jobs.has(key)) {
      const oceanPride = button.dataset.name === 'MT Ocean Pride';
      const saved = savedJobs[key] || {};
      const day = String(button.closest('.day')?.querySelector('.num')?.textContent || '22').padStart(2, '0');
      jobs.set(key, {
        key, name: button.dataset.name, port: button.dataset.port, status: button.dataset.status,
        jobNo: oceanPride ? 'GAC-260922-001' : '',
        eta: oceanPride ? `2026-09-${day}T08:00` : '',
        etb: oceanPride ? `2026-09-${day}T12:00` : '',
        etd: oceanPride ? '2026-09-24T18:00' : '',
        principal: oceanPride ? 'Ocean Shipping Ltd.' : '',
        ...Object.fromEntries(savedFields.map(field => [field, Object.prototype.hasOwnProperty.call(saved, field) ? String(saved[field] ?? '') : (oceanPride ? ({
          jobNo: 'GAC-260922-001', eta: `2026-09-${day}T08:00`,
          etb: `2026-09-${day}T12:00`, etd: '2026-09-24T18:00',
          principal: 'Ocean Shipping Ltd.'
        })[field] : '')])),
        services: oceanPride ? [
          makeService('Port clearance', 'Operations', 'Done'),
          makeService('Crew change', '2 crew members · Immigration documents', 'Pending'),
          makeService('Fresh water', '100 MT · Supplier confirmed', 'Confirmed'),
          makeService('CTM', 'Prefund verification', 'Action needed')
        ] : [],
        crew: oceanPride ? [
          makeCrew({ name: 'Sample crew member A', nationality: 'Filipino', rank: 'Master', change: 'Off-signers', status: 'Docs pending' }),
          makeCrew({ name: 'Sample crew member B', nationality: 'Indian', rank: '2nd Engineer', change: 'On-signers', status: 'Submitted' })
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
  createdJobsPanel.innerHTML = '<div class="panel-head"><h2>Jobs saved in this browser</h2><span class="small">Job details only; crew data resets on reload</span></div><div id="hfCreatedJobs"></div>';
  document.querySelector('#operations').appendChild(createdJobsPanel);
  const createdJobs = createdJobsPanel.querySelector('#hfCreatedJobs');
  function renderCreatedJobs() {
    createdJobs.innerHTML = [...jobs.entries()].filter(([key]) => key.startsWith('created-')).map(([key, job]) =>
      `<button type="button" class="job blue" data-job-id="${escapeHtml(key)}" data-name="${escapeHtml(job.name)}" data-port="${escapeHtml(job.port)}" data-status="${escapeHtml(job.status)}"><b>${escapeHtml(job.name)}</b><small>${escapeHtml(job.port)} · ${escapeHtml(job.eta.replace('T', ' '))} · ${escapeHtml(job.services.map(service => service.name).join(', '))}</small></button>`
    ).join('') || '<p class="small">No jobs created yet.</p>';
    createdJobs.querySelectorAll('.job').forEach(button => button.addEventListener('click', () => openJob(button)));
  }
  Object.entries(savedJobs).filter(([key, job]) => key.startsWith('created-') && job && job.name)
    .forEach(([key, saved]) => jobs.set(key, {
      key, name: saved.name, port: saved.port || '', status: saved.status || 'Planned',
      jobNo: saved.jobNo || '', eta: saved.eta || '', etb: saved.etb || '',
      etd: saved.etd || '', principal: saved.principal || '',
      githubPath: saved.githubPath || '',
      services: Array.isArray(saved.services) ? saved.services.map(service =>
        makeService(String(service.name || 'General'), '', String(service.status || 'Pending'))) : [],
      crew: [], groupOpen: Object.fromEntries(categories.map(category => [category, true])),
      personOpen: {}, cars: [], boats: [], checklist: [false, false, false, false]
    }));
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
    const jobId = 'created-' + Date.now().toString(36) + '-' + id();
    const date = new Date(eta);
    const jobNo = `HF-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(Object.keys(savedJobs).filter(key => key.startsWith('created-')).length + 1).padStart(3, '0')}`;
    jobs.set(jobId, {
      key: jobId, name, eta, etb: '', etd: '', principal, imo: String(data.get('imo') || '').trim(),
      port: String(data.get('port') || ''), notes: String(data.get('notes') || '').trim(),
      status: 'Planned', jobNo, githubPath: jobPath({ name, eta, jobNo }),
      services: [makeService(String(data.get('service') || 'General'), '', 'Pending')],
      crew: [], groupOpen: Object.fromEntries(categories.map(category => [category, true])),
      personOpen: {}, cars: [], boats: [], checklist: [false, false, false, false]
    });
    const saved = persistJob(jobs.get(jobId));
    renderCreatedJobs();
    event.currentTarget.reset();
    document.querySelector('#modal').classList.remove('open');
    notify(saved ? 'Job saved in this browser' : 'Job created for this session; browser storage unavailable');
  }, true);

  function renderJob() {
    jobDrawer.innerHTML = `
      <button type="button" class="close" data-action="close-job" aria-label="Close job details">×</button>
      <h2>${escapeHtml(activeJob.name)}</h2>
      <div class="meta">${escapeHtml(activeJob.port)}${activeJob.eta ? ' · ' + escapeHtml(activeJob.eta.replace('T', ' ')) : ''}</div>
      <span class="tag green">${escapeHtml(activeJob.status)}</span>
      <form id="hfJobDetailsForm" class="hf-job-details-form">
        <div class="hf-job-details-grid">
          ${field('Job No.', activeJob.jobNo, 'name="jobNo" required')}
          ${field('ETA', activeJob.eta, 'name="eta"', 'datetime-local')}
          ${field('ETB', activeJob.etb, 'name="etb"', 'datetime-local')}
          ${field('ETD', activeJob.etd, 'name="etd"', 'datetime-local')}
          ${field('Principal', activeJob.principal, 'name="principal"')}
          <div class="hf-field"><span>PIC</span><b>${activeJob.key.startsWith('created-') ? 'Not assigned' : 'Thanaphon'}</b></div>
        </div>
        <div class="hf-actions"><button type="submit" class="primary">Save job details</button></div>
        <p class="small">Job details are saved in this browser. Crew identity data is not saved after reload.</p>
      </form>
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
      ${activeJob.key.startsWith('created-') ? '<p class="small">No tasks or documents have been recorded for this job.</p>' : `
      <div class="line-item"><b>Tasks: 8 / 11 complete</b><span>Visa confirmation overdue · Supplier follow-up due 23 Sep</span></div>
      <div class="line-item"><b>Documents: 7 / 8 received</b><span>Missing: immigration confirmation</span></div>
      <div class="line-item"><b>Latest activity</b><span>22 Sep 14:05 — ETA amended by Thanaphon</span></div>`}
    `;
  }

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
          if (activeJob.key.startsWith('created-')) persistJob(activeJob);
          renderJob();
          renderCreatedJobs();
        }
        break;
      case 'open-service':
        if (!service) break;
        activeService = service;
        if (service.name.trim().toLowerCase() === 'crew change') {
          activeTab = 'crew';
          renderCrew();
          detailDrawer.classList.add('open');
          loadCrew();
        } else {
          editingService = service;
          renderJob();
          jobDrawer.querySelector('[name="name"]').focus();
        }
        break;
    }
  });
  jobDrawer.addEventListener('submit', event => {
    if (event.target.id === 'hfJobDetailsForm') {
      event.preventDefault();
      const data = new FormData(event.target);
      const jobNo = String(data.get('jobNo') || '').trim();
      if (!jobNo) return;
      const eta = String(data.get('eta') || '');
      const etb = String(data.get('etb') || '');
      const etd = String(data.get('etd') || '');
      if ((eta && etb && etb < eta) || (eta && etd && etd < eta) || (etb && etd && etd < etb)) {
        notify('ETB and ETD must be after ETA');
        return;
      }
      for (const field of savedFields) activeJob[field] = String(data.get(field) || '').trim();
      activeJob.jobNo = jobNo;
      if (activeJob.githubPath) activeJob.githubPath = jobPath(activeJob);
      const saved = persistJob(activeJob);
      renderJob();
      renderCreatedJobs();
      notify(saved ? 'Job details saved in this browser' : 'Job details updated for this session; browser storage unavailable');
      return;
    }
    if (event.target.id !== 'hfServiceForm') return;
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get('name') || '').trim();
    if (!name) return;
    if (editingService === 'new') activeJob.services.push(makeService(name, String(data.get('note') || '').trim(), String(data.get('status'))));
    else Object.assign(editingService, { name, note: String(data.get('note') || '').trim(), status: String(data.get('status')) });
    editingService = null;
    if (activeJob.key.startsWith('created-')) persistJob(activeJob);
    renderJob();
    renderCreatedJobs();
  });

  const crewInput = (crew, property, type = 'text') =>
    `<input type="${type}" data-kind="crew" data-id="${crew.id}" data-field="${property}" aria-label="${escapeHtml(property)} for ${escapeHtml(crew.name || 'new person')}" value="${escapeHtml(crew[property])}">`;
  const crewSelect = (crew, property, options) =>
    select(crew[property], options, `data-kind="crew" data-id="${crew.id}" data-field="${property}" aria-label="${escapeHtml(property)} for ${escapeHtml(crew.name || 'new person')}"`);
  const recordInput = (kind, record, property, type = 'text') =>
    `<input type="${type}" data-kind="${kind}" data-id="${record.id}" data-field="${property}" aria-label="${escapeHtml(property)}" value="${escapeHtml(record[property])}">`;
  const flightInput = (flight, property, placeholder, maxLength) =>
    `<input type="text" data-kind="flight" data-id="${flight.id}" data-field="${property}" aria-label="${escapeHtml(property)}" placeholder="${placeholder}" maxlength="${maxLength}" value="${escapeHtml(flight[property])}">`;
  const crewCheck = (crew, property, label) =>
    `<label class="hf-visa-option"><input type="checkbox" data-kind="crew" data-id="${crew.id}" data-field="${property}" ${crew[property] ? 'checked' : ''}><span>${label}</span></label>`;

  function flightTable(crew) {
    return `<div class="hf-subhead"><b>Flights for ${escapeHtml(crew.name || 'this person')}</b><button type="button" class="secondary" data-action="add-flight" data-id="${crew.id}">+ Add flight</button></div>
      <div class="table-wrap"><table class="table hf-nested-table"><thead><tr><th>No.</th><th>Airline</th><th>Flight No.</th><th>Date</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>Booking ref.</th><th></th></tr></thead><tbody>
      ${crew.flights.length ? crew.flights.map((flight, index) => `<tr><td>${index + 1}</td><td>${flightInput(flight, 'airline', '6E', 3)}</td><td>${flightInput(flight, 'number', '1347', 6)}</td><td>${flightInput(flight, 'date', '17SEP', 7)}</td><td>${flightInput(flight, 'from', 'DEL', 3)}</td><td>${flightInput(flight, 'to', 'BKK', 3)}</td><td>${flightInput(flight, 'departure', '0650', 4)}</td><td>${flightInput(flight, 'arrival', '1250', 4)}</td><td>${recordInput('flight', flight, 'booking')}${attachmentControl(flight, 'flight', 'Flight', crew.id)}</td><td><button type="button" class="hf-plain hf-danger" data-action="delete-flight" data-id="${flight.id}" data-person="${crew.id}" aria-label="Remove flight ${index + 1}">×</button></td></tr>`).join('') : '<tr><td colspan="10" class="small">No flights added for this person.</td></tr>'}
      </tbody></table></div>`;
  }
  function attachmentControl(record, type, label, personId = '') {
    const file = record.attachments?.[type];
    return `<div class="hf-attachment"><button type="button" class="secondary" data-action="attach" data-id="${record.id}" data-person="${personId || record.id}" data-type="${type}">+ Attach file</button>${file ? `<span title="${escapeHtml(file.path || '')}">${escapeHtml(file.name)}</span>` : ''}</div>`;
  }
  function personDetails(crew) {
    return `<tr class="hf-person-details"><td colspan="9"><div class="hf-person-grid">
      <div><h4>Details & Immigration · ${escapeHtml(crew.name || 'New person')}</h4><div class="hf-immigration-grid">
        <label class="hf-category-field">Category ${crewSelect(crew, 'change', categories)}</label>
        <fieldset class="hf-visa-options"><legend>Visa / permission</legend>
          ${crewCheck(crew, 'visaTr', 'VISA-TR')}
          ${crewCheck(crew, 'visaC', 'VISA-C')}
          ${crewCheck(crew, 'visaArrival', 'VISA-ARRIVAL')}
          ${crewCheck(crew, 'oktb', 'OKTB')}
          ${crewCheck(crew, 'bg', 'BG.')}
          ${crewCheck(crew, 'ex', 'EX')}
          ${attachmentControl(crew, 'visa', 'Visa / permission')}
        </fieldset>
        <label class="hf-status-field">Status ${crewSelect(crew, 'immigrationStatus', ['Not started', 'Documents pending', 'Submitted', 'Approved', 'Completed'])}</label>
        ${crew.change === 'Other' ? `<label class="hf-other-field">Other category <input type="text" data-kind="crew" data-id="${crew.id}" data-field="otherCategory" placeholder="Type category" value="${escapeHtml(crew.otherCategory)}"></label>` : ''}
        <label class="hf-notes-field">Notes ${crewInput(crew, 'immigrationNotes')}</label>
      </div></div><div class="hf-flight-area">${flightTable(crew)}</div></div></td></tr>`;
  }
  function crewTable(change) {
    const list = activeJob.crew.filter(crew => crew.change === change);
    const open = activeJob.groupOpen[change];
    return `<section class="hf-crew-group"><div class="hf-group-head"><button type="button" class="hf-group-toggle" data-action="toggle-group" data-change="${escapeHtml(change)}" aria-expanded="${Boolean(open)}"><span class="hf-chevron">${open ? '▾' : '▸'}</span>${escapeHtml(change)} <span class="small">(${list.length})</span></button><button type="button" class="secondary" data-action="add-crew" data-change="${escapeHtml(change)}">+ Add</button></div>
      ${open ? `<div class="table-wrap"><table class="table hf-crew-table"><thead><tr><th>No.</th><th>Name · Surname</th><th>Nationality</th><th>Rank</th><th>Date of Birth</th><th>Passport · dates</th><th>Seaman Book · dates</th><th>Details</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((crew, index) => `<tr><td>${index + 1}</td><td>${crewInput(crew, 'name')}${crew.change === 'Other' && crew.otherCategory ? `<small>${escapeHtml(crew.otherCategory)}</small>` : ''}</td><td>${crewInput(crew, 'nationality')}</td><td>${crewInput(crew, 'rank')}</td><td>${crewInput(crew, 'dob', 'date')}</td><td><div class="hf-document-fields">${crewInput(crew, 'passport')}<div class="hf-date-pair"><label>Issue ${crewInput(crew, 'passportIssue', 'date')}</label><label>Expiry ${crewInput(crew, 'passportExpiry', 'date')}</label></div>${attachmentControl(crew, 'passport', 'Passport')}</div></td><td><div class="hf-document-fields">${crewInput(crew, 'seamanBook')}<div class="hf-date-pair"><label>Issue ${crewInput(crew, 'seamanBookIssue', 'date')}</label><label>Expiry ${crewInput(crew, 'seamanBookExpiry', 'date')}</label></div>${attachmentControl(crew, 'seamanBook', 'Seaman Book')}</div></td><td><button type="button" class="hf-plain" data-action="toggle-person" data-id="${crew.id}" aria-expanded="${Boolean(activeJob.personOpen[crew.id])}">${activeJob.personOpen[crew.id] ? 'Hide' : 'Flight / Immigration'}</button></td><td><button type="button" class="hf-plain hf-danger" data-action="delete-crew" data-id="${crew.id}" aria-label="Remove ${escapeHtml(crew.name || 'person ' + (index + 1))}">×</button></td></tr>${activeJob.personOpen[crew.id] ? personDetails(crew) : ''}`).join('') : '<tr><td colspan="9" class="small">No people in this group yet.</td></tr>'}</tbody></table></div>` : ''}</section>`;
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
      ${activeTab === 'crew' ? `<div class="hf-save-bar"><span role="status">${escapeHtml(syncMessage)}</span><div>${auth.authenticated || !auth.configured ? '' : '<a class="secondary hf-sign-in" href="/api/auth?mode=start">Sign in with GitHub</a>'}<button type="button" class="primary" data-action="save-crew" ${auth.authenticated ? '' : 'disabled'}>Save crew data</button></div></div>` : ''}
      <div role="tabpanel" class="hf-tab-panel">${activeTab === 'crew' ? categories.map(crewTable).join('') : activeTab === 'travel' ? travelTable() : checklist()}</div>
      <p class="hf-demo-note">Crew data and attachments are saved in the private GitHub job documents repository after you select Save.</p>
    `;
  }
  const attachmentInput = document.createElement('input');
  attachmentInput.type = 'file';
  attachmentInput.accept = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
  attachmentInput.hidden = true;
  document.body.appendChild(attachmentInput);
  let attachmentTarget = null;
  function jobPayload() {
    return { name: activeJob.name, jobNo: activeJob.jobNo, eta: activeJob.eta };
  }
  async function api(path, options) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body.error || `Request failed (${response.status})`);
    return body;
  }
  async function loadCrew() {
    const job = activeJob, service = activeService;
    try {
      auth = await api('/api/auth?mode=status');
      if (!auth.authenticated) {
        syncMessage = auth.configured ? 'Sign in as primoxy-dev to load and save crew data.' : 'Private GitHub storage needs server configuration.';
        renderCrew();
        return;
      }
      const key = `${job.key}:${service.name}`;
      if (loadedCrew.has(key)) { syncMessage = 'Crew records loaded from GitHub.'; renderCrew(); return; }
      syncMessage = 'Loading crew records from GitHub…';
      renderCrew();
      const query = new URLSearchParams({ vessel: job.name, jobNo: job.jobNo, eta: job.eta, service: service.name });
      const data = await api('/api/crew?' + query);
      if (activeJob !== job || activeService !== service) return;
      job.crew = data.crew;
      loadedCrew.add(key);
      job.crew.forEach(person => {
        if (!person.attachments) person.attachments = {};
        if (!Array.isArray(person.flights)) person.flights = [];
        person.flights.forEach(flight => { if (!flight.attachments) flight.attachments = {}; });
      });
      syncMessage = 'Crew records loaded from GitHub.';
      renderCrew();
    } catch (error) {
      syncMessage = error.message;
      renderCrew();
    }
  }
  async function saveCrew() {
    if (!auth.authenticated) return;
    syncMessage = 'Saving crew records…';
    renderCrew();
    try {
      const result = await api('/api/crew', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: jobPayload(), service: activeService.name, crew: activeJob.crew })
      });
      syncMessage = `Saved to private GitHub: ${result.path}`;
      renderCrew();
    } catch (error) {
      syncMessage = 'Save failed: ' + error.message;
      renderCrew();
    }
  }
  function selectAttachment(button) {
    if (!auth.authenticated) { syncMessage = 'Sign in as primoxy-dev before attaching files.'; renderCrew(); return; }
    const person = activeJob.crew.find(item => item.id === button.dataset.person);
    if (!person) return;
    const record = button.dataset.type === 'flight' ? person.flights.find(item => item.id === button.dataset.id) : person;
    if (!record) return;
    attachmentTarget = { person, record, type: button.dataset.type };
    attachmentInput.value = '';
    attachmentInput.click();
  }
  attachmentInput.addEventListener('change', async () => {
    const file = attachmentInput.files?.[0];
    const target = attachmentTarget;
    if (!file || !target) return;
    if (file.size > 5 * 1024 * 1024) { syncMessage = 'File must be smaller than 5 MB.'; renderCrew(); return; }
    syncMessage = `Uploading ${file.name}…`;
    renderCrew();
    try {
      const contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(Error('Cannot read the selected file'));
        reader.readAsDataURL(file);
      });
      const data = await api('/api/attachment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: jobPayload(), service: activeService.name, person: target.person,
          personId: target.person.id, recordId: target.record.id,
          type: target.type, filename: file.name, mimeType: file.type, contentBase64
        })
      });
      target.record.attachments ||= {};
      target.record.attachments[target.type] = data.attachment;
      await saveCrew();
    } catch (error) {
      syncMessage = 'Upload failed: ' + error.message;
      renderCrew();
    }
  });
  detailDrawer.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'close-crew') detailDrawer.classList.remove('open');
    if (button.dataset.action === 'save-crew') saveCrew();
    if (button.dataset.action === 'attach') selectAttachment(button);
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
    if (record) record[field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
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

