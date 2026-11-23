import { archiveCounts, handoverByteLimit, validHandoverCase, validateHandover } from './lib/handover-catalog.mjs';
import { bindHandoverMindMap, renderHandoverMindMap } from './operations-handover-map.mjs';

const endpoint = '/api/operations';
const instances = new WeakMap();
const defaultCase = 'งานปัจจุบัน';
const mapSection = '@mind-map';
const mapArtwork = './assets/fvsb-handover-illustrations.webp';
const views = [
  ['sop', 'SOP และเช็กลิสต์'],
  ['email', 'รูปแบบอีเมล'],
  ['sources', 'อีเมลต้นทาง']
];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dateLabel = date => new Intl.DateTimeFormat('th-TH', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
}).format(new Date(date + 'T00:00:00Z'));
const evidence = ids => ids.map(id => '<span class="hfh-ref">' + escape(id) + '</span>').join('');
const list = values => '<ul>' + values.map(value => '<li>' + escape(value) + '</li>').join('') + '</ul>';
const badge = value => '<span class="hfh-badge">' + escape(value) + '</span>';

async function request(input) {
  const options = input ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  } : { cache: 'no-store' };
  const response = await fetch(input ? endpoint : endpoint + '?action=handover', options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(data.error || 'โหลดข้อมูล Handover ไม่สำเร็จ'), { status: response.status });
  return data;
}

function importControl(hasCatalog) {
  return `<label class="hfh-import">
    <input type="file" data-hfh-import accept=".json,application/json">
    <span>${hasCatalog ? 'แทนที่ไฟล์คู่มือ' : 'นำเข้าไฟล์คู่มือ JSON'}</span>
  </label>`;
}

export function openOperationsHandover(root) {
  let instance = instances.get(root);
  if (!instance) {
    instance = createWorkspace(root);
    instances.set(root, instance);
  }
  return instance.load();
}

