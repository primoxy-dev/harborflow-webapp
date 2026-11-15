import { amountInCents, banknoteDenominations, banknoteRows, calculateCtmPricing, ctmCurrencies, ctmFeeLabels, defaultCtmPricing, emptyBanknotes, validateCashVoucher, validateCtmPricing, voucherDueDateField, voucherFields, voucherLineFields, voucherRowLimit } from './lib/cash-voucher.mjs';

const width = 612, height = 792;
const defaultApprover = 'Mr. Jarun Soisuwan';
const defaultPreparerAndChecker = 'Mr. Thanaphon Boonkaewsuk';
const money = new Intl.NumberFormat('en-US');
const priceMoney = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});
function printableDate(value, year = 'numeric') {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year, timeZone: 'UTC'
  }).format(date).replace('Sept', 'Sep').replaceAll(' ', '-');
}
const closingLine = line => line.kind === 'remark' || line.kind === 'dueDate';
const banknotePosition = lines => {
  const closing = lines.findIndex(closingLine);
  return closing < 0 ? lines.length : closing;
};

function drawVoucher(ctx, voucher, paintLogo) {
  const ink = '#153149', muted = '#42586c', grid = '#adbdc9', tint = '#edf3f7';
  const left = 48, right = width - left;
  const jobEnd = 144, descriptionEnd = 460, centsStart = 538;
  const groups = ctmCurrencies.map(currency => ({
    currency, rows: banknoteRows(voucher.banknotes, currency).filter(row => row.quantity > 0)
  })).filter(group => group.rows.length);
  const banknoteLines = Math.max(0, ...groups.map(group => group.rows.length));
  const banknoteSlots = banknoteLines ? banknoteLines + 3 : 0;
  const banknoteIndex = banknotePosition(voucher.lines);
  const hasClosingLines = banknoteIndex < voucher.lines.length;
  const banknoteRow = banknoteIndex + (hasClosingLines && banknoteIndex > 0 ? 1 : 0);
  const closingRow = banknoteRow + banknoteSlots + (hasClosingLines && banknoteSlots ? 1 : 0);
  const lineRows = voucher.lines.map((_, index) =>
    index < banknoteIndex ? index : closingRow + (index - banknoteIndex) * 2
  );
  const tableTop = 174, rowsTop = 198, bodyHeight = 400;
  const slots = Math.max(voucherRowLimit, (lineRows.at(-1) ?? -1) + 1, banknoteRow + banknoteSlots);
  const rowHeight = bodyHeight / slots, totalTop = rowsTop + bodyHeight, totalEnd = totalTop + 26;
  function text(value, x, y, { size = 10, bold = false, color = ink, align = 'left', limit = Infinity } = {}) {
    if (!value) return;
    const weight = bold ? 'bold ' : '';
    ctx.font = `${weight}${size}px Arial`;
    const textWidth = ctx.measureText(value).width;
    if (textWidth > limit) ctx.font = `${weight}${size * limit / textWidth}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }
  const line = (x1,y1,x2,y2) => {
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
  };
  function splitAmount(cents, y, bold = false) {
    text(money.format(Math.floor(cents / 100)), centsStart - 7, y, { align: 'right', limit: centsStart - descriptionEnd - 14, bold });
    text(String(cents % 100).padStart(2, '0'), right - 6, y, { align: 'right', bold });
  }
  const header = voucher.header;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = tint;
  ctx.fillRect(left, tableTop, right - left, rowsTop - tableTop);
  ctx.fillRect(left, totalTop, right - left, totalEnd - totalTop);
  ctx.fillStyle = '#f7f9fb';
  ctx.fillRect(left, rowsTop, jobEnd - left, totalTop - rowsTop);
  ctx.strokeStyle = grid;
  ctx.lineWidth = .5;
  ctx.beginPath();
  for (let i = 0; i <= slots; i++) line(left, rowsTop + i * rowHeight, right, rowsTop + i * rowHeight);
  line(jobEnd, tableTop, jobEnd, totalTop);
  line(descriptionEnd, tableTop, descriptionEnd, totalEnd);
  line(centsStart, rowsTop, centsStart, totalEnd);
  for (let i = 1; i < 8; i++) {
    const x = left + i * (jobEnd - left) / 8;
    line(x, rowsTop, x, totalTop);
  }
  ctx.stroke();
  ctx.strokeStyle = '#70879a';
  ctx.lineWidth = .65;
  ctx.strokeRect(left, tableTop, right - left, totalEnd - tableTop);
  ctx.beginPath();
  line(left, 111, right, 111);
  for (const [from, to] of [[left, 338], [356, 447], [465, right]]) line(from, 158, to, 158);
  line(left, 669, 338, 669);
  line(356, 669, right, 669);
  for (const x of [left, 226, 404]) line(x, 727, x + 160, 727);
  ctx.stroke();
  paintLogo(504, 45, 60, 52);
  text('GULF AGENCY COMPANY (THAILAND) LTD', left, 62, { size: 10, bold: true, color: muted });
  text('PAYMENT VOUCHER', left, 92, { size: 24, bold: true });
  text('Pay To', left, 136, { bold: true, color: muted });
  text(header.payTo, left, 153, { size: 11, limit: 286 });
  text('Voucher No.', 356, 136, { bold: true, color: muted });
  text(header.number, 356, 153, { size: 11, limit: 89 });
  text('Date', 465, 136, { bold: true, color: muted });
  text(printableDate(header.date), 465, 153);
  text('JOB NO.', (left + jobEnd) / 2, 190, { align: 'center', bold: true });
  text('DESCRIPTION', (jobEnd + descriptionEnd) / 2, 190, { align: 'center', bold: true });
  text('AMOUNT', (descriptionEnd + right) / 2, 190, { align: 'center', bold: true });

  let total = 0, hasAmount = false;
  voucher.lines.forEach(({ jobNo, description, amount, kind }, index) => {
    const top = rowsTop + lineRows[index] * rowHeight, y = top + rowHeight / 2 + 3.5;
    if (/^[A-Za-z0-9]{1,8}$/.test(jobNo)) {
      [...jobNo].forEach((char, i) => text(char, left + (i + .5) * (jobEnd - left) / 8, y, { align: 'center' }));
    } else if (jobNo) {
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(left + .5, top + .5, jobEnd - left - 1, rowHeight - 1);
      text(jobNo, left + 5, y, { limit: jobEnd - left - 10 });
    }
    const label = kind === 'dueDate'
      ? 'DUE DATE : ' + (printableDate(description, '2-digit').toUpperCase() || 'DD-MMM-YY')
      : description;
    text(label, jobEnd + 10, y, { limit: descriptionEnd - jobEnd - 20 });
    const cents = amountInCents(amount);
    if (cents !== null) {
      hasAmount = true;
      total += cents;
      splitAmount(cents, y);
    }
  });
  text('TOTAL', descriptionEnd - 10, totalTop + 17, { align: 'right', bold: true });
  if (hasAmount) splitAmount(total, totalTop + 17, true);
  if (groups.length) {
    const groupWidth = (descriptionEnd - jobEnd) / groups.length;
    const start = rowsTop + banknoteRow * rowHeight;
    const headingTop = start + rowHeight, dataTop = headingTop + rowHeight;
    const subtotalTop = dataTop + banknoteLines * rowHeight;
    const baseline = rowHeight / 2 + 3;
    const fillBand = top => ctx.fillRect(jobEnd + .35, top + .35, descriptionEnd - jobEnd - .7, rowHeight - .7);
    ctx.fillStyle = tint;
    fillBand(start);
    fillBand(headingTop);
    fillBand(subtotalTop);
    text('BANKNOTE BREAKDOWN', jobEnd + 10, start + baseline, { size: 9, bold: true });
    if (groups.length > 1) {
      ctx.strokeStyle = grid;
      ctx.lineWidth = .5;
      ctx.beginPath();
      line(jobEnd + groupWidth, headingTop, jobEnd + groupWidth, subtotalTop + rowHeight);
      ctx.stroke();
    }
    groups.forEach(({currency, rows}, index) => {
      const x = jobEnd + index * groupWidth, end = x + groupWidth;
      const quantityX = x + groupWidth * .56;
      text(currency + ' note', x + 10, headingTop + baseline, { size: 8.5, bold: true });
      text('Qty', quantityX, headingTop + baseline, { size: 8.5, bold: true, align: 'right' });
      text('Amount', end - 7, headingTop + baseline, { size: 8.5, bold: true, align: 'right' });
      rows.forEach(({denomination, quantity, amount}, i) => {
        const y = dataTop + i * rowHeight + baseline;
        text(money.format(denomination), x + 10, y, { size: 8.5 });
        text(money.format(quantity), quantityX, y, { size: 8.5, align: 'right' });
        text(money.format(amount), end - 7, y, { size: 8.5, align: 'right' });
      });
      text(currency + ' TOTAL', x + 10, subtotalTop + baseline, { size: 8.5, bold: true });
      text(money.format(rows.reduce((sum, row) => sum + row.amount, 0)), end - 7, subtotalTop + baseline, { size: 8.5, bold: true, align: 'right' });
    });
  }
  text('Received by', left, 648, { bold: true, color: muted });
  text(header.receivedBy, left, 665, { limit: 286 });
  text('Received date', 356, 648, { bold: true, color: muted });
  text(printableDate(header.receivedDate), 356, 665);
  for (const [x, label, value] of [[left, 'Prepared by', header.preparedBy],
    [226, 'Checked by', header.checkedBy], [404, 'Approved by', header.approvedBy]]) {
    text(value, x + 80, 720, { align: 'center', limit: 154 });
    text(label, x + 80, 742, { align: 'center', bold: true, color: muted });
  }
}

const emptyFields = fields => Object.fromEntries(Object.keys(fields).map(key => [key, '']));
const escape = value => String(value).replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

function mountCtmPricing(host, pricing, editable, onEdit) {
  const disabled = editable ? '' : 'disabled';
  host.innerHTML = `
    <div class="hfo-toolbar"><h4>CTM pricing</h4><button type="button" class="hfo-btn" data-copy-pricing>Copy table</button></div>
    <div class="hfo-voucher-pricing-fields">
      <label class="hfo-field">CTM amount<input data-ctm-amount inputmode="decimal" maxlength="13" value="${escape(pricing.amount)}" ${disabled}></label>
      <label class="hfo-field">Currency<select data-ctm-currency ${disabled}>${ctmCurrencies.map(currency => `<option>${currency}</option>`).join('')}</select></label>
    </div>
    <table aria-label="CTM fee calculation">
      <thead><tr><th scope="col">Charge</th><th scope="col">%</th><th scope="col">Minimum</th><th scope="col" data-ctm-fee-heading></th></tr></thead>
      <tbody>${ctmFeeLabels.map((label, index) => `<tr>
        <th scope="row">${label}</th>
        <td><input data-ctm-rate="${index}" aria-label="${label} percentage" inputmode="decimal" maxlength="7" value="${escape(pricing.rates[index])}" ${disabled}></td>
        <td><input data-ctm-minimum="${index}" aria-label="${label} minimum" inputmode="decimal" maxlength="13" ${disabled}></td>
        <td class="hfo-voucher-price" data-ctm-fee></td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="3" scope="row">TOTAL</th><td class="hfo-voucher-price" data-ctm-total></td></tr></tfoot>
    </table>
    <p class="hfo-muted hfo-voucher-pricing-note">Fees use the higher of the percentage or the minimum in the selected currency.</p>
    <p class="hfo-muted" data-copy-status role="status"></p>`;
  const currency = host.querySelector('[data-ctm-currency]');
  currency.value = pricing.currency;
  const amount = host.querySelector('[data-ctm-amount]');
  const minimums = [...host.querySelectorAll('[data-ctm-minimum]')];
  const fees = [...host.querySelectorAll('[data-ctm-fee]')];
  const heading = host.querySelector('[data-ctm-fee-heading]');
  const total = host.querySelector('[data-ctm-total]');
  const status = host.querySelector('[data-copy-status]');
  const copy = host.querySelector('[data-copy-pricing]');
  const format = cents => cents === undefined ? '—' : priceMoney.format(cents / 100);
  const report = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('hfo-alert', error);
  };
  function showMinimums() {
    minimums.forEach((input, index) => { input.value = pricing.minimums[pricing.currency][index]; });
    heading.textContent = pricing.currency;
  }
  function update() {
    const result = calculateCtmPricing(pricing);
    fees.forEach((cell, index) => { cell.textContent = format(result?.fees[index]); });
    total.textContent = format(result?.total);
    copy.disabled = !result;
    const error = validateCtmPricing(pricing);
    report(error || '', Boolean(error));
  }
  host.addEventListener('input', event => {
    const { ctmRate, ctmMinimum } = event.target.dataset;
    if (event.target === amount) pricing.amount = amount.value;
    else if (ctmRate !== undefined) pricing.rates[Number(ctmRate)] = event.target.value;
    else if (ctmMinimum !== undefined) pricing.minimums[pricing.currency][Number(ctmMinimum)] = event.target.value;
    else return;
    update();
    onEdit();
  });
  currency.onchange = () => {
    pricing.currency = currency.value;
    showMinimums();
    update();
    onEdit();
  };
  copy.onclick = async () => {
    const result = calculateCtmPricing(pricing);
    if (!result) return;
    const selected = pricing.currency;
    const header = ['Charge', '%', 'Minimum (' + selected + ')', 'Amount (' + selected + ')'];
    const rows = [
      ['CTM', '', '', format(result.principal)],
      ...ctmFeeLabels.map((label, index) => {
        const minimum = amountInCents(pricing.minimums[selected][index]);
        return [label, pricing.rates[index], minimum === null ? '' : format(minimum), format(result.fees[index])];
      }),
      ['TOTAL', '', '', format(result.total)]
    ];
    const plain = [header, ...rows].map(row => row.join('\t')).join('\n');
    const cells = (row, tag) => row.map(value => `<${tag} style="border:1px solid #a9baca;padding:4px 8px">${escape(value)}</${tag}>`).join('');
    const html = `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse"><thead><tr>${cells(header,'th')}</tr></thead><tbody>${rows.map(row => `<tr>${cells(row,'td')}</tr>`).join('')}</tbody></table>`;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], {type:'text/html'}),
        'text/plain': new Blob([plain], {type:'text/plain'})
      })]);
      report('Table copied.');
    } catch {
      try {
        await navigator.clipboard.writeText(plain);
        report('Table copied as tab-separated text.');
      } catch {
        report('Clipboard unavailable. Select and copy the values from the table.', true);
      }
    }
  };
  showMinimums();
  update();
}

