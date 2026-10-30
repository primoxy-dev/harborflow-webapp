// Customer document renderer. Preview and export use this same paginated surface.
// Workflow adapted from EasyInvoicePDF's shared PDF instance pattern (see THIRD_PARTY_NOTICES.md).
import { customerProjection, quoteTotals } from './quotation-model.mjs';

const money=value=>Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function renderQuotationPages(raw,createCanvas=()=>document.createElement('canvas')) {
  const data=customerProjection(raw),totals=quoteTotals(data);
  const W=1240,H=1754,M=70,bottom=H-90,pages=[];
  const accent=data.template==='classic'?'#193454':'#087f76';
  let canvas,ctx,y;
  const font=(size=20,bold=false)=>{ctx.font=`${bold?'bold ':''}${size}px Segoe UI, sans-serif`;};
  const wrap=(value,width)=>{
    const lines=[];
    for(const paragraph of String(value||'').split(/\r?\n/)){
      let line='';
      for(const ch of paragraph){if(line&&ctx.measureText(line+ch).width>width){lines.push(line);line='';}line+=ch;}
      lines.push(line);
    }
    return lines;
  };
  const start=()=>{
    canvas=createCanvas();canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');pages.push(canvas);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle=accent;ctx.fillRect(0,0,W,14);
    font(20,true);ctx.fillText('QUOTATION',M,65);font(16);ctx.textAlign='right';ctx.fillText(data.number||'Draft',W-M,65);ctx.textAlign='left';y=110;
  };
  const room=height=>{if(y+height>bottom)start();};
  const text=(value,{size=20,bold=false,color='#24354a',width=W-2*M,indent=0}={})=>{
    font(size,bold);const lines=wrap(value,width);
    for(const line of lines){room(size+16);font(size,bold);ctx.fillStyle=color;ctx.fillText(line,M+indent,y);y+=size+12;}
  };
  const tableHead=()=>{
    room(65);ctx.fillStyle=accent;ctx.fillRect(M,y-20,W-2*M,44);ctx.fillStyle='#fff';font(18,true);
    ctx.fillText('DESCRIPTION',M+10,y+8);ctx.fillText('QTY / UNIT',745,y+8);ctx.fillText('UNIT PRICE',890,y+8);ctx.fillText('TOTAL',1060,y+8);y+=48;
  };
  start();text(data.issuer||'HarborFlow',{size:32,bold:true,color:accent});
  if(data.issuerAddress)text(data.issuerAddress,{size:18,color:'#627487'});
  y+=16;
  text(`Quotation no. ${data.number||'—'}     Date: ${data.date||'—'}`,{bold:true});
  if(data.validUntil)text(`Valid until: ${data.validUntil}`,{size:18});
  y+=12;text(`Prepared for: ${data.customer||'—'}`,{size:24,bold:true});
  if(data.customerAddress)text(data.customerAddress,{size:18});
  text(`Vessel: ${data.vessel||'—'}   /   Job: ${data.jobNo||'—'}`,{size:18});
  text(`Port: ${data.port||'—'}   /   Currency: ${data.currency}`,{size:18});
  y+=24;tableHead();
  if(!data.lines.length)text('Add a service item to start your quotation.',{color:'#627487'});
  data.lines.forEach((line,index)=>{
    font();const labels=wrap(`${index+1}. ${line.description||'—'}`,640);
    const details=[line.customerNote,`VAT: ${line.vatMode||'—'}${line.vatMode&&line.vatMode!=='none'?' '+(line.vatRate||'0')+'%':''}`].filter(Boolean).flatMap(t=>wrap(t,640));
    if(y+Math.min((labels.length+details.length)*32+24,320)>bottom){start();tableHead();}
    const firstY=y;
    labels.forEach((label,i)=>{
      if(y+32>bottom){start();tableHead();}
      font(20,i===0);ctx.fillStyle='#24354a';ctx.fillText(label,M+10,y);y+=32;
    });
    // Values are printed on the first row; descriptions/notes can flow across pages.
    if(y-labels.length*32===firstY){font(18);ctx.fillText(`${line.saleQuantity||'—'} ${line.unit||''}`,745,firstY,130);ctx.fillText(line.salePrice===''?'—':money(line.salePrice),890,firstY,150);ctx.fillText(totals.lines[index]?money(totals.lines[index].total):'—',1060,firstY,110);}
    for(const detail of details){if(y+30>bottom){start();tableHead();}font(17);ctx.fillStyle='#627487';ctx.fillText(detail,M+10,y);y+=30;}
    ctx.strokeStyle='#e2e9ed';ctx.beginPath();ctx.moveTo(M,y-10);ctx.lineTo(W-M,y-10);ctx.stroke();y+=20;
  });
  room(190);y+=12;
  for(const [label,value] of [['Subtotal',totals.subtotal],['VAT',totals.tax],['Total',totals.total]]){
    font(label==='Total'?28:22,label==='Total');ctx.fillStyle=label==='Total'?accent:'#24354a';ctx.fillText(label,750,y);ctx.textAlign='right';ctx.fillText(totals.complete?`${money(value)} ${data.currency}`:'—',W-M,y);ctx.textAlign='left';y+=42;
  }
  for(const [label,value] of [['Notes',data.notes],['Terms',data.terms]]){if(value){room(85);y+=20;text(label,{bold:true});text(value,{size:18});}}
  pages.forEach((page,i)=>{const c=page.getContext('2d');c.font='16px Segoe UI, sans-serif';c.fillStyle='#627487';c.fillText(`Quotation · ${data.number||'Draft'}`,M,H-35);c.fillText(`Page ${i+1} / ${pages.length}`,W-190,H-35);});
  return pages;
}
