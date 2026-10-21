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
        nationality:String(person.data?.nationality||''),rank:String(person.data?.rank||''),
        dob:String(person.data?.dob||''),passport:String(person.data?.passport||''),passportExpiry:String(person.data?.passportExpiry||''),
        flights:(Array.isArray(person.data?.flights)?person.data.flights:[]).filter(flight=>Object.values(flight||{}).some(hasValue)).map(flight=>({
          airline:String(flight?.airline||''),number:String(flight?.number||''),date:String(flight?.date||''),from:String(flight?.from||''),to:String(flight?.to||''),
          departure:String(flight?.departure||''),arrival:String(flight?.arrival||''),booking:String(flight?.booking||'')
        }))
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
      const crewGroups=source.type==='Crew Change'?{
        onSigners:assigned.filter(person=>/^on[- ]?signers?$/i.test(person.category)),
        offSigners:assigned.filter(person=>/^off[- ]?signers?$/i.test(person.category))
      }:null;
      return {id:item.id,seq:item.seq,type:String(source.type||'Service'),status:String(source.status||'Not Started'),fields,specifics,checklist,people:assigned,crewGroups,travel};
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
  const flightTable=person=>person.flights.length?`<div class="hfs-flight-scroll"><table class="hfs-flight-table"><thead><tr><th>Airline</th><th>Flight No.</th><th>Date</th><th>From</th><th>To</th><th>Departure</th><th>Arrival</th><th>PNR</th></tr></thead><tbody>${person.flights.map(flight=>`<tr>${[['Airline',flight.airline],['Flight No.',flight.number],['Date',flight.date],['From',flight.from],['To',flight.to],['Departure',flight.departure],['Arrival',flight.arrival],['PNR',flight.booking]].map(([name,value])=>`<td data-label="${name}">${escape(value||'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="hfs-empty-line">ยังไม่มีรายละเอียดเที่ยวบิน</p>';
  const crewPerson=person=>`<div class="hfs-crew-person"><div class="hfs-crew-person-head"><b>${escape(person.name||'Unnamed crew')}</b><span>${escape([person.rank,person.nationality].filter(Boolean).join(' · ')||'—')}</span></div><div class="hfs-crew-person-meta">${[['Date of birth',person.dob],['Passport',person.passport],['PP. EXP',person.passportExpiry]].filter(([,value])=>hasValue(value)).map(([name,value])=>pair(name,value)).join('')}</div>${flightTable(person)}</div>`;
  const crewGroup=(title,people)=>`<section class="hfs-crew-group"><h5>${escape(title)} <span>${people.length}</span></h5>${people.length?people.map(crewPerson).join(''):'<p class="hfs-empty-line">ยังไม่มีรายชื่อ</p>'}</section>`;
  function render(report) {
    const j=report.job,t=report.totals;
    const header=`<div class="hfs-report-title"><div><span class="hfs-eyebrow">OPERATIONS · SERVICE SUMMARY</span><h2>${escape(j.vessel)}</h2><p>${escape([j.jobNo,j.port].filter(Boolean).join(' · '))}</p></div><span class="hfs-report-badge">${escape(report.publicView?'PUBLIC SUMMARY':'JOB REPORT')}</span></div>`;
    const metadata=[['Job No.',j.jobNo],['Port / Terminal',j.port],['Principal',j.principal],['ETA',j.eta],['ETD',j.etd],['Job status',j.status],['Job PIC',j.pic]].filter(([,value])=>hasValue(value));
    const metrics=`<div class="hfs-report-metrics"><div><span>Services</span><strong>${t.services}</strong></div><div><span>Completed</span><strong>${t.completed}</strong></div><div><span>Waiting</span><strong>${t.waiting}</strong></div><div><span>Checklist</span><strong>${report.publicView?'—':`${t.done} / ${t.steps}`}</strong></div></div>`;
    const cards=report.services.length?report.services.map(service=>{
      const fieldHtml=service.fields.length||service.specifics.length?`<div class="hfs-report-fields">${[...service.fields,...service.specifics].map(field=>pair(field.name,field.value)).join('')}</div>`:'<p class="hfs-empty-line">ยังไม่มีรายละเอียดเพิ่มเติม</p>';
      const checkHtml=report.publicView?'<p class="hfs-empty-line">ลงชื่อเข้าใช้เพื่อดู checklist และรายละเอียด</p>':service.checklist.length?
        `<div class="hfs-report-checks">${service.checklist.map(step=>`<div class="hfs-check-row"><span class="hfs-check ${step.done?'done':''}" aria-label="${step.done?'Complete':'Pending'}">${step.done?'✓':''}</span><span>${escape(step.text)}${step.done&&step.completedAt?`<small>${escape([step.actor,step.completedAt].filter(Boolean).join(' · '))}</small>`:''}</span></div>`).join('')}</div>`:'<p class="hfs-empty-line">ยังไม่มี checklist</p>';
      const peopleHtml=service.crewGroups?`<div class="hfs-report-sub hfs-crew-change"><h4>Crew Change</h4>${report.publicView?'<p class="hfs-empty-line">ลงชื่อเข้าใช้และใช้สิทธิ์ Crew เพื่อดูรายชื่อและเที่ยวบิน</p>':crewGroup('On-signers',service.crewGroups.onSigners)+crewGroup('Off-signers',service.crewGroups.offSigners)}</div>`:service.people.length?`<div class="hfs-report-sub"><h4>Linked crew / visitors</h4><div class="hfs-people-list">${service.people.map(person=>`<span>${escape([person.name,person.category||person.kind,person.rank,person.nationality].filter(Boolean).join(' · '))}</span>`).join('')}</div></div>`:'';
      const travelHtml=service.travel.length?`<div class="hfs-report-sub"><h4>Travel</h4>${service.travel.map(trip=>`<div class="hfs-trip"><b>${escape(trip.kind.toUpperCase())} · ${escape(trip.origin||'—')} → ${escape(trip.destination||'—')}</b><span>${escape([trip.departure,trip.arrival,trip.provider,trip.vehicle,trip.status].filter(value=>value&&value!=='—').join(' · '))}</span>${trip.passengers.length||trip.cargo.length?`<small>${escape([...trip.passengers,...trip.cargo].join(', '))}</small>`:''}</div>`).join('')}</div>`:'';
      return `<article class="hfs-service-card ${service.crewGroups?'hfs-service-crew':''}"><div class="hfs-service-head"><div><span>#${escape(service.seq)}</span><h3>${escape(service.type)}</h3></div><span class="hfs-status" data-status="${escape(service.status)}">${escape(service.status)}</span></div>${fieldHtml}<div class="hfs-report-sub"><h4>Checklist <span>${report.publicView?'':`${service.checklist.filter(step=>step.done).length} / ${service.checklist.length}`}</span></h4>${checkHtml}</div>${peopleHtml}${travelHtml}</article>`;
    }).join(''):'<div class="hfs-empty-report">ยังไม่มี Service ใน Port Call นี้</div>';
    return `${header}<div class="hfs-report-meta">${metadata.map(([name,value])=>pair(name,value)).join('')}</div>${metrics}<div class="hfs-report-note">${report.publicView?'รายงานสาธารณะแสดงเฉพาะข้อมูลสรุป':'ข้อมูล ณ '+escape(report.generatedAt)+' (Asia/Bangkok) · ตรวจสอบข้อมูลกับ Job ก่อนนำไปใช้'}</div><div class="hfs-service-grid">${cards}</div>`;
  }
  function createPages(report) {
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
      const crewCount=(service.crewGroups?.onSigners.length||0)+(service.crewGroups?.offSigners.length||0),flightCount=service.people.reduce((sum,person)=>sum+person.flights.length,0);
      ensure(Math.min(420,60+([...service.fields,...service.specifics].length*24)+(service.checklist.length*14)+(crewCount*34)+(flightCount*12)+(service.travel.length*28)));
      ctx.fillStyle='#eff6f6';ctx.fillRect(left,y,bodyWidth,28);y+=7;
      text(`#${service.seq}  ${service.type}  ·  ${service.status}`,{x:left+9,max:bodyWidth-18,size:11,bold:true,color:'#10233d',lineHeight:17});y+=12;
      for(const field of [...service.fields,...service.specifics])item(field.name,field.value);
      text(`CHECKLIST${report.publicView?'':`  ${service.checklist.filter(step=>step.done).length}/${service.checklist.length}`}`,{size:8,bold:true,color:'#567184',lineHeight:13});
      if(report.publicView)text('Sign in to view checklist and details.',{size:9,color:'#6b7a90'});
      else if(!service.checklist.length)text('No checklist steps yet.',{size:9,color:'#6b7a90'});
      else for(const step of service.checklist)text(`${step.done?'[x]':'[ ]'}  ${step.text}${step.done&&step.completedAt?`  (${[step.actor,step.completedAt].filter(Boolean).join(' · ')})`:''}`,{size:9,lineHeight:13,indent:3});
      if(service.crewGroups&&!report.publicView){
        y+=5;text('CREW CHANGE',{size:8,bold:true,color:'#567184',lineHeight:13});
        for(const [groupName,crew] of [['ON-SIGNERS',service.crewGroups.onSigners],['OFF-SIGNERS',service.crewGroups.offSigners]]){
          ensure(30);text(`${groupName}  ${crew.length}`,{size:9,bold:true,color:'#107a72',lineHeight:15,indent:3});
          if(!crew.length)text('No crew listed.',{size:8.5,color:'#6b7a90',lineHeight:12,indent:8});
          for(const person of crew){
            ensure(38);text([person.name,person.rank,person.nationality].filter(Boolean).join(' · '),{size:9,bold:true,lineHeight:14,indent:8});
            const identity=[person.dob&&`DOB ${person.dob}`,person.passport&&`Passport ${person.passport}`,person.passportExpiry&&`PP. EXP ${person.passportExpiry}`].filter(Boolean).join(' · ');
            if(identity)text(identity,{size:8.2,color:'#607286',lineHeight:12,indent:8});
            if(!person.flights.length)text('No flight details.',{size:8.2,color:'#6b7a90',lineHeight:12,indent:12});
            for(const flight of person.flights){
              const route=[flight.airline,flight.number,flight.date,flight.from&&flight.to?`${flight.from}-${flight.to}`:[flight.from,flight.to].filter(Boolean).join('-'),[flight.departure,flight.arrival].filter(Boolean).join('-'),flight.booking&&`PNR ${flight.booking}`].filter(Boolean).join(' · ');
              text(route||'Flight details pending',{size:8.2,lineHeight:12,indent:12});
            }
            y+=2;
          }
        }
      } else if(service.people.length){y+=5;text('LINKED CREW / VISITORS',{size:8,bold:true,color:'#567184',lineHeight:13});for(const person of service.people)text([person.name,person.category||person.kind,person.rank,person.nationality].filter(Boolean).join(' · '),{size:9,lineHeight:13,indent:3});}
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
    return {pages,width,height,scale};
  }
  const safeName=report=>String(report.job.jobNo||report.job.vessel||'PORT-CALL').replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
  function createPdf(report) {
    if (!window.HarborFlowOktbPdf?.pdfFromPages) throw Error('PDF exporter unavailable');
    const {pages}=createPages(report);
    return {filename:`SERVICE SUMMARY - ${safeName(report)}.PDF`,blob:window.HarborFlowOktbPdf.pdfFromPages(pages)};
  }
  function createImage(report) {
    const {pages}=createPages(report),gap=24;
    const canvas=document.createElement('canvas');canvas.width=Math.max(...pages.map(page=>page.width));canvas.height=pages.reduce((sum,page)=>sum+page.height,0)+gap*Math.max(0,pages.length-1);
    const context=canvas.getContext('2d');context.fillStyle='#e8eef3';context.fillRect(0,0,canvas.width,canvas.height);
    let top=0;for(const page of pages){context.drawImage(page,0,top);top+=page.height+gap;}
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve({filename:`SERVICE SUMMARY - ${safeName(report)}.PNG`,blob}):reject(Error('Image exporter unavailable')),'image/png'));
  }
  const xmlEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
  const columnName=index=>{let result='';for(let number=index+1;number;number=Math.floor((number-1)/26))result=String.fromCharCode(65+(number-1)%26)+result;return result;};
  function workbookRows(report){
    const rows=[],add=(values,style=0)=>rows.push(values.map(value=>({value,style})));
    add(['SERVICE SUMMARY REPORT'],1);add([report.job.vessel],1);add([[report.job.jobNo,report.job.port].filter(Boolean).join(' · ')],4);add([]);
    for(const [name,value] of [['Job No.',report.job.jobNo],['Port / Terminal',report.job.port],['Principal',report.job.principal],['ETA',report.job.eta],['ETD',report.job.etd],['Job status',report.job.status],['Job PIC',report.job.pic]].filter(([,value])=>hasValue(value)))add([name,value],4);
    add([]);add(['Services',report.totals.services,'Completed',report.totals.completed,'Waiting',report.totals.waiting,'Checklist',report.publicView?'—':`${report.totals.done}/${report.totals.steps}`],2);
    for(const service of report.services){
      add([]);add([`#${service.seq}`,service.type,service.status],2);
      for(const field of [...service.fields,...service.specifics])add([field.name,field.value],4);
      add(['Checklist','Status','Completed by / at'],3);
      if(report.publicView)add(['Sign in to view checklist and details.']);
      else if(!service.checklist.length)add(['No checklist steps yet.']);
      else for(const step of service.checklist)add([step.text,step.done?'Complete':'Pending',[step.actor,step.completedAt].filter(Boolean).join(' · ')]);
      if(service.crewGroups&&!report.publicView){
        for(const [groupName,crew] of [['ON-SIGNERS',service.crewGroups.onSigners],['OFF-SIGNERS',service.crewGroups.offSigners]]){
          add([]);add([groupName,crew.length],2);add(['Name - Surname','Rank','Nationality','Date of birth','Passport','PP. EXP'],3);
          if(!crew.length)add(['No crew listed.']);
          for(const person of crew){
            add([person.name,person.rank,person.nationality,person.dob,person.passport,person.passportExpiry]);
            add(['Flight','Airline','Flight No.','Date','From','To','Departure','Arrival','PNR'],3);
            if(!person.flights.length)add(['','No flight details.']);
            else for(const flight of person.flights)add(['',flight.airline,flight.number,flight.date,flight.from,flight.to,flight.departure,flight.arrival,flight.booking]);
          }
        }
      } else if(service.people.length){
        add([]);add(['LINKED CREW / VISITORS'],2);add(['Name - Surname','Category','Rank','Nationality'],3);
        for(const person of service.people)add([person.name,person.category||person.kind,person.rank,person.nationality]);
      }
      if(service.travel.length){
        add([]);add(['TRAVEL'],2);add(['Type','Origin','Destination','Planned departure','Planned arrival','Provider','Vehicle / boat','Status','Passengers / cargo'],3);
        for(const trip of service.travel)add([trip.kind,trip.origin,trip.destination,trip.departure,trip.arrival,trip.provider,trip.vehicle,trip.status,[...trip.passengers,...trip.cargo].join(', ')]);
      }
    }
    add([]);add([`${report.publicView?'PUBLIC SUMMARY':'TRIAL DATA'} · Generated ${report.generatedAt} Asia/Bangkok`],4);return rows;
  }
  function zipStore(files){
    const encoder=new TextEncoder(),parts=[],central=[];let offset=0;
    const u16=value=>new Uint8Array([value&255,(value>>>8)&255]),u32=value=>new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]);
    const table=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
    const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
    for(const [name,content] of Object.entries(files)){
      const nameBytes=encoder.encode(name),data=typeof content==='string'?encoder.encode(content):content,crc=crc32(data);
      const local=[u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0),nameBytes,data];
      parts.push(...local);const size=local.reduce((sum,item)=>sum+item.length,0);
      central.push(...[u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nameBytes]);offset+=size;
    }
    const centralSize=central.reduce((sum,item)=>sum+item.length,0),count=Object.keys(files).length;
    return new Blob([...parts,...central,u32(0x06054b50),u16(0),u16(0),u16(count),u16(count),u32(centralSize),u32(offset),u16(0)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function createExcel(report){
    const rows=workbookRows(report),maxColumns=Math.max(9,...rows.map(row=>row.length));
    const sheetRows=rows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((cell,columnIndex)=>`<c r="${columnName(columnIndex)}${rowIndex+1}" t="inlineStr" s="${cell.style}"><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`).join('')}</row>`).join('');
    const columns=Array.from({length:maxColumns},(_,index)=>`<col min="${index+1}" max="${index+1}" width="${index===0?24:index===1?32:18}" customWidth="1"/>`).join('');
    const files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary report" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF10233D"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF334155"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF107A72"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F2F4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFDCE5ED"/></left><right style="thin"><color rgb="FFDCE5ED"/></right><top style="thin"><color rgb="FFDCE5ED"/></top><bottom style="thin"><color rgb="FFDCE5ED"/></bottom></border></borders><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>',
      'xl/worksheets/sheet1.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${sheetRows}</sheetData><pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
    };
    return {filename:`SERVICE SUMMARY - ${safeName(report)}.XLSX`,blob:zipStore(files)};
  }
  function saveDownload({filename,blob}){
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),300000);return filename;
  }
  function downloadPdf(report) {
    return saveDownload(createPdf(report));
  }
  async function download(report,format){
    const output=format==='xlsx'?createExcel(report):format==='png'?await createImage(report):createPdf(report);
    return saveDownload(output);
  }
  window.HarborFlowSummaryReport={build,render,createPdf,createExcel,createImage,downloadPdf,download};
})();
