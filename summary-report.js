/* Read-only per-Port-Call Service report. The API controls which fields are available. */
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const label = key => String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,char=>char.toUpperCase());
  const hasValue = value => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
  const show = value => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : Array.isArray(value) ? value.join(', ') : String(value ?? '');
  const isScalar = value => ['string','number','boolean'].includes(typeof value);
  const dateTime = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:(?:T| )(\d{2}:\d{2}))?/);
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
      const specifics=publicView ? [] : Object.entries(source.details || {})
        .filter(([,value])=>hasValue(value)&&(isScalar(value)||Array.isArray(value)&&value.every(isScalar)))
        .map(([key,value])=>({name:label(key),value:show(value)}));
      const checklist=publicView ? [] : (Array.isArray(source.checklist)?source.checklist:[]).map(step=>({
        text:String(step.text||''),done:Boolean(step.done),actor:String(step.actor||''),completedAt:step.completedAt?dateTime(step.completedAt):''
      }));
      const assigned=people.filter(person=>Array.isArray(person.data?.serviceIds)&&person.data.serviceIds.includes(item.id)).map(person=>({
        id:person.id,kind:person.kind,name:String(person.data?.name||''),category:String(person.data?.category||''),
        nationality:String(person.data?.nationality||''),rank:String(person.data?.rank||''),
        dob:String(person.data?.dob||''),passport:String(person.data?.passport||''),passportExpiry:String(person.data?.passportExpiry||''),
        seamanBook:String(person.data?.seamanBook||''),immigration:person.data?.immigration,
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


  const compact=values=>values.filter(value=>hasValue(value)&&value!=='—').join(' · ');
  const immigration=(person,code)=>Boolean(person?.immigration?.codes?.[code]||
    (code==='VISA'&&person?.immigration?.visa)||(code==='OKTB'&&person?.immigration?.oktb));
  const personMeta=person=>compact([person.rank,person.nationality]);
  const personDocs=person=>compact([
    person.passport&&'Passport '+person.passport,person.passportExpiry&&'EXP '+person.passportExpiry,
    person.seamanBook&&'SB '+person.seamanBook,person.dob&&'DOB '+person.dob
  ]);
  const flightsFor=person=>person.flights.map(flight=>compact([
    [flight.airline,flight.number].filter(Boolean).join(' '),[flight.from,flight.to].filter(Boolean).join(' → '),
    flight.date,[flight.departure,flight.arrival].filter(Boolean).join('–'),flight.booking&&'PNR '+flight.booking
  ])).filter(Boolean);
  const crewChecks=person=>[
    ['Passport','PP',Boolean(person.passport)],['Seaman Book','SB',Boolean(person.seamanBook)],
    ['Flight','FLT',flightsFor(person).length>0],
    ...['OKTB','VISA','VISA-C','VOA','BG','EX'].map(code=>[code,code,immigration(person,code)])
  ];
  function crewGroups(report){
    if(report.publicView)return [];
    const sections=report.services.flatMap(service=>service.crewGroups?[service.crewGroups]:[]);
    if(!sections.length)return [];
    return [['On-signers','onSigners'],['Off-signers','offSigners']].map(([title,group])=>({
      title,people:[...new Map(sections.flatMap(section=>section[group]).map(person=>[person.id,person])).values()]
    })).filter(section=>section.people.length);
  }
  function serviceDetails(service){
    const fields=[...service.fields,...service.specifics];
    const crew=service.crewGroups;
    const related=service.people.filter(person=>!crew||!crew.onSigners.includes(person)&&!crew.offSigners.includes(person));
    const travel=service.travel.map(trip=>compact([
      [trip.origin,trip.destination].filter(Boolean).join(' → '),trip.departure,trip.arrival,trip.provider,
      trip.vehicle,trip.status,trip.purpose,trip.passengers.join(', '),trip.cargo.join(', ')
    ]));
    return {
      description:fields.find(field=>field.name==='Description')?.value||'',
      fields:fields.filter(field=>field.name!=='Description'),
      travel,related
    };
  }
  const checkMark=(done,title)=>`<span class="hfs-check${done?' done':''}" role="img" aria-label="${escape(title)}: ${done?'checked':'unchecked'}">${done?'✓':''}</span>`;
  function renderService(service,publicView){
    const {description,fields,travel,related}=serviceDetails(service);
    const done=service.checklist.filter(step=>step.done).length;
    const detailText=description||fields.length||travel.length||related.length;
    const details=`<div class="hfs-service-details">
      ${description?`<p>${escape(description)}</p>`:''}
      ${fields.length?`<dl>${fields.map(field=>`<div><dt>${escape(field.name)}</dt><dd>${escape(field.value)}</dd></div>`).join('')}</dl>`:''}
      ${travel.length?`<div class="hfs-travel-summary"><b>Travel</b><ul>${travel.map(item=>`<li>${escape(item)}</li>`).join('')}</ul></div>`:''}
      ${related.length?`<div class="hfs-travel-summary"><b>Linked people</b><ul>${related.map(person=>
        `<li>${escape(compact([person.name,person.category||person.kind,personMeta(person),personDocs(person),...flightsFor(person)]))}</li>`
      ).join('')}</ul></div>`:''}
    </div>`;
    const checklist=service.checklist.length?`<div class="hfs-service-checklist">
      <h5>Checklist <span>${done}/${service.checklist.length}</span></h5>
      <ul>${service.checklist.map(step=>`<li>${checkMark(step.done,step.text)}<div>${escape(step.text||'Untitled step')}${step.done&&step.completedAt?
        `<small>${escape(compact([step.actor,step.completedAt]))}</small>`:''}</div></li>`).join('')}</ul>
    </div>`:'';
    return `<article class="hfs-service-item">
      <header><h4>${escape(service.type)}</h4><span class="hfs-service-status" data-status="${escape(service.status)}">${escape(service.status)}</span></header>
      ${!publicView&&(detailText||checklist)?`<div class="hfs-service-body${detailText&&checklist?' has-columns':''}">${detailText?details:''}${checklist}</div>`:''}
    </article>`;
  }
  function renderCrew({title,people}){
    return `<section class="hfs-crew-section${title==='Off-signers'?' off-signers':''}"><h4>${escape(title)} <span>${people.length}</span></h4><ul>${people.map(person=>{
      const flights=flightsFor(person),docs=personDocs(person),meta=personMeta(person);
      return `<li class="hfs-crew-member">
        <h5>${escape(person.name||'Unnamed crew')}</h5>
        ${meta?`<p>${escape(meta)}</p>`:''}
        <div class="hfs-crew-checks">${crewChecks(person).map(([name,short,checked])=>
          `<span>${checkMark(checked,name)}${escape(name)}</span>`).join('')}</div>
        ${docs?`<p class="hfs-crew-docs">${escape(docs)}</p>`:''}
        ${flights.length?`<div class="hfs-crew-flights"><b>Flight details</b><ul>${flights.map(line=>`<li>${escape(line)}</li>`).join('')}</ul></div>`:''}
        ${person.immigration?.notes?`<p>${escape(person.immigration.notes)}</p>`:''}
      </li>`;
    }).join('')}</ul></section>`;
  }
  function render(report){
    const {job}=report;
    const schedule=[['ETA',job.eta],['ETD',job.etd]].filter(([,value])=>value&&value!=='—');
    const crew=crewGroups(report);
    return `<header class="hfs-report-vessel"><div>
      <div class="hfs-vessel-title"><h2>${escape(job.vessel)}</h2>${job.status?`<span>${escape(job.status)}</span>`:''}</div>
      <p>${escape(compact([job.jobNo,job.port,job.principal,job.pic&&'PIC '+job.pic]))}</p></div>
      ${schedule.length?`<dl class="hfs-schedule">${schedule.map(([name,value])=>`<div><dt>${name}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`:''}
    </header>
    <div class="hfs-report-content">
      <section class="hfs-report-services"><h3>Services <span>${report.totals.completed}/${report.totals.services} completed</span></h3>
        ${report.services.length?report.services.map(service=>renderService(service,report.publicView)).join(''):'<p>No services for this port call.</p>'}
      </section>
      ${crew.length?`<section class="hfs-report-crew"><h3>Crew change</h3><div class="hfs-crew-columns">${crew.map(renderCrew).join('')}</div></section>`:''}
      <p class="hfs-report-note">${report.publicView?'PUBLIC SUMMARY · ':''}อัปเดต ${escape(report.generatedAt)} (Bangkok)</p>
    </div>`;
  }

  function createPage(report){
    const width=595,height=842,scale=3.5,left=32,bodyWidth=width-left*2;
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
    const ctx=window.HarborFlowVectorPdf?.captureContext(canvas)||canvas.getContext('2d');
    ctx.scale(scale,scale);ctx.textBaseline='top';
    const ink='#173442',muted='#486473',line='#dce7eb',teal='#086d62';
    let shortened=false;
    function fill(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
    function wrap(value,max){
      const result=[];
      let current='';
      for(const word of String(value??'').trim().split(/\s+/)){
        const joined=current?current+' '+word:word;
        if(ctx.measureText(joined).width<=max){current=joined;continue;}
        if(current)result.push(current);
        current='';
        for(const character of word){
          if(current&&ctx.measureText(current+character).width>max){result.push(current);current='';}
          current+=character;
        }
      }
      if(current)result.push(current);
      return result;
    }
    function text(value,x,y,{size=9,color=ink,bold=false,max=bodyWidth}={}){
      ctx.font=(bold?'bold ':'')+size+'px Arial, sans-serif';
      let display=String(value??'');
      if(ctx.measureText(display).width>max){
        shortened=true;
        const chars=Array.from(display);
        while(chars.length&&ctx.measureText(chars.join('')+'…').width>max)chars.pop();
        display=chars.join('').trimEnd()+'…';
      }
      ctx.fillStyle=color;ctx.fillText(display,x,y);
    }
    function check(done,x,y){
      fill(x,y,8,8,done?teal:'#8da5ac');
      if(!done){fill(x+1,y+1,6,6,'#fff');return;}
      ctx.strokeStyle='#fff';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x+2,y+4);ctx.lineTo(x+3.5,y+5.5);ctx.lineTo(x+6.5,y+2.5);ctx.stroke();
    }

    fill(0,0,width,height,'#fff');
    fill(left,32,bodyWidth,77,'#10313f');
    const job=report.job;
    text('SUMMARY REPORT',left+14,43,{color:'#afdade',size:8,bold:true});
    text(job.vessel,left+14,57,{color:'#fff',size:20,bold:true,max:bodyWidth-28});
    text(compact([job.jobNo,job.port,job.principal,job.pic&&'PIC '+job.pic]),left+14,86,{
      color:'#d5edf0',max:bodyWidth-28
    });
    text(compact([job.eta!=='—'&&job.eta&&'ETA '+job.eta,job.etd!=='—'&&job.etd&&'ETD '+job.etd,job.status]),left,119,{
      color:muted,bold:true
    });

    const crew=crewGroups(report);
    const start=161,bottom=780;
    const maxCrew=crew.reduce((max,group)=>Math.max(max,group.people.length),0);
    const crewSpace=crew.length?Math.min(386,26+maxCrew*45):0;
    const available=bottom-start-crewSpace;
    const headingHeight=19,detailHeight=11,detailWidth=313;
    const maxServices=Math.floor(available/headingHeight);
    const services=report.services.slice(0,maxServices);
    const serviceRows=services.map(service=>{
      const {description,fields,travel,related}=serviceDetails(service);
      ctx.font='9px Arial, sans-serif';
      const details=wrap(compact([description,...fields.map(field=>field.name+' '+field.value),...travel,...related.map(person=>person.name)]),detailWidth);
      const steps=service.checklist.flatMap(step=>wrap(step.text||'Untitled step',168).map((value,index)=>({
        value,done:index===0?step.done:null
      })));
      return {service,details,steps,available:Math.max(details.length,steps.length),lines:0};
    });
    let remaining=Math.floor((available-headingHeight*services.length)/detailHeight);
    const maxLines=serviceRows.reduce((max,row)=>Math.max(max,row.available),0);
    for(let index=0;index<maxLines&&remaining>0;index++){
      for(const row of serviceRows){
        if(!remaining)break;
        if(index<row.available){row.lines++;remaining--;}
      }
    }
    const badge={
      Completed:['#e4f4ee','#12644d'],'In Progress':['#e7effa','#255489'],
      Waiting:['#fff1da','#7b4b06'],Cancelled:['#fae9ed','#8b2e43']
    };
    text('Services',left,140,{size:13,bold:true});
    text(report.totals.completed+'/'+report.totals.services+' completed',left+bodyWidth-90,143,{size:8.5,color:muted,max:90});
    let y=start;
    for(const {service,details,steps,lines} of serviceRows){
      const rowHeight=headingHeight+lines*detailHeight;
      fill(left,y,bodyWidth,1,line);
      text(service.type,left,y+5,{size:10.5,bold:true,max:bodyWidth-125});
      const [background,color]=Object.hasOwn(badge,service.status)?badge[service.status]:['#ecf2f4',muted];
      fill(left+bodyWidth-91,y+3,91,14,background);
      text(service.status,left+bodyWidth-85,y+6,{size:8,color,bold:true,max:79});
      if(details.length>lines||steps.length>lines)shortened=true;
      details.slice(0,lines).forEach((value,index)=>text(value,left,y+headingHeight+index*detailHeight,{color:muted,max:detailWidth}));
      steps.slice(0,lines).forEach(({value,done},index)=>{
        const top=y+headingHeight+index*detailHeight;
        if(done!==null)check(done,left+337,top);
        text(value,left+349,top,{max:168});
      });
      y+=rowHeight;
    }
    if(!services.length){
      text('No services for this port call.',left,y+5,{color:muted});
      y+=19;
    }

    let omittedCrew=0;
    if(crew.length){
      const crewY=y+13,gap=16,crewWidth=(bodyWidth-gap*(crew.length-1))/crew.length;
      crew.forEach(({title,people},index)=>{
        const x=left+index*(crewWidth+gap),rowHeight=45;
        let rowY=crewY+20;
        fill(x,crewY,crewWidth,17,title==='On-signers'?'#e8f4f0':'#edf2f7');
        text(title+' ('+people.length+')',x+6,crewY+4,{size:9,bold:true});
        const shown=people.slice(0,Math.max(0,Math.floor((bottom-rowY)/rowHeight)));
        omittedCrew+=people.length-shown.length;
        ctx.font='8px Arial, sans-serif';
        const blocks=shown.map(person=>({
          person,details:wrap(compact([...flightsFor(person),personDocs(person),person.immigration?.notes]),crewWidth-8),lines:1
        }));
        let extra=Math.floor((bottom-rowY-shown.length*rowHeight)/detailHeight);
        const longest=blocks.reduce((max,block)=>Math.max(max,block.details.length),0);
        for(let i=1;i<longest&&extra>0;i++){
          for(const block of blocks){
            if(!extra)break;
            if(i<block.details.length){block.lines++;extra--;}
          }
        }
        for(const {person,details,lines} of blocks){
          text(person.name||'Unnamed crew',x+4,rowY+2,{size:9.5,bold:true,max:crewWidth-8});
          text(personMeta(person),x+4,rowY+13,{size:8,color:muted,max:crewWidth-8});
          let flagX=x+4;
          for(const [name,short,done] of crewChecks(person)){
            check(done,flagX,rowY+23);
            text(short,flagX+10,rowY+23,{size:7,color:muted,max:25});
            flagX+=ctx.measureText(short).width+13;
          }
          details.slice(0,lines).forEach((value,i)=>text(value,x+4,rowY+34+i*detailHeight,{size:8,color:muted,max:crewWidth-8}));
          if(details.length>lines)shortened=true;
          rowY+=rowHeight+(lines-1)*detailHeight;
          fill(x,rowY-1,crewWidth,1,line);
        }
      });
    }
    const omitted=report.services.length-services.length;
    const notice=compact([omitted?'+'+omitted+' services':'',omittedCrew?'+'+omittedCrew+' crew':'',shortened?'More details':'']);
    if(notice)text(notice+' in Summary report or Excel.',left,790,{size:8,color:muted});
    fill(left,806,bodyWidth,1,line);
    text(compact([report.publicView?'PUBLIC SUMMARY':'','Updated '+report.generatedAt+' (Bangkok)']),left,813,{size:8,color:muted});
    text('1 / 1',width-left-15,813,{size:8,color:muted,max:18});
    return canvas;
  }
  const safeName=report=>String(report.job.jobNo||report.job.vessel||'PORT-CALL').replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
  function createPdf(report) {
    if (!window.HarborFlowOktbPdf?.pdfFromPages) throw Error('PDF exporter unavailable');
    const page=createPage(report);
    return {filename:`SERVICE SUMMARY - ${safeName(report)}.PDF`,blob:window.HarborFlowOktbPdf.pdfFromPages([page])};
  }
  function createImage(report) {
    const canvas=createPage(report);
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
          add([]);add([groupName,crew.length],2);add(['Name - Surname','Rank','Nationality','Date of birth','Passport','PP. EXP','Seaman book','Immigration'],3);
          if(!crew.length)add(['No crew listed.']);
          for(const person of crew){
            add([person.name,person.rank,person.nationality,person.dob,person.passport,person.passportExpiry,person.seamanBook,
              ['OKTB','VISA','VISA-C','VOA','BG','EX'].filter(code=>immigration(person,code)).join(', ')]);
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

