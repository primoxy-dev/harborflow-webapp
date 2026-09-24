/* Shared terminal restrictions, stored in a private GitHub repository via the API. */
(() => {
  const section = document.getElementById('knowledge');
  if (!section) return;

  const storageKey = 'harborflow-terminal-knowledge-v1';
  const publicCacheKey = 'harborflow-terminal-public-cache-v1';
  const services = [
    ['crew', 'Crew change'], ['supt', 'Supt.'], ['sire', 'SIRE inspector'],
    ['class', 'Class surveyor'], ['engineer', 'Service engineer'],
    ['spare', "Ship’s spare"], ['stores', 'Store / provision'],
    ['medical', 'Medical visit'], ['water', 'F. water supply'],
    ['garbage', 'Garbage / sludge'], ['courier', 'Courier (small)'],
    ['offlandSmall', 'Off-land (small)'], ['offlandHeavy', 'Off-land (heavy)']
  ];
  const initialGroups = [
    ['Map Ta Phut', ['LMPT1', 'LMPT2', 'SPRC', 'SPM', 'PTTGC', 'MTT', 'IRPC', 'TPT', 'TTT', 'GLOW', 'MIT', 'BLCP']],
    ['Laem Chabang', ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'C0', 'C1', 'C2', 'C3']],
    ['Sriracha', ['Kerry Siam Seaport', 'Sriracha Harbour', 'Thaioil', 'Bangchak (Esso)', 'PTT']]
  ];
  const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const blankTerminal = (port, terminal) => ({ id: newId(), port, terminal, restrictions: {}, note: '', source: '', verified: '' });
  const initialState = () => ({ terminals: initialGroups.flatMap(([port, names]) => names.map(name => blankTerminal(port, name))), contacts: [], updated: '' });
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  let legacyDraft = null;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && Array.isArray(saved.terminals) && Array.isArray(saved.contacts) && saved.updated) legacyDraft = saved;
  } catch { /* Browser storage is optional; the server is authoritative. */ }
  let state = initialState();
  let loaded = false, loading = false, remoteEmpty = false, login = null, stale = false, staleExpiresAt = 0;
  let grants = { restrictionEdit: false, contactView: false, contactEdit: false, administrator: false };
  let contactsLoaded = false, contactsError = '';
  const sync = Object.fromEntries(['restrictions', 'contacts'].map(area => [area, { revision: null, changeNumber: 0, savedNumber: 0, saving: false, conflict: false, timer: null }]));
  let syncMessage = 'Loading the shared table…';
  let accessUsers = [], accessRevision = null, accessOpen = false, accessMessage = '';
  let pendingProfile = null;
  let proposals = [], proposalRevision = null, proposalsOpen = false, proposalMessage = '';
  let historyOpen = false, historyArea = 'restrictions', historyRows = [], historyMessage = '';
  const proposalTargets = {};
  const conflictReview = { restrictions: null, contacts: null };
  let activeSubtab = 'restrictions';
  let editingTerminal = null;
  let editingContact = null;

  const canEdit = (area = activeSubtab) => loaded && !stale && (area === 'contacts' ? grants.contactEdit : grants.restrictionEdit) && !sync[area].conflict;
  const hasPending = () => Object.values(sync).some(item => item.changeNumber !== item.savedNumber);
  async function api(path, options) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(Error(body.error || `Request failed (${response.status})`), { status: response.status });
    return body;
  }
  async function loadShared(force = false) {
    if (loading || (loaded && !force)) return;
    if (Object.values(sync).some(item => item.saving)) { syncMessage = 'Wait for the current save to finish before reloading.'; showStorageStatus(); return; }
    if (force && hasPending() && !confirm('Unsaved changes may be lost. Reload shared data?')) return;
    loading = true;
    syncMessage = 'Loading shared Knowledge base…';
    render();
    try {
      const result = await api('/api/knowledge?area=restrictions');
      state.terminals = result.revision ? result.data.terminals : initialState().terminals;
      state.updated = result.data.updated || '';
      remoteEmpty = !result.revision;
      sync.restrictions.revision = result.revision;
      login = result.login;
      grants = result.grants;
      stale = false;
      staleExpiresAt = 0;
      contactsLoaded = false;
      contactsError = '';
      state.contacts = [];
      try { localStorage.setItem(publicCacheKey, JSON.stringify({ terminals: state.terminals, updated: state.updated, cachedAt: Date.now() })); } catch { /* Public cache is optional. */ }
      if (grants.contactView) {
        try {
          const privateResult = await api('/api/knowledge?area=contacts');
          state.contacts = privateResult.data.contacts;
          sync.contacts.revision = privateResult.revision;
          contactsLoaded = true;
        } catch (error) { contactsError = error.message; }
      }
      loaded = true;
      Object.values(sync).forEach(item => { item.conflict = false; item.changeNumber = item.savedNumber = 0; });
      editingTerminal = editingContact = null;
      syncMessage = `Shared data loaded · ${grants.restrictionEdit ? 'Can edit restrictions' : 'Public view only'}`;
      if (grants.administrator) await loadAccess();
      if (login && (grants.restrictionEdit || grants.contactView)) await loadProposals();
    } catch (error) {
      syncMessage = error.message;
      if (!loaded) {
        login = null;
        grants = { restrictionEdit: false, contactView: false, contactEdit: false, administrator: false };
        try {
          const cached = JSON.parse(localStorage.getItem(publicCacheKey) || 'null');
          if (cached && Array.isArray(cached.terminals) && Date.now() - cached.cachedAt <= 86400000) {
            state.terminals = cached.terminals;
            state.contacts = [];
            state.updated = cached.updated || '';
            loaded = stale = true;
            staleExpiresAt = cached.cachedAt + 86400000;
            syncMessage = `Offline public copy from ${new Date(cached.cachedAt).toLocaleString()}. Confirm with the terminal before use.`;
          }
        } catch { /* No public cache available. */ }
      }
    } finally {
      loading = false;
      render();
    }
  }
  async function loadAccess() {
    try {
      const result = await api('/api/knowledge?mode=access');
      accessUsers = result.users;
      accessRevision = result.revision;
      accessMessage = '';
    } catch (error) { accessMessage = `Could not load sharing list: ${error.message}`; }
  }
  async function loadProposals() {
    try {
      const result = await api('/api/knowledge?mode=proposals');
      proposals = result.proposals || [];
      proposalRevision = result.revision;
      proposalMessage = '';
    } catch (error) { proposalMessage = `Could not load import proposals: ${error.message}`; }
  }
  async function submitPrevious(area) {
    const key = area === 'contacts' ? 'contacts' : 'terminals';
    const rows = legacyDraft?.[key] || [];
    if (!rows.length) return;
    if (!confirm(`Send ${rows.length} ${area} entries privately for the owner's row-by-row review? Nothing will publish yet.`)) return;
    proposalMessage = 'Submitting private proposal…';
    render();
    try {
      await api('/api/knowledge?mode=proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area, rows }) });
      await loadProposals();
      proposalMessage = 'Proposal submitted. The owner must approve entries one by one.';
    } catch (error) { proposalMessage = error.message; }
    render();
  }
  async function decideProposal(button) {
    const proposal = proposals.find(item => item.id === button.dataset.proposalId);
    const area = proposal?.area;
    if (!proposal || login !== 'primoxy-dev') return;
    const action = button.dataset.decision;
    const targetId = proposalTargets[`${proposal.id}:${button.dataset.rowId}`] || '';
    if (action === 'replace' && !targetId) { proposalMessage = 'Choose an existing row to replace.'; render(); return; }
    if (!confirm(`${action} this ${area} import entry?`)) return;
    proposalMessage = 'Recording decision…';
    render();
    try {
      await api('/api/knowledge?mode=decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposalId: proposal.id, rowId: button.dataset.rowId, action, targetId, proposalRevision, dataRevision: sync[area].revision }) });
      await loadProposals();
      await loadShared(true);
      proposalMessage = 'Decision saved.';
    } catch (error) { proposalMessage = error.message; }
    render();
  }
  async function loadHistory(area = activeSubtab) {
    historyArea = area;
    historyMessage = 'Loading history…';
    render();
    try {
      const result = await api(`/api/knowledge?mode=history&area=${area}`);
      historyRows = result.history || [];
      historyMessage = historyRows.length ? '' : 'No recorded changes yet.';
    } catch (error) { historyRows = []; historyMessage = error.message; }
    render();
  }
  async function restoreChange(id) {
    if (login !== 'primoxy-dev' || !confirm('Restore this change’s previous values? This will create a new revision.')) return;
    try {
      await api(`/api/knowledge?mode=restore&area=${historyArea}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changeId: id, revision: sync[historyArea].revision }) });
      await loadShared(true);
      await loadHistory(historyArea);
    } catch (error) { historyMessage = error.message; render(); }
  }
  async function reviewConflict(area = activeSubtab) {
    try {
      const result = await api(`/api/knowledge?area=${area}`);
      const key = area === 'contacts' ? 'contacts' : 'terminals';
      const localRows = state[key], remoteRows = result.data[key];
      const local = new Map(localRows.map(row => [row.id, row]));
      const remote = new Map(remoteRows.map(row => [row.id, row]));
      const ids = [...new Set([...local.keys(), ...remote.keys()])].filter(id => JSON.stringify(local.get(id) || null) !== JSON.stringify(remote.get(id) || null));
      if (!ids.length) {
        sync[area].revision = result.revision;
        sync[area].savedNumber = sync[area].changeNumber;
        sync[area].conflict = false;
        syncMessage = 'Both devices now have the same information.';
        render();
        return;
      }
      conflictReview[area] = { revision: result.revision, local, working: remote, ids, resolved: new Set() };
      render();
    } catch (error) { syncMessage = error.message; showStorageStatus(); }
  }
  function resolveConflict(area, id, choice) {
    const review = conflictReview[area];
    if (!review || !review.ids.includes(id)) return;
    if (choice === 'local') {
      const row = review.local.get(id);
      if (row) review.working.set(id, row);
      else review.working.delete(id);
    }
    review.resolved.add(id);
    if (review.resolved.size === review.ids.length) {
      const item = sync[area];
      state[area === 'contacts' ? 'contacts' : 'terminals'] = [...review.working.values()];
      item.revision = review.revision;
      item.conflict = false;
      item.changeNumber = item.savedNumber + 1;
      conflictReview[area] = null;
      saveShared(area);
    }
    render();
  }
  async function updateAccess(users) {
    const previous = accessUsers;
    accessUsers = users;
    accessMessage = 'Saving access list…';
    render();
    try {
      const result = await api('/api/knowledge?mode=access', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users, revision: accessRevision })
      });
      accessRevision = result.revision;
      accessMessage = 'Access list saved. Editors can sign in to make changes.';
    } catch (error) {
      accessUsers = previous;
      accessMessage = `Sharing failed: ${error.message}`;
      if (error.status === 409) await loadAccess();
    }
    render();
  }
  function persist(area = activeSubtab) {
    if (!canEdit(area)) return;
    state.updated = new Date().toISOString();
    const item = sync[area];
    item.changeNumber += 1;
    syncMessage = 'Changes pending…';
    clearTimeout(item.timer);
    item.timer = setTimeout(() => saveShared(area), 650);
    showStorageStatus();
  }
  async function saveShared(area = activeSubtab) {
    const item = sync[area];
    if (!canEdit(area) || item.saving || item.changeNumber === item.savedNumber) return;
    item.saving = true;
    const sentNumber = item.changeNumber;
    syncMessage = 'Saving shared table…';
    showStorageStatus();
    try {
      const result = await api(`/api/knowledge?area=${area}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: item.revision, [area === 'contacts' ? 'contacts' : 'terminals']: state[area === 'contacts' ? 'contacts' : 'terminals'] })
      });
      item.revision = result.revision;
      if (area === 'restrictions') remoteEmpty = false;
      item.savedNumber = sentNumber;
      syncMessage = item.changeNumber === item.savedNumber ? 'Saved for everyone' : 'Saving newer changes…';
    } catch (error) {
      item.conflict = error.status === 409;
      syncMessage = item.conflict ? 'Another device changed this table. Reload to review before editing again.' : `Save failed: ${error.message}`;
      if (item.conflict) render();
    } finally {
      item.saving = false;
      showStorageStatus();
      if (item.changeNumber !== item.savedNumber && !item.conflict && !syncMessage.startsWith('Save failed')) item.timer = setTimeout(() => saveShared(area), 100);
    }
  }
  function showStorageStatus() {
    const element = document.getElementById('kbStorageStatus');
    if (!element) return;
    element.textContent = syncMessage;
    const retry = module.querySelector('[data-kb-action="retry-save"]');
    if (retry) retry.disabled = !hasPending() || Object.values(sync).some(item => item.saving || item.conflict);
  }

  // Keep existing Knowledge base cards available as the Articles tab.
  const articles = document.createElement('div');
  articles.id = 'kbArticles';
  while (section.firstChild) articles.appendChild(section.firstChild);
  const tabbar = document.createElement('div');
  tabbar.className = 'kb-main-tabs';
  tabbar.innerHTML = '<button type="button" class="tab active" data-kb-main="articles">Articles & SOP</button><button type="button" class="tab" data-kb-main="terminal">Terminal Restriction and Contact list</button>';
  const module = document.createElement('div');
  module.id = 'kbTerminalModule';
  module.hidden = true;
  section.append(tabbar, articles, module);
  tabbar.addEventListener('click', event => {
    const button = event.target.closest('[data-kb-main]');
    if (!button) return;
    const showTerminal = button.dataset.kbMain === 'terminal';
    articles.hidden = showTerminal;
    module.hidden = !showTerminal;
    tabbar.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    if (showTerminal) loadShared();
  });

  const input = (name, label, value, type = 'text', required = false) =>
    `<label><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''}></label>`;
  function terminalForm() {
    if (editingTerminal === null) return '';
    const row = state.terminals.find(item => item.id === editingTerminal) || { port: '', terminal: '', note: '', source: '', verified: '' };
    return `<form id="kbTerminalForm" class="kb-form">
      <h3>${editingTerminal === 'new' ? 'Add terminal' : 'Edit terminal'}</h3>
      <p class="kb-public-warning">Public information: every field in this form, including Notes and Source, can be read by anyone without signing in.</p>
      <div class="kb-form-grid">${input('port', 'Port', row.port, 'text', true)}${input('terminal', 'Terminal', row.terminal, 'text', true)}${input('source', 'Source / circular', row.source)}${input('verified', 'Last verified', row.verified, 'date')}${input('note', 'General conditions / contact note', row.note)}</div>
      <div class="kb-form-actions">${editingTerminal === 'new' ? '<button type="button" class="secondary" data-kb-action="cancel-terminal">Cancel</button><button type="submit" class="primary">Add terminal</button>' : '<span class="small" id="kbEditStatus" role="status">Changes sync automatically for the team</span><button type="button" class="secondary" data-kb-action="cancel-terminal">Close</button>'}</div>
    </form>`;
  }
  function contactForm() {
    if (editingContact === null) return '';
    const row = state.contacts.find(item => item.id === editingContact) || { port: '', terminal: '', name: '', role: '', phone: '', email: '', note: '' };
    return `<form id="kbContactForm" class="kb-form">
      <h3>${editingContact === 'new' ? 'Add contact' : 'Edit contact'}</h3>
      <div class="kb-form-grid">${input('port', 'Port', row.port, 'text', true)}${input('terminal', 'Terminal', row.terminal)}${input('name', 'Contact name', row.name, 'text', true)}${input('role', 'Role / department', row.role)}${input('phone', 'Phone', row.phone, 'tel')}${input('email', 'Email', row.email, 'email')}${input('note', 'Notes', row.note)}</div>
      <div class="kb-form-actions">${editingContact === 'new' ? '<button type="button" class="secondary" data-kb-action="cancel-contact">Cancel</button><button type="submit" class="primary">Add contact</button>' : '<span class="small" id="kbEditStatus" role="status">Changes sync automatically for the team</span><button type="button" class="secondary" data-kb-action="cancel-contact">Close</button>'}</div>
    </form>`;
  }
  const statusInfo = status => status === 'yes' ? { icon: '✓', label: 'Allowed', checked: 'true' }
    : status === 'no' ? { icon: '✕', label: 'Restricted', checked: 'false' }
      : { icon: '—', label: 'Not verified', checked: 'mixed' };
  function statusCell(row, key, label) {
    const value = row.restrictions?.[key] || 'unknown';
    const info = statusInfo(value);
    return `<td class="kb-status-cell"><button type="button" role="checkbox" aria-checked="${info.checked}" aria-label="${escapeHtml(row.port)} ${escapeHtml(row.terminal)}: ${escapeHtml(label)} — ${info.label}" title="${info.label}${canEdit() ? '; click to change' : ''}" class="kb-status kb-${value}" data-kb-action="cycle" data-id="${escapeHtml(row.id)}" data-service="${key}" ${canEdit() ? '' : 'disabled'}>${info.icon}</button></td>`;
  }
  function matrix() {
    const ports = [...new Set(state.terminals.map(row => row.port))].sort((a, b) => {
      const knownA = initialGroups.findIndex(group => group[0] === a);
      const knownB = initialGroups.findIndex(group => group[0] === b);
      return (knownA < 0 ? 999 : knownA) - (knownB < 0 ? 999 : knownB) || a.localeCompare(b);
    });
    return `<div class="kb-matrix-scroll"><table class="kb-matrix"><thead><tr><th class="kb-terminal-col">Port / Terminal</th>${services.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}<th class="kb-notes-col">Conditions / Source</th><th class="kb-actions-col">Actions</th></tr></thead><tbody>
      ${ports.map(port => `<tr class="kb-port-row"><th colspan="${services.length + 3}">${escapeHtml(port)}</th></tr>${state.terminals.filter(row => row.port === port).map(row => `<tr><th class="kb-terminal-name">${escapeHtml(row.terminal)}</th>${services.map(([key, label]) => statusCell(row, key, label)).join('')}<td class="kb-notes"><span>${escapeHtml(row.note || '—')}</span><small>${escapeHtml(row.source || 'No source')} · ${row.verified ? 'Verified ' + escapeHtml(row.verified) : 'Unverified'}</small></td><td class="kb-row-actions">${canEdit() ? `<button type="button" class="kb-link" data-kb-action="edit-terminal" data-id="${escapeHtml(row.id)}">Edit</button><button type="button" class="kb-link kb-delete" data-kb-action="delete-terminal" data-id="${escapeHtml(row.id)}">Delete</button>` : 'View only'}</td></tr>`).join('')}`).join('')}
      ${ports.length ? '' : `<tr><td colspan="${services.length + 3}">No terminals yet. Select Add terminal.</td></tr>`}
    </tbody></table></div>`;
  }
  function contacts() {
    return `<div class="kb-contact-scroll"><table class="table kb-contact-table"><thead><tr><th>Port</th><th>Terminal</th><th>Contact name</th><th>Role / department</th><th>Phone</th><th>Email</th><th>Notes</th><th>Actions</th></tr></thead><tbody>
      ${state.contacts.length ? state.contacts.map(row => `<tr><td>${escapeHtml(row.port)}</td><td>${escapeHtml(row.terminal)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.role)}</td><td>${escapeHtml(row.phone)}</td><td>${escapeHtml(row.email)}</td><td>${escapeHtml(row.note)}</td><td class="kb-row-actions">${canEdit() ? `<button type="button" class="kb-link" data-kb-action="edit-contact" data-id="${escapeHtml(row.id)}">Edit</button><button type="button" class="kb-link kb-delete" data-kb-action="delete-contact" data-id="${escapeHtml(row.id)}">Delete</button>` : 'View only'}</td></tr>`).join('') : '<tr><td colspan="8">No contacts yet. Select Add contact.</td></tr>'}
      </tbody></table></div>`;
  }
  function accessPanel() {
    if (!grants.administrator) return '';
    const grantLabels = [['restrictionEdit', 'Edit restrictions'], ['contactView', 'View contacts'], ['contactEdit', 'Edit contacts']];
    return `<div class="kb-access"><div class="kb-toolbar"><div><b>Share Knowledge base</b><p class="small">Terminal restrictions are public. Contacts require named access. Knowledge permissions never grant crew access.</p></div><button type="button" class="secondary" data-kb-action="toggle-access">${accessOpen ? 'Hide access' : 'Manage access'}</button></div>
      ${accessOpen ? `<p class="small">Verify the exact GitHub profile before confirming a grant. Contact editors also receive Contact-view access.</p>
        <form id="kbProfileForm" class="kb-access-form"><label>GitHub username <input name="login" required pattern="[A-Za-z0-9-]{1,39}" autocomplete="off"></label><button type="submit" class="secondary">Check profile</button></form>
        ${pendingProfile ? `<div class="kb-profile"><img src="${escapeHtml(pendingProfile.avatarUrl || '')}" alt="" width="36" height="36"><a href="${escapeHtml(pendingProfile.url || '')}" target="_blank" rel="noopener noreferrer">${escapeHtml(pendingProfile.login)}</a><span>GitHub ID ${pendingProfile.id}</span></div>
        <form id="kbAccessForm" class="kb-access-form"><span>Confirm permissions for ${escapeHtml(pendingProfile.login)}</span>${grantLabels.map(([key, label]) => `<label><input type="checkbox" name="${key}"> ${label}</label>`).join('')}${login === 'primoxy-dev' ? '<label><input type="checkbox" name="administrator"> Knowledge Base Administrator</label>' : ''}<button type="submit" class="primary">Confirm access</button></form>` : ''}
        <div class="kb-access-users">${accessUsers.length ? accessUsers.map(user => {
          const protectedUser = login !== 'primoxy-dev' && (user.administrator || user.login === login);
          return `<div class="kb-access-user"><b>${escapeHtml(user.login)}</b>${grantLabels.map(([key, label]) => `<label><input type="checkbox" data-kb-access-grant="${key}" data-login="${escapeHtml(user.login)}" ${user.grants?.[key] ? 'checked' : ''} ${protectedUser ? 'disabled' : ''}> ${label}</label>`).join('')}${login === 'primoxy-dev' ? `<label><input type="checkbox" data-kb-access-grant="administrator" data-login="${escapeHtml(user.login)}" ${user.administrator ? 'checked' : ''}> Administrator</label>` : ''}<button type="button" class="kb-link kb-delete" data-kb-action="remove-access" data-login="${escapeHtml(user.login)}" ${protectedUser ? 'disabled' : ''}>Remove</button></div>`;
        }).join('') : '<span class="small">No named users added.</span>'}</div>
        <p class="small" role="status">${escapeHtml(accessMessage)}</p>` : ''}</div>`;
  }
  function proposalPanel() {
    if (!proposalsOpen) return '';
    const pending = proposals.filter(item => item.rows?.some(row => row.decision === 'pending'));
    return `<div class="kb-panel"><h3>Private import proposals</h3><p class="small">Nothing here becomes shared until the owner approves individual entries.</p>
      ${legacyDraft && grants.restrictionEdit ? '<button type="button" class="secondary" data-kb-action="propose-restrictions">Send this browser’s previous terminals for review</button>' : ''}
      ${legacyDraft?.contacts?.length && grants.contactView ? '<button type="button" class="secondary" data-kb-action="propose-contacts">Send this browser’s previous contacts for review</button>' : ''}
      <p class="small" role="status">${escapeHtml(proposalMessage)}</p>
      ${pending.length ? pending.map(proposal => `<div class="kb-proposal"><h4>${escapeHtml(proposal.area)} · submitted by ${escapeHtml(proposal.submittedBy)} · ${escapeHtml(proposal.submittedAt)}</h4>${proposal.rows.filter(row => row.decision === 'pending').map(item => {
        const key = `${proposal.id}:${item.id}`;
        const existing = state[proposal.area === 'contacts' ? 'contacts' : 'terminals'];
        const selected = proposalTargets[key] || '';
        const target = existing.find(row => row.id === selected);
        return `<div class="kb-proposal-row"><b>Proposed entry</b><pre>${escapeHtml(JSON.stringify(item.row, null, 2))}</pre>${login === 'primoxy-dev' ? `<label>Existing row to replace <select data-kb-proposal-target="${escapeHtml(key)}"><option value="">Choose a row</option>${existing.map(row => `<option value="${escapeHtml(row.id)}" ${selected === row.id ? 'selected' : ''}>${escapeHtml(row.terminal || row.name)} · ${escapeHtml(row.port)}</option>`).join('')}</select></label>${target ? `<b>Current entry</b><pre>${escapeHtml(JSON.stringify(target, null, 2))}</pre>` : ''}<div class="kb-proposal-actions"><button type="button" class="secondary" data-kb-action="decide-proposal" data-decision="add" data-proposal-id="${escapeHtml(proposal.id)}" data-row-id="${escapeHtml(item.id)}">Approve as new</button><button type="button" class="secondary" data-kb-action="decide-proposal" data-decision="replace" data-proposal-id="${escapeHtml(proposal.id)}" data-row-id="${escapeHtml(item.id)}">Replace selected</button><button type="button" class="secondary" data-kb-action="decide-proposal" data-decision="reject" data-proposal-id="${escapeHtml(proposal.id)}" data-row-id="${escapeHtml(item.id)}">Reject</button></div>` : '<span class="small">Awaiting owner review</span>'}</div>`;
      }).join('')}</div>`).join('') : '<p class="small">No pending proposals.</p>'}</div>`;
  }
  function historyPanel() {
    if (!historyOpen) return '';
    return `<div class="kb-panel"><h3>Knowledge change history · ${escapeHtml(historyArea)}</h3><p class="small" role="status">${escapeHtml(historyMessage)}</p>
      ${historyRows.map(entry => `<div class="kb-history-row"><b>${escapeHtml(entry.at)} · ${escapeHtml(entry.actor)} · ${entry.count} changed row(s)</b>${entry.changes ? `<details><summary>Review before and after</summary><pre>${escapeHtml(JSON.stringify(entry.changes, null, 2))}</pre></details>` : '<p class="small">Details hidden by your permissions.</p>'}${login === 'primoxy-dev' && entry.changes ? `<button type="button" class="secondary" data-kb-action="restore-change" data-change-id="${escapeHtml(entry.id)}">Restore previous values</button>` : ''}</div>`).join('')}</div>`;
  }
  function conflictPanel(area = activeSubtab) {
    const review = conflictReview[area];
    if (!sync[area].conflict) return '';
    if (!review) return '<div class="kb-panel"><b>Another device changed this information.</b> <button type="button" class="secondary" data-kb-action="review-conflict">Compare rows</button></div>';
    return `<div class="kb-panel"><h3>Resolve changed rows one by one</h3><p class="small">There is no whole-table overwrite. Choose the current shared row or reapply your row for each difference.</p>${review.ids.map(id => `<div class="kb-conflict-row"><b>${escapeHtml(id)}</b><div class="kb-compare"><div><b>Current shared</b><pre>${escapeHtml(JSON.stringify(review.working.get(id) || null, null, 2))}</pre></div><div><b>Your unsaved row</b><pre>${escapeHtml(JSON.stringify(review.local.get(id) || null, null, 2))}</pre></div></div>${review.resolved.has(id) ? '<span>Resolved</span>' : `<button type="button" class="secondary" data-kb-action="resolve-conflict" data-choice="remote" data-id="${escapeHtml(id)}">Keep shared</button><button type="button" class="secondary" data-kb-action="resolve-conflict" data-choice="local" data-id="${escapeHtml(id)}">Reapply mine</button>`}</div>`).join('')}</div>`;
  }
  function render() {
    module.innerHTML = `<div class="kb-heading"><div><h2>Terminal Restriction and Contact list</h2><p>Reference matrix for service access and terminal contacts</p></div><span id="kbStorageStatus" class="small"></span></div>
      ${!loaded ? `<div class="kb-auth-card"><p>${escapeHtml(syncMessage)}</p><button type="button" class="secondary" data-kb-action="refresh">Try again</button></div>` : `
      <div class="kb-alert">${stale ? 'Stale public copy · confirm with the terminal before use' : 'Public terminal restrictions'} · ${escapeHtml(login || 'Guest')}. Contact details require named sign-in access. Confirm the current terminal circular before operational use.</div>
      ${!login ? '<div class="kb-sync-actions"><a class="primary kb-sign-in" href="/api/auth?mode=start">Sign in for granted access</a></div>' : ''}
      <div class="kb-sync-actions"><button type="button" class="secondary" data-kb-action="refresh">Reload latest</button>${canEdit() ? '<button type="button" class="secondary" data-kb-action="retry-save">Save now</button>' : ''}${login ? '<button type="button" class="secondary" data-kb-action="toggle-history">History</button>' : ''}${login && (grants.restrictionEdit || grants.contactView) ? '<button type="button" class="secondary" data-kb-action="toggle-proposals">Import review</button>' : ''}</div>
      ${accessPanel()}
      ${proposalPanel()}${historyPanel()}${conflictPanel()}
      <div class="kb-subtabs"><button type="button" class="tab ${activeSubtab === 'restrictions' ? 'active' : ''}" data-kb-subtab="restrictions">Terminal restrictions</button><button type="button" class="tab ${activeSubtab === 'contacts' ? 'active' : ''}" data-kb-subtab="contacts">Contact list</button></div>
      ${activeSubtab === 'restrictions' ? `<div class="kb-toolbar"><div class="kb-legend"><span class="kb-key kb-yes">✓ Allowed</span><span class="kb-key kb-no">✕ Restricted</span><span class="kb-key kb-unknown">— Unverified</span><span class="small">${canEdit() ? 'Click a cell to cycle its status.' : 'Sign in with edit access to change cells.'}</span></div>${canEdit() ? '<button type="button" class="primary" data-kb-action="add-terminal">+ Add terminal</button>' : ''}</div>${canEdit() ? terminalForm() : ''}${matrix()}`
        : !grants.contactView ? '<div class="kb-auth-card">Contact list is private. Ask the owner for named access, then sign in with GitHub.</div>' : !contactsLoaded ? `<div class="kb-auth-card">${escapeHtml(contactsError || 'Loading private contacts…')} <button type="button" data-kb-action="refresh">Retry</button></div>` : `<div class="kb-toolbar"><span class="small">Keep contacts current; confirm before use.</span>${canEdit() ? '<button type="button" class="primary" data-kb-action="add-contact">+ Add contact</button>' : ''}</div>${canEdit() ? contactForm() : ''}${contacts()}`}`}`;
    showStorageStatus();
  }
  module.addEventListener('click', event => {
    if (event.target.closest('.kb-sign-in')) {
      try { sessionStorage.setItem('hf-open-knowledge', '1'); } catch { /* No session storage. */ }
      return;
    }
    const subtab = event.target.closest('[data-kb-subtab]');
    if (subtab) { activeSubtab = subtab.dataset.kbSubtab; render(); return; }
    const button = event.target.closest('[data-kb-action]');
    if (!button) return;
    const { kbAction: action, id: rowId } = button.dataset;
    if (action === 'refresh') { loadShared(true); return; }
    if (action === 'retry-save') { clearTimeout(sync[activeSubtab].timer); saveShared(activeSubtab); return; }
    if (action === 'toggle-proposals') { proposalsOpen = !proposalsOpen; if (proposalsOpen) loadProposals().then(render); render(); return; }
    if (action === 'propose-restrictions') { submitPrevious('restrictions'); return; }
    if (action === 'propose-contacts') { submitPrevious('contacts'); return; }
    if (action === 'decide-proposal') { decideProposal(button); return; }
    if (action === 'toggle-history') { historyOpen = !historyOpen; if (historyOpen) loadHistory(); render(); return; }
    if (action === 'restore-change') { restoreChange(button.dataset.changeId); return; }
    if (action === 'review-conflict') { reviewConflict(); return; }
    if (action === 'resolve-conflict') { resolveConflict(activeSubtab, rowId, button.dataset.choice); return; }
    if (action === 'toggle-access' && grants.administrator) { accessOpen = !accessOpen; render(); return; }
    if (action === 'remove-access' && grants.administrator) {
      if (confirm(`Remove Knowledge base access for ${button.dataset.login}?`)) updateAccess(accessUsers.filter(item => item.login !== button.dataset.login));
      return;
    }
    if (!canEdit()) return;
    if (action === 'cycle') {
      const row = state.terminals.find(item => item.id === rowId);
      if (!row) return;
      row.restrictions ||= {};
      const current = row.restrictions[button.dataset.service] || 'unknown';
      const next = current === 'unknown' ? 'yes' : current === 'yes' ? 'no' : 'unknown';
      row.restrictions[button.dataset.service] = next;
      const info = statusInfo(next);
      button.textContent = info.icon;
      button.className = `kb-status kb-${next}`;
      button.setAttribute('aria-checked', info.checked);
      button.setAttribute('aria-label', `${row.port} ${row.terminal}: ${services.find(([key]) => key === button.dataset.service)?.[1]} — ${info.label}. Click to change`);
      button.title = `${info.label}; click to change`;
      persist();
      return;
    }
    if (action === 'add-terminal') editingTerminal = 'new';
    if (action === 'edit-terminal') editingTerminal = rowId;
    if (action === 'cancel-terminal') editingTerminal = null;
    if (action === 'delete-terminal') {
      const row = state.terminals.find(item => item.id === rowId);
      if (row && confirm(`Delete ${row.terminal} from ${row.port}?`)) {
        state.terminals = state.terminals.filter(item => item.id !== rowId);
        if (editingTerminal === rowId) editingTerminal = null;
        persist();
      } else return;
    }
    if (action === 'add-contact') editingContact = 'new';
    if (action === 'edit-contact') editingContact = rowId;
    if (action === 'cancel-contact') editingContact = null;
    if (action === 'delete-contact') {
      const row = state.contacts.find(item => item.id === rowId);
      if (row && confirm(`Delete contact ${row.name}?`)) {
        state.contacts = state.contacts.filter(item => item.id !== rowId);
        if (editingContact === rowId) editingContact = null;
        persist();
      } else return;
    }
    render();
    if (action === 'add-terminal' || action === 'edit-terminal') module.querySelector('#kbTerminalForm [name="port"]')?.focus();
    if (action === 'add-contact' || action === 'edit-contact') module.querySelector('#kbContactForm [name="port"]')?.focus();
  });
  module.addEventListener('input', event => {
    if (!canEdit()) return;
    const form = event.target.closest('form');
    const isTerminal = form?.id === 'kbTerminalForm' && editingTerminal && editingTerminal !== 'new';
    const isContact = form?.id === 'kbContactForm' && editingContact && editingContact !== 'new';
    if (!isTerminal && !isContact) return;
    const row = isTerminal
      ? state.terminals.find(item => item.id === editingTerminal)
      : state.contacts.find(item => item.id === editingContact);
    if (!row) return;
    const keys = isTerminal
      ? ['port', 'terminal', 'source', 'verified', 'note']
      : ['port', 'terminal', 'name', 'role', 'phone', 'email', 'note'];
    const values = Object.fromEntries(keys.map(key => [key, String(form.elements.namedItem(key)?.value || '').trim()]));
    const status = form.querySelector('#kbEditStatus');
    if (!values.port || (isTerminal ? !values.terminal : !values.name)) {
      status.textContent = isTerminal ? 'Port and Terminal are required' : 'Port and Contact name are required';
      return;
    }
    if (isTerminal && state.terminals.some(item => item.id !== row.id && item.port.toLowerCase() === values.port.toLowerCase() && item.terminal.toLowerCase() === values.terminal.toLowerCase())) {
      status.textContent = 'This terminal already exists under this port';
      return;
    }
    Object.assign(row, values);
    persist();
    status.textContent = 'Syncing automatically for everyone…';
  });
  module.addEventListener('change', event => {
    const proposalTarget = event.target.dataset.kbProposalTarget;
    if (proposalTarget) { proposalTargets[proposalTarget] = event.target.value; render(); return; }
    const key = event.target.dataset.kbAccessGrant;
    const user = event.target.dataset.login;
    if (!key || !user || !grants.administrator) return;
    updateAccess(accessUsers.map(item => {
      if (item.login !== user) return item;
      if (key === 'administrator') return { ...item, administrator: event.target.checked };
      const next = { ...item.grants, [key]: event.target.checked };
      if (key === 'contactEdit' && event.target.checked) next.contactView = true;
      if (key === 'contactView' && !event.target.checked) next.contactEdit = false;
      return { ...item, grants: next };
    }));
  });
  module.addEventListener('submit', event => {
    if (event.target.id === 'kbProfileForm') {
      event.preventDefault();
      if (!grants.administrator) return;
      const candidate = String(new FormData(event.target).get('login') || '').trim().toLowerCase();
      if (!/^[a-z0-9-]{1,39}$/.test(candidate)) return;
      pendingProfile = null;
      accessMessage = 'Checking GitHub profile…';
      render();
      api(`/api/knowledge?mode=profile&login=${encodeURIComponent(candidate)}`).then(profile => {
        pendingProfile = profile;
        accessMessage = 'Check this profile carefully, choose permissions, then confirm.';
        render();
      }).catch(error => { accessMessage = error.message; render(); });
      return;
    }
    if (event.target.id === 'kbAccessForm') {
      event.preventDefault();
      if (!grants.administrator || !pendingProfile) return;
      const form = new FormData(event.target);
      const user = pendingProfile.login;
      const proposed = { login: user, githubId: pendingProfile.id, grants: { restrictionEdit: form.has('restrictionEdit'), contactView: form.has('contactView') || form.has('contactEdit'), contactEdit: form.has('contactEdit') }, administrator: login === 'primoxy-dev' && form.has('administrator') };
      if (user === 'primoxy-dev' || accessUsers.some(item => item.login === user) || !Object.values(proposed.grants).some(Boolean) && !proposed.administrator) {
        accessMessage = 'Choose at least one permission for a new GitHub user.';
        render();
        return;
      }
      pendingProfile = null;
      updateAccess([...accessUsers, proposed]);
      return;
    }
    const terminalFormSubmitted = event.target.id === 'kbTerminalForm';
    const contactFormSubmitted = event.target.id === 'kbContactForm';
    if (!terminalFormSubmitted && !contactFormSubmitted) return;
    event.preventDefault();
    if (!canEdit()) return;
    const form = new FormData(event.target);
    const value = name => String(form.get(name) || '').trim();
    if (terminalFormSubmitted) {
      const port = value('port'), terminal = value('terminal');
      if (!port || !terminal) return;
      const duplicate = state.terminals.some(row => row.id !== editingTerminal && row.port.toLowerCase() === port.toLowerCase() && row.terminal.toLowerCase() === terminal.toLowerCase());
      if (duplicate) { alert('This terminal already exists under this port.'); return; }
      const details = { port, terminal, source: value('source'), verified: value('verified'), note: value('note') };
      if (editingTerminal === 'new') state.terminals.push({ ...blankTerminal(port, terminal), ...details });
      else Object.assign(state.terminals.find(row => row.id === editingTerminal), details);
      editingTerminal = null;
    }
    if (contactFormSubmitted) {
      const details = Object.fromEntries(['port', 'terminal', 'name', 'role', 'phone', 'email', 'note'].map(key => [key, value(key)]));
      if (!details.port || !details.name) return;
      if (editingContact === 'new') state.contacts.push({ id: newId(), ...details });
      else Object.assign(state.contacts.find(row => row.id === editingContact), details);
      editingContact = null;
    }
    persist();
    render();
  });
  try {
    if (sessionStorage.getItem('hf-open-knowledge') === '1') {
      sessionStorage.removeItem('hf-open-knowledge');
      document.querySelector('.nav[data-view="knowledge"]')?.click();
      tabbar.querySelector('[data-kb-main="terminal"]')?.click();
    }
  } catch { /* Session storage is optional. */ }
  setInterval(() => {
    if (stale && Date.now() > staleExpiresAt) {
      loaded = stale = false;
      state.terminals = [];
      syncMessage = 'The public offline copy expired. Reload when connected; confirm directly with the terminal.';
      render();
      return;
    }
    if (!module.hidden && loaded && !hasPending() && !Object.values(sync).some(item => item.saving) && editingTerminal === null && editingContact === null && !accessOpen) loadShared(true);
  }, 60000);
  window.addEventListener('beforeunload', event => {
    if (loaded && hasPending()) { event.preventDefault(); event.returnValue = ''; }
  });
})();

