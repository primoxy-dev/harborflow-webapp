import { randomUUID } from 'node:crypto';
import { configReady, gh, json, knowledgeAccessPath, knowledgeContactsPath, knowledgeGrants, knowledgePath, knowledgeProposalsPath, nodeHandler, readJson, sameOrigin, sessionLogin } from '../lib/harborflow.mjs';

const owner = 'primoxy-dev';
const serviceKeys = new Set(['crew', 'supt', 'sire', 'class', 'engineer', 'spare', 'stores', 'medical', 'water', 'garbage', 'courier', 'offlandSmall', 'offlandHeavy']);
const field = (value, limit = 200) => {
  if (typeof value !== 'string' || value.length > limit) throw Error('Invalid or oversized field');
  return value.trim();
};
const bool = value => value === true;
const publicGrants = { restrictionEdit: false, contactView: false, contactEdit: false, administrator: false };

function restrictionsFrom(input) {
  if (!Array.isArray(input?.terminals) || input.terminals.length > 500) throw Error('Invalid terminal table');
  const ids = new Set(), names = new Set();
  const terminals = input.terminals.map(row => {
    if (!row || typeof row !== 'object') throw Error('Invalid terminal');
    const id = field(row.id, 80), port = field(row.port, 100), terminal = field(row.terminal, 100);
    const key = `${port.toLowerCase()}|${terminal.toLowerCase()}`;
    if (!id || !port || !terminal || ids.has(id) || names.has(key)) throw Error('Missing or duplicate terminal');
    ids.add(id); names.add(key);
    if (!row.restrictions || typeof row.restrictions !== 'object' || Array.isArray(row.restrictions)) throw Error('Invalid restrictions');
    const restrictions = {};
    for (const [service, status] of Object.entries(row.restrictions)) {
      if (!serviceKeys.has(service) || !['unknown', 'yes', 'no'].includes(status)) throw Error('Invalid service status');
      restrictions[service] = status;
    }
    const verified = field(row.verified || '', 10);
    if (verified && !/^\d{4}-\d{2}-\d{2}$/.test(verified)) throw Error('Invalid verification date');
    return { id, port, terminal, restrictions, source: field(row.source || '', 300), note: field(row.note || '', 1000), verified, ...(row.importRef ? { importRef: field(row.importRef, 100) } : {}) };
  });
  return { version: 2, terminals, updated: new Date().toISOString() };
}

function contactsFrom(input) {
  if (!Array.isArray(input?.contacts) || input.contacts.length > 500) throw Error('Invalid contact list');
  const ids = new Set();
  const contacts = input.contacts.map(row => {
    if (!row || typeof row !== 'object') throw Error('Invalid contact');
    const id = field(row.id, 80), port = field(row.port, 100), name = field(row.name, 100);
    if (!id || !port || !name || ids.has(id)) throw Error('Missing or duplicate contact');
    ids.add(id);
    return { id, port, name, terminal: field(row.terminal || '', 100), role: field(row.role || '', 100), phone: field(row.phone || '', 100), email: field(row.email || '', 200), note: field(row.note || '', 1000), ...(row.importRef ? { importRef: field(row.importRef, 100) } : {}) };
  });
  return { version: 1, contacts, updated: new Date().toISOString() };
}

function normalizedUsers(input) {
  if (!Array.isArray(input?.users) || input.users.length > 50) throw Error('Invalid access list');
  const seen = new Set();
  return input.users.map(item => {
    const login = field(item?.login, 39).toLowerCase();
    if (!/^[a-z0-9-]{1,39}$/.test(login) || login === owner || seen.has(login)) throw Error('Invalid GitHub username');
    seen.add(login);
    const g = item.grants || {};
    const grants = {
      restrictionEdit: bool(g.restrictionEdit),
      contactView: bool(g.contactView) || bool(g.contactEdit),
      contactEdit: bool(g.contactEdit)
    };
    const administrator = bool(item.administrator);
    if (!Object.values(grants).some(Boolean) && !administrator) throw Error('At least one permission is required');
    const githubId = Number(item.githubId);
    if (!Number.isSafeInteger(githubId) || githubId <= 0) throw Error('Verified GitHub profile is required');
    return { login, githubId, grants, administrator };
  });
}

