import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
export { captureContext } from './capture.mjs';
import { recordedPage, captureContext, vectorImages } from './capture.mjs';
import { logo } from './gac-logo.mjs';
import { traceSignature } from '../lib/signature-vector.mjs';
import { pageFit } from './page-fit.mjs';

export function fromCanvases(canvases, options) { return createVectorPdf(canvases.map(recordedPage),options); }
export async function fromLivePage(page, { exactText = true } = {}) {
  await document.fonts.ready;
  // Export at the desktop document width, independently of mobile viewport,
  // text inflation and scrollable/transformed document-panel ancestors.
  const clone=page.cloneNode(true);
  clone.hidden=false;clone.style.cssText+=';position:absolute;left:-20000px;top:0;width:800px;min-width:800px;max-width:800px;box-sizing:border-box;box-shadow:none;border-color:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%;';
  document.body.append(clone);
  try {
    const borderGroups=new Map();
    const logoElement=clone.querySelector('.hfd-oktb-logo');
    if(logoElement){const background=getComputedStyle(logoElement).backgroundImage,src=background.match(/url\(["']?(.*?)["']?\)/)?.[1];if(src){const picture=new Image();picture.src=src;await picture.decode();await prepareImage(picture,'logo');vectorImages.set(picture.src,logo);picture.style.cssText='width:100%;height:100%;object-fit:contain';logoElement.style.backgroundImage='none';logoElement.append(picture);}}
    const signature=clone.querySelector('#hfdSignatureOut');
    if(signature&&!signature.hidden&&signature.src){await signature.decode();await prepareImage(signature,'signature');vectorImages.set(signature.src,signature.hfoVector);}
    const canvas=document.createElement('canvas');
    const context=captureContext(canvas,{rasterText:exactText}),nativeGet=canvas.getContext.bind(canvas);
    canvas.getContext=(kind,...args)=>kind==='2d'?context:nativeGet(kind,...args);
    await html2canvas(clone,{canvas,scale:3,windowWidth:1200,windowHeight:900,backgroundColor:'#fff',logging:false,onclone:async(doc,captured)=>{
        await doc.fonts.ready;
        const origin=captured.getBoundingClientRect();
        canvas.width=Math.ceil(origin.width*3);canvas.height=Math.ceil(origin.height*3);
        for(const cell of captured.querySelectorAll('th,td')){
          const rect=cell.getBoundingClientRect(),css=doc.defaultView.getComputedStyle(cell);
          for(const [edge,axis,pos,start,end]of [['Top','h',rect.top-origin.top,rect.left-origin.left,rect.right-origin.left],['Bottom','h',rect.bottom-origin.top,rect.left-origin.left,rect.right-origin.left],['Left','v',rect.left-origin.left,rect.top-origin.top,rect.bottom-origin.top],['Right','v',rect.right-origin.left,rect.top-origin.top,rect.bottom-origin.top]]){
            const width=parseFloat(css['border'+edge+'Width']),color=css['border'+edge+'Color'];
            if(!width||css['border'+edge+'Style']==='none'||color==='transparent'||color==='rgba(0, 0, 0, 0)')continue;
            const key=[axis,pos.toFixed(2),width,color].join('|');if(!borderGroups.has(key))borderGroups.set(key,{axis,pos,width,color,segments:[]});borderGroups.get(key).segments.push([start,end]);
          }
          cell.style.borderColor='transparent';
        }
      }
    });
    context.save();context.setTransform(3,0,0,3,0,0);
    for(const {axis,pos,width,color,segments}of borderGroups.values()){
      const merged=[];for(const span of segments.sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&span[0]<=last[1]+0.1)last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}
      context.strokeStyle=color;context.lineWidth=width;context.beginPath();for(const [start,end]of merged){context.moveTo(axis==='h'?start:pos,axis==='h'?pos:start);context.lineTo(axis==='h'?end:pos,axis==='h'?pos:end);}context.stroke();
    }
    context.restore();
    return fromCanvases([canvas],{width:595,height:842,preserveAspectRatio:true});
  } finally {clone.remove();vectorImages.clear();}
}
function drawPath(ctx,d) {
  const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
  let i=0,cmd='',x=0,y=0,sx=0,sy=0;
  const num=()=>{const n=Number(tokens[i++]);if(!Number.isFinite(n))throw Error('Invalid vector path');return n;};
  ctx.beginPath();
  while(i<tokens.length){if(/^[a-zA-Z]$/.test(tokens[i]))cmd=tokens[i++];const relative=cmd===cmd.toLowerCase(),ox=relative?x:0,oy=relative?y:0;
    switch(cmd.toUpperCase()){
      case 'M': x=num()+ox;y=num()+oy;ctx.moveTo(x,y);sx=x;sy=y;cmd=relative?'l':'L';break;
      case 'L': x=num()+ox;y=num()+oy;ctx.lineTo(x,y);break;
      case 'H': x=num()+ox;ctx.lineTo(x,y);break;
      case 'V': y=num()+oy;ctx.lineTo(x,y);break;
      case 'C': {const a=num()+ox,b=num()+oy,c=num()+ox,d=num()+oy;x=num()+ox;y=num()+oy;ctx.bezierCurveTo(a,b,c,d,x,y);break;}
      case 'Z':ctx.closePath();x=sx;y=sy;cmd='';break;
      default:throw Error('Unsupported vector path');
    }
  }
  ctx.fill();
}
export async function prepareImage(image,kind,review=true) {
  if(kind==='logo'){image.hfoVector=logo;return image;}
  if(kind!=='signature')return image;
  const surface=document.createElement('canvas');surface.width=image.naturalWidth;surface.height=image.naturalHeight;
  if(surface.width>900||surface.height>350)throw Error('Signature must be at most 900 × 350 pixels');
  surface.getContext('2d').drawImage(image,0,0);
  const svg=traceSignature(surface.getContext('2d').getImageData(0,0,surface.width,surface.height));
  const vector={viewBox:[0,0,surface.width,surface.height],paths:[{d:svg.match(/ d="([^"]+)"/)[1],fill:'#000'}]};
  const accepted=!review||await new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Review vector signature');
    const title=document.createElement('h2');title.textContent='Review signature / ตรวจลายเซ็น';dialog.append(title);
    const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:20px;max-width:80vw';
    for(const [label,src] of [['Original',image.src],['Vector',`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`]]){const cell=document.createElement('div'),caption=document.createElement('p'),picture=document.createElement('img');caption.textContent=label;picture.src=src;picture.alt=label;picture.style.cssText='width:300px;max-width:70vw;background:white;border:1px solid #999';cell.append(caption,picture);row.append(cell);}
    dialog.append(row);const close=value=>{dialog.close();dialog.remove();resolve(value);};
    for(const [label,value]of [['Use vector signature',true],['Cancel download',false]]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>close(value);dialog.append(button);}
    dialog.addEventListener('cancel',event=>{event.preventDefault();close(false);},{once:true});document.body.append(dialog);dialog.showModal();
  });
  if(!accepted)throw Error('Signature approval cancelled');
  image.hfoVector=vector;return image;
}

// Replay the same drawing commands used for the screen onto a PDF surface.
// Callers supply a text image for scripts which must retain browser shaping.
export function createVectorPdf(pages, { width = 595, height = 842, preserveAspectRatio = false } = {}) {
  if (!pages.length) throw new Error('No PDF pages');
  const pdf = new jsPDF({unit:'pt',format:[width,height],orientation:width > height ? 'landscape' : 'portrait',compress:true});
  pages.forEach((page,index) => {
    if (index) pdf.addPage([width,height],width > height ? 'landscape' : 'portrait');
    const ctx = pdf.context2d;
    ctx.autoPaging = false;
    ctx.save();
    const {sx,sy,x:offsetX,y:offsetY}=pageFit(page.width,page.height,width,height,preserveAspectRatio);
    ctx.translate(offsetX,offsetY);
    ctx.scale(sx,sy);
    for (const command of page.commands) {
      const {name,args,property} = command;
      if (property) { ctx[name] = args; continue; }
      if(name==='setTransform'){ctx.setTransform(...args.map((n,i)=>n*(i===1||i===3||i===5?sy:sx)+(i===4?offsetX:i===5?offsetY:0)));continue;}
      if(name==='textImage'){pdf.addImage(args[0],'PNG',offsetX+args[1]*sx,offsetY+args[2]*sy,args[3]*sx,args[4]*sy,undefined,'FAST');continue;}
      if(name==='drawImage'&&args[0].hfoVector){const vector=args[0].hfoVector,[x,y,w,h]=args.length===9?args.slice(5):args.slice(1);ctx.save();ctx.translate(x,y);ctx.scale(w/vector.viewBox[2],h/vector.viewBox[3]);ctx.translate(-vector.viewBox[0],-vector.viewBox[1]);for(const path of vector.paths){ctx.fillStyle=path.fill;drawPath(ctx,path.d);}ctx.restore();continue;}
      if(name==='roundRect'){const [x,y,w,h,radius]=args,r=Math.min(Number(Array.isArray(radius)?radius[0]:radius)||0,w/2,h/2);ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();continue;}
      if (typeof ctx[name] !== 'function') throw new Error(`Unsupported PDF drawing command: ${name}`);
      ctx[name](...args);
    }
    ctx.restore();
  });
  return pdf.output('blob');
}
