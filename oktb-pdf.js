/* Browser-only OKTB draft PDF export. Crew data is never sent to another service. */
(() => {
  const PAGE_W=595, PAGE_H=842, SCALE=2.1;
  const dateOnly=value=>/^\d{4}-\d{2}-\d{2}/.test(String(value||''))?String(value).slice(0,10):'';
  function displayDate(value){
    const date=dateOnly(value);
    if(!date)return '[not set]';
    const [year,month,day]=date.split('-').map(Number);
    return String(day).padStart(2,'0')+'-'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]+'-'+String(year).slice(-2);
  }
  function fileName(people,vessel){
    if(!people.length)throw Error('กรุณาเลือกลูกเรือก่อนดาวน์โหลด');
    const nationalities=[...new Set(people.map(person=>String(person.nationality||'').trim()).filter(Boolean))];
    const subject=people.length===1?people[0].name:nationalities.join(' & ')||'CREW';
    const clean=value=>String(value||'').replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().toUpperCase().slice(0,120);
    return 'OKTB - '+(clean(subject)||'CREW')+' ('+(clean(vessel)||'VESSEL')+').PDF';
  }
  function image(source){
    return new Promise((resolve,reject)=>{
      if(!source){resolve(null);return;}
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(Error('อ่านภาพสำหรับ PDF ไม่สำเร็จ'));
      img.src=source;
    });
  }
  function logoSource(element){
    if(!element)return '';
    const background=getComputedStyle(element).backgroundImage;
    const match=background.match(/url\(["']?(data:[^"')]+)["']?\)/);
    return match?.[1]||'';
  }
  function pdfFromPages(pages){
    const encoder=new TextEncoder(),parts=[];let length=0;
    const append=data=>{const bytes=typeof data==='string'?encoder.encode(data):data;parts.push(bytes);length+=bytes.length;};
    append('%PDF-1.4\n%HarborFlow\n');
    const offsets=[0],pageIds=pages.map((_,i)=>3+i*3);
    function object(id,content){
      offsets[id]=length;append(id+' 0 obj\n');append(content);append('\nendobj\n');
    }
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,'<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pages.length+' >>');
    pages.forEach((canvas,i)=>{
      const pageId=pageIds[i],imageId=pageId+1,contentId=pageId+2;
      object(pageId,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PAGE_W+' '+PAGE_H+'] /Resources << /XObject << /Im0 '+imageId+' 0 R >> >> /Contents '+contentId+' 0 R >>');
      const binary=atob(canvas.toDataURL('image/jpeg',0.94).split(',')[1]);
      const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
      offsets[imageId]=length;append(imageId+' 0 obj\n');
      append('<< /Type /XObject /Subtype /Image /Width '+canvas.width+' /Height '+canvas.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+bytes.length+' >>\nstream\n');
      append(bytes);append('\nendstream\nendobj\n');
      const stream='q\n'+PAGE_W+' 0 0 '+PAGE_H+' 0 0 cm\n/Im0 Do\nQ\n';
      object(contentId,'<< /Length '+encoder.encode(stream).length+' >>\nstream\n'+stream+'endstream');
    });
    const start=length,count=2+pages.length*3;
    append('xref\n0 '+(count+1)+'\n0000000000 65535 f \n');
    for(let id=1;id<=count;id++)append(String(offsets[id]).padStart(10,'0')+' 00000 n \n');
    append('trailer\n<< /Size '+(count+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF');
    return new Blob(parts,{type:'application/pdf'});
  }
  async function renderPages({preview,people,ctx,profile,logo}){
    const logoImage=await image(logoSource(logo));
    const signatureImage=profile.signature?await image(profile.signature):null;
    const pages=[];let canvas,pen,y;
    function newPage(continued=false){
      canvas=document.createElement('canvas');
      canvas.width=Math.round(PAGE_W*SCALE);canvas.height=Math.round(PAGE_H*SCALE);
      pen=canvas.getContext('2d');pen.scale(SCALE,SCALE);pen.fillStyle='#fff';pen.fillRect(0,0,PAGE_W,PAGE_H);
      pen.fillStyle='#111';pages.push(canvas);y=36;
      if(continued){pen.font='bold 12px Arial';pen.fillText('OK TO BOARD MESSAGE / GUARANTEE LETTER (continued)',36,y);y+=26;}
    }
    function ensure(height){
      if(y+height>PAGE_H-50)newPage(true);
    }
    function text(value,x,top,size=10,bold=false,align='left'){
      pen.fillStyle='#111';pen.font=(bold?'bold ':'')+size+'px Arial, sans-serif';
      pen.textAlign=align;pen.textBaseline='top';pen.fillText(String(value??''),x,top);
      pen.textAlign='left';
    }
    function wrap(value,maxWidth,size=10,bold=false){
      pen.font=(bold?'bold ':'')+size+'px Arial, sans-serif';
      const words=String(value??'').split(/\s+/),lines=[];let line='';
      for(const word of words){
        const next=line?line+' '+word:word;
        if(line&&pen.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;
      }
      if(line)lines.push(line);
      return lines.length?lines:[''];
    }
    function paragraph(value,size=10,lineHeight=15,bold=false){
      const lines=wrap(value,PAGE_W-72,size,bold);
      ensure(lines.length*lineHeight+6);
      for(const line of lines){text(line,36,y,size,bold);y+=lineHeight;}
      y+=6;
    }
    function cell(value,x,top,width,height,align='center'){
      pen.strokeStyle='#111';pen.lineWidth=.8;pen.strokeRect(x,top,width,height);
      const size=8.2,lines=wrap(value,width-8,size).slice(0,2);
      const start=top+(height-lines.length*11)/2;
      lines.forEach((line,i)=>{pen.fillStyle='#111';pen.font=size+'px Arial, sans-serif';pen.textAlign=align;pen.textBaseline='top';pen.fillText(line,align==='left'?x+4:x+width/2,start+i*11,width-8);pen.textAlign='left';});
    }
    function table(title,headers,rows,widths){
      ensure(60);
      text(title,36,y,11,true);y+=20;
      const drawHeader=()=>{
        let x=36;headers.forEach((head,i)=>{cell(head,x,y,widths[i],24);x+=widths[i];});y+=24;
      };
      drawHeader();
      if(!rows.length){
        cell('No details recorded',36,y,widths.reduce((a,b)=>a+b,0),28);y+=28;
      }
      for(const row of rows){
        if(y+28>PAGE_H-50){newPage(true);text(title+' (continued)',36,y,11,true);y+=20;drawHeader();}
        let x=36;row.forEach((value,i)=>{cell(value,x,y,widths[i],28,i===1&&title==='Personal Details'?'left':'center');x+=widths[i];});y+=28;
      }
      y+=16;
    }
    newPage();
    if(logoImage)pen.drawImage(logoImage,38,34,86,68);
    text('BANGKOK, THAILAND',142,36,15,true);
    text('GULF AGENCY COMPANY (THAILAND) LTD.',142,55,11,true);
    text('26/30-31 9th Floor, Orakarn Building, Soi Chidlom,',142,74,8.5);
    text('Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330',142,88,8.5);
    text('Tel +66-2-650 7400  Fax +66-2-650 7401',142,102,8.5);
    y=134;
    for(const [label,value] of [['Date',displayDate(ctx.issueDate)],['To',ctx.airline||'[airline not set]'],['Attn','All concern']]){
      text(label,36,y,10);text(':',75,y,10);
      const lines=wrap(value,PAGE_W-123,10);
      for(const line of lines){text(line,87,y,10);y+=15;}
      y+=3;
    }
    y+=11;paragraph('Re : "OK TO BOARD MESSAGE / GUARANTEE LETTER"',11,17,true);
    paragraph('Gulf Agency Company (Thailand) Ltd., as agent for Vessel "'+(preview.job.vessel||'[Vessel from Job]')+'"',10,15);
    paragraph('The Vessel above will arrive at '+(preview.job.port||'[Port from Job]').toUpperCase()+' on '+displayDate(ctx.arrivalDate)+'.',10,15);
    paragraph('We confirm that the under mentioned personnel are scheduled to embark the said vessel on '+displayDate(ctx.arrivalDate)+' and are arriving Bangkok on the flights below.',10,15);
    const personal=people.map((person,i)=>[i+1,person.name,person.nationality,person.rank,displayDate(person.dob),person.seamanBook,person.passport,displayDate(person.passportExpiry)]);
    table('Personal Details',['No.','Name - Surname','Nationality','Rank','Date of Birth','Seaman Book','Passport','Expire'],personal,[25,118,67,57,66,65,65,60]);
    const flightMap=new Map();
    for(const person of people)for(const flight of person.flights||[]){
      if(!Object.values(flight).some(Boolean))continue;
      const key=JSON.stringify(['airline','number','date','from','to','departure','arrival'].map(field=>String(flight[field]||'').toUpperCase()));
      if(!flightMap.has(key))flightMap.set(key,{flight,bookings:[]});
      const group=flightMap.get(key);
      if(flight.booking&&!group.bookings.includes(flight.booking))group.bookings.push(flight.booking);
    }
    const flights=[...flightMap.values()].map(({flight,bookings})=>[[flight.airline,flight.number].filter(Boolean).join(' '),/^\d{4}-/.test(flight.date)?displayDate(flight.date):flight.date,flight.from,flight.to,flight.departure,flight.arrival,bookings.join(' / ')]);
    table('Flight Details',['Airline / Flight','Date','From','To','Departure','Arrival','PNR'],flights,[108,64,55,55,72,72,97]);
    const closing='Please provide your valuable assistance for departure as per the above flight details. Should you require clarification, please contact '+(profile.contact||'[contact not set]')+' on Tel: '+(profile.phone||'[phone not set]')+'.';
    const closingHeight=wrap(closing,PAGE_W-72,10).length*15+6+21+21+(signatureImage?55:42)+15+13+12;
    ensure(closingHeight);
    paragraph(closing,10,15);
    paragraph('Thank you for your kind co-operation.',10,15);
    paragraph('Yours faithfully,',10,15);
    if(signatureImage){pen.drawImage(signatureImage,36,y,110,49);y+=55;}
    else{y+=24;text('Signature pending owner approval',36,y,9);y+=18;}
    text(profile.signer||'[signatory not set]',36,y,10,true);y+=15;
    text('Gulf Agency Company (Thailand) Ltd.',36,y,9);y+=13;
    text('As Agents Only',36,y,9);
    for(const [index,page] of pages.entries()){
      const ctx=page.getContext('2d');ctx.save();ctx.setTransform(SCALE,0,0,SCALE,0,0);
      ctx.fillStyle='rgba(160,0,0,.12)';ctx.font='bold 39px Arial';ctx.textAlign='center';
      ctx.translate(PAGE_W/2,PAGE_H/2);ctx.rotate(-.32);ctx.fillText('SAMPLE · NOT APPROVED',0,0);ctx.restore();
      ctx.fillStyle='#555';ctx.font='8px Arial';ctx.textAlign='right';
      ctx.fillText('DRAFT · '+(index+1)+' / '+pages.length,PAGE_W-36,PAGE_H-23);
    }
    return pages;
  }
  async function download(input){
    if(!input.people?.length)throw Error('กรุณาเลือกลูกเรือก่อนดาวน์โหลด');
    const name=fileName(input.people,input.preview.job.vessel);
    const pages=await renderPages(input);
    const blob=pdfFromPages(pages),url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=name;
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    return name;
  }
  async function downloadLoi({preview,person,ctx,profile,logo}) {
    if(!person?.id||!ctx.embassy)throw Error('กรุณาเลือกลูกเรือและสถานทูต');
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(PAGE_W*SCALE);canvas.height=Math.round(PAGE_H*SCALE);
    const pen=canvas.getContext('2d');pen.scale(SCALE,SCALE);pen.fillStyle='#fff';pen.fillRect(0,0,PAGE_W,PAGE_H);
    const logoImage=await image(logoSource(logo)),signature=profile.signature?await image(profile.signature):null;
    const lines=(value,width,size=10)=>{
      pen.font=size+'px Arial';const output=[];let line='';
      for(const word of String(value||'[not set]').split(/\s+/)){
        const next=line?line+' '+word:word;
        if(line&&pen.measureText(next).width>width){output.push(line);line=word;}else line=next;
      }
      if(line)output.push(line);return output;
    };
    const text=(value,x,y,size=10,bold=false,align='left')=>{
      pen.fillStyle='#111';pen.font=(bold?'bold ':'')+size+'px Arial';pen.textBaseline='top';pen.textAlign=align;pen.fillText(String(value||'[not set]'),x,y);pen.textAlign='left';
    };
    if(logoImage)pen.drawImage(logoImage,62,40,80,66);
    text('บริษัท กัลฟ เอเจนซี่ คัมปะนี (ประเทศไทย) จำกัด',156,44,9,true);
    text('GULF AGENCY COMPANY (THAILAND) LTD.',156,62,8);
    text('26/30-31 9th Floor, Orakarn Building, Soi Chidlom, Ploenchit Road,',156,78,7);
    text('Lumpinee, Pathumwan, Bangkok 10330',156,89,7);
    text('Tel +66-2-650 7400  Fax +66-2-650 7401  E-mail shipping.thailand@gac.com',156,102,7);
    text('INVITATION LETTER',PAGE_W/2,143,14,true,'center');
    let y=175;
    const paragraph=(value,gap=8,size=10)=>{
      for(const line of lines(value,PAGE_W-120,size)){text(line,60,y,size);y+=15;}y+=gap;
    };
    paragraph('Date : '+displayDate(ctx.issueDate),3);
    paragraph('To : '+ctx.embassy,0);y+=65;
    paragraph('From : Gulf Agency Company (Thailand) Ltd.');
    paragraph('Subject : VISA Issuance',21);
    paragraph('Dear Sirs,',4);
    paragraph('This is to advise that the following person is arriving to Thailand for visit the vessel "'+(preview.job.vessel||'[Vessel from Job]')+'"',0);
    paragraph('Thailand, '+(preview.job.port||'[Port from Job]').toUpperCase(),20);
    text('Personal Detail :',60,y,10,true);y+=19;
    const fields=[['Surname',person.surname,'Given name',person.givenName],['Date of Birth',person.dob,'Place of Birth',person.placeOfBirth],['Nationality',person.nationality,'Passport No.',person.passport],['Issued',person.passportIssued,'Expiry',person.passportExpiry],['Seamans book',person.seamanBook,'Issued',person.seamanBookIssued]];
    for(const [left,a,right,b] of fields){
      const l=lines(left+': '+(a||'[not set]'),222,9),r=lines(right+': '+(b||'[not set]'),222,9);
      l.forEach((v,i)=>text(v,60,y+i*13,9));r.forEach((v,i)=>text(v,303,y+i*13,9));y+=Math.max(l.length,r.length)*13+4;
    }
    y+=19;
    paragraph('On arrival in Thailand, We will meet the above named and assist them in joining the vessel. We will also be responsible for the maintenance and hotel arrangement during his stays in Thailand prior join vessel and arrange for his repatriation to home town in case he is unbable to join vessel.',15,9);
    paragraph('We, Gulf Agency Company(Thailand) Ltd. Are sponsoring him at the airport',2,9);
    paragraph('Expenses to be incurred during his stays in Thailand, it will be responed by our company',18,9);
    // Never silently clip a long draft onto one sheet.
    if(y+145>PAGE_H-30)throw Error('ข้อมูลยาวเกินหนึ่งหน้า กรุณาตรวจและย่อรายละเอียดก่อนดาวน์โหลด');
    text('Yours Faithfully,',430,y,10,false,'center');y+=23;
    if(signature){pen.drawImage(signature,360,y,140,49);y+=55;}else{text('Signature pending owner approval',430,y,8,false,'center');y+=55;}
    const signoff=['('+(profile.signer||'[signatory not set]')+')',ctx.loiTitle||'Operations Coordinator, Shipping Services','Mobile: '+(profile.phone||'[phone not set]'),'As Agents Only, E.&.O.E.'];
    for(const value of signoff){for(const line of lines(value,250,9)){text(line,415,y,9,false,'center');y+=13;}y+=5;}
    pen.save();pen.fillStyle='rgba(160,0,0,.12)';pen.font='bold 37px Arial';pen.textAlign='center';pen.translate(PAGE_W/2,PAGE_H/2);pen.rotate(-.32);pen.fillText('SAMPLE · NOT APPROVED',0,0);pen.restore();
    text('DRAFT · 1 / 1',PAGE_W-60,PAGE_H-22,8,false,'right');
    const name=fileName([person],preview.job.vessel).replace(/^OKTB/,'LOI');
    const blob=pdfFromPages([canvas]),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return name;
  }
  async function downloadPermit({preview,ctx,profile,logo}){
    const draft=ctx.permitDraft;
    if(!draft?.tables?.length)throw Error('ไม่มีตารางในร่างเอกสาร');
    const logoImage=await image(logoSource(logo)),signature=profile.signature?await image(profile.signature):null;
    const model=await import('./permit-draft.mjs');
    const pages=[];let canvas,pen,y;
    function text(value,x,top,size=8,bold=false,align='left'){
      pen.fillStyle='#111';pen.font=(bold?'bold ':'')+size+'px Arial, Tahoma, sans-serif';pen.textAlign=align;pen.textBaseline='top';pen.fillText(String(value??''),x,top);pen.textAlign='left';
    }
    function wrap(value,width,size=8,bold=false){
      pen.font=(bold?'bold ':'')+size+'px Arial, Tahoma, sans-serif';
      const out=[];let line='';
      for(const paragraph of String(value??'').split('\n')){
        for(const word of paragraph.split(/\s+/)){
          if(!word)continue;
          const next=line?line+' '+word:word;
          if(pen.measureText(next).width<=width){line=next;continue;}
          if(line){out.push(line);line='';}
          if(pen.measureText(word).width<=width){line=word;continue;}
          for(const char of word){if(line&&pen.measureText(line+char).width>width){out.push(line);line=char;}else line+=char;}
        }
        out.push(line);line='';
      }
      return out.length?out:[''];
    }
    function page(){
      canvas=document.createElement('canvas');canvas.width=Math.round(PAGE_W*SCALE);canvas.height=Math.round(PAGE_H*SCALE);
      pen=canvas.getContext('2d');pen.scale(SCALE,SCALE);pen.fillStyle='white';pen.fillRect(0,0,PAGE_W,PAGE_H);pages.push(canvas);y=36;
    }
    function paragraph(value,size=8,gap=2,indent=0){
      const lines=wrap(value,PAGE_W-72-indent,size);
      for(const [i,line] of lines.entries()){text(line,36+(i===0?indent:0),y,size);y+=size+3;}y+=gap;
    }
    function table(table){
      const n=table.headers.length;
      const weights=n===8?[5,24,10,10,13,13,13,12]:n===5?[6,36,18,18,22]:n===4?[6,40,25,29]:[50,50];
      const total=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>(PAGE_W-72)*w/total);
      const drawRow=(values,header=false)=>{
        const wrapped=values.map((v,i)=>wrap(v,widths[i]-8,header?7.1:7.4,header));
        const height=Math.max(header?16:13,Math.max(...wrapped.map(v=>v.length))*9+4);
        let x=36;
        wrapped.forEach((lines,i)=>{
          if(header){pen.fillStyle='#d8dfe7';pen.fillRect(x,y,widths[i],height);}
          pen.strokeStyle='#111';pen.lineWidth=.5;pen.strokeRect(x,y,widths[i],height);
          const top=y+(height-lines.length*9)/2;
          lines.forEach((line,k)=>text(line,header?x+widths[i]/2:x+4,top+k*9,header?7.1:7.4,header,header?'center':'left'));x+=widths[i];
        });y+=height;return height;
      };
      if(table.title){text(table.title,36,y,8,true);y+=15;}drawRow(table.headers,true);
      for(const row of table.rows){
        drawRow(row.cells);
      }y+=12;
    }
    function drawDocument(){
    y=36;
    if(logoImage)pen.drawImage(logoImage,38,36,68,55);
    text('บริษัท กัลฟ เอเจนซี่ คัมปะนี (ประเทศไทย) จำกัด',118,37,8,true);
    text('GULF AGENCY COMPANY (THAILAND) LTD.',118,51,7);
    const address='26/30-31 9th Floor, Orakarn Building, Soi Chidlom, Ploenchit Road, Lumpinee, Pathumwan, Bangkok 10330';
    pen.font='7px Arial';const addressSize=Math.min(7,(PAGE_W-36-118)*7/pen.measureText(address).width);text(address,118,65,addressSize);
    text('Tel +66-2-650 7400  Fax +66-2-650 7401  E-mail shipping.thailand@gac.com',118,78,6.5);
    text(displayDate(ctx.issueDate),PAGE_W-36,106,8,false,'right');y=128;
    paragraph('Subject: '+draft.subject);paragraph('Dear Marine Operation Division');
    paragraph('Gulf Agency Company (Thailand) LTD. has been appointed of the subject vessel "'+(preview.job.vessel||'[Vessel not set in Job]')+'"',8,2,22);
    paragraph('at '+model.permitLocation(preview.job)+' on '+displayDate(ctx.permitDate)+' during her operations',8,12);
    draft.tables.forEach(table);
    paragraph('We would be grateful to terminal approve permission.',8,16);
    text('Thank you & Best regards,',440,y,8,false,'center');y+=19;
    if(signature)pen.drawImage(signature,390,y,100,38);else text('Signature pending owner approval',440,y+15,6.8,false,'center');y+=45;
    for(const line of ['('+(profile.signer||'[signatory not set]')+')','Operations Coordinator, Shipping Services','Mobile: '+(profile.phone||'[phone not set]'),'As Agents Only']){for(const part of wrap(line,230,7.3)){text(part,440,y,7.3,false,'center');y+=11;}}
    }
    // Measure the complete letter first, then render it without page breaks.
    page();drawDocument();
    const contentHeight=Math.max(PAGE_H,y+36),fit=Math.min(1,(PAGE_H-72)/(contentHeight-72));
    if(contentHeight*SCALE>30000)throw Error('ข้อมูลยาวเกินขนาดภาพที่รองรับ กรุณาลดข้อความหรือแถวก่อนดาวน์โหลด');
    canvas.height=Math.ceil(contentHeight*SCALE);pen=canvas.getContext('2d');pen.scale(SCALE,SCALE);pen.fillStyle='white';pen.fillRect(0,0,PAGE_W,contentHeight);drawDocument();
    const fitted=document.createElement('canvas');fitted.width=Math.round(PAGE_W*SCALE);fitted.height=Math.round(PAGE_H*SCALE);
    const fittedPen=fitted.getContext('2d');fittedPen.fillStyle='white';fittedPen.fillRect(0,0,fitted.width,fitted.height);
    const drawWidth=(PAGE_W-72)*fit*SCALE,drawHeight=(contentHeight-72)*fit*SCALE;
    fittedPen.drawImage(canvas,36*SCALE,36*SCALE,(PAGE_W-72)*SCALE,(contentHeight-72)*SCALE,(fitted.width-drawWidth)/2,36*SCALE,drawWidth,drawHeight);
    pages.splice(0,pages.length,fitted);
    for(const [i,p] of pages.entries()){
      const c=p.getContext('2d');c.save();c.setTransform(SCALE,0,0,SCALE,0,0);c.fillStyle='rgba(160,0,0,.10)';c.font='bold 36px Arial';c.textAlign='center';c.translate(PAGE_W/2,PAGE_H/2);c.rotate(-.32);c.fillText('SAMPLE - NOT APPROVED',0,0);c.restore();c.save();c.setTransform(SCALE,0,0,SCALE,0,0);c.fillStyle='#555';c.font='8px Arial';c.textAlign='right';c.fillText('DRAFT - '+(i+1)+' / '+pages.length,PAGE_W-36,PAGE_H-22);c.restore();
    }
    const vessel=String(preview.job.vessel||'VESSEL').replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').trim().slice(0,100);
    const name='TERMINAL PERMIT - '+vessel.toUpperCase()+'.PDF';
    const url=URL.createObjectURL(pdfFromPages(pages)),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return name;
  }
  window.HarborFlowOktbPdf={download,fileName,downloadLoi,downloadPermit};
})();
