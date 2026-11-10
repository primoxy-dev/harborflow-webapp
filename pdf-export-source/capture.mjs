const surfaces = new WeakMap();
export const vectorImages = new Map();
const styles = ['font','fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','miterLimit','globalAlpha','textAlign','textBaseline'];
export function captureContext(canvas, { rasterText = false } = {}) {
  if (surfaces.has(canvas)) return surfaces.get(canvas).context;
  const native = canvas.getContext('2d'), commands = [];
  const context = new Proxy(native, {
    get(target,name) {
      const value = target[name];
      if (typeof value !== 'function') return value;
      return (...args) => {
        if(name==='drawImage'&&vectorImages.has(args[0]?.src)) args[0].hfoVector=vectorImages.get(args[0].src);
        if(name==='drawImage'&&args[0].hfoVector){
          commands.push({name,args});const vector=args[0].hfoVector,[x,y,w,h]=args.length===9?args.slice(5):args.slice(1);
          target.save();target.translate(x,y);target.scale(w/vector.viewBox[2],h/vector.viewBox[3]);target.translate(-vector.viewBox[0],-vector.viewBox[1]);
          for(const path of vector.paths){target.fillStyle=path.fill;target.fill(new Path2D(path.d));}target.restore();return;
        }
        if (name === 'fillText' && (rasterText || /[^\x20-\x7e\u00a0-\u00ff]/.test(String(args[0])))) {
          // Preserve browser shaping for Thai and other complex scripts.
          const metrics=target.measureText(String(args[0])),matrix=target.getTransform();
          const x=args[1],y=args[2],fontSize=parseFloat(target.font.match(/([\d.]+)px/)?.[1]||'12');
          const left=x-(metrics.actualBoundingBoxLeft??0),right=x+(metrics.actualBoundingBoxRight??metrics.width),top=y-(metrics.actualBoundingBoxAscent??fontSize),bottom=y+(metrics.actualBoundingBoxDescent??fontSize);
          const points=[[left,top],[right,top],[right,bottom],[left,bottom]].map(([x,y])=>({x:matrix.a*x+matrix.c*y+matrix.e,y:matrix.b*x+matrix.d*y+matrix.f}));
          const bx=Math.floor(Math.min(...points.map(p=>p.x)))-3,by=Math.floor(Math.min(...points.map(p=>p.y)))-3,bw=Math.max(1,Math.ceil(Math.max(...points.map(p=>p.x)))-bx+3),bh=Math.max(1,Math.ceil(Math.max(...points.map(p=>p.y)))-by+3);
          const image = document.createElement('canvas'); image.width=bw; image.height=bh;
          const pen=image.getContext('2d'); for(const key of styles) pen[key]=target[key];
          pen.setTransform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e-bx,matrix.f-by); pen.fillText(...args);
          commands.push({name:'textImage',args:[image.toDataURL('image/png'),bx,by,bw,bh]});
        } else if (!['measureText','getTransform','getImageData','isPointInPath','isPointInStroke'].includes(name)) commands.push({name,args});
        return value.apply(target,args);
      };
    },
    set(target,name,value) { if(styles.includes(name)) commands.push({name,args:value,property:true}); target[name]=value; return true; }
  });
  surfaces.set(canvas,{context,commands}); return context;
}
export function recordedPage(canvas) {
  const entry=surfaces.get(canvas);
  if(!entry) throw new Error('PDF drawing surface was not recorded');
  return {width:canvas.width,height:canvas.height,commands:entry.commands};
}
