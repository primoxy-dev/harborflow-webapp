const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = date => date.slice(8, 10) + '-' + months[Number(date.slice(5, 7)) - 1] + '-' + date.slice(2, 4);
const instance = new WeakMap();
const widths = [4, 15, 12, 3, 4, 5, 4, 18, 12, 11, 12];
const columns = ['NO.', 'NAME', 'RANK', 'DOB', 'AGE', 'Nearest Airport', 'RESIDENCE', 'CONTACT NO.', 'EMAIL'];
const sizes = ['A4', 'A3', 'letter'];
const orientations = ['landscape', 'portrait'];
const margins = ['8', '12', '18'];
const initialPrint = { size: 'A4', orientation: 'landscape', margin: '8' };
const emptyMessage = 'นำเข้าไฟล์ข้อมูลลูกเรือเพื่อแสดงตาราง';

async function request(action, payload) {
  const response = await fetch('/api/operations' + (payload ? '' : '?action=' + action), payload ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  } : { cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(Error(result.error || 'โหลดข้อมูลลูกเรือไม่สำเร็จ'), { status: response.status });
  return result;
}

function rosterHeading(roster, level) {
  return '<header class="hfc-document"><' + level + '>' + escapeHtml(roster.title) + '</' + level +
    '><p><span>Year ' + escapeHtml(roster.year) + '</span><span>Last updated <b>' +
    dateLabel(roster.updated) + '</b></span></p></header>';
}

function rosterTable(rows, spreadsheet) {
  const groups = [];
  rows.forEach((row, index) => {
    if (row[2].trim() || !groups.length) groups.push([]);
    groups.at(-1).push({ row, index });
  });
  const letters = spreadsheet ? '<tr class="hfc-letters" aria-hidden="true"><td></td>' +
    widths.map((_, index) => '<td>' + String.fromCharCode(65 + index) + '</td>').join('') + '</tr>' : '';
  const grid = groups.map(group => '<tbody>' + group.map(({ row, index }, groupIndex) =>
    '<tr>' + (spreadsheet ? '<td class="hfc-number" aria-hidden="true">' + (index + 4) + '</td>' : '') +
    row.map((value, column) => {
      if (column === 2 && groupIndex) return '';
      const attributes = column === 2 ? ' class="hfc-rank" rowspan="' + group.length + '"' :
        ([0, 3, 4, 5, 6].includes(column) ? ' class="hfc-center"' : '');
      return '<td' + attributes + '>' + escapeHtml(value) + '</td>';
    }).join('') + '</tr>').join('') + '</tbody>').join('');
  return '<table class="hfc-table" aria-label="Crew details"><colgroup>' +
    (spreadsheet ? '<col class="hfc-gutter">' : '') +
    widths.map(width => '<col style="width:' + width + '%">').join('') + '</colgroup><thead>' +
    letters + '<tr>' + (spreadsheet ? '<td class="hfc-number" aria-hidden="true">3</td>' : '') +
    columns.map(title => title === 'DOB' ? '<th scope="colgroup" colspan="3">DOB</th>' :
      '<th scope="col">' + title + '</th>').join('') + '</tr></thead>' + grid + '</table>';
}

function options(values, current, label = value => value) {
  return values.map(value => '<option value="' + value + '"' + (value === current ? ' selected' : '') +
    '>' + label(value) + '</option>').join('');
}

function settingsForm(settings) {
  return '<details class="hfc-print-settings"><summary>Page setup</summary><div class="hfc-page-options">' +
    '<label>Paper size <select name="size">' + options(sizes, settings.size, value => value === 'letter' ? 'Letter' : value) + '</select></label>' +
    '<label>Orientation <select name="orientation">' + options(orientations, settings.orientation,
      value => value === 'landscape' ? 'Landscape' : 'Portrait') + '</select></label>' +
    '<label>Margins <select name="margin">' + options(margins, settings.margin, value => value + ' mm') +
    '</select></label></div></details>';
}

function printMarkup(roster, settings) {
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Crew details</title><style>' +
    '@page{size:' + settings.size + ' ' + settings.orientation + ';margin:' + settings.margin + 'mm}' +
    'body{margin:0;color:#142b35;font:9pt/1.3 Arial,sans-serif}' +
    '.hfc-document{margin-bottom:10pt}.hfc-document h1{font-size:15pt;margin:0 0 4pt}' +
    '.hfc-document p{display:flex;gap:16pt;margin:0}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed}' +
    'thead{display:table-header-group}th,td{border:0.5pt solid #7f9095;padding:3pt 3.5pt;overflow-wrap:anywhere;white-space:pre-wrap}' +
    'th{background:#e9f1f1;print-color-adjust:exact;-webkit-print-color-adjust:exact}' +
    'tbody,tr{break-inside:avoid}td.hfc-rank{vertical-align:middle}td.hfc-center{text-align:center}' +
    '</style>' + rosterHeading(roster, 'h1') + rosterTable(roster.rows, false) + '</html>';
}

export function openCrewDetails(container, load = request) {
  if (!instance.has(container)) instance.set(container, mount(container, load));
  return instance.get(container)();
}

function mount(container, load) {
  let state = {};
  let busy = false;
  let printFrame;
  const settings = { ...initialPrint };
  const message = (value, error = false) => {
    const status = container.querySelector('.hfc-message');
    if (status) {
      status.textContent = value;
      status.classList.toggle('hfc-error', error);
    }
  };
  function render() {
    const { editable, roster } = state;
    container.innerHTML = '<div class="panel hfc-roster"><header class="hfc-toolbar"><h2>Crew’s details</h2><div class="hfc-actions">' +
      (editable ? '<label class="hfc-import">Import crew details<input type="file" accept=".json,application/json"></label>' : '') +
      (roster ? settingsForm(settings) + '<button type="button" class="primary" data-hfc-print>Print</button>' : '') +
      '</div></header><p class="hfc-message" role="status"></p>' +
      (roster ? rosterHeading(roster, 'h3') +
        '<div class="hfc-grid" role="region" aria-label="Crew spreadsheet" tabindex="0">' +
        rosterTable(roster.rows, true) + '</div>' : '<p>' + (editable ? emptyMessage : 'ไม่มีข้อมูลลูกเรือในบัญชีนี้') + '</p>') +
      '</div>';
  }

  container.addEventListener('change', async event => {
    const input = event.target;
    if (input.tagName === 'SELECT') {
      const valid = { size: sizes, orientation: orientations, margin: margins }[input.name];
      if (valid?.includes(input.value)) settings[input.name] = input.value;
      return;
    }
    const file = input.files?.[0];
    if (!file || !state.editable || busy) return;
    input.value = '';
    if (file.size > 250_000) { message('ไฟล์ต้องมีขนาดไม่เกิน 250 KB', true); return; }
    busy = true;
    input.disabled = true;
    message('กำลังบันทึกข้อมูลลูกเรือ…');
    try {
      const roster = JSON.parse(await file.text());
      state = await load('saveCrewDetails', { roster, revision: state.revision });
      render();
      message('บันทึกข้อมูลลูกเรือแล้ว');
    } catch (error) { message(error.message, true); }
    finally { busy = false; input.disabled = false; }
  });

  container.addEventListener('click', event => {
    if (!event.target.closest('[data-hfc-print]') || !state.roster) return;
    printFrame?.remove();
    const frame = document.createElement('iframe');
    printFrame = frame;
    frame.className = 'hfc-print-frame';
    frame.title = 'Crew details print preview';
    frame.tabIndex = -1;
    frame.addEventListener('load', () => {
      const win = frame.contentWindow;
      win.addEventListener('afterprint', () => frame.remove(), { once: true });
      win.focus();
      win.print();
    }, { once: true });
    frame.srcdoc = printMarkup(state.roster, settings);
    document.body.append(frame);
  });

  return async () => {
    if (busy) return;
    busy = true;
    container.innerHTML = '<div class="panel" role="status">กำลังโหลดข้อมูลลูกเรือ…</div>';
    try { state = await load('crewDetails'); render(); }
    catch (error) {
      state = {};
      render();
      message(error.status === 401 ? 'ลงชื่อเข้าใช้เพื่อเปิดข้อมูลลูกเรือ' :
        (error.status === 403 ? 'บัญชีนี้ต้องมีสิทธิ์ดูข้อมูลลูกเรือ' : error.message), true);
    } finally { busy = false; }
  };
}
