import { bindMailEditor, cleanBody, createMailComposer, outlookUrl } from './hotel-email.mjs';
import { mailRecipientAddresses } from './lib/mail-recipients.mjs';

const pageWidth = 612, pageHeight = 792, scale = 3.5;
const defaultHospital = 'โรงพยาบาลกรุงเทพระยอง';
const defaultHospitalEnglish = 'Bangkok Rayong Hospital';
const referralTo = 'BRH Information <Information.rayong@bangkokhospital.com>; BRH Customer Service Department <brhrcpt@brh.co.th>';
const referralCc = 'shipping.thailand@gac.com; Success Thailand <success.thailand@success-th.com>';
const contactFields = ['signatory', 'position', 'phone'];
const thaiDateFormat = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
});
const englishDateFormat = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC'
});
const emailDateFormat = new Intl.DateTimeFormat('en-GB', {
  year: '2-digit', month: 'short', day: 'numeric', timeZone: 'UTC'
});

function letterDate(value, format = thaiDateFormat) {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isNaN(date.valueOf()) ? '' : format.format(date);
}

function openReferralEmail(fields, trigger, downloadLetter) {
  const hospital = fields.hospital.trim();
  const isBangkokRayong = hospital === defaultHospital ||
    hospital.toLowerCase() === defaultHospitalEnglish.toLowerCase();
  const date = letterDate(fields.appointmentDate, emailDateFormat).replace('Sept', 'Sep').toUpperCase();
  const vessel = fields.vessel.trim().toUpperCase();
  const person = fields.personName.trim().toUpperCase();
  const dialog = createMailComposer({
    footerExtra: '<button class="hfo-btn" type="button" data-email-letter-pdf>Download PDF</button>' +
      '<button class="hfo-btn" type="button" data-copy-referral-cc>Copy CC</button>'
  });
  const form = dialog.querySelector('form');
  const notice = dialog.querySelector('[data-mail-notice]');
  const { editor } = bindMailEditor(form);
  function report(message, error = false) {
    notice.textContent = message;
    notice.classList.toggle('hfo-alert', error);
  }
  dialog.querySelector('[data-branch]').textContent = ['Referral Letter', vessel].filter(Boolean).join(' · ');
  form.elements.to.value = isBangkokRayong ? referralTo : '';
  form.elements.cc.value = referralCc;
  form.elements.subject.value = (vessel || '[VESSEL]') + ': MEDICAL VISIT APPOINTMENT FOR ' +
    (person || '[PATIENT NAME]') + ' ON ' + (date || '[APPOINTMENT DATE]');
  for (const line of [
    'Dear ' + (isBangkokRayong ? defaultHospitalEnglish : hospital || '[Hospital]') + ',',
    'Please find the attached referral letter and kindly arrange the medical visit on ' + (date || '[Appointment date]') + '.',
    "Please confirm the appointment and send us the doctor's certificate in English as soon as the visit is complete."
  ]) {
    const paragraph = document.createElement('p');
    paragraph.textContent = line;
    editor.append(paragraph);
  }
  form.hidden = false;
  form.onsubmit = event => event.preventDefault();
  const missing = [!vessel && 'vessel', !person && 'patient name', !date && 'appointment date', !isBangkokRayong && 'To'].filter(Boolean);
  const attachmentHint = 'Download the referral letter PDF and attach it in Outlook.';
  report((missing.length ? 'Complete the missing fields before sending (' + missing.join(', ') + '). ' : '') + attachmentHint);
  form.addEventListener('mail-format-error', event => report(event.detail, true));
  form.querySelector('[data-email-letter-pdf]').onclick = () => downloadLetter(report);
  form.querySelector('[data-copy-referral-cc]').onclick = async () => {
    try {
      const addresses = mailRecipientAddresses(form.elements.cc.value).join('; ');
      if (!addresses) { report('The CC field is empty.'); return; }
      await navigator.clipboard.writeText(addresses);
      report('CC copied. Paste it into the CC field in Outlook.');
    } catch {
      form.elements.cc.select();
      report('Check the CC addresses, or copy them directly from the CC field.', true);
    }
  };
  form.querySelector('[data-copy]').onclick = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([cleanBody(editor.innerHTML)], { type: 'text/html' }),
        'text/plain': new Blob([editor.innerText], { type: 'text/plain' })
      })]);
      report('Formatted body copied. Paste it into Outlook.');
    } catch { report('Select and copy the body directly to keep its formatting.', true); }
  };
  form.querySelector('[data-outlook]').onclick = () => {
    try {
      const to = mailRecipientAddresses(form.elements.to.value).join(';');
      if (!to) { form.elements.to.focus(); report('Enter a To address for this hospital.', true); return; }
      const cc = mailRecipientAddresses(form.elements.cc.value).join(';');
      const subject = form.elements.subject.value;
      const body = editor.innerText;
      let url = outlookUrl({ to, cc, subject });
      try { url = outlookUrl({ to, cc, subject, body }); }
      catch (error) { if (!window.confirm(error.message + ' Open Outlook with recipients and subject?')) return; }
      window.open(url, '_blank', 'noopener,noreferrer');
      report('If Outlook leaves CC blank, use Copy CC. ' + attachmentHint);
    } catch (error) { report(error.message, true); }
  };
  dialog.querySelector('[data-close-mail]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { dialog.remove(); if (trigger.isConnected) trigger.focus(); }, { once: true });
  trigger.parentElement.append(dialog);
  dialog.showModal();
}

