import {amountInCents,banknoteRows,ctmCurrencies} from './lib/cash-voucher.mjs';
import {bindMailEditor,cleanBody,createMailComposer,outlookUrl} from './hotel-email.mjs';

const money=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function voucherMailDetails(job,draft) {
  const currency=draft.pricing.currency;
  const groups=ctmCurrencies.map(code=>{
    const rows=banknoteRows(draft.banknotes,code).filter(row=>row.quantity);
    return {currency:code,rows,total:rows.reduce((sum,row)=>sum+row.amount,0)};
  }).filter(group=>group.rows.length);
  const paymentLines=draft.lines.filter(line=>!line.kind&&amountInCents(line.amount)!==null);
  const ctmLine=paymentLines.find(line=>/\bCTM\b|cash to master/i.test(line.description))||paymentLines[0];
  const banknoteTotal=groups.find(group=>group.currency===currency)?.total;
  const amount=amountInCents(draft.pricing.amount)??amountInCents(ctmLine?.amount)??(banknoteTotal===undefined?null:banknoteTotal*100);
  const vessel=String(job.data.vessel||'').trim();
  const jobNo=job.data.jobNo||draft.lines.find(line=>line.jobNo)?.jobNo||'';
  const date=draft.lines.find(line=>line.kind==='dueDate')?.description;
  const parsed=new Date(date+'T00:00:00Z');
  const dueDate=Number.isNaN(parsed.valueOf())?'To be confirmed':new Intl.DateTimeFormat('en-GB',{
    day:'2-digit',month:'short',year:'2-digit',timeZone:'UTC'
  }).format(parsed).replace('Sept','Sep').replaceAll(' ','-').toUpperCase();
  const warnings=[];
  if(amount===null)warnings.push('Enter the CTM amount.');
  if(!groups.length)warnings.push('Enter the banknote breakdown.');
  if(groups.some(group=>group.currency!==currency))warnings.push('Check the currencies in the banknote breakdown.');
  if(banknoteTotal!==undefined&&amount!==null&&banknoteTotal*100!==amount)warnings.push('The banknote total differs from the CTM amount.');
  if(dueDate==='To be confirmed')warnings.push('Set the due date on the voucher.');
  const amountText=amount===null?'[CTM amount]':currency+' '+money.format(amount/100);
  return {vessel,jobNo,amountText,dueDate,groups,warnings,
    subject:'REQUEST TO PROVIDE CTM '+(amount===null?'[AMOUNT]':money.format(amount/100)+currency)+' TO MASTER OF '+(vessel.toUpperCase()||'[VESSEL]')};
}

function voucherEmailBody({vessel,jobNo,amountText,dueDate,groups},approvedBy) {
  const approver=!approvedBy||/\bJarun\b/i.test(approvedBy)?'P’ Boy':approvedBy;
  const tables=groups.map(group=>`<table aria-label="${group.currency} denominations"><thead><tr><th>Banknote (${group.currency})</th><th>Qty</th><th>Amount</th></tr></thead><tbody>
    ${group.rows.map(row=>`<tr><td>${money.format(row.denomination)}</td><td>${money.format(row.quantity)}</td><td>${money.format(row.amount)}</td></tr>`).join('')}
    </tbody><tfoot><tr><th colspan="2" class="hfo-ctm-total">TOTAL ${group.currency}</th><td class="hfo-ctm-total">${money.format(group.total)}</td></tr></tfoot></table>`).join('<br>');
  return `<p>Dear ${escape(approver)},</p>
    <p>Please kindly find attached Payment voucher for your approval krub.</p>
    <p>Dear P’ Pong,</p>
    <p>Please kindly arrange CTM amount of <strong class="hfo-ctm-highlight">${escape(amountText)}</strong> as below details.</p>
    <p>VESSEL NAME: <strong>${escape(vessel||'[Vessel]')}</strong><br>JOB NO. <strong class="hfo-ctm-highlight">${escape(jobNo||'[Job No.]')}</strong></p>
    <p><strong>Denomination:</strong></p>${tables||'<p>[Banknote breakdown]</p>'}
    <p><strong class="hfo-ctm-highlight hfo-ctm-total">DUE DATE: ${escape(dueDate)}<span data-ctm-due-time></span></strong></p>
    <p>Thank you &amp; Best regards,</p>`;
}

export function openVoucherEmail({job,draft,trigger,downloadVoucher}) {
  const details=voucherMailDetails(job,draft);
  const dialog=createMailComposer({
    fieldsExtra:'<label class="hfo-mail-line"><span>Due time (LT)</span><input name="dueTime" type="time"></label>',
    footerExtra:'<button type="button" class="hfo-btn" data-email-voucher-pdf>Download PDF</button>'
  });
  const form=dialog.querySelector('form');
  const notice=dialog.querySelector('[data-mail-notice]');
  const {editor}=bindMailEditor(form);
  const report=(text,error=false)=>{notice.textContent=text;notice.classList.toggle('hfo-alert',error);};
  dialog.querySelector('[data-branch]').textContent=['Payment Voucher',details.vessel,details.jobNo].filter(Boolean).join(' · ');
  form.elements.subject.value=details.subject;
  editor.innerHTML=voucherEmailBody(details,draft.header.approvedBy);
  form.hidden=false;
  report([...details.warnings,'Download the voucher and attach it in Outlook.'].join(' '),Boolean(details.warnings.length));
  form.onsubmit=event=>event.preventDefault();
  form.elements.dueTime.oninput=()=>{
    const time=editor.querySelector('[data-ctm-due-time]');
    if(time)time.textContent=form.elements.dueTime.value?' @ '+form.elements.dueTime.value.replace(':','')+'LT':'';
  };
  form.querySelector('[data-email-voucher-pdf]').onclick=()=>{
    try{downloadVoucher();report('Voucher downloaded. Attach it in Outlook.');}
    catch(error){report(error.message,true);}
  };
  form.querySelector('[data-outlook]').onclick=()=>{
    const to=form.elements.to.value, cc=form.elements.cc.value, subject=form.elements.subject.value;
    const body=editor.innerText;
    try{
      let url=outlookUrl({to,cc,subject});
      try{url=outlookUrl({to,cc,subject,body});}
      catch(error){if(!window.confirm(error.message+' Open Outlook with recipients and subject?'))return;}
      window.open(url,'_blank','noopener,noreferrer');
      report('Use Copy formatted body to keep the table in Outlook. Attach the downloaded voucher before sending.');
    }catch(error){report(error.message,true);}
  };
  form.querySelector('[data-copy]').onclick=async()=>{
    try{
      if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw Error('Select and copy the body directly to keep its formatting.');
      await navigator.clipboard.write([new ClipboardItem({
        'text/html':new Blob([cleanBody(editor.innerHTML)],{type:'text/html'}),
        'text/plain':new Blob([editor.innerText],{type:'text/plain'})
      })]);
      report('Formatted body copied. Paste it into Outlook.');
    }catch(error){report(error.message,true);}
  };
  dialog.querySelector('[data-close-mail]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();if(trigger.isConnected)trigger.focus();},{once:true});
  trigger.parentElement.append(dialog);
  dialog.showModal();
}