function createWorkspace(root) {
  let catalog = null, revision = null, progress = {};
  let section = 'overview', view = 'sop', selectedTemplate = '', term = '', caseRef = defaultCase;
  let loading = null, busy = false;

  const workflow = () => catalog?.workflows.find(item => item.id === section);
  const contacts = ids => ids.map(id => catalog.contacts.find(contact => contact.id === id));
  const role = name => catalog.roles[name];
  const currentCheck = (work, step) => Object.hasOwn(progress, caseRef) &&
    progress[caseRef]?.[work]?.[step] === true;

  function accept(data) {
    catalog = data.catalog;
    revision = data.revision;
    progress = data.progress || {};
    if (section !== 'overview' && section !== mapSection && !workflow()) section = 'overview';
  }

  function load() {
    if (loading || busy) return loading;
    root.innerHTML = '<div class="panel" role="status">กำลังโหลด Operations Handover…</div>';
    loading = request().then(data => {
      accept(data);
      render();
    }).catch(error => {
      catalog = null;
      progress = {};
      const message = error.status === 401 ? 'ลงชื่อเข้าใช้ HarborFlow เพื่อเปิดคู่มือรับช่วงงาน' :
        error.status === 403 ? 'บัญชีนี้ต้องมีสิทธิ์ Operations เพื่อเปิดคู่มือ' : error.message;
      root.innerHTML = `<div class="hfh-empty hfh-shell"><h2>Operations Handover</h2>
        <p role="alert">${escape(message)}</p><button type="button" data-hfh-retry>โหลดอีกครั้ง</button></div>`;
    }).finally(() => { loading = null; });
    return loading;
  }

  function feedback(message, failed = false) {
    const status = root.querySelector('[data-hfh-feedback]');
    if (status) {
      status.textContent = message;
      status.classList.toggle('error', failed);
    }
  }

  function render() {
    if (!catalog) {
      root.innerHTML = `<div class="hfh-empty hfh-shell">
        <h2>Operations Handover</h2><p>นำเข้าไฟล์คู่มือเพื่อเปิด SOP เช็กลิสต์ และรูปแบบอีเมลในบัญชีของคุณ</p>
        ${importControl(false)}<p class="hfh-feedback" role="status" data-hfh-feedback></p>
      </div>`;
      return;
    }
    const counts = archiveCounts(catalog);
    root.innerHTML = `<div class="hfh-shell">
      <header class="hfh-hero">
        <div><h2>${escape(catalog.title)}</h2><p>${escape(catalog.account)}</p></div>
        <div class="hfh-hero-import">${importControl(true)}</div>
        <dl class="hfh-stats">
          <div><dt>ไฟล์ต้นทาง</dt><dd>${counts.files}</dd></div>
          <div><dt>อีเมลหลังรวมสำเนา</dt><dd>${counts.messages}</dd></div>
          <div><dt>หมวดงาน</dt><dd>${catalog.workflows.length}</dd></div>
        </dl>
      </header>
      <p class="hfh-feedback" role="status" data-hfh-feedback></p>
      <label class="hfh-mobile-menu"><span>หมวดงาน</span><select data-hfh-mobile>
        <option value="overview">คิวรับช่วง</option>
        <option value="${mapSection}">Mind Map</option>
        ${catalog.categories.map(category => `<optgroup label="${escape(category.title)}">${catalog.workflows
          .filter(item => item.category === category.id).map(item =>
            `<option value="${escape(item.id)}">${escape(item.title)}</option>`).join('')}</optgroup>`).join('')}
      </select></label>
      <div class="hfh-layout">
        <aside class="hfh-sidebar" aria-label="เมนูคู่มือ">
          <label class="hfh-search"><span>ค้นหาในคู่มือ</span><input type="search" data-hfh-search placeholder="ชื่อเรื่อง ผู้รับ หรือรหัสเมล" value="${escape(term)}"></label>
          <nav data-hfh-menu aria-label="หมวดงาน"></nav>
        </aside>
        <div class="hfh-main" data-hfh-main></div>
      </div>
    </div>`;
    renderMenu();
    renderMain();
    root.querySelector('[data-hfh-mobile]').value = section;
  }

  function matches(work, query) {
    if (!query) return true;
    const people = work.templates.flatMap(item => contacts([...item.from, ...item.to, ...item.cc]))
      .flatMap(person => [person.name, person.email]);
    return [work.title, work.summary, work.category, ...work.sources, ...people,
      ...work.templates.flatMap(item => [item.title, item.subject])]
      .some(value => value.toLowerCase().includes(query));
  }

  function navButton(id, title, count = '') {
    return `<button type="button" data-hfh-section="${escape(id)}"${section === id ? ' aria-current="page"' : ''}>
      <span>${escape(title)}</span>${count ? '<small>' + count + '</small>' : ''}
    </button>`;
  }

  function renderMenu() {
    const query = term.trim().toLowerCase();
    const groups = catalog.categories.map(category => {
      const rows = catalog.workflows.filter(work => work.category === category.id && matches(work, query));
      return rows.length ? `<section class="hfh-menu-group"><h3>${escape(category.title)}</h3>
        ${rows.map(work => navButton(work.id, work.title)).join('')}</section>` : '';
    }).join('');
    root.querySelector('[data-hfh-menu]').innerHTML =
      navButton('overview', 'คิวรับช่วง', catalog.followups.length) + navButton(mapSection, 'Mind Map') +
      (groups || '<p class="hfh-muted">ไม่พบหมวดงานที่ตรงคำค้น</p>');
  }

  function renderOverview() {
    const { roles, archive } = catalog;
    return `<header class="hfh-panel-head"><h3>คิวรับช่วง</h3>
      <p>รายการที่ควรตรวจต่อจากสถานะที่พบใน ${escape(archive.name)} ถึง ${escape(dateLabel(archive.to))}</p></header>
      <dl class="hfh-owners">
        <div><dt>ผู้ส่งต่องาน</dt><dd>${escape(roles.outgoing)}</dd></div>
        <div><dt>ประสานและยืนยันงาน</dt><dd>${escape(roles.lead)}</dd></div>
        <div><dt>เตรียมข้อมูลและติดตาม</dt><dd>${escape(roles.assistant)}</dd></div>
      </dl>
      <div class="hfh-queue">
        ${catalog.followups.map(item => `<article>
          <div class="hfh-queue-title"><h4>${escape(item.title)}</h4>${badge(role(item.owner))}</div>
          <p>${escape(item.observed)}</p>
          <p><b>ตรวจต่อ</b> ${escape(item.next)}</p>
          <footer><span class="hfh-refs">${evidence(item.sources)}</span><button type="button" data-hfh-section="${escape(item.workflow)}">เปิด SOP</button></footer>
        </article>`).join('') || '<p>เปิดหมวดงานเพื่อดูขั้นตอน</p>'}
      </div>
      <details class="hfh-archive-note"><summary>ขอบเขตอีเมลที่ใช้วิเคราะห์</summary>
        <p>${escape(dateLabel(archive.from))} ถึง ${escape(dateLabel(archive.to))} · ${escape(archive.note)}</p>
      </details>`;
  }

  function renderSop(work) {
    const done = work.steps.filter(step => currentCheck(work.id, step.id)).length;
    const cases = [...new Set([defaultCase, caseRef, ...Object.keys(progress)])];
    return `<div class="hfh-sop">
      <dl class="hfh-boundaries">
        <div><dt>เริ่มเมื่อ</dt><dd>${escape(work.start)}</dd></div>
        <div><dt>ปิดงานเมื่อ</dt><dd>${escape(work.done)}</dd></div>
      </dl>
      <div class="hfh-check-head"><div><h4>เช็กลิสต์</h4><p>${escape(caseRef)} · ${done}/${work.steps.length} เสร็จแล้ว</p></div>
        <form data-hfh-case><label>Job No. / เคส <input name="caseRef" maxlength="80" list="hfh-case-refs" value="${escape(caseRef)}" required></label>
          <datalist id="hfh-case-refs">${cases.map(name => '<option value="' + escape(name) + '"></option>').join('')}</datalist>
          <button type="submit">เปิดเช็กลิสต์</button>
        </form>
      </div>
      <progress aria-label="ความคืบหน้าเช็กลิสต์" max="${work.steps.length}" value="${done}"></progress>
      <ol class="hfh-checklist">${work.steps.map(step => `<li><label>
        <input type="checkbox" data-hfh-step="${escape(step.id)}"${currentCheck(work.id, step.id) ? ' checked' : ''}>
        <span><b>${escape(step.title)}</b><small>${escape(step.detail)}</small></span>
        ${badge(role(step.owner))}
      </label></li>`).join('')}</ol>
      ${work.notes.length ? '<div class="hfh-notes"><h4>จุดตรวจ</h4>' + list(work.notes) + '</div>' : ''}
      ${work.related.length ? `<div class="hfh-related"><h4>งานที่เชื่อมกัน</h4>
        ${work.related.map(id => `<button type="button" data-hfh-section="${escape(id)}">${escape(catalog.workflows.find(item => item.id === id).title)}</button>`).join('')}
      </div>` : ''}
    </div>`;
  }

  function renderRecipientRow(label, ids, copy) {
    if (!ids.length) return '';
    return `<div class="hfh-recipient-row"><dt>${label}</dt><dd>${contacts(ids).map(person => `<div class="hfh-contact">
      <b>${escape(person.name)}</b>${person.email ? '<span>' + escape(person.email) + '</span>' : '<span>' + escape(person.note) + '</span>'}
    </div>`).join('')}</dd>${copy ? `<button type="button" data-hfh-copy="${copy}">คัดลอก ${label}</button>` : ''}</div>`;
  }

  function renderEmail(work) {
    const template = work.templates.find(item => item.id === selectedTemplate) || work.templates[0];
    selectedTemplate = template.id;
    const outgoing = template.direction === 'outgoing';
    return `<div class="hfh-email">
      <label class="hfh-template-picker"><span>เลือกสถานการณ์</span><select data-hfh-template>${work.templates.map(item =>
        `<option value="${escape(item.id)}"${item.id === template.id ? ' selected' : ''}>${escape(item.title)}</option>`).join('')}</select></label>
      <header class="hfh-template-head"><h4>${escape(template.title)}</h4>${badge(outgoing ? 'อีเมลส่งออก' : 'อีเมลรับเข้า')}</header>
      <p>${escape(template.when)}</p>
      <dl class="hfh-recipients">${renderRecipientRow('From', template.from, '')}${renderRecipientRow('To', template.to, outgoing ? 'to' : '')}
        ${renderRecipientRow('CC', template.cc, outgoing ? 'cc' : '')}</dl>
      <div class="hfh-mail-field"><h4>Subject</h4>${outgoing ? '<button type="button" data-hfh-copy="subject">คัดลอกหัวข้อ</button>' : ''}
        <p>${escape(template.subject)}</p></div>
      <div class="hfh-mail-field"><h4>${outgoing ? 'Body' : 'ข้อมูลที่ต้องอ่านจากเมล'}</h4>
        ${outgoing ? '<button type="button" data-hfh-copy="body">คัดลอกเนื้อหา</button>' : ''}
        <div class="hfh-mail-body">${escape(template.body)}</div></div>
      ${outgoing ? '<p class="hfh-muted">แทนค่าข้อมูลใน {{…}} และตรวจผู้รับก่อนส่ง</p>' : ''}
      ${template.attachments.length ? '<div class="hfh-notes"><h4>ไฟล์แนบ</h4>' + list(template.attachments) + '</div>' : ''}
      ${template.notes.length ? '<div class="hfh-notes"><h4>ข้อสังเกต</h4>' + list(template.notes) + '</div>' : ''}
      <div class="hfh-refs" aria-label="อ้างอิงจากอีเมล">${evidence(template.sources)}</div>
    </div>`;
  }

  function renderSources(work) {
    const workIds = new Set(work.sources);
    const records = catalog.sources.filter(item => workIds.has(item.id));
    const direction = { outgoing: 'ส่งออก', incoming: 'รับเข้า', system: 'ระบบ' };
    return `<section class="hfh-sources"><h4>อีเมลต้นทาง ${records.length} รายการ</h4>
      <ul>${records.map(item => `<li>${evidence([item.id])}<div><b>${escape(item.label)}</b>
        <small>${escape(dateLabel(item.date))} · ${escape(item.sender)} · ${direction[item.direction]}${item.duplicateOf ? ' · สำเนาของ ' + escape(item.duplicateOf) : ''}</small>
      </div></li>`).join('')}</ul></section>`;
  }

  function renderMain() {
    const box = root.querySelector('[data-hfh-main]');
    if (section === 'overview') {
      box.innerHTML = renderOverview();
      return;
    }
    if (section === mapSection) {
      box.innerHTML = renderHandoverMindMap(catalog, mapArtwork, { workspace: true });
      bindHandoverMindMap(box.querySelector('[data-hfm-root]'));
      return;
    }
    const work = workflow();
    box.innerHTML = `<header class="hfh-panel-head"><div class="hfh-work-title"><h3>${escape(work.title)}</h3>${badge(role(work.owner))}</div>
      <p>${escape(work.summary)}</p></header>
      <div class="hfh-view-switch" role="group" aria-label="ข้อมูลของหมวดงาน">
        ${views.map(([id, title]) => `<button type="button" data-hfh-view="${id}" aria-pressed="${view === id}">${title}</button>`).join('')}
      </div>
      <div class="hfh-view-content">${view === 'email' ? renderEmail(work) : view === 'sources' ? renderSources(work) : renderSop(work)}</div>`;
  }

  function selectSection(id, fromMenu, nextView = 'sop') {
    section = id;
    view = nextView;
    selectedTemplate = '';
    root.querySelector('[data-hfh-mobile]').value = id;
    renderMenu();
    renderMain();
    feedback('');
    if (fromMenu) {
      root.querySelector('[data-hfh-menu] [aria-current="page"]')?.focus({ preventScroll: true });
    } else {
      const heading = root.querySelector('[data-hfh-main] h3');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus();
    }
  }

  async function importFile(file) {
    if (!file || busy) return;
    if (file.size > handoverByteLimit - 256) { feedback('ไฟล์คู่มือใหญ่เกิน 300 KB', true); return; }
    busy = true;
    feedback('กำลังอ่านไฟล์คู่มือ…');
    try {
      const data = validateHandover(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
      accept(await request({ action: 'importHandover', revision, catalog: data }));
      section = 'overview'; view = 'sop'; term = ''; caseRef = defaultCase;
      render();
      feedback('บันทึกคู่มือในบัญชี Operations แล้ว');
    } catch (error) { feedback(error.message, true); }
    finally { busy = false; }
  }

  async function saveCheck(input) {
    const clicked = input.dataset.hfhStep, work = workflow();
    if (busy) { input.checked = !input.checked; return; }
    busy = true;
    const value = input.checked;
    root.querySelectorAll('[data-hfh-step]').forEach(control => { control.disabled = true; });
    try {
      const result = await request({ action: 'checkHandoverStep', revision, caseRef, workflow: work.id, step: clicked, checked: value });
      progress = result.progress;
      feedback('บันทึกเช็กลิสต์แล้ว');
    } catch (error) { feedback(error.message, true); }
    finally {
      busy = false;
      if (section === work.id && view === 'sop') {
        renderMain();
        root.querySelector('[data-hfh-step="' + clicked + '"]')?.focus({ preventScroll: true });
      }
    }
  }

  function copyValue(key) {
    const work = workflow();
    const template = work.templates.find(item => item.id === selectedTemplate);
    if (key === 'to' || key === 'cc') {
      return contacts(template[key]).map(person => person.email || '{{EMAIL_FROM_CURRENT_CASE}}').join('; ');
    }
    return template[key];
  }

  async function downloadMindMap(button) {
    const map = button.closest('[data-hfm-root]');
    const status = map.querySelector('[data-hfm-pdf-status]');
    const name = catalog.title.replace(/ Operations Handover$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
      .trim().replace(/\s+/g, '-') || 'Operations';
    button.disabled = true;
    status.textContent = 'กำลังสร้าง PDF…';
    try {
      const { createHandoverMapPdf } = await import('./operations-handover-map-pdf.mjs');
      const pdf = await createHandoverMapPdf(map, mapArtwork);
      await window.HarborFlowOktbPdf.saveLivePdf(pdf, name + '-Mind-Map.pdf');
      status.textContent = 'ดาวน์โหลด PDF แล้ว';
    } catch {
      status.textContent = 'สร้าง PDF ไม่สำเร็จ กรุณาลองอีกครั้ง';
    } finally {
      button.disabled = false;
    }
  }

  root.addEventListener('input', event => {
    if (!event.target.matches('[data-hfh-search]')) return;
    term = event.target.value;
    renderMenu();
  });
  root.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-hfh-import]')) {
      const [file] = input.files;
      input.value = '';
      void importFile(file);
    } else if (input.matches('[data-hfh-step]')) {
      void saveCheck(input);
    } else if (input.matches('[data-hfh-mobile]')) {
      selectSection(input.value, false);
    } else if (input.matches('[data-hfh-template]')) {
      selectedTemplate = input.value;
      renderMain();
      root.querySelector('[data-hfh-template]')?.focus({ preventScroll: true });
    }
  });
  root.addEventListener('submit', event => {
    if (!event.target.matches('[data-hfh-case]')) return;
    event.preventDefault();
    if (busy) return;
    const name = String(new FormData(event.target).get('caseRef') || '').trim();
    if (!validHandoverCase(name)) { feedback('ระบุชื่อเคสหรือ Job No. ไม่เกิน 80 ตัวอักษร', true); return; }
    caseRef = name;
    renderMain();
    feedback('เปิดเช็กลิสต์ของ ' + caseRef);
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-hfh-retry]')) { void load(); return; }
    if (button.matches('[data-hfm-download]')) { void downloadMindMap(button); return; }
    if (button.dataset.hfhSection) {
      selectSection(button.dataset.hfhSection, Boolean(button.closest('[data-hfh-menu]')), button.dataset.hfhOpenView);
      return;
    }
    if (button.dataset.hfhView) {
      view = button.dataset.hfhView;
      renderMain();
      root.querySelector('[data-hfh-view][aria-pressed="true"]')?.focus({ preventScroll: true });
      return;
    }
    if (button.dataset.hfhCopy) {
      try {
        await navigator.clipboard.writeText(copyValue(button.dataset.hfhCopy));
        feedback('คัดลอกแล้ว');
        const label = button.dataset.copyLabel || button.textContent;
        button.dataset.copyLabel = label;
        button.textContent = 'คัดลอกแล้ว';
        setTimeout(() => { if (button.isConnected) button.textContent = label; }, 1400);
      } catch { feedback('คัดลอกอัตโนมัติไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอก', true); }
    }
  });

  return { load };
}