async function githubProfile(login) {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_DOCUMENTS_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!response.ok) throw Error('GitHub profile could not be verified');
  const user = await response.json();
  if (String(user.login || '').toLowerCase() !== login || !Number.isSafeInteger(user.id)) throw Error('GitHub profile mismatch');
  return { login, id: user.id, avatarUrl: user.avatar_url, url: user.html_url };
}

async function save(path, body, validate, actor, label, allowImportRef = false) {
  if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'revision') || (typeof body.revision !== 'string' && body.revision !== null)) return json({ error: 'Revision is required' }, 400);
  const current = await readJson(path);
  if ((current?.sha || null) !== body.revision) return json({ error: 'This information changed on another device. Reload and compare before saving.' }, 409);
  const data = validate(body);
  if (path === knowledgePath || path === knowledgeContactsPath) {
    const key = path === knowledgePath ? 'terminals' : 'contacts';
    const before = new Map((current?.data?.[key] || []).map(row => [row.id, row]));
    if (!allowImportRef) {
      for (const row of data[key]) {
        if (before.get(row.id)?.importRef) row.importRef = before.get(row.id).importRef;
        else delete row.importRef;
      }
    }
    const after = new Map(data[key].map(row => [row.id, row]));
    const changes = [...new Set([...before.keys(), ...after.keys()])].flatMap(id => {
      const oldRow = before.get(id) || null, newRow = after.get(id) || null;
      return JSON.stringify(oldRow) === JSON.stringify(newRow) ? [] : [{ id, before: oldRow, after: newRow }];
    });
    data.history = (current?.data?.history || []).slice(-99);
    if (changes.length) data.history.push({ id: randomUUID(), actor, at: data.updated, changes });
  }
  try {
    const result = await gh('PUT', path, { message: `${label} by ${actor}`, content: Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64'), ...(current?.sha ? { sha: current.sha } : {}) });
    return json({ saved: true, revision: result.content?.sha, updated: data.updated });
  } catch (error) {
    if (/GitHub PUT failed \((409|422)\)/.test(error.message)) return json({ error: 'This information changed on another device. Reload and compare before saving.' }, 409);
    throw error;
  }
}

async function accessRoute(request, login, grants) {
  if (!login) return json({ error: 'Sign in to manage access' }, 401);
  if (!grants.administrator) return json({ error: 'Only Knowledge Base Administrators can manage access' }, 403);
  if (request.method === 'GET') {
    const file = await readJson(knowledgeAccessPath);
    return json({ users: file?.data?.users || [], revision: file?.sha || null, owner: login === owner });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
  if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
  const raw = await request.text();
  if (raw.length > 30000) return json({ error: 'Access list is too large' }, 413);
  const body = JSON.parse(raw);
  const current = await readJson(knowledgeAccessPath);
  if ((current?.sha || null) !== body.revision) return json({ error: 'Access list changed. Reload before saving.' }, 409);
  const users = normalizedUsers(body);
  const previous = current?.data?.users || [];
  if (login !== owner) {
    const protectedBefore = previous.filter(item => item.administrator || item.login === login);
    const protectedAfter = users.filter(item => item.administrator || item.login === login);
    if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) return json({ error: 'Only the owner can change administrator grants or your own access' }, 403);
  }
  for (const user of users) {
    const known = previous.find(item => item.login === user.login && item.githubId === user.githubId);
    if (!known) {
      const profile = await githubProfile(user.login);
      if (profile.id !== user.githubId) return json({ error: `GitHub profile changed for ${user.login}` }, 400);
    }
  }
  return save(knowledgeAccessPath, { ...body, users }, value => ({ version: 2, users: value.users, updated: new Date().toISOString() }), login, 'Update Knowledge base access');
}

async function proposalsRoute(request, login, grants) {
  if (!login) return json({ error: 'Sign in to submit or review imports' }, 401);
  if (!grants.restrictionEdit && !grants.contactView && login !== owner) return json({ error: 'Relevant data permission required' }, 403);
  const file = await readJson(knowledgeProposalsPath);
  const proposals = Array.isArray(file?.data?.proposals) ? file.data.proposals : [];
  if (request.method === 'GET') return json({ proposals: login === owner ? proposals : proposals.filter(item => item.submittedBy === login && (item.area === 'contacts' ? grants.contactView : grants.restrictionEdit)), revision: file?.sha || null });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
  const raw = await request.text();
  if (raw.length > 300000) return json({ error: 'Proposal is too large' }, 413);
  const body = JSON.parse(raw);
  const area = body.area;
  if (!['restrictions', 'contacts'].includes(area)) return json({ error: 'Invalid proposal area' }, 400);
  if (area === 'restrictions' ? !grants.restrictionEdit : !grants.contactView) return json({ error: 'Relevant data permission required' }, 403);
  if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 100) return json({ error: 'Proposal must contain 1–100 rows' }, 400);
  const key = area === 'contacts' ? 'contacts' : 'terminals';
  const validated = area === 'contacts' ? contactsFrom({ contacts: body.rows }) : restrictionsFrom({ terminals: body.rows });
  for (const row of validated[key]) delete row.importRef;
  if (proposals.length >= 50) return json({ error: 'Proposal queue is full' }, 409);
  const proposal = { id: randomUUID(), area, submittedBy: login, submittedAt: new Date().toISOString(), rows: validated[key].map(row => ({ id: randomUUID(), row, decision: 'pending' })) };
  const saved = await save(knowledgeProposalsPath, { revision: file?.sha || null, proposals: [...proposals, proposal] }, value => ({ version: 1, proposals: value.proposals, updated: new Date().toISOString() }), login, `Submit ${area} import proposal`);
  if (saved.status !== 200) return saved;
  return json({ proposalId: proposal.id, revision: (await saved.json()).revision });
}

