/* Terminal restriction matrix prototype. Data is local to this browser only. */
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
  let storedLocally = true;
  let state;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    state = saved && Array.isArray(saved.terminals) && Array.isArray(saved.contacts) ? saved : initialState();
  } catch {
    state = initialState();
    storedLocally = false;
  }
  let activeSubtab = 'restrictions';
  let editingTerminal = null;
  let editingContact = null;

  function persist() {
    state.updated = new Date().toISOString();
    try { localStorage.setItem(storageKey, JSON.stringify(state)); storedLocally = true; }
    catch { storedLocally = false; }
    showStorageStatus();
  }
  function showStorageStatus() {
    const element = document.getElementById('kbStorageStatus');
    if (!element) return;
    element.textContent = storedLocally
      ? `Saved in this browser only${state.updated ? ' · ' + new Date(state.updated).toLocaleString() : ''}`
      : 'Browser storage unavailable; changes last only until refresh';
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
    if (showTerminal) render();
  });

  const input = (name, label, value, type = 'text', required = false) =>
    `<label><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''}></label>`;
  function terminalForm() {
    if (editingTerminal === null) return '';
    const row = state.terminals.find(item => item.id === editingTerminal) || { port: '', terminal: '', note: '', source: '', verified: '' };
    return `<form id="kbTerminalForm" class="kb-form">
      <h3>${editingTerminal === 'new' ? 'Add terminal' : 'Edit terminal'}</h3>
      <div class="kb-form-grid">${input('port', 'Port', row.port, 'text', true)}${input('terminal', 'Terminal', row.terminal, 'text', true)}${input('source', 'Source / circular', row.source)}${input('verified', 'Last verified', row.verified, 'date')}${input('note', 'General conditions / contact note', row.note)}</div>
      <div class="kb-form-actions"><button type="button" class="secondary" data-kb-action="cancel-terminal">Cancel</button><button type="submit" class="primary">Save terminal</button></div>
    </form>`;
  }
  function contactForm() {
    if (editingContact === null) return '';
    const row = state.contacts.find(item => item.id === editingContact) || { port: '', terminal: '', name: '', role: '', phone: '', email: '', note: '' };
    return `<form id="kbContactForm" class="kb-form">
      <h3>${editingContact === 'new' ? 'Add contact' : 'Edit contact'}</h3>
      <div class="kb-form-grid">${input('port', 'Port', row.port, 'text', true)}${input('terminal', 'Terminal', row.terminal)}${input('name', 'Contact name', row.name, 'text', true)}${input('role', 'Role / department', row.role)}${input('phone', 'Phone', row.phone, 'tel')}${input('email', 'Email', row.email, 'email')}${input('note', 'Notes', row.note)}</div>
      <div class="kb-form-actions"><button type="button" class="secondary" data-kb-action="cancel-contact">Cancel</button><button type="submit" class="primary">Save contact</button></div>
    </form>`;
  }
  const statusInfo = status => status === 'yes' ? { icon: '✓', label: 'Allowed', checked: 'true' }
    : status === 'no' ? { icon: '✕', label: 'Restricted', checked: 'false' }
      : { icon: '—', label: 'Not verified', checked: 'mixed' };
  function statusCell(row, key, label) {
    const value = row.restrictions?.[key] || 'unknown';
    const info = statusInfo(value);
    return `<td class="kb-status-cell"><button type="button" role="checkbox" aria-checked="${info.checked}" aria-label="${escapeHtml(row.port)} ${escapeHtml(row.terminal)}: ${escapeHtml(label)} — ${info.label}. Click to change" title="${info.label}; click to change" class="kb-status kb-${value}" data-kb-action="cycle" data-id="${escapeHtml(row.id)}" data-service="${key}">${info.icon}</button></td>`;
  }
  function matrix() {
    const ports = [...new Set(state.terminals.map(row => row.port))].sort((a, b) => {
      const knownA = initialGroups.findIndex(group => group[0] === a);
      const knownB = initialGroups.findIndex(group => group[0] === b);
      return (knownA < 0 ? 999 : knownA) - (knownB < 0 ? 999 : knownB) || a.localeCompare(b);
    });
    return `<div class="kb-matrix-scroll"><table class="kb-matrix"><thead><tr><th class="kb-terminal-col">Port / Terminal</th>${services.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}<th class="kb-notes-col">Conditions / Source</th><th class="kb-actions-col">Actions</th></tr></thead><tbody>
      ${ports.map(port => `<tr class="kb-port-row"><th colspan="${services.length + 3}">${escapeHtml(port)}</th></tr>${state.terminals.filter(row => row.port === port).map(row => `<tr><th class="kb-terminal-name">${escapeHtml(row.terminal)}</th>${services.map(([key, label]) => statusCell(row, key, label)).join('')}<td class="kb-notes"><span>${escapeHtml(row.note || '—')}</span><small>${escapeHtml(row.source || 'No source')} · ${row.verified ? 'Verified ' + escapeHtml(row.verified) : 'Unverified'}</small></td><td class="kb-row-actions"><button type="button" class="kb-link" data-kb-action="edit-terminal" data-id="${escapeHtml(row.id)}">Edit</button><button type="button" class="kb-link kb-delete" data-kb-action="delete-terminal" data-id="${escapeHtml(row.id)}">Delete</button></td></tr>`).join('')}`).join('')}
      ${ports.length ? '' : `<tr><td colspan="${services.length + 3}">No terminals yet. Select Add terminal.</td></tr>`}
    </tbody></table></div>`;
  }
  function contacts() {
    return `<div class="kb-contact-scroll"><table class="table kb-contact-table"><thead><tr><th>Port</th><th>Terminal</th><th>Contact name</th><th>Role / department</th><th>Phone</th><th>Email</th><th>Notes</th><th>Actions</th></tr></thead><tbody>
      ${state.contacts.length ? state.contacts.map(row => `<tr><td>${escapeHtml(row.port)}</td><td>${escapeHtml(row.terminal)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.role)}</td><td>${escapeHtml(row.phone)}</td><td>${escapeHtml(row.email)}</td><td>${escapeHtml(row.note)}</td><td class="kb-row-actions"><button type="button" class="kb-link" data-kb-action="edit-contact" data-id="${escapeHtml(row.id)}">Edit</button><button type="button" class="kb-link kb-delete" data-kb-action="delete-contact" data-id="${escapeHtml(row.id)}">Delete</button></td></tr>`).join('') : '<tr><td colspan="8">No contacts yet. Select Add contact.</td></tr>'}
      </tbody></table></div>`;
  }
  function render() {
    module.innerHTML = `<div class="kb-heading"><div><h2>Terminal Restriction and Contact list</h2><p>Reference matrix for service access and terminal contacts</p></div><span id="kbStorageStatus" class="small"></span></div>
      <div class="kb-alert">Terminal names are sample rows. Service permissions are intentionally blank until verified. Check the current terminal circular and record its source and verification date before operational use. Contact information is stored only in this browser.</div>
      <div class="kb-subtabs"><button type="button" class="tab ${activeSubtab === 'restrictions' ? 'active' : ''}" data-kb-subtab="restrictions">Terminal restrictions</button><button type="button" class="tab ${activeSubtab === 'contacts' ? 'active' : ''}" data-kb-subtab="contacts">Contact list</button></div>
      ${activeSubtab === 'restrictions' ? `<div class="kb-toolbar"><div class="kb-legend"><span class="kb-key kb-yes">✓ Allowed</span><span class="kb-key kb-no">✕ Restricted</span><span class="kb-key kb-unknown">— Unverified</span><span class="small">Click a cell to cycle its status.</span></div><button type="button" class="primary" data-kb-action="add-terminal">+ Add terminal</button></div>${terminalForm()}${matrix()}`
        : `<div class="kb-toolbar"><span class="small">Keep contacts current; confirm before use.</span><button type="button" class="primary" data-kb-action="add-contact">+ Add contact</button></div>${contactForm()}${contacts()}`}`;
    showStorageStatus();
  }
  module.addEventListener('click', event => {
    const subtab = event.target.closest('[data-kb-subtab]');
    if (subtab) { activeSubtab = subtab.dataset.kbSubtab; render(); return; }
    const button = event.target.closest('[data-kb-action]');
    if (!button) return;
    const { kbAction: action, id: rowId } = button.dataset;
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
  module.addEventListener('submit', event => {
    const terminalFormSubmitted = event.target.id === 'kbTerminalForm';
    const contactFormSubmitted = event.target.id === 'kbContactForm';
    if (!terminalFormSubmitted && !contactFormSubmitted) return;
    event.preventDefault();
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
})();

