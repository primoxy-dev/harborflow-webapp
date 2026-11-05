// Field meanings learned from the user's annotated examples. The document
// version and visual layout may vary; these are labels, not page coordinates.
export const FIELD_LABELS=Object.freeze({
  surname:['SURNAME','FAMILY NAME','APELYIDO'],
  given:['GIVEN NAME','GIVEN NAMES','FIRST NAME','PANGALAN'],
  nationality:['NATIONALITY','CITIZENSHIP','NASYONALIDAD'],
  dob:['DATE OF BIRTH','BIRTH DATE','DOB','PETSA NG KAPANGANAKAN'],
  passport:['PASSPORT NO','PASSPORT NUMBER','PASSPORT NO.'],
  passportExpiry:['DATE OF EXPIRY','EXPIRY DATE','DATE OF EXPIRATION','VALID UNTIL'],
  seamanBook:['SEAMAN BOOK NO','SEAFARER BOOK NO','SRB NO','CDC NO'],
  sex:['SEX','GENDER','KASARIAN'],
  name:['NAME OF SEAFARER IN FULL','NAME OF SEAFARER','SEAMAN NAME'],
});

// Only return unambiguous matches. Text resembling MRZ is ignored and never
// used to fill fields. The consumer must confirm inferred values before saving.
export function fieldForLabel(label){
 const text=String(label||'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 if(!text||text.includes('DATE OF ISSUE'))return '';
 const matches=[];
 for(const [field,aliases] of Object.entries(FIELD_LABELS))for(const alias of aliases){
  const clean=alias.replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(text===clean)matches.push(field);
 }
 const unique=[...new Set(matches)];return unique.length===1?unique[0]:'';
}

export function fieldsFromLabelValuePairs(pairs){
 const fields={},conflicts=[];
 for(const pair of Array.isArray(pairs)?pairs:[]){
  const label=String(pair?.label||''),value=String(pair?.value||'').trim();
  if(!value||/[<]{2,}/.test(label)||/[<]{2,}/.test(value))continue;
  const field=fieldForLabel(label);if(!field)continue;
  if(fields[field]&&fields[field]!==value){conflicts.push(field);delete fields[field];continue;}
  if(!conflicts.includes(field))fields[field]=value;
 }
 return {fields,conflicts,requiresReview:true};
}

// Find values following visible labels in OCR output. Unlabelled numbers are
// only proposed when a single document-number-shaped candidate is present.
// The caller supplies text from the printed data page, excluding the MRZ.
export function extractVisibleFields(text,documentType){
 if(!['passport','seamanBook'].includes(documentType))throw Error('Unsupported document type');
 const lines=String(text||'').toUpperCase().split(/\r?\n/).map(s=>s.replace(/^[^A-Z0-9]+/,'').trim()).filter(s=>s&&!/[<]{2,}/.test(s));
 const fields={},conflicts=[],warnings=[];
 const add=(key,value)=>{if(!value||conflicts.includes(key))return;if(fields[key]&&fields[key]!==value){delete fields[key];conflicts.push(key);}else fields[key]=value;};
 const dates=/\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\s+[A-Z]{3,9}\s+\d{4}|[A-Z]{3,9}\s+\d{1,2},?\s+\d{4})\b/g;
 const labelPatterns=[
  ['surname',/\b(?:SURNAME|FAMILY NAME|APELYIDO)\b/],
  ['given',/\b(?:GIVEN NAMES?|FIRST NAMES?|PANGALAN[A-Z]?)\b/],
  ['nationality',/\b(?:NATIONALITY|NASYONALIDAD)\b/],
  ['dob',/\b(?:DATE OF BIRTH|BIRTH DATE|DOB|PETSA NG KAPANGANAKAN)\b/],
  ['passportExpiry',/\b(?:DATE OF EXPIRY|EXPIRY DATE|DATE OF EXPIRATION|VALID UNTIL|PETSA(?:NG| NG) PAGKAWALANG)\b/],
  ['passport',/\b(?:PASSPORT\s*(?:NO\.?|NUMBER)|PASAPORTE\s*(?:BLG|BILANG))\b/],
  ['seamanBook',/\b(?:SEAMAN(?: BOOK)?|SEAFARER(?: BOOK)?|SRB|CDC)\s*(?:NO\.?|NUMBER)\b/],
  ['name',/^(?:SEAMAN NAME|NAME OF SEAFARER(?: IN FULL)?|NAME)\b/],
  ['sex',/^(?:SEX|GENDER|KASARIAN)\b/],
 ];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];for(const [key,pattern] of labelPatterns){
   if(documentType==='passport'&&key==='seamanBook')continue;
   const match=pattern.exec(line);if(!match)continue;
   if(key==='dob'||key==='passportExpiry'){
    const nearby=[line,...lines.slice(i+1,i+4)];
    for(const [offset,item] of nearby.entries()){
     if(offset>0&&/\b(?:DATE OF ISSUE|DATE ISSUED|DATE OF EXPIRY|EXPIRY DATE|VALID UNTIL|DATE OF BIRTH)\b/.test(item))break;
     const date=[...item.matchAll(dates)];if(date.length>1)break;
     if(date.length===1){add(key==='passportExpiry'&&documentType==='seamanBook'?'seamanBookExpiry':key,date[0][0]);break;}
    }
    continue;
   }
   const tail=line.slice(match.index+match[0].length),after=tail.replace(/^[^A-Z0-9]+/,'').trim();
   const next=lines[i+1]||'';
   // Bilingual heading lines often contain an OCR-garbled translation after
   // the slash. The value is on the following line, not in that heading.
   const headingOnly=/^\s*\//.test(tail)||key==='given'&&/^PANGALAN/.test(match[0])&&/\b(?:NOME|NAME|NAMES)\b/.test(after);
   const value=headingOnly?next:after||next;
   if(!value||labelPatterns.some(([,p])=>p.test(value)))continue;
   if(['given','surname','name'].includes(key)&&/^[A-Z][A-Z .,'-]{1,60}$/.test(value))add(key,value);
   else if(key==='sex'&&/^(?:M|F|MALE|FEMALE)$/.test(value))add(key,value);
   else if(key==='nationality'&&/^[A-Z ]{3,30}$/.test(value))add(key,value);
   else if(['passport','seamanBook'].includes(key)&&/^(?=[A-Z0-9]*\d)[A-Z0-9]{6,14}$/.test(value.replace(/\s/g,'')))add(key,value.replace(/\s/g,''));
  }
 }
 if(documentType==='seamanBook'&&!fields.seamanBook){
  const matches=[...new Set(lines.flatMap(line=>line.match(/\b[A-Z]\d{7}\b/g)||[]))];
  if(matches.length===1){fields.seamanBook=matches[0];warnings.push('Confirm the unlabelled Seaman Book number');}
 }
 for(const key of documentType==='passport'?['given','surname','passport','dob','passportExpiry','nationality']:['name','dob','seamanBook','seamanBookExpiry'])if(!fields[key])warnings.push(`Review ${key}`);
 return {fields,conflicts,warnings,requiresReview:true};
}