function drawLetter(ctx, fields, drawLogo, signature) {
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
  const left = 72, right = pageWidth - left;
  const contentWidth = right - left;
  const letterhead = left + 82;
  const paragraphIndent = left + 24;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  drawLogo(left, 46, 68, 58);
  text('บริษัท กัลฟ์ เอเจนซี่ คัมปะนี (ประเทศไทย) จำกัด', letterhead, 58, { size: 10, bold: true });
  text('GULF AGENCY COMPANY (THAILAND) LTD.', letterhead, 73, { size: 9, bold: true });
  text('26/30-31 9th Floor, Orakarn Building, Soi Chidlom, Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330', letterhead, 88, { size: 7.5, limit: right - letterhead });
  text('Tel (+66) 2 650 7400   Fax (+66) 2 650 7401   E-mail shipping.thailand@gac.com', letterhead, 102, { size: 7.5 });

  ctx.strokeStyle = '#334154';
  ctx.lineWidth = .7;
  const noteWidth = 154, noteCenter = right - noteWidth / 2;
  ctx.strokeRect(right - noteWidth, 120, noteWidth, 45);
  text('อธิบายสภาพอาการของผู้ป่วย', noteCenter, 138, { size: 8, align: 'center' });
  text('และการตรวจรักษาเป็นภาษาอังกฤษ', noteCenter, 153, { size: 8, align: 'center' });
  text('ใบส่งตัว', pageWidth / 2, 192, { size: 17, bold: true, align: 'center' });
  text(letterDate(fields.issueDate), right, 214, { align: 'right', size: 9.5 });
  text('เรียน  ผู้อำนวยการ' + fields.hospital, left, 239, { size: 10, limit: contentWidth });
  text('ด้วยบริษัท GULF AGENCY COMPANY (THAILAND) LTD. ซึ่งเป็นตัวแทนเรือ ขอส่งตัวลูกเรือ', paragraphIndent, 259, { size: 10, limit: right - paragraphIndent });
  const vesselLine = fields.vessel ? 'ของเรือ "' + fields.vessel + '" ตามรายชื่อด้านล่างนี้' : 'ตามรายชื่อด้านล่างนี้';
  text(vesselLine, left, 277, { size: 10, limit: contentWidth });

  const personFields = [
    ['Name - Surname', fields.personName, left, 310, 91, 158],
    ['Nationality', fields.nationality, left + 267, 310, 71, 124],
    ['DOB', letterDate(fields.birthDate, englishDateFormat), left, 333, 91, 158],
    ['PP. NO.', fields.passport, left + 267, 333, 71, 124]
  ];
  for (const [label, value, x, y, offset, maxWidth] of personFields) {
    text(label + ':', x, y, { size: 9.5, bold: true });
    text(value, x + offset, y, { size: 9.5, limit: maxWidth });
  }

  const appointment = letterDate(fields.appointmentDate);
  text('เข้ารับการตรวจรักษา' + (appointment ? ' วันที่ ' + appointment : '') +
    ' โดยบริษัทฯ จะเป็นผู้ชำระค่าพยาบาลจนกระทั่งสิ้นสุดการรักษา', paragraphIndent, 371, { size: 10, limit: right - paragraphIndent });
  text('ตามข้อตกลงระหว่างบริษัทฯ กับโรงพยาบาลฯ โดยขอให้ส่งใบแจ้งหนี้ไปตามชื่อและที่อยู่ด้านล่างนี้', left, 390, { size: 10, limit: contentWidth });
  text('และกรุณาจัดทำเอกสารเป็นภาษาอังกฤษ', left, 409, { size: 10 });
  text('C/O GULF AGENCY COMPANY (THAILAND) LTD. 26/30-31 9th Floor, Orakarn Building, Soi Chidlom,', left, 446, { size: 9.5, limit: contentWidth });
  text('Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330', left, 464, { size: 9.5 });
  text('จึงเรียนมาเพื่อโปรดดำเนินการ', paragraphIndent, 500, { size: 10 });

  const signatureCenter = right - 93;
  text('ขอแสดงความนับถือ', signatureCenter, 543, { size: 10, align: 'center' });
  if (signature) {
    const ratio = Math.min(155 / signature.naturalWidth, 44 / signature.naturalHeight);
    const w = signature.naturalWidth * ratio, h = signature.naturalHeight * ratio;
    ctx.drawImage(signature, signatureCenter - w / 2, 572 - h / 2, w, h);
  }
  text(fields.signatory ? '(' + fields.signatory + ')' : '', signatureCenter, 604, { align: 'center', limit: 184 });
  text(fields.position, signatureCenter, 622, { align: 'center', limit: 184 });
  text(fields.phone ? 'Mobile: ' + fields.phone : '', signatureCenter, 640, { align: 'center', limit: 184 });
  text('All business is undertaken subject to our Standard Trading Conditions of Carriage, which are incorporated into', left, 693, { size: 7, limit: contentWidth });
  text('all contracts of carriage to which we are a party. Our Standard Trading Conditions are available on request.', left, 705, { size: 7, limit: contentWidth });
}

