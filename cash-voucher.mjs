import { amountInCents, validateCashVoucher, voucherFields, voucherLineFields, voucherRowLimit } from './lib/cash-voucher.mjs';

const width = 612, height = 792;
const money = new Intl.NumberFormat('en-US');
const printableDate = value => value ? new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
}).format(new Date(value + 'T00:00:00Z')).replaceAll(' ', '-') : '';

function drawVoucher(ctx, voucher, paintLogo) {
  const ink = '#153149', muted = '#42586c', grid = '#adbdc9', tint = '#edf3f7';
  const left = 48, right = width - left;
  const jobEnd = 144, descriptionEnd = 460, centsStart = 538;
  const tableTop = 174, rowsTop = 198, rowHeight = 20;
  const totalTop = rowsTop + voucherRowLimit * rowHeight, totalEnd = totalTop + 26;
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
  for (let i = 0; i <= voucherRowLimit; i++) line(left, rowsTop + i * rowHeight, right, rowsTop + i * rowHeight);
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
  text('DESCRIPTION', jobEnd + 10, 190, { bold: true });
  text('AMOUNT', (descriptionEnd + right) / 2, 190, { align: 'center', bold: true });

  let total = 0, hasAmount = false;
  voucher.lines.forEach(({ jobNo, description, amount }, index) => {
    const top = rowsTop + index * rowHeight, y = top + 14;
    if (/^[A-Za-z0-9]{1,8}$/.test(jobNo)) {
      [...jobNo].forEach((char, i) => text(char, left + (i + .5) * (jobEnd - left) / 8, y, { align: 'center' }));
    } else if (jobNo) {
      ctx.fillStyle = '#f7f9fb';
      ctx.fillRect(left + .5, top + .5, jobEnd - left - 1, rowHeight - 1);
      text(jobNo, left + 5, y, { limit: jobEnd - left - 10 });
    }
    text(description, jobEnd + 10, y, { limit: descriptionEnd - jobEnd - 20 });
    const cents = amountInCents(amount);
    if (cents !== null) {
      hasAmount = true;
      total += cents;
      splitAmount(cents, y);
    }
  });
  text('TOTAL', descriptionEnd - 10, totalTop + 17, { align: 'right', bold: true });
  if (hasAmount) splitAmount(total, totalTop + 17, true);
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

export async function mountCashVoucher(host, { job, service, editable, api }) {
  const pdf = window.HarborFlowVectorPdf;
  if (!pdf) throw Error('PDF tools are unavailable. Reload this page to try again.');
  const logo = await pdf.prepareImage(new Image(), 'logo');
  if (!host.isConnected) return;
  const legacy = service.data.details || {};
  let saved = legacy.paymentVoucher;
  const jobNo = job.data.jobNo || '';
  const draft = saved && !validateCashVoucher(saved) ? structuredClone(saved) : {
    header: { ...emptyFields(voucherFields), payTo: String(legacy.recipient ?? '').slice(0, 100) },
    lines: [{ jobNo, description: '', amount: amountInCents(String(legacy.amount ?? '')) === null ? '' : String(legacy.amount) }]
  };
  const disabled = editable ? '' : 'disabled';
  const input = (key, [label, max, type = 'text'], value, row) => `<label class="hfo-field">${label}
    <input data-voucher-field="${key}" ${row === undefined ? '' : `data-voucher-row="${row}"`} type="${type === 'date' ? 'date' : 'text'}"
      maxlength="${max}" ${type === 'decimal' ? 'inputmode="decimal"' : ''} value="${escape(value)}" ${disabled}></label>`;
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
        <div class="hfo-form-grid hfo-voucher-fields hfo-voucher-approval">
          ${['receivedBy','receivedDate','preparedBy','checkedBy','approvedBy'].map(key => input(key, voucherFields[key], draft.header[key])).join('')}
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
      ${Object.entries(voucherLineFields).map(([key, field]) => input(key, field, line[key], index)).join('')}
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
    draft.lines.push({ ...emptyFields(voucherLineFields), jobNo });
    renderLines();
    lines.querySelector('[data-voucher-row="' + (draft.lines.length - 1) + '"][data-voucher-field="description"]')?.focus();
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
    const invalid = validateCashVoucher(draft);
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
