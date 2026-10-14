/* Crew Training trial: fictional or de-identified records only. No browser storage. */
(() => {
  const tabs = ['Overview', 'Calendar', 'Crew', 'Training Matrix', 'Courses & Sessions', 'Certificates'];
  const state = { root: null, tab: 'Overview', vesselId: '', vessels: [],
    crew: [], courses: [], sessions: [], enrollments: [], certificates: [], rules: [] };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = value => value ? esc(String(value).slice(0, 10)) : '—';
  const stamp = value => value ? esc(new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok'
  })) + ' ICT' : '—';
  const option = (id, label) => `<option value="${esc(id)}">${esc(label)}</option>`;
  const crewOptions = () => state.crew.map(c => option(c.id, c.display_name + ' · ' + c.rank)).join('');
  const courseOptions = () => state.courses.map(c => option(c.id, c.code + ' · ' + c.name)).join('');
  const sessionOptions = () => state.sessions.filter(s => s.state !== 'cancelled').map(s =>
    option(s.id, (state.courses.find(c => c.id === s.course_id)?.code || 'Course') + ' · ' + stamp(s.starts_at))).join('');
  const vesselOptions = () => state.vessels.map(v => option(v.id, v.name)).join('');
  const box = (label, name, attrs = '') => `<label>${label}<input name="${name}" ${attrs}></label>`;
  const select = (label, name, options) => `<label>${label}<select name="${name}" required>${options}</select></label>`;
  const submit = label => `<button class="primary" type="submit">${label}</button>`;
  const message = (text, kind = '') => {
    const node = state.root?.querySelector('#trainingMessage');
    if (node) { node.textContent = text; node.dataset.kind = kind; }
  };

  async function api(action, params = {}) {
    const url = new URL('/api/training', location.origin);
    url.searchParams.set('action', action);
    const scoped = state.vesselId || params.vesselId;
    if (scoped) url.searchParams.set('vesselId', scoped);
    for (const [key, value] of Object.entries(params)) if (value != null && key !== 'vesselId') url.searchParams.set(key, value);
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = Error(data.error || 'Could not load Crew Training');
      failure.status = response.status;
      failure.conflicts = data.conflicts;
      throw failure;
    }
    return data;
  }
  async function post(action, payload) {
    const response = await fetch('/api/training', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, vesselId: state.vesselId || undefined, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = Error(data.error || 'Save failed');
      failure.conflicts = data.conflicts;
      throw failure;
    }
    return data;
  }
  async function upload(form) {
    const body = new FormData(form);
    body.set('action', 'certificates.upload');
    if (state.vesselId) body.set('vesselId', state.vesselId);
    const response = await fetch('/api/training', { method: 'POST', credentials: 'same-origin', body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || 'Upload failed');
    return data;
  }
  const formData = form => Object.fromEntries(new FormData(form).entries());
  const empty = text => `<p class="training-empty">${esc(text)}</p>`;
  const header = (title, note) => `<div class="training-section-head"><div><h3>${title}</h3><p>${note}</p></div></div>`;

  function shell(root) {
    root.innerHTML = `<div class="training-workspace">
      <div class="training-banner" role="note"><strong>Crew Training · Online trial</strong>
        <span>ใช้เฉพาะข้อมูลสมมติหรือข้อมูลที่ตัดตัวตนแล้ว ยังไม่รองรับข้อมูลลูกเรือจริงและการทำงานออฟไลน์</span></div>
      <div class="training-toolbar"><label>Vessel <select id="trainingVessel"><option value="">All vessels</option></select></label>
        <button class="secondary" type="button" data-training-refresh>Refresh</button></div>
      <div class="training-tabs" role="tablist" aria-label="Crew Training views">
        ${tabs.map(t => `<button type="button" role="tab" data-training-tab="${esc(t)}"
          aria-selected="${t === state.tab}">${esc(t)}</button>`).join('')}</div>
      <p id="trainingMessage" class="training-message" role="status" aria-live="polite"></p>
      <div id="trainingBody" class="training-body" aria-live="polite"></div>
    </div>`;
  }
  async function loadVessels() {
    const data = await api('vessels.list');
    state.vessels = data.vessels || [];
    if (state.vesselId && !state.vessels.some(v => v.id === state.vesselId)) state.vesselId = '';
    if (!state.vesselId && state.vessels.length === 1) state.vesselId = state.vessels[0].id;
    const chooser = state.root.querySelector('#trainingVessel');
    chooser.innerHTML = '<option value="">All vessels</option>' + vesselOptions();
    chooser.value = state.vesselId;
  }
  async function refresh() {
    if (!state.root) return;
    message('Loading…');
    try {
      await loadVessels();
      const data = await Promise.all([
        api('crew.list'), api('courses.list'), api('sessions.list'),
        api('enrollments.list'), api('certificates.list'), api('matrix.list')
      ]);
      [state.crew, state.courses, state.sessions, state.enrollments, state.certificates, state.rules] =
        data.map((row, i) => row[['crew','courses','sessions','enrollments','certificates','rules'][i]] || []);
      await render();
      message('');
    } catch (e) {
      const body = state.root.querySelector('#trainingBody');
      if (e.status === 401) {
        body.innerHTML = '<div class="training-card"><h3>Sign in to use Crew Training</h3><p>Training records are private.</p><a class="primary training-link" href="/api/auth?mode=start">Sign in with GitHub</a></div>';
      } else if (e.status === 403) {
        body.innerHTML = '<div class="training-card"><h3>Training access required</h3><p>Ask the owner for a training grant and vessel assignment.</p></div>';
      } else {
        body.innerHTML = `<div class="training-card" role="alert"><h3>Could not load Crew Training</h3><p>${esc(e.message)}</p></div>`;
      }
      message(e.message, 'error');
    }
  }
  async function render() {
    const body = state.root.querySelector('#trainingBody');
    state.root.querySelectorAll('[data-training-tab]').forEach(button =>
      button.setAttribute('aria-selected', String(button.dataset.trainingTab === state.tab)));
    if (state.tab === 'Overview') {
      const { overview = {}, role } = await api('overview.get');
      const access = role === 'owner' ? await api('grants.list') : { grants: [], assignments: [] };
      body.innerHTML = `${header('Training overview', 'Status for the selected vessel scope')}
        <div class="training-metrics"><div><span>Crew</span><strong>${esc(overview.crew || 0)}</strong></div>
        <div><span>Open sessions</span><strong>${esc(overview.sessions || 0)}</strong></div>
        <div><span>Certificates awaiting review</span><strong>${esc(overview.pendingCertificates || 0)}</strong></div></div>
        <div class="training-card"><h3>Next steps</h3><p>Create a fictional crew profile, assign a vessel, approve a matrix rule,
        schedule a session, record a result, verify a certificate, then check readiness.</p></div>
        ${['owner','coordinator'].includes(role) ? `<div class="training-card"><h3>Add vessel</h3><form data-training-form="vessel-create" class="training-form">
        ${box('Vessel name', 'name', 'required placeholder="MT Fictional"')}${box('Vessel type', 'vesselType', 'required placeholder="Tanker"')}
        ${submit('Add vessel')}</form></div>` : ''}
        ${role === 'owner' ? `<div class="training-grid">
        <div class="training-card"><h3>Training access</h3>
        <form data-training-form="grant-set" class="training-form">
        ${box('GitHub login', 'login', 'required pattern="[a-z0-9-]{1,39}"')}
        ${select('Training role', 'role', ['viewer','coordinator','approver','officer'].map(x => option(x,x)).join(''))}
        ${submit('Set training role')}</form>
        <p class="training-small">Operations Crew permissions do not grant access here.</p></div>
        <div class="training-card"><h3>Assign officer to vessel</h3>
        <form data-training-form="officer-assign" class="training-form">
        ${select('Officer', 'officerLogin', (access.grants || []).filter(g => g.role === 'officer' && !g.revoked_at)
          .map(g => option(g.login,g.login)).join(''))}
        ${select('Vessel', 'vesselId', vesselOptions())}${submit('Assign vessel')}</form></div></div>` : ''}`;
      return;
    }
    if (state.tab === 'Calendar') {
      const sessions = [...state.sessions].sort((a,b) => String(a.starts_at).localeCompare(String(b.starts_at)));
      body.innerHTML = `${header('Training calendar', 'Sessions in the selected vessel scope · times shown in Bangkok time')}
        <div class="training-card"><div class="training-table-wrap"><table><thead><tr><th>Date and time</th><th>Course</th><th>Vessel</th><th>Venue</th><th>State</th></tr></thead>
        <tbody>${sessions.map(s => `<tr><td>${stamp(s.starts_at)}</td><td>${esc(state.courses.find(c => c.id === s.course_id)?.name || s.course_id)}</td>
        <td>${esc(state.vessels.find(v => v.id === s.vessel_id)?.name || 'Shore')}</td><td>${esc(s.venue)}</td><td>${esc(s.state)}</td></tr>`).join('')}</tbody></table></div>
        ${sessions.length ? '' : empty('No sessions yet.')}</div>`;
      return;
    }
    if (state.tab === 'Crew') {
      body.innerHTML = `${header('Crew registry', 'One stable fictional training profile can link to more than one Job')}
        <div class="training-grid"><div class="training-card"><h3>Add crew</h3>
        <form data-training-form="crew-create" class="training-form">
        ${box('Fictional display name', 'displayName', 'required')}${box('Rank', 'rank', 'required')}
        ${box('Department', 'department')}${submit('Add crew')}</form></div>
        <div class="training-card"><h3>Assign crew to vessel</h3>
        <form data-training-form="assignment-create" class="training-form">
        ${select('Crew', 'crewId', crewOptions())}${select('Vessel', 'vesselId', vesselOptions())}
        ${box('Joining date', 'joinsOn', 'type="date"')}${submit('Assign')}</form></div></div>
        <div class="training-card"><h3>Availability</h3>
        <form data-training-form="availability-set" class="training-form">
        ${select('Crew', 'crewId', crewOptions())}
        ${select('Kind', 'kind', ['available','duty','travel','leave'].map(x => option(x,x)).join(''))}
        ${box('Start (ISO with offset)', 'startsAt', 'required placeholder="2026-10-15T09:00+07:00"')}
        ${box('End (ISO with offset)', 'endsAt', 'required placeholder="2026-10-15T17:00+07:00"')}
        ${box('Source', 'source', 'required placeholder="Officer verified"')}${submit('Record availability')}</form></div>
        <div class="training-card"><h3>Readiness by crew</h3>
        <form data-training-form="readiness" class="training-form">
        ${select('Crew', 'crewId', crewOptions())}${box('Selected date', 'onDate', 'type="date" required value="' + new Date().toISOString().slice(0,10) + '"')}
        ${submit('Check readiness')}</form><div id="trainingReadiness"></div></div>
        <div class="training-card"><h3>Crew profiles</h3><div class="training-table-wrap"><table><thead><tr><th>Name</th><th>Rank</th><th>Department</th><th>Version</th></tr></thead>
        <tbody>${state.crew.map(c => `<tr><td>${esc(c.display_name)}</td><td>${esc(c.rank)}</td><td>${esc(c.department)}</td><td>${esc(c.version)}</td></tr>`).join('')}</tbody></table></div>
        ${state.crew.length ? '' : empty('No crew profiles yet.')}</div>`;
      return;
    }
    if (state.tab === 'Training Matrix') {
      body.innerHTML = `${header('Training Matrix', 'Draft requirements need approval before they apply')}
        <div class="training-card"><h3>Draft requirement</h3>
        <form data-training-form="matrix-draft" class="training-form">
        ${select('Course', 'courseId', courseOptions())}${box('Rank (optional)', 'rank')}
        ${box('Vessel type (optional)', 'vesselType')}${select('Vessel', 'vesselId', '<option value="">All vessels</option>' + vesselOptions())}
        ${box('Effective from', 'effectiveFrom', 'type="date" required')}
        ${box('Effective until (exclusive)', 'effectiveUntil', 'type="date"')}
        ${box('Recurrence (months)', 'recurrenceMonths', 'type="number" min="1"')}
        ${box('Days before joining', 'dueDaysBeforeJoin', 'type="number" min="0" value="0"')}
        ${box('Source', 'source', 'required')}${submit('Create draft')}</form></div>
        <div class="training-card"><h3>Rules</h3><div class="training-table-wrap"><table><thead><tr><th>Course</th><th>Rank</th><th>Vessel</th><th>Effective</th><th>Source</th><th>State</th><th>Action</th></tr></thead>
        <tbody>${state.rules.map(r => `<tr><td>${esc(state.courses.find(c => c.id === r.course_id)?.code || r.course_id)}</td>
        <td>${esc(r.rank || 'All')}</td><td>${esc(state.vessels.find(v => v.id === r.vessel_id)?.name || 'All')}</td>
        <td>${date(r.effective_from)} – ${date(r.effective_until)}</td><td>${esc(r.source)}</td><td>${esc(r.state)}</td>
        <td>${r.state === 'draft' ? `<button type="button" data-training-action="approve-rule" data-id="${esc(r.id)}" data-version="${esc(r.version)}">Approve</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        ${state.rules.length ? '' : empty('No matrix rules yet.')}</div>`;
      return;
    }
    if (state.tab === 'Courses & Sessions') {
      body.innerHTML = `${header('Courses & Sessions', 'Propose changes before moving a confirmed session')}
        <div class="training-grid"><div class="training-card"><h3>Add course</h3>
        <form data-training-form="course-create" class="training-form">
        ${box('Code', 'code', 'required')}${box('Course name', 'name', 'required')}
        ${box('Duration (minutes)', 'durationMinutes', 'type="number" min="1" required')}
        ${select('Mode', 'mode', ['shore','onboard','online'].map(x => option(x,x)).join(''))}
        ${box('Source', 'source')}${submit('Add course')}</form></div>
        <div class="training-card"><h3>Plan session</h3>
        <form data-training-form="session-create" class="training-form">
        ${select('Course', 'courseId', courseOptions())}
        ${select('Vessel', 'vesselId', vesselOptions())}
        ${box('Start (ISO with offset)', 'startsAt', 'required placeholder="2026-10-15T09:00+07:00"')}
        ${box('End (ISO with offset)', 'endsAt', 'required placeholder="2026-10-15T12:00+07:00"')}
        ${box('IANA time zone', 'displayZone', 'required value="Asia/Bangkok"')}
        ${box('Instructor', 'instructor')}${box('Venue', 'venue')}
        ${box('Capacity', 'capacity', 'type="number" min="1" required')}${submit('Create draft')}</form></div></div>
        <div class="training-grid"><div class="training-card"><h3>Enroll crew</h3>
        <form data-training-form="enrollment-add" class="training-form">
        ${select('Session', 'sessionId', sessionOptions())}${select('Crew', 'crewId', crewOptions())}
        ${submit('Enroll')}</form></div>
        <div class="training-card"><h3>Record attendance and result</h3>
        <form data-training-form="outcome-record" class="training-form">
        ${select('Enrollment', 'enrollmentId', state.enrollments.map(e => option(e.id, e.display_name + ' · ' + stamp(e.starts_at))).join(''))}
        ${select('Attendance', 'attendance', ['pending','present','absent'].map(x => option(x,x)).join(''))}
        ${select('Assessment', 'assessment', ['pending','passed','failed'].map(x => option(x,x)).join(''))}
        ${box('Assessor', 'assessor', 'required')}${box('Evidence note', 'evidence')}
        ${submit('Record result')}</form></div></div>
        <div class="training-card"><h3>Sessions</h3><div class="training-table-wrap"><table><thead><tr><th>Course</th><th>Start</th><th>Capacity</th><th>State</th><th>Actions</th></tr></thead>
        <tbody>${state.sessions.map(s => `<tr><td>${esc(state.courses.find(c => c.id === s.course_id)?.name || s.course_id)}</td>
        <td>${stamp(s.starts_at)}</td><td>${esc(s.capacity)}</td><td>${esc(s.state)}</td>
        <td><div class="training-actions">${['draft','confirmed'].includes(s.state) ?
          `<button type="button" data-training-action="propose-session" data-id="${esc(s.id)}">Propose change</button>` : ''}
        ${s.state === 'proposed' ? `<button type="button" data-training-action="confirm-session" data-id="${esc(s.id)}">Confirm</button>` : ''}
        ${['draft','proposed','confirmed'].includes(s.state) ? `<button type="button" data-training-action="cancel-session" data-id="${esc(s.id)}">Cancel</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>
        ${state.sessions.length ? '' : empty('No sessions yet.')}</div>`;
      return;
    }
    body.innerHTML = `${header('Certificates', 'Private documents · reviewer verification required')}
      <div class="training-card"><h3>Upload fictional certificate</h3>
      <form data-training-form="certificate-upload" class="training-form" enctype="multipart/form-data">
      ${select('Crew', 'crewId', crewOptions())}${select('Course', 'courseId', courseOptions())}
      ${box('Issuer', 'issuer', 'required')}${box('Issue date', 'issuedOn', 'type="date" required')}
      ${box('Expiry date', 'expiresOn', 'type="date"')}${box('PDF/JPEG/PNG · max 3 MB', 'file', 'type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required')}
      ${submit('Upload')}</form></div>
      <div class="training-card"><h3>Review queue and files</h3><div class="training-table-wrap"><table><thead><tr><th>Crew</th><th>Course</th><th>File</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${state.certificates.map(c => `<tr><td>${esc(state.crew.find(p => p.id === c.crew_id)?.display_name || c.crew_id)}</td>
      <td>${esc(state.courses.find(x => x.id === c.course_id)?.name || c.course_id)}</td>
      <td>${esc(c.file_name)}</td><td>${date(c.expires_on)}</td><td>${esc(c.review_state)}</td>
      <td><div class="training-actions"><a href="/api/training?action=certificates.download&id=${encodeURIComponent(c.id)}${state.vesselId ? '&vesselId=' + encodeURIComponent(state.vesselId) : ''}">Download</a>
      ${c.review_state === 'pending' ? `<button type="button" data-training-action="verify-certificate" data-id="${esc(c.id)}">Verify</button>
      <button type="button" data-training-action="reject-certificate" data-id="${esc(c.id)}">Reject</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>
      ${state.certificates.length ? '' : empty('No certificates yet.')}</div>`;
  }

  async function submitForm(form) {
    const kind = form.dataset.trainingForm;
    const data = formData(form);
    if (kind === 'readiness') {
      const { readiness, requirements } = await api('readiness.get', data);
      state.root.querySelector('#trainingReadiness').innerHTML =
        `<div class="training-result"><strong>${esc(readiness.status)}</strong>
        <span>${esc(requirements.length)} requirement(s)</span>
        <ul>${readiness.reasons.map(r => `<li>${esc(r.detail)}</li>`).join('')}</ul></div>`;
      return;
    }
    if (kind === 'certificate-upload') { await upload(form); return; }
    const actions = {
      'vessel-create': ['vessels.create', { data }],
      'grant-set': ['grants.set', data],
      'officer-assign': ['officers.assign', data],
      'crew-create': ['crew.create', { data }],
      'assignment-create': ['assignments.create', { data }],
      'availability-set': ['availability.set', { crewId: data.crewId, data }],
      'course-create': ['courses.create', { data: { ...data, durationMinutes: Number(data.durationMinutes) } }],
      'matrix-draft': ['matrix.draft', { data: { ...data, recurrenceMonths: data.recurrenceMonths ? Number(data.recurrenceMonths) : null,
        dueDaysBeforeJoin: Number(data.dueDaysBeforeJoin || 0) } }],
      'session-create': ['sessions.create', { data: { ...data, vesselId: data.vesselId || state.vesselId || null,
        capacity: Number(data.capacity) } }],
      'enrollment-add': ['enrollments.add', { sessionId: data.sessionId, crewId: data.crewId,
        idempotencyKey: crypto.randomUUID() }],
      'outcome-record': ['outcomes.record', { enrollmentId: data.enrollmentId, data }]
    };
    const entry = actions[kind];
    if (!entry) throw Error('Unknown form');
    await post(entry[0], entry[1]);
  }
  async function clickAction(button) {
    const action = button.dataset.trainingAction;
    const id = button.dataset.id;
    if (action === 'approve-rule') {
      await post('matrix.approve', { id, version: Number(button.dataset.version) });
    } else if (action === 'verify-certificate' || action === 'reject-certificate') {
      const certificate = state.certificates.find(c => c.id === id);
      const rejected = action === 'reject-certificate';
      const reason = rejected ? prompt('Reason for rejection') : '';
      if (rejected && !reason) return;
      await post('certificates.review', { id, version: certificate.version,
        decision: rejected ? 'rejected' : 'verified', reason });
    } else {
      const session = state.sessions.find(s => s.id === id);
      if (!session) return;
      if (action === 'confirm-session') await post('sessions.confirm', { id, version: session.version });
      if (action === 'cancel-session') {
        const reason = prompt('Reason for cancellation');
        if (!reason) return;
        await post('sessions.cancel', { id, version: session.version, reason });
      }
      if (action === 'propose-session') {
        const startsAt = prompt('New start · ISO with offset (example 2026-10-15T09:00+07:00)');
        if (!startsAt) return;
        const endsAt = prompt('New end · ISO with offset');
        if (!endsAt) return;
        await post('sessions.propose', { id, version: session.version,
          data: { startsAt, endsAt, displayZone: session.display_zone,
            instructor: session.instructor, venue: session.venue } });
      }
    }
  }

  function bind(root) {
    root.addEventListener('click', async event => {
      const tab = event.target.closest('[data-training-tab]');
      if (tab) {
        state.tab = tab.dataset.trainingTab;
        message('Loading…');
        try { await render(); message(''); } catch (e) { message(e.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-training-refresh]')) { await refresh(); return; }
      const action = event.target.closest('[data-training-action]');
      if (action) {
        try { await clickAction(action); await refresh(); message('Saved', 'success'); }
        catch (e) { message(e.conflicts ? e.message + ' · ' + JSON.stringify(e.conflicts) : e.message, 'error'); }
      }
    });
    root.addEventListener('change', event => {
      if (event.target.id === 'trainingVessel') { state.vesselId = event.target.value; refresh(); }
    });
    root.addEventListener('submit', async event => {
      const form = event.target.closest('[data-training-form]');
      if (!form) return;
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      message('Saving…');
      try {
        await submitForm(form);
        if (form.dataset.trainingForm !== 'readiness') { await refresh(); message('Saved', 'success'); }
        else message('');
      } catch (e) { message(e.message, 'error'); }
      finally { button.disabled = false; }
    });
  }
  window.HarborFlowTraining = {
    mount(root) {
      if (state.root !== root) { state.root = root; shell(root); bind(root); }
      refresh();
    },
    refresh
  };
})();