function mountBanknotes(host, banknotes, editable, onEdit) {
  const disabled = editable ? '' : 'disabled';
  host.innerHTML = `<h4>Banknote breakdown</h4><div class="hfo-voucher-banknote-grid">
    ${ctmCurrencies.map(currency => `<table aria-label="${currency} banknotes" data-banknote-currency="${currency}">
      <thead><tr><th scope="col">${currency} note</th><th scope="col">Qty</th><th scope="col">Amount</th></tr></thead>
      <tbody>${banknoteDenominations[currency].map((denomination,index) => `<tr>
        <th scope="row">${denomination}</th>
        <td><input type="text" inputmode="numeric" maxlength="7" aria-label="${currency} ${denomination} quantity" data-banknote-index="${index}" value="${escape(banknotes[currency][index])}" ${disabled}></td>
        <td class="hfo-voucher-price" data-banknote-amount></td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row" colspan="2">${currency} total</th><td class="hfo-voucher-price" data-banknote-total></td></tr></tfoot>
    </table>`).join('')}
  </div><p class="hfo-muted">Denominations with a quantity above zero appear in the Description column.</p>
  <p class="hfo-muted" data-banknote-status role="status"></p>`;
  const status = host.querySelector('[data-banknote-status]');
  function updateTable(table) {
    const rows = banknoteRows(banknotes, table.dataset.banknoteCurrency);
    table.querySelectorAll('[data-banknote-amount]').forEach((cell, index) => {
      cell.textContent = rows[index].quantity ? money.format(rows[index].amount) : '—';
    });
    table.querySelector('[data-banknote-total]').textContent = money.format(rows.reduce((sum, row) => sum + row.amount, 0));
  }
  host.querySelectorAll('table').forEach(updateTable);
  host.addEventListener('input', event => {
    const input = event.target;
    if (!editable || !input.hasAttribute('data-banknote-index')) return;
    const table = input.closest('table');
    const invalid = input.value !== '' && !/^\d{1,7}$/.test(input.value);
    input.setAttribute('aria-invalid', String(invalid));
    banknotes[table.dataset.banknoteCurrency][Number(input.dataset.banknoteIndex)] = input.value;
    status.textContent = host.querySelector('[aria-invalid="true"]') ? 'Enter a whole number of banknotes.' : '';
    updateTable(table);
    onEdit();
  });
}

export async function mountCashVoucher(host, { job, service, editable, api }) {
  const pdf = window.HarborFlowVectorPdf;
  if (!pdf) throw Error('PDF tools are unavailable. Reload this page to try again.');
  const logo = await pdf.prepareImage(new Image(), 'logo');
  if (!host.isConnected) return;
  const legacy = service.data.details || {};
  let saved = legacy.paymentVoucher;
  const jobNo = job.data.jobNo || '';
  const vessel = String(job.data.vessel || '').trim();
  const intro = 'PLEASE ARRANGE CTM TO MASTER OF "';
  const vesselLimit = voucherLineFields.description[1] - intro.length - 1;
  const draft = saved && !validateCashVoucher(saved) ? structuredClone(saved) : {
    header: {
      ...emptyFields(voucherFields),
      payTo: String(legacy.recipient ?? '').slice(0, 100),
      preparedBy: defaultPreparerAndChecker,
      checkedBy: defaultPreparerAndChecker,
      approvedBy: defaultApprover
    },
    lines: [
      { jobNo, description: intro + vessel.slice(0, vesselLimit) + '"', amount: amountInCents(String(legacy.amount ?? '')) === null ? '' : String(legacy.amount) },
      { jobNo: '', description: 'REMARK : PLEASE ARRANGE WITH NEW NOTES AND NO STAMPS', amount: '', kind: 'remark' },
      { jobNo: '', description: '', amount: '', kind: 'dueDate' }
    ]
  };
  draft.pricing ??= defaultCtmPricing(legacy);
  draft.banknotes ??= emptyBanknotes();
  const disabled = editable ? '' : 'disabled';
  const nameLists = { preparedBy: 'hfoVoucherStaff', checkedBy: 'hfoVoucherStaff', approvedBy: 'hfoVoucherApprovers' };
  const input = (key, [label, max, type = 'text'], value, row) => `<label class="hfo-field">${label}
    <input data-voucher-field="${key}" ${row === undefined ? '' : `data-voucher-row="${row}"`} type="${type === 'date' ? 'date' : 'text'}"
      maxlength="${max}" ${type === 'decimal' ? 'inputmode="decimal"' : ''} ${nameLists[key] ? `list="${nameLists[key]}"` : ''}
      value="${escape(value)}" ${disabled}></label>`;
  host.innerHTML = `
    <div class="hfo-toolbar"><h3>Payment Voucher</h3><div class="hfo-actions">
      ${editable ? '<button type="button" class="hfo-btn" data-voucher-save>Save voucher</button>' : ''}
      <button type="button" class="hfo-btn primary" data-voucher-download>Download PDF</button>
    </div></div>
    <p role="status" data-voucher-status class="hfo-muted">${saved || !editable ? '' : 'Fill in the voucher and save it to this Service.'}</p>
    <div class="hfo-voucher-layout">
      <div>
        <div class="hfo-form-grid hfo-voucher-fields">${['number', 'payTo', 'date'].map(key => input(key, voucherFields[key], draft.header[key])).join('')}</div>
        <div class="hfo-toolbar hfo-voucher-line-heading"><h4>Voucher lines</h4>${editable ? '<button type="button" class="hfo-btn" data-voucher-add>+ Add line</button>' : ''}</div>
        <div data-voucher-lines></div>
        <section class="hfo-voucher-pricing" aria-label="CTM pricing" data-voucher-pricing></section>
        <section class="hfo-voucher-pricing hfo-voucher-banknotes" aria-label="Banknote breakdown" data-voucher-banknotes></section>
        <div class="hfo-form-grid hfo-voucher-fields hfo-voucher-approval">
          ${['receivedBy','receivedDate','preparedBy','checkedBy','approvedBy'].map(key => input(key, voucherFields[key], draft.header[key])).join('')}
          <datalist id="hfoVoucherStaff"><option value="${escape(defaultPreparerAndChecker)}"></option></datalist>
          <datalist id="hfoVoucherApprovers"><option value="${escape(defaultApprover)}"></option></datalist>
        </div>
      </div>
      <section class="hfo-voucher-preview" aria-label="PDF Live">
        <h4>PDF Live</h4><canvas aria-label="Payment Voucher preview" role="img"></canvas>
      </section>
    </div>`;
  const status = host.querySelector('[data-voucher-status]');
  const preview = host.querySelector('canvas');
  const lines = host.querySelector('[data-voucher-lines]');
  const save = host.querySelector('[data-voucher-save]');
  const add = host.querySelector('[data-voucher-add]');
  const download = host.querySelector('[data-voucher-download]');
  const report = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('hfo-alert', error);
  };
  mountCtmPricing(host.querySelector('[data-voucher-pricing]'), draft.pricing, editable, () => report('Unsaved changes'));
  function draw(canvas, exporting = false) {
    const scale = 3.5;
    if (canvas.width !== width * scale || canvas.height !== height * scale) {
      canvas.width = width * scale;
      canvas.height = height * scale;
    }
    const ctx = exporting ? pdf.captureContext(canvas) : canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawVoucher(ctx, draft, (x, y, w, h) => {
      if (exporting) return ctx.drawImage(logo, x, y, w, h);
      const { viewBox: [left, top, logoWidth, logoHeight], paths } = logo.hfoVector;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(w / logoWidth, h / logoHeight);
      ctx.translate(-left, -top);
      for (const path of paths) {
        ctx.fillStyle = path.fill;
        ctx.fill(new Path2D(path.d));
      }
      ctx.restore();
    });
  }
  function renderLines() {
    lines.innerHTML = draft.lines.map((line, index) => `<div class="hfo-voucher-line" role="group" aria-label="Line ${index + 1}">
      ${Object.entries(voucherLineFields).map(([key, field]) => input(key, key === 'description' && line.kind === 'dueDate' ? voucherDueDateField : field, line[key], index)).join('')}
      ${editable ? `<button type="button" class="hfo-btn danger" aria-label="Remove line ${index + 1}" data-voucher-remove="${index}">×</button>` : ''}
    </div>`).join('');
    if (add) add.disabled = draft.lines.length >= voucherRowLimit;
  }
  let frame;
  function changed() {
    report('Unsaved changes');
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (host.isConnected) draw(preview); });
  }
  mountBanknotes(host.querySelector('[data-voucher-banknotes]'), draft.banknotes, editable, changed);
  host.addEventListener('input', event => {
    const { voucherField, voucherRow } = event.target.dataset;
    if (!editable || !voucherField) return;
    const record = voucherRow === undefined ? draft.header : draft.lines[Number(voucherRow)];
    record[voucherField] = event.target.value;
    changed();
  });
  lines.addEventListener('click', event => {
    const button = event.target.closest('[data-voucher-remove]');
    if (!editable || !button) return;
    draft.lines.splice(Number(button.dataset.voucherRemove), 1);
    renderLines();
    changed();
  });
  if (add) add.onclick = () => {
    if (draft.lines.length >= voucherRowLimit) return;
    const index = banknotePosition(draft.lines);
    draft.lines.splice(index, 0, { ...emptyFields(voucherLineFields), jobNo });
    renderLines();
    lines.querySelector('[data-voucher-row="' + index + '"][data-voucher-field="description"]')?.focus();
    changed();
  };
  if (save) save.onclick = async () => {
    const invalid = validateCashVoucher(draft);
    if (invalid) return report(invalid, true);
    const snapshot = structuredClone(draft);
    save.disabled = true;
    report('Saving…');
    try {
      const { record } = await api('updateService', {
        id: service.id, patch: { details: { paymentVoucher: snapshot } }, base: { details: { paymentVoucher: saved } }
      });
      Object.assign(service, record);
      saved = record.data.details.paymentVoucher;
      report(JSON.stringify(snapshot) === JSON.stringify(draft) ? 'Voucher saved' : 'Unsaved changes');
    } catch (error) {
      report(error.code === 409 ? 'Voucher changed elsewhere. Copy any unsaved edits before reopening this Job.' : error.message, true);
    } finally {
      save.disabled = false;
    }
  };
  download.onclick = () => {
    const invalid = validateCashVoucher({header: draft.header, lines: draft.lines, banknotes: draft.banknotes});
    if (invalid) return report(invalid, true);
    try {
      const canvas = document.createElement('canvas');
      draw(canvas, true);
      const blob = pdf.fromCanvases([canvas], { width, height });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const suffix = (draft.header.number || jobNo || job.data.vessel || '').replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-').trim();
      link.download = 'PAYMENT VOUCHER' + (suffix ? ' - ' + suffix : '') + '.pdf';
      host.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      report(error.message, true);
    }
  };
  renderLines();
  draw(preview);
}
