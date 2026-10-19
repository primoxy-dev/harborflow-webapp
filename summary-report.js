/* Read-only per-Port-Call Service report. The API controls which fields are available. */
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const label = key => String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,char=>char.toUpperCase());
  const hasValue = value => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
  const show = value => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : Array.isArray(value) ? value.join(', ') : String(value ?? '');
  const dateTime = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T| )(\d{2}:\d{2})?/);
    if (!match) return String(value || '—');
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${match[3]} ${months[Number(match[2])-1] || match[2]} ${match[1]}${match[4] ? ' · '+match[4] : ''}`;
  };
  const serviceFields = [
    ['description','Description'],['pic','Service PIC'],['supplier','Supplier'],
    ['plannedStart','Planned start'],['plannedEnd','Planned end'],['actualStart','Actual start'],['actualEnd','Actual end'],
    ['baselineDue','Baseline due'],['terminalCondition','Terminal condition'],['terminalConfirmation','Terminal confirmation'],
    ['restrictionReason','Restriction / unverified reason'],['sopVersion','SOP version'],
    ['planConfirmed','Plan confirmed'],['supplierConfirmed','Supplier confirmed'],['notes','Notes']
  ];
  const dateFields = new Set(['plannedStart','plannedEnd','actualStart','actualEnd','baselineDue']);
  function build(data, jobId, linked={}) {
    const job=(data.jobs || []).find(item=>item.id===jobId);
    if (!job) throw Error('Port Call not found');
    const publicView=Boolean(data.public);
    const people=publicView ? [] : (linked.people || []);
    const trips=publicView ? [] : (linked.trips || []);
    const services=(data.services || []).filter(item=>item.job_id===jobId && !item.removed_at).sort((a,b)=>a.seq-b.seq).map(item=>{
      const source=item.data || {};
      const fields=publicView ? [] : serviceFields.filter(([key])=>hasValue(source[key]))
        .map(([key,name])=>({name,value:dateFields.has(key)?dateTime(source[key]):show(source[key])}));
      const specifics=publicView ? [] : Object.entries(source.details || {}).filter(([,value])=>hasValue(value))
        .map(([key,value])=>({name:label(key),value:show(value)}));
      const checklist=publicView ? [] : (Array.isArray(source.checklist)?source.checklist:[]).map(step=>({
        text:String(step.text||''),done:Boolean(step.done),actor:String(step.actor||''),completedAt:step.completedAt?dateTime(step.completedAt):''
      }));
      const assigned=people.filter(person=>Array.isArray(person.data?.serviceIds)&&person.data.serviceIds.includes(item.id)).map(person=>({
        id:person.id,kind:person.kind,name:String(person.data?.name||''),category:String(person.data?.category||''),
        nationality:String(person.data?.nationality||''),rank:String(person.data?.rank||'')
      }));
      const travel=trips.filter(trip=>trip.service_id===item.id).map(trip=>{
        const record=trip.data||{};
        const passengerNames=(record.personIds||[]).map(id=>people.find(person=>person.id===id)?.data?.name).filter(Boolean);
        return {
          kind:String(record.kind||''),origin:String(record.originName||record.origin||''),destination:String(record.destinationName||record.destination||''),
          departure:dateTime(record.plannedDeparture),arrival:dateTime(record.plannedArrival),provider:String(record.provider||''),
          vehicle:String(record.vehicle||''),status:String(record.status||''),purpose:String(record.purpose||''),
          passengers:passengerNames,cargo:Array.isArray(record.cargoItems)?record.cargoItems.filter(Boolean):record.cargo?[String(record.cargo)]:[]
        };
      });
      return {id:item.id,seq:item.seq,type:String(source.type||'Service'),status:String(source.status||'Not Started'),fields,specifics,checklist,people:assigned,travel};
    });
    const checklist=services.flatMap(service=>service.checklist);
    return {
      publicView,job:{id:job.id,vessel:String(job.data?.vessel||'Unnamed vessel'),jobNo:publicView?'':String(job.data?.jobNo||''),
        port:String(job.data?.port||''),principal:publicView?'':String(job.data?.principal||''),
        eta:dateTime(job.data?.eta),etd:publicView?'':dateTime(job.data?.etd),
        status:String(job.data?.status||''),pic:publicView?'':String(job.data?.pic||'')},
      services,totals:{services:services.length,completed:services.filter(service=>service.status==='Completed').length,
        waiting:services.filter(service=>service.status==='Waiting').length,steps:checklist.length,done:checklist.filter(step=>step.done).length},
      peopleAvailable:!publicView && (Boolean(data.grant?.crewView)||Boolean(data.grant?.visitorView)),
      travelAvailable:!publicView && Boolean(data.grant?.crewView)&&Boolean(data.grant?.visitorView),
      generatedAt:new Date().toLocaleString('en-GB',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'})
    };
  }
  const pair=(name,value)=>`<div class="hfs-report-field"><span>${escape(name)}</span><b>${escape(value)}</b></div>`;
  function render(report) {
    const j=report.job,t=report.totals;
    const header=`<div class="hfs-report-title"><div><span class="hfs-eyebrow">OPERATIONS · SERVICE SUMMARY</span><h2>${escape(j.vessel)}</h2><p>${escape([j.jobNo,j.port].filter(Boolean).join(' · '))}</p></div><span class="hfs-report-badge">${escape(report.publicView?'PUBLIC SUMMARY':'JOB REPORT')}</span></div>`;
    const metadata=[['Job No.',j.jobNo],['Port / Terminal',j.port],['Principal',j.principal],['ETA',j.eta],['ETD',j.etd],['Job status',j.status],['Job PIC',j.pic]].filter(([,value])=>hasValue(value));
    const metrics=`<div class="hfs-report-metrics"><div><span>Services</span><strong>${t.services}</strong></div><div><span>Completed</span><strong>${t.completed}</strong></div><div><span>Waiting</span><strong>${t.waiting}</strong></div><div><span>Checklist</span><strong>${report.publicView?'—':`${t.done} / ${t.steps}`}</strong></div></div>`;
    const cards=report.services.length?report.services.map(service=>{
      const fieldHtml=service.fields.length||service.specifics.length?`<div class="hfs-report-fields">${[...service.fields,...service.specifics].map(field=>pair(field.name,field.value)).join('')}</div>`:'<p class="hfs-empty-line">ยังไม่มีรายละเอียดเพิ่มเติม</p>';
      const checkHtml=report.publicView?'<p class="hfs-empty-line">ลงชื่อเข้าใช้เพื่อดู checklist และรายละเอียด</p>':service.checklist.length?
        `<div class="hfs-report-checks">${service.checklist.map(step=>`<div class="hfs-check-row"><span class="hfs-check ${step.done?'done':''}" aria-label="${step.done?'Complete':'Pending'}">${step.done?'✓':''}</span><span>${escape(step.text)}${step.done&&step.completedAt?`<small>${escape([step.actor,step.completedAt].filter(Boolean).join(' · '))}</small>`:''}</span></div>`).join('')}</div>`:'<p class="hfs-empty-line">ยังไม่มี checklist</p>';
      const peopleHtml=service.people.length?`<div class="hfs-report-sub"><h4>Linked crew / visitors</h4><div class="hfs-people-list">${service.people.map(person=>`<span>${escape([person.name,person.category||person.kind,person.rank,person.nationality].filter(Boolean).join(' · '))}</span>`).join('')}</div></div>`:'';
      const travelHtml=service.travel.length?`<div class="hfs-report-sub"><h4>Travel</h4>${service.travel.map(trip=>`<div class="hfs-trip"><b>${escape(trip.kind.toUpperCase())} · ${escape(trip.origin||'—')} → ${escape(trip.destination||'—')}</b><span>${escape([trip.departure,trip.arrival,trip.provider,trip.vehicle,trip.status].filter(value=>value&&value!=='—').join(' · '))}</span>${trip.passengers.length||trip.cargo.length?`<small>${escape([...trip.passengers,...trip.cargo].join(', '))}</small>`:''}</div>`).join('')}</div>`:'';
      return `<article class="hfs-service-card"><div class="hfs-service-head"><div><span>#${escape(service.seq)}</span><h3>${escape(service.type)}</h3></div><span class="hfs-status" data-status="${escape(service.status)}">${escape(service.status)}</span></div>${fieldHtml}<div class="hfs-report-sub"><h4>Checklist <span>${report.publicView?'':`${service.checklist.filter(step=>step.done).length} / ${service.checklist.length}`}</span></h4>${checkHtml}</div>${peopleHtml}${travelHtml}</article>`;
    }).join(''):'<div class="hfs-empty-report">ยังไม่มี Service ใน Port Call นี้</div>';
    return `${header}<div class="hfs-report-meta">${metadata.map(([name,value])=>pair(name,value)).join('')}</div>${metrics}<div class="hfs-report-note">${report.publicView?'รายงานสาธารณะแสดงเฉพาะข้อมูลสรุป':'ข้อมูล ณ '+escape(report.generatedAt)+' (Asia/Bangkok) · ตรวจสอบข้อมูลกับ Job ก่อนนำไปใช้'}</div><div class="hfs-service-grid">${cards}</div>`;
  }
  function createPdf(report) {
    if (!window.HarborFlowOktbPdf?.pdfFromPages) throw Error('PDF exporter unavailable');
    const width=595,height=842,scale=2,pages=[];
    let canvas,ctx,y,pageNumber=0;
    const left=38,right=width-38,bodyWidth=right-left;
    function page() {
      canvas=document.createElement('canvas');canvas.width=width*scale;canvas.height=height*scale;
      ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
      ctx.textBaseline='top';pages.push(canvas);pageNumber++;y=38;
      ctx.fillStyle='#107a72';ctx.fillRect(left,29,36,4);
      ctx.fillStyle='#66788b';ctx.font='9px Arial';ctx.fillText('HARBORFLOW  /  OPERATIONS',left,38);y=63;
    }
    function ensure(space){if(y+space>height-49)page();}
    function splitLine(line,max,font){
      ctx.font=font;const words=String(line).split(/\s+/),result=[];let current='';
      for(const word of words){const proposal=current?current+' '+word:word;
        if(ctx.measureText(proposal).width<=max){current=proposal;continue;}
        if(current)result.push(current);current='';
        if(ctx.measureText(word).width<=max){current=word;continue;}
        for(const letter of Array.from(word)){if(ctx.measureText(current+letter).width>max&&current){result.push(current);current='';}current+=letter;}
      }
      if(current)result.push(current);return result.length?result:[''];
    }
    function text(value,{x=left,size=10,bold=false,color='#203047',max=bodyWidth,lineHeight=size+4,indent=0}={}){
      const font=`${bold?'bold ':''}${size}px Arial, sans-serif`;
      for(const paragraph of String(value||'—').split('\n')){
        for(const line of splitLine(paragraph,max-indent,font)){
          ensure(lineHeight);ctx.fillStyle=color;ctx.font=font;ctx.fillText(line,x+indent,y);y+=lineHeight;
        }
      }
    }
    function rule(){ensure(12);ctx.fillStyle='#e0e7ee';ctx.fillRect(left,y,bodyWidth,1);y+=12;}
    function item(name,value){text(name.toUpperCase(),{size:7.5,bold:true,color:'#6b7a90',lineHeight:11});text(value,{size:9.5,lineHeight:13});y+=4;}
    page();
    text('SERVICE SUMMARY REPORT',{size:18,bold:true,color:'#10233d',lineHeight:25});
    text(report.job.vessel,{size:15,bold:true,color:'#10233d',lineHeight:21});
    text([report.job.jobNo,report.job.port].filter(Boolean).join('  ·  '),{size:9,color:'#607286'});
    y+=7;rule();
    for(const [name,value] of [['Job No.',report.job.jobNo],['Port / Terminal',report.job.port],['Principal',report.job.principal],['ETA',report.job.eta],['ETD',report.job.etd],['Job status',report.job.status],['Job PIC',report.job.pic]].filter(([,value])=>hasValue(value)))item(name,value);
    rule();
    text(`Services ${report.totals.services}  ·  Completed ${report.totals.completed}  ·  Waiting ${report.totals.waiting}${report.publicView?'':`  ·  Checklist ${report.totals.done}/${report.totals.steps}`}`,{size:10,bold:true,color:'#107a72'});
    y+=9;
    for(const [serviceIndex,service] of report.services.entries()){
      ensure(95);ctx.fillStyle='#eff6f6';ctx.fillRect(left,y,bodyWidth,28);y+=7;
      text(`#${service.seq}  ${service.type}  ·  ${service.status}`,{x:left+9,max:bodyWidth-18,size:11,bold:true,color:'#10233d',lineHeight:17});y+=12;
      for(const field of [...service.fields,...service.specifics])item(field.name,field.value);
      text(`CHECKLIST${report.publicView?'':`  ${service.checklist.filter(step=>step.done).length}/${service.checklist.length}`}`,{size:8,bold:true,color:'#567184',lineHeight:13});
      if(report.publicView)text('Sign in to view checklist and details.',{size:9,color:'#6b7a90'});
      else if(!service.checklist.length)text('No checklist steps yet.',{size:9,color:'#6b7a90'});
      else for(const step of service.checklist)text(`${step.done?'[x]':'[ ]'}  ${step.text}${step.done&&step.completedAt?`  (${[step.actor,step.completedAt].filter(Boolean).join(' · ')})`:''}`,{size:9,lineHeight:13,indent:3});
      if(service.people.length){y+=5;text('LINKED CREW / VISITORS',{size:8,bold:true,color:'#567184',lineHeight:13});for(const person of service.people)text([person.name,person.category||person.kind,person.rank,person.nationality].filter(Boolean).join(' · '),{size:9,lineHeight:13,indent:3});}
      if(service.travel.length){y+=5;text('TRAVEL',{size:8,bold:true,color:'#567184',lineHeight:13});for(const trip of service.travel){text(`${trip.kind.toUpperCase()}  ${trip.origin||'—'} → ${trip.destination||'—'}`,{size:9,bold:true,lineHeight:13,indent:3});text([trip.departure,trip.arrival,trip.provider,trip.vehicle,trip.status,...trip.passengers,...trip.cargo].filter(value=>value&&value!=='—').join(' · '),{size:8.5,lineHeight:12,indent:3});}}
      y+=10;
      if(serviceIndex<report.services.length-1)rule();
    }
    for(const [index,surface] of pages.entries()){
      const context=surface.getContext('2d');context.save();context.setTransform(scale,0,0,scale,0,0);
      context.fillStyle='#8190a2';context.font='8px Arial';context.textBaseline='top';
      context.fillText(`${report.publicView?'PUBLIC SUMMARY  ·  ':'TRIAL DATA  ·  '}Generated ${report.generatedAt} Asia/Bangkok`,left,height-30);
      context.textAlign='right';context.fillText(`${index+1} / ${pages.length}`,right,height-30);context.restore();
    }
    const safe=String(report.job.jobNo||report.job.vessel||'PORT-CALL').replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
    const filename=`SERVICE SUMMARY - ${safe}.PDF`;
    return {filename,blob:window.HarborFlowOktbPdf.pdfFromPages(pages)};
  }
  function downloadPdf(report) {
    const {filename,blob}=createPdf(report);
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),300000);
    return filename;
  }
  window.HarborFlowSummaryReport={build,render,createPdf,downloadPdf};
})();