async function decideRoute(request, login) {
  if (login !== owner) return json({ error: 'Only the owner can approve imports' }, login ? 403 : 401);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
  const raw = await request.text();
  if (raw.length > 20000) return json({ error: 'Decision is too large' }, 413);
  const body = JSON.parse(raw);
  if (!['add', 'replace', 'reject'].includes(body.action)) return json({ error: 'Invalid decision' }, 400);
  const queue = await readJson(knowledgeProposalsPath);
  if (!queue || queue.sha !== body.proposalRevision) return json({ error: 'Proposal queue changed. Reload.' }, 409);
  const proposals = queue.data.proposals;
  const proposal = proposals.find(item => item.id === body.proposalId);
  const candidate = proposal?.rows.find(item => item.id === body.rowId);
  if (!candidate || candidate.decision !== 'pending') return json({ error: 'Pending proposal row not found' }, 404);
  const area = proposal.area, key = area === 'contacts' ? 'contacts' : 'terminals';
  const path = area === 'contacts' ? knowledgeContactsPath : knowledgePath;
  const current = await readJson(path);
  if (body.action !== 'reject') {
    const importRef = `${proposal.id}:${candidate.id}`;
    const alreadyApplied = (current?.data?.[key] || []).some(row => row.importRef === importRef);
    if (!alreadyApplied) {
      if ((current?.sha || null) !== body.dataRevision) return json({ error: 'Published data changed. Reload before approving.' }, 409);
      const rows = [...(current?.data?.[key] || [])];
      const imported = { ...candidate.row, importRef };
      if (body.action === 'add') rows.push(imported);
      else {
        const index = rows.findIndex(row => row.id === body.targetId);
        if (index < 0) return json({ error: 'Replacement target not found' }, 404);
        imported.id = rows[index].id;
        rows[index] = imported;
      }
      const result = await save(path, { revision: current?.sha || null, [key]: rows }, area === 'contacts' ? contactsFrom : restrictionsFrom, login, `Approve import ${importRef}`, true);
      if (result.status !== 200) return result;
    }
  }
  candidate.decision = body.action === 'reject' ? 'rejected' : 'approved';
  candidate.decidedBy = login;
  candidate.decidedAt = new Date().toISOString();
  const result = await save(knowledgeProposalsPath, { revision: queue.sha, proposals }, value => ({ version: 1, proposals: value.proposals, updated: new Date().toISOString() }), login, `Decide import ${proposal.id}`);
  return result;
}

