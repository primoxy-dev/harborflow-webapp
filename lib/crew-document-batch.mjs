import {normalizeDocumentDate} from './crew-document-field-labels.mjs';

const value=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const names=s=>String(s||'').toUpperCase().replace(/\b(?:MR|MRS|MS|MISS|CAPT|CAPTAIN)\b\.?/g,' ').replace(/[^A-Z0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean);

// Never assume pages in a PDF belong to the same person. Merge only when
// both names and an independent identifier agree; ambiguous cases stay separate.
export function groupDocumentPages(pages){
 const groups=[];
 for(const page of pages){
  const f=page?.fields||{},name=names(f.name),dob=normalizeDocumentDate(f.dob||''),passport=value(f.passport);
  if(name.length<2){groups.push({pages:[page],status:'needs-review',reason:'Name could not be read'});continue;}
  const matches=groups.filter(g=>{
   if(g.status!=='ready')return false;
   const other=g.pages[0].fields||{},otherName=names(other.name),otherDob=normalizeDocumentDate(other.dob||''),otherPassport=value(other.passport);
   const sameName=name.join(' ')===otherName.join(' ');
   if(dob&&otherDob&&dob!==otherDob||passport&&otherPassport&&passport!==otherPassport)return false;
   return sameName&&((dob&&otherDob&&dob===otherDob)||(passport&&otherPassport&&passport===otherPassport));
  });
  if(matches.length===1)matches[0].pages.push(page);
  else if(matches.length>1)groups.push({pages:[page],status:'needs-review',reason:'Multiple possible matches'});
  else {
   const sameNames=groups.filter(g=>names(g.pages[0]?.fields?.name).join(' ')===name.join(' '));
   if(sameNames.length){for(const group of sameNames){group.status='needs-review';group.reason='Same name without a confirmed matching identifier';}groups.push({pages:[page],status:'needs-review',reason:'Same name without a confirmed matching identifier'});}
   else groups.push({pages:[page],status:'ready'});
  }
 }
 return groups;
}

// A page with signs of multiple passports needs manual separation. OCR can
// miss those signs, so this check is a safeguard rather than a guarantee.
export function pageIdentityStatus(text){
 const lines=String(text||'').toUpperCase().split(/\r?\n/);
 const mrz=lines.filter(line=>/^\s*P<[A-Z]{3}/.test(line)).length;
 const surnames=lines.filter(line=>/\b(?:SURNAME|FAMILY NAME)\b/.test(line)).length;
 if(mrz>1||surnames>1)return {safe:false,reason:'Multiple possible people on one page'};
 return {safe:true};
}
