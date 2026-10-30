// Independent Job workspace; never navigates to the Commercial quotation editor.
let active=null;
function open(jobId){
 if(active)return;
 const dialog=document.createElement('dialog');dialog.className='hf-job-quotation-dialog';
 const style=document.createElement('style');style.textContent='.hf-job-quotation-dialog{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#fff;overflow:hidden}.hf-job-quotation-dialog::backdrop{background:#10233dcc}.hf-jq-bar{height:48px;padding:7px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e4e4e7;color:#52525b;font:13px Arial,sans-serif}.hf-job-quotation-dialog iframe{width:100%;height:calc(100% - 49px);border:0;display:block}';
 const bar=document.createElement('div');bar.className='hf-jq-bar';const label=document.createElement('b');label.textContent='Job / Create Quotation';
 const close=document.createElement('button');close.type='button';close.className='hfo-btn';close.textContent='← Back to Job';bar.append(label,close);
 const frame=document.createElement('iframe');frame.title='Job quotation editor';frame.src='/job-quotation/?jobId='+encodeURIComponent(jobId);
 dialog.append(style,bar,frame);document.body.append(dialog);const priorFocus=document.activeElement;active={dialog,frame,jobId,dirty:false};
 const dismiss=()=>{if(active?.dirty&&!confirm('มีใบเสนอราคาที่ยังไม่ได้บันทึก กลับ Job โดยไม่บันทึกหรือไม่?'))return;dialog.close();dialog.remove();active=null;priorFocus?.focus();};
 close.addEventListener('click',dismiss);dialog.addEventListener('cancel',e=>{e.preventDefault();dismiss();});dialog.showModal();close.focus();
}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==active?.frame.contentWindow||event.data?.jobId!==active?.jobId)return;if(event.data?.type==='hf-job-quotation-dirty')active.dirty=event.data.dirty===true;});
window.HarborFlowJobQuotation={open};
// A copied link still requires the API's signed-in Job permission check.
const linked=new URLSearchParams(location.search).get('jobQuotation');if(linked&&/^[a-f0-9-]{36}$/i.test(linked))open(linked);
