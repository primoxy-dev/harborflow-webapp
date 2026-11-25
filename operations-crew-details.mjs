const escapeHtml = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = date => date.slice(8, 10) + '-' + months[Number(date.slice(5, 7)) - 1] + '-' + date.slice(2, 4);
const instance = new WeakMap();
const widths = [4, 15, 12, 3, 4, 5, 4, 18, 12, 11, 12];
const columns = ['NO.', 'NAME', 'RANK', 'DOB', 'AGE', 'Nearest Airport', 'RESIDENCE', 'CONTACT NO.', 'EMAIL'];
const cellLabels = ['No.', 'Name', 'Rank', 'Birth day', 'Birth month', 'Birth year', 'Age', 'Nearest airport', 'Residence', 'Contact no.', 'Email'];
const sizes = ['A4', 'A3', 'letter', 'legal'];
const orientations = ['landscape', 'portrait'];
const marginSides = ['Top', 'Right', 'Bottom', 'Left'];
const initialPrint = { size: 'A4', orientation: 'landscape', Top: 8, Right: 8, Bottom: 8, Left: 8, font: 9, first: 1, last: '', repeat: true, gridlines: true };
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

function rosterTable(rows, spreadsheet, editing = false) {
  const groups = [];
  rows.forEach((row, index) => {
    if (row[2].trim() || !groups.length) groups.push([]);
    groups.at(-1).push({ row, index });
  });
  const letters = spreadsheet ? '<tr class="hfc-letters" aria-hidden="true"><td></td>' +
    widths.map((_, index) => '<td>' + String.fromCharCode(65 + index) + '</td>').join('') + '</tr>' : '';
  const grid = groups.map(group => '<tbody>' + group.map(({ row, index }, groupIndex) =>
    '<tr>' + (spreadsheet ? '<td class="hfc-number">' + (index + 4) + (editing ?
      '<button type="button" data-hfc-remove="' + index + '" aria-label="Remove row ' + (index + 1) + '">×</button>' : '') + '</td>' : '') +
    row.map((value, column) => {
      if (column === 2 && groupIndex && !editing) {
        return spreadsheet ? '<td class="hfc-mobile-rank" data-label="Rank">' + escapeHtml(group[0].row[2]) + '</td>' : '';
      }
      const attributes = column === 2 && !editing ? ' class="hfc-rank" rowspan="' + group.length + '"' :
        ([0, 3, 4, 5, 6].includes(column) ? ' class="hfc-center"' : '');
      return '<td' + attributes + (spreadsheet ? ' data-label="' + cellLabels[column] + '"' : '') + '>' +
        (editing ? '<textarea rows="1" maxlength="500" aria-label="' + cellLabels[column] + ', row ' + (index + 1) +
          '" data-row="' + index + '" data-column="' + column + '">\n' + escapeHtml(value) + '</textarea>' : escapeHtml(value)) + '</td>';
    }).join('') + '</tr>').join('') + '</tbody>').join('');
  return '<table class="hfc-table" aria-label="Crew details"><colgroup>' +
    (spreadsheet ? '<col class="hfc-gutter">' : '') +
    widths.map(width => '<col style="width:' + (spreadsheet ? width * .975 : width) + '%">').join('') + '</colgroup><thead>' +
    letters + '<tr>' + (spreadsheet ? '<td class="hfc-number" aria-hidden="true">3</td>' : '') +
    columns.map(title => title === 'DOB' ? '<th scope="colgroup" colspan="3">DOB</th>' :
      '<th scope="col">' + title + '</th>').join('') + '</tr></thead>' + grid + '</table>';
}

function options(values, current, label = value => value) {
  return values.map(value => '<option value="' + value + '"' + (value === current ? ' selected' : '') +
    '>' + label(value) + '</option>').join('');
}

function settingsForm(settings, total, open) {
  const number = (label, name, min, max, unit = '') =>
    '<label>' + label + unit + '<input type="number" name="' + name + '" min="' + min + '" max="' + max +
    '" value="' + settings[name] + '"></label>';
  const checkbox = (label, name) => '<label class="hfc-check"><input type="checkbox" name="' + name +
    '"' + (settings[name] ? ' checked' : '') + '>' + label + '</label>';
  return '<details class="hfc-print-settings"' + (open ? ' open' : '') + '><summary>Page setup</summary><div class="hfc-page-options">' +
    '<fieldset><legend>Paper</legend><label>Paper size <select name="size">' + options(sizes, settings.size,
      value => ({ letter: 'Letter', legal: 'Legal' })[value] || value) + '</select></label>' +
    '<label>Orientation <select name="orientation">' + options(orientations, settings.orientation,
      value => value === 'landscape' ? 'Landscape' : 'Portrait') + '</select></label></fieldset>' +
    '<fieldset><legend>Margins (mm)</legend>' + marginSides.map(side => number(side, side, 0, 40)).join('') + '</fieldset>' +
    '<fieldset><legend>Table</legend>' + number('Font size', 'font', 6, 16, ' (pt)') +
    checkbox('Repeat column headers', 'repeat') + checkbox('Print gridlines', 'gridlines') + '</fieldset>' +
    '<fieldset><legend>Rows (1–' + total + ')</legend>' + number('First row', 'first', 1, total) +
    number('Last row', 'last', 1, total) + '<small>Leave Last row blank to print to the end.</small></fieldset></div></details>';
}