// Cross-document identity checks are advisory. They never merge records or
// select one side of a disagreement for the user.
export function normalizeDocumentDate(value){
 const months={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
  let text=String(value||'').toUpperCase().replace(/,/g,' ').replace(/\s+/g,' ').trim();const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(iso)text=`${iso[3]}-${iso[2]}-${iso[1]}`;else if(/[A-Z]/.test(text))text=text.replace(/[.\/-]/g,' ').replace(/\s+/g,' ');let m=text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/),day,month,year;
  if(m){day=+m[1];month=+m[2];year=+m[3];}else if((m=text.match(/^(\d{1,2})\s+([A-Z]{3,9})\s+(\d{4})$/))){day=+m[1];month=months[m[2].slice(0,3)];year=+m[3];}else if((m=text.match(/^([A-Z]{3,9})\s+(\d{1,2})\s+(\d{4})$/))){month=months[m[1].slice(0,3)];day=+m[2];year=+m[3];}else return '';
  const d=new Date(Date.UTC(year,(month||0)-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()+1===month&&d.getUTCDate()===day?d.toISOString().slice(0,10):'';
}
export function displayDocumentDate(value){
 const normalized=normalizeDocumentDate(value);if(!normalized)return '';
 const [year,month,day]=normalized.split('-');const names=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];return `${day}-${names[Number(month)-1]}-${year}`;
}

// A candidate region is located relative to an OCR-detected printed label.
// Only use this on the printed data page after excluding the MRZ.
export function passportNumberRegion(words,pageWidth,pageHeight){
 if(!Array.isArray(words)||!Number.isFinite(pageWidth)||!Number.isFinite(pageHeight)||pageWidth<=0||pageHeight<=0)return null;
 const labels=words.filter(w=>/^(?:PASSPORT|PASAPORT|PASAPORTE)$/i.test(String(w?.text||'').trim())&&Number.isFinite(w.left)&&Number.isFinite(w.top)&&w.width>0&&w.height>0);
 const candidates=labels.filter(w=>words.some(other=>other!==w&&Math.abs(other.top-w.top)<=Math.max(w.height,other.height||0)&&other.left>=w.left&&other.left<=w.left+w.width*4&&/(?:\bNO\b|NUMBER|BLG|BILANG|PASSPIIRT)/i.test(String(other.text||''))));
 if(candidates.length!==1)return null;
 const label=candidates[0],left=Math.max(0,Math.floor(label.left-label.height*.4)),top=Math.max(0,Math.floor(label.top+label.height*.6));
 const width=Math.min(pageWidth-left,Math.ceil(label.height*11.1)),height=Math.min(pageHeight-top,Math.ceil(label.height*1.32));
 return width>0&&height>0?{left,top,width,height}:null;
}

export function formatPhilippineName(given,middle,surname,{seaman=false}={}){
 const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
 const g=clean(given),m=clean(middle),s=clean(surname);if(!g||!s)return '';
 const middlePart=m?(seaman?`${m[0].toUpperCase()}.`:m):'';
 return [g,middlePart,s].filter(Boolean).join(' ');
}

export function formatCrewName(given,middle,surname){
 const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
 const first=clean(given),last=clean(surname);return first&&last?[first,clean(middle),last].filter(Boolean).join(' '):'';
}

// Suggest a printed middle name only when a separately supplied seaman-book
// name has an initial and exactly one candidate occurs between given name and
// the printed birth date. Never use an MRZ line as evidence.
export function suggestMiddleName(passportText,given,seamanName){
 const first=String(given||'').trim().toUpperCase();
 const initial=String(seamanName||'').toUpperCase().match(/(?:^|\s)([A-Z])\.\s+/)?.[1];
 if(!/^[A-Z]{2,}$/.test(first)||!initial)return {suggestion:'',requiresReview:true};
 const lines=String(passportText||'').toUpperCase().split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/[<]{2,}/.test(s));
 const start=lines.findIndex(s=>s===first);if(start<0)return {suggestion:'',requiresReview:true};
 const candidates=[];let foundBirthDate=false;
 for(const line of lines.slice(start+1)){
  if(/\b(?:\d{1,2}\s+[A-Z]{3,9}\s+\d{4}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/.test(line)){foundBirthDate=true;break;}
  if(/^[A-Z]{3,40}$/.test(line)&&line.startsWith(initial))candidates.push(line);
 }
 const values=[...new Set(candidates)];return {suggestion:foundBirthDate&&values.length===1?values[0]:'',requiresReview:true};
}

// choices is the existing nationality datalist. Never invent a value outside
// that list; an ambiguous OCR reading remains blank.
export function matchExistingNationality(value,choices){
 const input=String(value||'').trim().toUpperCase().replace(/[^A-Z ]/g,'').replace(/\s+/g,' ');
 const list=[...new Set((Array.isArray(choices)?choices:[]).map(x=>String(x).trim().toUpperCase()).filter(Boolean))];
 if(!input)return '';if(list.includes(input))return input;
 if(input.length<7||input.includes(' '))return '';
 function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let diag=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diag+(a[i-1]===b[j-1]?0:1));diag=old;}}return row[b.length];}
 const scored=list.filter(x=>!x.includes(' ')).map(x=>({value:x,score:distance(input,x)})).filter(x=>x.score<=2).sort((a,b)=>a.score-b.score);
 return scored.length&&(!scored[1]||scored[0].score<scored[1].score)?scored[0].value:'';
}

