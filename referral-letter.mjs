const pageWidth = 612, pageHeight = 792, scale = 3.5;
const thaiDateFormat = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
});
const englishDateFormat = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC'
});

function letterDate(value, format = thaiDateFormat) {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isNaN(date.valueOf()) ? '' : format.format(date);
}

function drawLetter(ctx, fields, drawLogo) {
  function text(value, x, y, { size = 9, bold = false, align = 'left', limit = Infinity, color = '#161e27' } = {}) {
    if (!value) return;
    const weight = bold ? 'bold ' : '';
    ctx.font = `${weight}${size}px Arial`;
    const width = ctx.measureText(value).width;
    if (width > limit) ctx.font = `${weight}${size * limit / width}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }
  const left = 90, right = 510;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  drawLogo(101, 42, 74, 63);
  text('บริษัท กัลฟ์ เอเจนซี่ คัมปะนี (ประเทศไทย) จำกัด', 183, 56, { bold: true });
  text('GULF AGENCY COMPANY (THAILAND) LTD.', 183, 72, { size: 8.4, bold: true });
  text('26/30-31 9th Floor, Orakarn Building, Soi Chidlom, Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330', 183, 87, { size: 7, limit: 332 });
  text('Tel (+66) 2 650 7400   Fax (+66) 2 650 7401   E-mail shipping.thailand@gac.com', 183, 102, { size: 7 });

  ctx.strokeStyle = '#334154';
  ctx.lineWidth = .7;
  ctx.strokeRect(350, 113, 131, 59);
  text('อธิบายสภาพอาการของผู้ป่วย', 415.5, 132, { size: 8, align: 'center' });
  text('และการตรวจรักษาเป็นภาษาอังกฤษ', 415.5, 155, { size: 8, align: 'center' });
  text('ใบส่งตัว', pageWidth / 2, 195, { size: 17, bold: true, align: 'center' });
  text(letterDate(fields.issueDate), right, 215, { align: 'right', size: 9.5 });
  text('เรียน  ผู้อำนวยการ' + (fields.hospital || '________________________'), left, 237, { limit: 420 });
  text('ด้วยบริษัท GULF AGENCY COMPANY (THAILAND) LTD. ซึ่งเป็นตัวแทนเรือ ขอส่งตัวลูกเรือของเรือชื่อ', 123, 256, { limit: 387 });
  text('"' + (fields.vessel || '________________________') + '" ตามรายชื่อด้านล่างนี้', left, 276, { limit: 420 });

  const personFields = [
    ['Name - Surname', fields.personName, 102, 310, 112],
    ['Nationality', fields.nationality, 305, 310, 128],
    ['DOB', letterDate(fields.birthDate, englishDateFormat), 102, 337, 150],
    ['PP. NO.', fields.passport, 305, 337, 150]
  ];
  for (const [label, value, x, y, maxWidth] of personFields) {
    text(label + ':', x, y, { size: 9, bold: true });
    text(value, x + (label === 'Name - Surname' ? 79 : 57), y, { size: 9, limit: maxWidth });
  }

  text('เข้ารับการตรวจรักษา วันที่ ' + (letterDate(fields.appointmentDate) || '____________________') +
    ' โดยบริษัทฯ จะเป็นผู้ชำระค่าพยาบาลจนกระทั่งสิ้นสุดการรักษา', 123, 387, { limit: 387 });
  text('ตามข้อตกลงระหว่างบริษัทฯ กับโรงพยาบาลฯ โดยขอให้ส่งใบแจ้งหนี้ไปตามชื่อและที่อยู่ด้านล่างนี้', left, 408, { limit: 420 });
  text('และกรุณาจัดทำเอกสารเป็นภาษาอังกฤษ', left, 428);
  text('C/O GULF AGENCY COMPANY (THAILAND) LTD. 26/30-31 9th Floor, Orakarn Building, Soi Chidlom,', left, 463, { limit: 420 });
  text('Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330', left, 484);
  text('จึงเรียนมาเพื่อโปรดดำเนินการ', 123, 512);

  const signatureCenter = 435;
  text('ขอแสดงความนับถือ', signatureCenter, 553, { align: 'center' });
  ctx.strokeStyle = '#334154';
  ctx.beginPath();
  ctx.moveTo(365, 600);
  ctx.lineTo(505, 600);
  ctx.stroke();
  text(fields.signatory ? '(' + fields.signatory + ')' : '', signatureCenter, 619, { align: 'center', limit: 165 });
  text(fields.position, signatureCenter, 638, { align: 'center', limit: 165 });
  text(fields.phone ? 'Mobile: ' + fields.phone : '', signatureCenter, 655, { align: 'center', limit: 165 });
  text('All business is undertaken subject to our Standard Trading Conditions of Carriage, which are incorporated into', left, 695, { size: 6.6, limit: 420 });
  text('all contracts of carriage to which we are a party. Our Standard Trading Conditions are available on request.', left, 707, { size: 6.6, limit: 420 });
}

export async function mountReferralLetter(host, { job, service }) {
  const pdf = window.HarborFlowVectorPdf;
  if (!pdf) throw Error('PDF tools are unavailable. Reload to try again.');
  const logo = await pdf.prepareImage(new Image(), 'logo');
  if (!host.isConnected) return;
  const fields = {
    vessel: String(job.data.vessel || '').slice(0, 100),
    hospital: '',
    issueDate: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10),
    appointmentDate: String(service.data.details?.appointment || service.data.plannedStart || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '',
    personName: '', nationality: '', birthDate: '', passport: '', signatory: '', position: '', phone: ''
  };
  host.innerHTML = `
    <div class="hfo-toolbar"><h3>Referral Letter</h3><button class="hfo-btn primary" type="button" data-referral-download>Download PDF</button></div>
    <p class="hfo-muted">Entries are kept in this tab while it is open.</p>
    <p role="status" data-referral-status></p>
    <div class="hfo-referral-layout">
      <form class="hfo-referral-form" autocomplete="off"></form>
      <section class="hfo-referral-preview" aria-label="PDF Live"><h4>PDF Live</h4><canvas role="img" aria-label="Referral Letter preview"></canvas></section>
    </div>`;
  const form = host.querySelector('form');
  for (const [legend, entries] of [
    ['Letter details', [['hospital','Hospital'], ['vessel','Vessel'], ['issueDate','Letter date','date'], ['appointmentDate','Appointment date','date']]],
    ['Patient details', [['personName','Name - Surname'], ['nationality','Nationality'], ['birthDate','Date of birth','date'], ['passport','Passport No.']]],
    ['Contact and signatory', [['signatory','Signatory'], ['position','Position'], ['phone','Mobile','tel']]]
  ]) {
    const fieldset = document.createElement('fieldset');
    const heading = document.createElement('legend');
    heading.textContent = legend;
    fieldset.append(heading);
    for (const [name, label, type = 'text'] of entries) {
      const wrapper = document.createElement('label');
      wrapper.className = 'hfo-field';
      const input = document.createElement('input');
      Object.assign(input, { name, type, maxLength: 100, value: fields[name] });
      fields[name] = input.value;
      wrapper.append(label, input);
      fieldset.append(wrapper);
    }
    form.append(fieldset);
  }
  const preview = host.querySelector('canvas');
  const status = host.querySelector('[data-referral-status]');
  function render(canvas, exporting = false) {
    if (canvas.width !== pageWidth * scale || canvas.height !== pageHeight * scale) {
      canvas.width = pageWidth * scale;
      canvas.height = pageHeight * scale;
    }
    const ctx = exporting ? pdf.captureContext(canvas) : canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawLetter(ctx, fields, (x,y,w,h) => {
      if (exporting) {
        ctx.drawImage(logo, x,y,w,h);
        return;
      }
      const { viewBox: [left,top,width,height], paths } = logo.hfoVector;
      ctx.save();
      ctx.translate(x,y);
      ctx.scale(w / width,h / height);
      ctx.translate(-left,-top);
      for (const path of paths) {
        ctx.fillStyle = path.fill;
        ctx.fill(new Path2D(path.d));
      }
      ctx.restore();
    });
  }
  let frame;
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', event => {
    fields[event.target.name] = event.target.value;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (host.isConnected) render(preview); });
  });
  host.querySelector('[data-referral-download]').onclick = () => {
    status.textContent = '';
    try {
      const canvas = document.createElement('canvas');
      render(canvas, true);
      const url = URL.createObjectURL(pdf.fromCanvases([canvas], { width: pageWidth, height: pageHeight }));
      const link = document.createElement('a');
      const vessel = fields.vessel.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-').trim();
      link.href = url;
      link.download = 'REFERRAL LETTER' + (vessel ? ' - ' + vessel : '') + '.pdf';
      host.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      status.textContent = error.message;
    }
  };
  render(preview);
}