function printMarkup(roster, settings) {
  const start = settings.first - 1;
  const rows = roster.rows.slice(start, settings.last || undefined);
  if (!rows[0][2].trim()) {
    const prior = roster.rows.slice(0, start).findLast(row => row[2].trim());
    if (prior) rows[0] = rows[0].map((value, column) => column === 2 ? prior[2] : value);
  }
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Crew details</title><style>' +
    '@page{size:' + settings.size + ' ' + settings.orientation + ';margin:' + marginSides.map(side => settings[side] + 'mm').join(' ') + '}' +
    'body{margin:0;color:#142b35;font:' + settings.font + 'pt/1.3 Arial,sans-serif}' +
    '.hfc-document{margin-bottom:10pt}.hfc-document h1{font-size:15pt;margin:0 0 4pt}' +
    '.hfc-document p{display:flex;gap:16pt;margin:0}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed}' +
    'thead{display:' + (settings.repeat ? 'table-header-group' : 'table-row-group') + '}th,td{' +
    (settings.gridlines ? 'border:0.5pt solid #7f9095;' : '') + 'padding:3pt 3.5pt;overflow-wrap:anywhere;white-space:pre-wrap}' +
    'th{background:#e9f1f1;print-color-adjust:exact;-webkit-print-color-adjust:exact}' +
    'tbody,tr{break-inside:avoid}td.hfc-rank{vertical-align:middle}td.hfc-center{text-align:center}' +
    '</style>' + rosterHeading(roster, 'h1') + rosterTable(rows, false) + '</html>';
}

function pastedRows(text) {
  const rows = [[]];
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (const [match, quoted, plain, end] of normalized.matchAll(/(?:"((?:[^"]|"")*)"|([^\t\n]*))([\t\n]|$)/g)) {
    if (!match && !normalized.endsWith('\t')) break;
    rows.at(-1).push(quoted === undefined ? plain : quoted.replaceAll('""', '"'));
    if (end === '\n') rows.push([]);
  }
  return rows;
}

export function openCrewDetails(container, load = request) {
  if (!instance.has(container)) instance.set(container, mount(container, load));
  return instance.get(container)();
}