// OCR suggestions are intentionally limited to the nationalities for which
// the user supplied examples; an unfamiliar or ambiguous word stays blank.
export function suggestSampleNationality(text){
 const candidates=['FILIPINO','INDIAN'],words=String(text||'').toUpperCase().match(/\b[A-Z]{5,12}\b/g)||[];
 function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let diag=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diag+(a[i-1]===b[j-1]?0:1));diag=old;}}return row[b.length];}
 const matches=candidates.filter(value=>words.some(word=>word===value||(value==='FILIPINO'&&word.length>=7&&distance(word,value)<=2)));
 return {suggestion:matches.length===1?matches[0]:'',requiresReview:true};
}
export function compareVisibleIdentities(passport,seaman){
 const a=normalizeDocumentDate(passport?.dob),b=normalizeDocumentDate(seaman?.dob),conflicts=[];
 if(a&&b&&a!==b)conflicts.push({field:'dob',passport:passport.dob,seamanBook:seaman.dob});
 return {conflicts,requiresReview:true};
}

// A second OCR pass over the printed page can corroborate a seaman-book date.
// The suggested match remains unconfirmed; a filename or MRZ never supplies it.
export function suggestBirthDate(passportDate,seamanDate,alternateDates){
 const printed=normalizeDocumentDate(passportDate),other=normalizeDocumentDate(seamanDate);
 if(!other)return {suggestion:'',requiresReview:true};
 if(!printed){const matching=(Array.isArray(alternateDates)?alternateDates:[]).filter(value=>normalizeDocumentDate(value)===other);return matching.length===1?{suggestion:other,requiresReview:true,reason:'unlabelled-printed-date-match'}:{suggestion:'',requiresReview:true};}
 if(printed===other)return {suggestion:printed,requiresReview:true,reason:'same-day'};
 const [py,pm,pd]=printed.split('-'),[sy,sm,sd]=other.split('-');
 const alternateMatches=(Array.isArray(alternateDates)?alternateDates:[]).filter(value=>normalizeDocumentDate(value)===other);
 const shorter=String(Number(pd)),longer=String(Number(sd));
 if(py===sy&&pm===sm&&shorter.length<longer.length&&longer.endsWith(shorter)&&alternateMatches.length){
  return {suggestion:other,requiresReview:true,reason:'alternate-printed-ocr'};
 }
 return {suggestion:'',requiresReview:true,reason:'conflict'};
}