export async function mountReferralLetter(host, { job, service, editable, login }) {
  const pdf = window.HarborFlowVectorPdf;
  if (!pdf) throw Error('PDF tools are unavailable. Reload to try again.');
  const logo = await pdf.prepareImage(new Image(), 'logo');
  if (!host.isConnected) return;
  const fields = {
    vessel: String(job.data.vessel || '').slice(0, 100),
    hospital: defaultHospital,
    issueDate: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10),
    appointmentDate: String(service.data.details?.appointment || service.data.plannedStart || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '',
    personName: '', nationality: '', birthDate: '', passport: '', signatory: '', position: '', phone: ''
  };
  host.innerHTML = `
    <div class="hfo-toolbar"><h3>Referral Letter</h3><div class="hfo-actions">
      <button class="hfo-btn" type="button" data-referral-email>Compose Email</button>
      <button class="hfo-btn" type="button" data-referral-save-as>Save as</button>
      <button class="hfo-btn primary" type="button" data-referral-download>Download PDF</button>
    </div></div>
    <p class="hfo-muted">Letter and patient details are kept in this tab while it is open.</p>
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
      if (name === 'hospital') input.setAttribute('list', 'hfoReferralHospitals');
      fields[name] = input.value;
      wrapper.append(label, input);
      fieldset.append(wrapper);
    }
    if (legend === 'Contact and signatory' && editable) {
      fieldset.insertAdjacentHTML('beforeend', `
        <label class="hfo-field">Signature<input type="file" accept="image/png,image/jpeg" title="PNG or JPEG" data-referral-signature disabled></label>
        <div class="hfo-referral-signature-actions">
          <div class="hfo-actions"><button type="button" class="hfo-btn" data-save-referral-contact disabled>Save contact details</button>
          <button type="button" class="hfo-btn" data-save-referral-signature disabled>Save signature</button>
          <button type="button" class="hfo-btn" data-remove-referral-signature disabled>Remove signature</button></div>
          <p class="hfo-muted" role="status" data-referral-contact-status></p>
          <p class="hfo-muted" role="status" data-referral-signature-status></p>
        </div>`);
    }
    form.append(fieldset);
  }
  const hospitals = document.createElement('datalist');
  hospitals.id = 'hfoReferralHospitals';
  hospitals.append(new Option(defaultHospital, defaultHospital));
  form.append(hospitals);
  const preview = host.querySelector('canvas');
  const status = host.querySelector('[data-referral-status]');
  let signatureImage = null;
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
    }, signatureImage);
  }
  let frame;
  function refreshPreview() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (host.isConnected) render(preview); });
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', event => {
    if (!Object.hasOwn(fields, event.target.name)) return;
    fields[event.target.name] = event.target.value;
    refreshPreview();
  });
  const saveAsButton = host.querySelector('[data-referral-save-as]');
  async function exportLetter(saveAs, report = message => { status.textContent = message; }) {
    report('');
    const vessel = fields.vessel.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-').trim();
    const name = 'REFERRAL LETTER' + (vessel ? ' - ' + vessel : '') + '.pdf';
    let handle;
    if (saveAs) saveAsButton.disabled = true;
    try {
      if (saveAs && typeof window.showSaveFilePicker === 'function') {
        try {
          handle = await window.showSaveFilePicker({
            suggestedName:name, types:[{description:'PDF document', accept:{'application/pdf':['.pdf']}}]
          });
        } catch (error) {
          if (error.name === 'AbortError') return;
          throw error;
        }
      }
      if (!host.isConnected) return;
      const canvas = document.createElement('canvas');
      render(canvas, true);
      const blob = pdf.fromCanvases([canvas], { width: pageWidth, height: pageHeight });
      await window.HarborFlowOktbPdf.saveLivePdf(blob, name, handle);
      report(handle ? 'PDF saved.' : 'PDF download started.');
    } catch (error) {
      report(error.message, true);
    } finally {
      if (saveAs) saveAsButton.disabled = false;
    }
  }
  saveAsButton.onclick = () => { void exportLetter(true); };
  host.querySelector('[data-referral-download]').onclick = () => { void exportLetter(false); };
  const composeButton = host.querySelector('[data-referral-email]');
  composeButton.onclick = () => openReferralEmail(fields, composeButton, report => exportLetter(false, report));
  render(preview);
  const documents = window.HarborFlowDocuments;
  const contactInputs = contactFields.map(name => form.elements.namedItem(name));
  const contactButton = form.querySelector('[data-save-referral-contact]');
  const contactStatus = form.querySelector('[data-referral-contact-status]');
  const currentContact = () => Object.fromEntries(contactFields.map(name => [name, fields[name]]));
  let contactBase = null, savedContact = currentContact(), savingContact = false;
  const contactChanged = () => contactFields.some(name => fields[name] !== savedContact[name]);
  function updateContactButton() {
    if (contactButton) contactButton.disabled = contactBase === null || savingContact || !contactChanged();
  }
  form.addEventListener('input', event => {
    if (!contactFields.includes(event.target.name) || !contactButton || contactBase === null) return;
    contactStatus.textContent = contactChanged() ? 'Unsaved contact details.' : '';
    updateContactButton();
  });
  if (contactButton) contactButton.onclick = async () => {
    const contact = currentContact();
    savingContact = true;
    updateContactButton();
    contactStatus.textContent = 'Saving contact details…';
    try {
      const response = await fetch('/api/documents?action=referralContact', {
        method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({login, contact, base:contactBase})
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Contact details could not be saved.');
      if (result.login !== login) throw Error('Account changed. Reopen the letter.');
      contactBase = result.base;
      savedContact = contact;
      contactStatus.textContent = contactChanged() ? 'Unsaved contact details.' : 'Contact details saved to your account.';
    } catch (error) {
      contactStatus.textContent = error.message;
    } finally {
      savingContact = false;
      updateContactButton();
    }
  };
  for (const input of contactInputs) input.readOnly = true;
  void documents.request({action:'referralContact'}).then(result => {
    if (!host.isConnected) return;
    if (result.login !== login) throw Error('Account changed. Reopen the letter.');
    contactBase = result.base;
    for (const input of contactInputs) {
      input.value = result.contact?.[input.name] ?? '';
      fields[input.name] = input.value;
    }
    savedContact = currentContact();
    refreshPreview();
  }).catch(error => {
    (contactStatus || status).textContent = error.message;
  }).finally(() => {
    for (const input of contactInputs) input.readOnly = false;
    updateContactButton();
  });
  if (editable) {
    const file = form.querySelector('[data-referral-signature]');
    const save = form.querySelector('[data-save-referral-signature]');
    const remove = form.querySelector('[data-remove-referral-signature]');
    const feedback = form.querySelector('[data-referral-signature-status]');
    let loaded = false, busy = false, saved = '', pending = '';
    const controls = () => {
      file.disabled = busy;
      save.disabled = busy || !loaded || pending === saved;
      remove.disabled = busy || !pending;
    };
    async function showSignature(data) {
      const image = data ? new Image() : null;
      if (image) {
        image.src = data;
        await image.decode();
      }
      pending = data;
      signatureImage = image;
      refreshPreview();
    }
    async function run(action, loading) {
      busy = true;
      controls();
      feedback.textContent = loading;
      try { await action(); }
      catch (error) { feedback.textContent = error.message; }
      finally {
        busy = false;
        controls();
      }
    }
    file.onchange = () => {
      const image = file.files[0];
      file.value = '';
      if (!image) return;
      void run(async () => {
        await showSignature(await documents.readSignature(image));
        feedback.textContent = loaded ? 'Ready to save to your account.' : 'Preview only. Reopen this tab to retry loading saved settings.';
      }, 'Preparing signature…');
    };
    remove.onclick = () => {
      void showSignature('');
      feedback.textContent = saved ? 'Select Save signature to remove it from your account.' : '';
      controls();
    };
    save.onclick = () => {
      void run(async () => {
        const response = await fetch('/api/documents?action=referralSignature', {
          method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({login, signature:pending, base:saved})
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || 'Signature could not be saved.');
        if (result.login !== login) throw Error('Account changed. Reopen the letter.');
        saved = result.signature;
        feedback.textContent = saved ? 'Signature saved to your account.' : 'Saved signature removed.';
      }, 'Saving signature…');
    };
    await run(async () => {
      const result = await documents.request({action:'referralSignature'});
      if (result.login !== login || !host.isConnected) return;
      await showSignature(result.signature);
      saved = result.signature;
      loaded = true;
      feedback.textContent = saved ? 'Using the signature saved to your account.' : '';
    }, 'Loading saved signature…');
  }
}
