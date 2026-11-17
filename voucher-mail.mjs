import {amountInCents,banknoteRows,ctmCurrencies} from './lib/cash-voucher.mjs';
import {mailRecipientAddresses} from './lib/mail-recipients.mjs';
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

export function openVoucherEmail({job,draft,trigger,downloadVoucher,loadRecipients,createOutlookDraft,outlookConnectUrl}) {
  const details=voucherMailDetails(job,draft);
  const dialog=createMailComposer({
    fieldsExtra:'<label class="hfo-mail-line"><span>Due time (LT)</span><input name="dueTime" type="time"></label>',
    footerExtra:`<button type="button" class="hfo-btn" data-email-voucher-pdf>Download PDF</button>
      <button type="button" class="hfo-btn" data-copy-voucher-cc>Copy CC</button>
      ${createOutlookDraft?'<button type="button" class="hfo-btn" data-create-outlook-draft>Create Outlook draft</button>':''}`
  });
  const form=dialog.querySelector('form');
  const notice=dialog.querySelector('[data-mail-notice]');
  const draftButton=form.querySelector('[data-create-outlook-draft]');
  const {editor}=bindMailEditor(form);
  const report=(text,error=false)=>{notice.textContent=text;notice.classList.toggle('hfo-alert',error);};
  dialog.querySelector('[data-branch]').textContent=['Payment Voucher',details.vessel,details.jobNo].filter(Boolean).join(' · ');
  form.elements.subject.value=details.subject;
  editor.innerHTML=voucherEmailBody(details,draft.header.approvedBy);
  form.hidden=false;
  const hint=[...details.warnings,'Use Copy CC and Copy formatted body when pasting into Outlook. Download the voucher PDF to attach it.'].join(' ');
  report(hint,Boolean(details.warnings.length));
  form.onsubmit=event=>event.preventDefault();
  form.elements.dueTime.oninput=()=>{
    const time=editor.querySelector('[data-ctm-due-time]');
    if(time)time.textContent=form.elements.dueTime.value?' @ '+form.elements.dueTime.value.replace(':','')+'LT':'';
  };
  form.querySelector('[data-email-voucher-pdf]').onclick=()=>{
    try{downloadVoucher();report('Voucher downloaded. Attach it in Outlook.');}
    catch(error){report(error.message,true);}
  };
  form.querySelector('[data-copy-voucher-cc]').onclick=async()=>{
    try{
      const cc=mailRecipientAddresses(form.elements.cc.value).join('; ');
      if(!cc){report('The CC field is empty.');return;}
      if(!navigator.clipboard?.writeText)throw Error('Copying is unavailable. Select and copy the CC field.');
      await navigator.clipboard.writeText(cc);
      report('CC copied. Paste it into the CC field in Outlook.');
    }catch(error){
      form.elements.cc.select();
      report(error.message,true);
    }
  };
  form.querySelector('[data-outlook]').onclick=()=>{
    const subject=form.elements.subject.value;
    const body=editor.innerText;
    try{
      const to=mailRecipientAddresses(form.elements.to.value).join(';');
      const cc=mailRecipientAddresses(form.elements.cc.value).join(';');
      let url=outlookUrl({to,cc,subject});
      try{url=outlookUrl({to,cc,subject,body});}
      catch(error){if(!window.confirm(error.message+' Open Outlook with recipients and subject?'))return;}
      window.open(url,'_blank','noopener,noreferrer');
      report('If Outlook leaves CC blank, paste the list using Copy CC. Replace the plain text with Copy formatted body to keep the table. Attach the downloaded voucher before sending.');
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
  if(draftButton){
    const link=document.createElement('a');
    link.className='hfo-btn';
    link.target='_blank';
    link.rel='noopener noreferrer';
    link.hidden=true;
    draftButton.after(link);
    function showLink(label,url){
      link.textContent=label;
      link.href=url;
      link.hidden=false;
    }
    draftButton.onclick=async()=>{
      draftButton.disabled=true;
      link.hidden=true;
      let created=false;
      try{
        const to=form.elements.to.value,cc=form.elements.cc.value,subject=form.elements.subject.value;
        mailRecipientAddresses(to);
        mailRecipientAddresses(cc);
        report('Creating draft in Outlook…');
        const result=await createOutlookDraft({to,cc,subject,body:cleanBody(editor.innerHTML)});
        created=true;
        showLink('Open Outlook draft',result.url);
        report('Draft created with To, CC and the formatted table. Review it in Outlook and attach the voucher PDF.');
      }catch(error){
        if(error.code===428&&error.detail?.connectOutlook){
          showLink('Connect Outlook',outlookConnectUrl);
          report('Connect your Microsoft 365 account, then return here and select Create Outlook draft again.');
        }else report(error.message,true);
      }finally{draftButton.disabled=created;}
    };
  }
  dialog.querySelector('[data-close-mail]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();if(trigger.isConnected)trigger.focus();},{once:true});
  trigger.parentElement.append(dialog);
  dialog.showModal();
  if(loadRecipients){
    const edited=new Set();
    for(const field of ['to','cc'])form.elements[field].addEventListener('input',()=>edited.add(field));
    const recipientActions=form.querySelectorAll('[data-outlook],[data-copy-voucher-cc],[data-create-outlook-draft]');
    recipientActions.forEach(button=>{button.disabled=true;});
    report('Loading default recipients…');
    void Promise.resolve().then(loadRecipients).then(defaults=>{
      if(!dialog.open)return;
      for(const field of ['to','cc'])if(!edited.has(field))form.elements[field].value=defaults[field]||'';
      report(hint,Boolean(details.warnings.length));
    },()=>{
      if(dialog.open)report('Default recipients could not load. Enter To and CC manually. '+hint,true);
    }).finally(()=>{recipientActions.forEach(button=>{button.disabled=false;});});
  }
}
