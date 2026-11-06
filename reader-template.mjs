const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
// Find one printed heading from OCR word boxes, then translate the user's
// value rectangle relative to that heading. Multiple matches are ambiguous.
export function locateTemplateValue(mapping,words,width,height){
 if(!mapping?.heading||!mapping?.label||!mapping?.value||!Array.isArray(words)||width<=0||height<=0)return null;
 const target=norm(mapping.heading).split(' ').filter(Boolean);if(!target.length)return null;
 const valid=words.map(w=>({text:norm(w.text),box:w.bbox})).filter(w=>w.text&&w.box&&[w.box.x0,w.box.y0,w.box.x1,w.box.y1].every(Number.isFinite));
 const matches=[];
 for(let i=0;i<valid.length;i++){
  const group=valid.slice(i,i+target.length);if(group.length!==target.length||group.some((w,j)=>w.text!==target[j]))continue;
  const first=group[0].box;if(group.some(w=>Math.abs(w.box.y0-first.y0)>Math.max(first.y1-first.y0,w.box.y1-w.box.y0)))continue;
  const left=Math.min(...group.map(w=>w.box.x0)),top=Math.min(...group.map(w=>w.box.y0));
  const x=left/width+(mapping.value.x-mapping.label.x),y=top/height+(mapping.value.y-mapping.label.y),w=mapping.value.width,h=mapping.value.height;
  if([x,y,w,h].every(Number.isFinite)&&x>=0&&y>=0&&w>0&&h>0&&x+w<=1&&y+h<=1)matches.push({x,y,width:w,height:h});
 }
 return matches.length===1?matches[0]:null;
}