function mount(container, load) {
  let state = {};
  let busy = false;
  let printFrame;
  let draft = null;
  let history = [];
  let editedCell;
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
    const setupOpen = Boolean(container.querySelector('.hfc-print-settings')?.open);
    const rows = draft ?? roster?.rows;
    container.innerHTML = '<div class="panel hfc-roster"><header class="hfc-toolbar"><h2>Crew’s details</h2><div class="hfc-actions">' +
      (editable && !draft ? '<label class="hfc-import">Import crew details<input type="file" accept=".json,application/json"></label>' : '') +
      (roster && !draft ? (editable ? '<button type="button" data-hfc-edit>Edit table</button>' : '') +
        '<button type="button" class="primary" data-hfc-print>Print</button>' : '') +
      '</div></header>' +
      (roster && !draft ? settingsForm(settings, rows.length, setupOpen) : '') +
      (draft ? '<div class="hfc-editbar"><button type="button" data-hfc-add>Add row</button>' +
        '<button type="button" data-hfc-undo' + (history.length ? '' : ' disabled') + '>Undo</button>' +
        '<button type="button" data-hfc-cancel>Cancel</button><button type="button" class="primary" data-hfc-save>Save changes</button>' +
        '<small>แก้ไขทีละช่อง หรือวางช่วงเซลล์จาก Excel โดยเริ่มที่ช่องที่เลือก</small></div>' : '') +
      '<p class="hfc-message" role="status"></p>' +
      (roster ? rosterHeading(roster, 'h3') +
        '<div class="hfc-grid" role="region" aria-label="Crew spreadsheet" tabindex="0">' +
        rosterTable(rows, true, Boolean(draft)) + '</div>' : '<p>' + (editable ? emptyMessage : 'ไม่มีข้อมูลลูกเรือในบัญชีนี้') + '</p>') +
      '</div>';
  }

  function remember() {
    history.push(draft.map(row => [...row]));
    if (history.length > 30) history.shift();
    container.querySelector('[data-hfc-undo]').disabled = false;
  }

  function focusCell(row, column) {
    container.querySelector('textarea[data-row="' + row + '"][data-column="' + column + '"]')?.focus();
  }

  container.addEventListener('input', event => {
    const input = event.target;
    if (draft && input.matches('textarea[data-row]')) {
      if (editedCell !== input) remember();
      editedCell = input;
      draft[input.dataset.row][input.dataset.column] = input.value;
    }
  });
  container.addEventListener('focusout', () => { editedCell = null; });
  container.addEventListener('keydown', event => {
    const input = event.target;
    if (!draft || !input.matches('textarea[data-row]') || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey) return;
    const row = Number(input.dataset.row), column = Number(input.dataset.column);
    let next = row * widths.length + column;
    if (event.key === 'Tab') next += event.shiftKey ? -1 : 1;
    else if (event.key === 'Enter' && !event.shiftKey) next += widths.length;
    else return;
    if (next < 0 || next >= draft.length * widths.length) return;
    event.preventDefault();
    focusCell(Math.floor(next / widths.length), next % widths.length);
  });
  container.addEventListener('paste', event => {
    const input = event.target;
    const text = event.clipboardData?.getData('text/plain');
    if (!draft || busy || !input.matches('textarea[data-row]') || !text) return;
    const excelTable = /<table\b/i.test(event.clipboardData.getData('text/html'));
    if (!text.includes('\t') && !(excelTable && /[\r\n]/.test(text))) return;
    event.preventDefault();
    const rows = pastedRows(text);
    const start = Number(input.dataset.row), column = Number(input.dataset.column);
    if (start + rows.length > 500 || rows.some(row => row.length + column > widths.length ||
      row.some(value => value.length > 500))) {
      message('ช่วงที่วางเกินขอบเขตตารางหรือมีข้อความยาวเกิน 500 ตัวอักษรต่อช่อง', true);
      return;
    }
    remember();
    rows.forEach((row, offset) => {
      const target = draft[start + offset] ??= Array(widths.length).fill('');
      row.forEach((value, index) => { target[column + index] = value; });
    });
    render();
    focusCell(start, column);
  });

  container.addEventListener('change', async event => {
    const input = event.target;
    if (input.closest('.hfc-page-options')) {
      if (input.name === 'size' && sizes.includes(input.value) ||
          input.name === 'orientation' && orientations.includes(input.value)) settings[input.name] = input.value;
      if (input.type === 'checkbox') settings[input.name] = input.checked;
      if (input.type === 'number' && input.validity.valid && (input.value !== '' || input.name === 'last')) {
        settings[input.name] = input.value === '' ? '' : Number(input.value);
      }
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

  container.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || busy || !state.roster) return;
    if (button.hasAttribute('data-hfc-edit') && state.editable) {
      draft = state.roster.rows.map(row => [...row]);
      history = [];
      render();
      focusCell(0, 1);
      return;
    }
    if (draft) {
      if (button.hasAttribute('data-hfc-add')) {
        if (draft.length >= 500) { message('เพิ่มได้สูงสุด 500 แถว', true); return; }
        remember();
        draft.push(Array(widths.length).fill(''));
        render();
        focusCell(draft.length - 1, 1);
      }
      if (button.hasAttribute('data-hfc-remove')) {
        if (draft.length === 1) { message('ต้องมีอย่างน้อย 1 แถว', true); return; }
        remember();
        const index = Number(button.dataset.hfcRemove);
        const [removed] = draft.splice(index, 1);
        if (draft[index] && !draft[index][2].trim()) draft[index][2] = removed[2];
        render();
        focusCell(Math.min(index, draft.length - 1), 1);
      }
      if (button.hasAttribute('data-hfc-undo') && history.length) { draft = history.pop(); render(); }
      if (button.hasAttribute('data-hfc-cancel')) { draft = null; render(); }
      if (button.hasAttribute('data-hfc-save')) {
        if (JSON.stringify(state.roster.rows) === JSON.stringify(draft)) { draft = null; render(); return; }
        busy = true;
        container.querySelectorAll('textarea,button').forEach(control => { control.disabled = true; });
        message('กำลังบันทึกข้อมูลลูกเรือ…');
        const updated = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
        try {
          state = await load('saveCrewDetails', { roster: { ...state.roster, rows: draft, updated }, revision: state.revision });
          draft = null;
          render();
          message('บันทึกข้อมูลลูกเรือแล้ว');
        } catch (error) { render(); message(error.message, true); }
        finally { busy = false; }
      }
      return;
    }
    if (!button.hasAttribute('data-hfc-print')) return;
    const invalid = [...container.querySelectorAll('.hfc-page-options input[type="number"]')]
      .some(input => !input.validity.valid || (!input.value && input.name !== 'last'));
    if (invalid || settings.first > (settings.last || state.roster.rows.length) ||
        settings.first > state.roster.rows.length || settings.last > state.roster.rows.length) {
      container.querySelector('.hfc-print-settings').open = true;
      message('ตรวจระยะขอบ ขนาดตัวอักษร และช่วงแถวที่ต้องการพิมพ์', true);
      return;
    }
    message('');
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
    if (busy || draft) return;
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
