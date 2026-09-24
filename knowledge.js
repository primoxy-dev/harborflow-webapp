/* Shared terminal restrictions, stored in a private GitHub repository via the API. */
(() => {
  const section = document.getElementById('knowledge');
  if (!section) return;

  const storageKey = 'harborflow-terminal-knowledge-v1';
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
  let importPending = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && Array.isArray(saved.terminals) && Array.isArray(saved.contacts) && saved.updated) legacyDraft = saved;
  } catch { /* Browser storage is optional; the server is authoritative. */ }
  let state = initialState();
  let loaded = false, loading = false, remoteEmpty = false, role = null, login = null;
  let revision = null, changeNumber = 0, savedNumber = 0, saving = false, conflict = false;
  let saveTimer = null, syncMessage = 'Loading the shared table…';
  let accessUsers = [], accessRevision = null, accessOpen = false, accessMessage = '';
  let activeSubtab = 'restrictions';
  let editingTerminal = null;
  let editingContact = null;

  const canEdit = () => loaded && role === 'editor' && !conflict;
  async function api(path, options) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(Error(body.error || `Request failed (${response.status})`), { status: response.status });
    return body;
  }
  async function loadShared(force = false) {
    if (loading || (loaded && !force)) return;
    if (saving) { syncMessage = 'Wait for the current save to finish before reloading.'; showStorageStatus(); return; }
    if (force && changeNumber !== savedNumber && !confirm('Unsaved changes may be lost. Reload shared data?')) return;
    loading = true;
    syncMessage = 'Loading shared Knowledge base…';
    render();
    try {
      const result = await api('/api/knowledge');
      state = result.data || initialState();
      remoteEmpty = !result.data;
      revision = result.revision;
      role = result.role;
      login = result.login;
      loaded = true;
      conflict = false;
      editingTerminal = editingContact = null;
      changeNumber = savedNumber = 0;
      syncMessage = `Shared data loaded · ${role === 'editor' ? 'Can edit' : 'Public view only'}`;
      if (login === 'primoxy-dev') await loadAccess();
    } catch (error) {
      syncMessage = error.message;
      if (!loaded) { role = null; login = null; }
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
  function persist() {
    if (!canEdit()) return;
    state.updated = new Date().toISOString();
    changeNumber += 1;
    syncMessage = 'Changes pending…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveShared, 650);
    showStorageStatus();
  }
  async function saveShared() {
    if (!canEdit() || saving || changeNumber === savedNumber) return;
    saving = true;
    const sentNumber = changeNumber;
    syncMessage = 'Saving shared table…';
    showStorageStatus();
    try {
      const result = await api('/api/knowledge', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision, terminals: state.terminals, contacts: state.contacts })
      });
      revision = result.revision;
      remoteEmpty = false;
      savedNumber = sentNumber;
      syncMessage = changeNumber === savedNumber ? 'Saved for everyone' : 'Saving newer changes…';
      if (changeNumber === savedNumber && importPending) {
        legacyDraft = null;
        importPending = false;
      }
    } catch (error) {
      conflict = error.status === 409;
      syncMessage = conflict ? 'Another device changed this table. Reload to review before editing again.' : `Save failed: ${error.message}`;
      if (conflict) render();
    } finally {
      saving = false;
      showStorageStatus();
      if (changeNumber !== savedNumber && !conflict && !syncMessage.startsWith('Save failed')) saveTimer = setTimeout(saveShared, 100);
    }
  }
  function showStorageStatus() {
    const element = document.getElementById('kbStorageStatus');
    if (!element) return;
    element.textContent = syncMessage;
    const retry = module.querySelector('[data-kb-action="retry-save"]');
    if (retry) retry.disabled = changeNumber === savedNumber || saving || conflict;
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
    if (login !== 'primoxy-dev') return '';
    return `<div class="kb-access"><div class="kb-toolbar"><div><b>Share Knowledge base</b><p class="small">Anyone with this website link can view the terminal table and contacts without signing in. Only the owner and GitHub users granted edit access can change them. Crew documents remain owner-only.</p></div><button type="button" class="secondary" data-kb-action="toggle-access">${accessOpen ? 'Hide access' : 'Manage access'}</button></div>
      ${accessOpen ? `<p class="small">Public view link: <a href="/">${escapeHtml(location.origin + '/')}</a>. Named editors must sign in with their listed GitHub username. View-only entries can sign in, but sign-in is not required to view.</p>
        <form id="kbAccessForm" class="kb-access-form"><label>GitHub username <input name="login" required pattern="[A-Za-z0-9-]{1,39}" autocomplete="off"></label><label>Permission <select name="role"><option value="viewer">View only</option><option value="editor">Can edit</option></select></label><button type="submit" class="primary">Add person</button></form>
        <div class="kb-access-users">${accessUsers.length ? accessUsers.map(user => `<div><span>${escapeHtml(user.login)}</span><select data-kb-access-role="${escapeHtml(user.login)}" aria-label="Permission for ${escapeHtml(user.login)}"><option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>View only</option><option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Can edit</option></select><button type="button" class="kb-link kb-delete" data-kb-action="remove-access" data-login="${escapeHtml(user.login)}">Remove</button></div>`).join('') : '<span class="small">No named users added. Public viewing is already enabled.</span>'}</div>
        <p class="small" role="status">${escapeHtml(accessMessage)}</p>` : ''}</div>`;
  }
  function render() {
    module.innerHTML = `<div class="kb-heading"><div><h2>Terminal Restriction and Contact list</h2><p>Reference matrix for service access and terminal contacts</p></div><span id="kbStorageStatus" class="small"></span></div>
      ${!loaded ? `<div class="kb-auth-card"><p>${escapeHtml(syncMessage)}</p><button type="button" class="secondary" data-kb-action="refresh">Try again</button></div>` : `
      <div class="kb-alert">Public view · ${role === 'editor' ? `${escapeHtml(login || '')} can edit` : 'Sign in only if you have edit permission'}. Confirm the current terminal circular and record its source and verification date before operational use.</div>
      ${role !== 'editor' ? '<div class="kb-sync-actions"><a class="primary kb-sign-in" href="/api/auth?mode=start">Sign in to edit</a></div>' : ''}
      <div class="kb-sync-actions"><button type="button" class="secondary" data-kb-action="refresh">Reload latest</button>${role === 'editor' ? '<button type="button" class="secondary" data-kb-action="retry-save">Save now</button>' : ''}${remoteEmpty && legacyDraft && canEdit() && changeNumber === savedNumber ? '<button type="button" class="secondary" data-kb-action="import-local">Import this browser’s previous table</button>' : ''}</div>
      ${accessPanel()}
      <div class="kb-subtabs"><button type="button" class="tab ${activeSubtab === 'restrictions' ? 'active' : ''}" data-kb-subtab="restrictions">Terminal restrictions</button><button type="button" class="tab ${activeSubtab === 'contacts' ? 'active' : ''}" data-kb-subtab="contacts">Contact list</button></div>
      ${activeSubtab === 'restrictions' ? `<div class="kb-toolbar"><div class="kb-legend"><span class="kb-key kb-yes">✓ Allowed</span><span class="kb-key kb-no">✕ Restricted</span><span class="kb-key kb-unknown">— Unverified</span><span class="small">${canEdit() ? 'Click a cell to cycle its status.' : 'Sign in with edit access to change cells.'}</span></div>${canEdit() ? '<button type="button" class="primary" data-kb-action="add-terminal">+ Add terminal</button>' : ''}</div>${canEdit() ? terminalForm() : ''}${matrix()}`
        : `<div class="kb-toolbar"><span class="small">Keep contacts current; confirm before use.</span>${canEdit() ? '<button type="button" class="primary" data-kb-action="add-contact">+ Add contact</button>' : ''}</div>${canEdit() ? contactForm() : ''}${contacts()}`}`}`;
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
    if (action === 'retry-save') { clearTimeout(saveTimer); saveShared(); return; }
    if (action === 'toggle-access' && login === 'primoxy-dev') { accessOpen = !accessOpen; render(); return; }
    if (action === 'remove-access' && login === 'primoxy-dev') {
      if (confirm(`Remove Knowledge base access for ${button.dataset.login}?`)) updateAccess(accessUsers.filter(item => item.login !== button.dataset.login));
      return;
    }
    if (action === 'import-local') {
      if (!canEdit() || !remoteEmpty || !legacyDraft) return;
      if (!confirm('Import this browser’s previous table to the shared Knowledge base? Everyone with access will see it.')) return;
      state = legacyDraft;
      importPending = true;
      persist();
      render();
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
    const user = event.target.dataset.kbAccessRole;
    if (user && login === 'primoxy-dev') updateAccess(accessUsers.map(item => item.login === user ? { ...item, role: event.target.value } : item));
  });
  module.addEventListener('submit', event => {
    if (event.target.id === 'kbAccessForm') {
      event.preventDefault();
      if (login !== 'primoxy-dev') return;
      const form = new FormData(event.target);
      const user = String(form.get('login') || '').trim().toLowerCase();
      const permission = String(form.get('role') || 'viewer');
      if (!/^[a-z0-9-]{1,39}$/.test(user) || user === 'primoxy-dev' || !['viewer', 'editor'].includes(permission) || accessUsers.some(item => item.login === user)) {
        accessMessage = 'Enter a new valid GitHub username.';
        render();
        return;
      }
      updateAccess([...accessUsers, { login: user, role: permission }]);
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
    if (!module.hidden && loaded && !saving && changeNumber === savedNumber && editingTerminal === null && editingContact === null && !accessOpen) loadShared(true);
  }, 60000);
  window.addEventListener('beforeunload', event => {
    if (loaded && changeNumber !== savedNumber) { event.preventDefault(); event.returnValue = ''; }
  });
})();