async function route(request) {
  if (!configReady()) return json({ error: 'Shared storage is not configured' }, 503);
  const login = sessionLogin(request);
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');
    const grants = login ? await knowledgeGrants(login) : publicGrants;
    if (mode === 'access') return accessRoute(request, login, grants);
    if (mode === 'proposals') return proposalsRoute(request, login, grants);
    if (mode === 'decide') return decideRoute(request, login);
    if (mode === 'profile') {
      if (!grants.administrator) return json({ error: 'Administrator access required' }, login ? 403 : 401);
      const candidate = String(url.searchParams.get('login') || '').trim().toLowerCase();
      if (!/^[a-z0-9-]{1,39}$/.test(candidate)) return json({ error: 'Invalid GitHub username' }, 400);
      return json(await githubProfile(candidate));
    }
    const area = url.searchParams.get('area') || 'restrictions';
    if (!['restrictions', 'contacts'].includes(area)) return json({ error: 'Unknown knowledge area' }, 400);
    if (area === 'contacts' && !grants.contactView && !(mode === 'history' && grants.administrator)) return json({ error: 'Contact list access required' }, login ? 403 : 401);
    const path = area === 'contacts' ? knowledgeContactsPath : knowledgePath;
    if (mode === 'history') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const file = await readJson(path);
      const canReadHistory = area === 'contacts' ? grants.contactEdit || grants.administrator : grants.restrictionEdit || grants.administrator;
      if (!canReadHistory) return json({ updated: file?.data?.updated || null, history: [] });
      const details = area === 'contacts' ? grants.contactView && (grants.contactEdit || grants.administrator) : grants.restrictionEdit || grants.administrator;
      return json({ updated: file?.data?.updated || null, history: (file?.data?.history || []).slice().reverse().map(entry => ({ id: entry.id, actor: entry.actor, at: entry.at, count: entry.changes.length, ...(details ? { changes: entry.changes } : {}) })) });
    }
    if (mode === 'restore') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (login !== owner) return json({ error: 'Only the owner can restore a revision' }, login ? 403 : 401);
      if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
      const raw = await request.text();
      if (raw.length > 10000) return json({ error: 'Request is too large' }, 413);
      const body = JSON.parse(raw);
      const current = await readJson(path);
      if (!current || current.sha !== body.revision) return json({ error: 'Information changed. Reload before restoring.' }, 409);
      const entry = (current.data.history || []).find(item => item.id === body.changeId);
      if (!entry) return json({ error: 'Revision not found' }, 404);
      const key = area === 'contacts' ? 'contacts' : 'terminals';
      const rows = new Map((current.data[key] || []).map(row => [row.id, row]));
      for (const change of entry.changes) {
        if (JSON.stringify(rows.get(change.id) || null) !== JSON.stringify(change.after)) return json({ error: 'This record changed again. Review the current version.' }, 409);
        if (change.before) rows.set(change.id, change.before);
        else rows.delete(change.id);
      }
      return save(path, { revision: current.sha, [key]: [...rows.values()] }, area === 'contacts' ? contactsFrom : restrictionsFrom, login, `Restore ${area}`, true);
    }
    if (request.method === 'GET') {
      const file = await readJson(path);
      const data = area === 'contacts'
        ? { contacts: file?.data?.contacts || [], updated: file?.data?.updated || null }
        : { terminals: file?.data?.terminals || [], updated: file?.data?.updated || null };
      return json({ area, login, grants, role: area === 'contacts' ? grants.contactEdit ? 'editor' : 'viewer' : grants.restrictionEdit ? 'editor' : 'viewer', data, revision: file?.sha || null });
    }
    if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
    if (!login) return json({ error: 'Sign in with GitHub to edit the Knowledge base' }, 401);
    if ((area === 'contacts' && !grants.contactEdit) || (area === 'restrictions' && !grants.restrictionEdit)) return json({ error: 'Edit access required' }, 403);
    if (!sameOrigin(request)) return json({ error: 'Invalid origin' }, 403);
    const raw = await request.text();
    if (raw.length > 600000) return json({ error: 'Information is too large' }, 413);
    return save(path, JSON.parse(raw), area === 'contacts' ? contactsFrom : restrictionsFrom, login, `Save ${area}`);
  } catch (error) {
    const bad = error instanceof SyntaxError || /Invalid|Missing|Duplicate|required|mismatch/.test(error.message || '');
    return json({ error: error instanceof SyntaxError ? 'Invalid JSON' : error.message || 'Shared storage failed' }, bad ? 400 : 503);
  }
}

export default nodeHandler(route);

