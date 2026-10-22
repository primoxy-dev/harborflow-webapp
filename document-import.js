/* Local-only document reading for Crew Change. Files never leave this browser. */
(() => {
  const PDF_JS='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
  const PDF_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const TESSERACT_JS='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const SIX_MONTHS_DAYS=183,MAX_FILE_BYTES=30*1024*1024;
  let pdfPromise,tesseractPromise;
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const upper=value=>clean(value).toUpperCase();
  const isoDate=(year,month,day)=>{
    const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));
    return Number.isNaN(date.valueOf())?'':`${String(date.getUTCFullYear()).padStart(4,'0')}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
  };
  function parseDate(value,{birth=false}={}){
    const source=upper(value).replace(/[,]/g,' ').trim();
    const compact=source.match(/\b(\d{2})(\d{2})(\d{2})\b/);
    if(compact){const yy=Number(compact[1]),current=new Date().getUTCFullYear()%100,year=birth?(yy<=current-16?2000+yy:1900+yy):2000+yy;return isoDate(year,compact[2],compact[3]);}
    const numeric=source.match(/\b(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{2,4})\b/);
    if(numeric){let year=Number(numeric[3]);if(year<100)year=birth?(year<=new Date().getUTCFullYear()%100-16?2000+year:1900+year):2000+year;return isoDate(year,numeric[2],numeric[1]);}
    const months={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
    const named=source.match(/\b(\d{1,2})[.\-/ ]*([A-Z]{3,9})[.\-/ ]*(\d{2,4})\b/);
    if(named){const month=months[named[2].slice(0,3)];let year=Number(named[3]);if(year<100)year=birth?(year<=new Date().getUTCFullYear()%100-16?2000+year:1900+year):2000+year;return month?isoDate(year,month,named[1]):'';}
    return '';
  }
  const labeled=(text,labels,pattern='[A-Z0-9][A-Z0-9 .\\-/]{2,30}')=>{
    const found=text.match(new RegExp(`(?:${labels})\\s*(?:NO\\.?|NUMBER|DATE)?\\s*[:#-]?\\s*(${pattern})`,'i'));
    return clean(found?.[1]||'');
  };
  const mrzValue=char=>char==='<'?0:/\d/.test(char)?Number(char):char.charCodeAt(0)-55;
  function validMrz(value,digit){if(!/\d/.test(digit||''))return false;const weights=[7,3,1];return [...value].reduce((sum,char,index)=>sum+mrzValue(char)*weights[index%3],0)%10===Number(digit);}
  function mrzPassport(text){
    const lines=String(text).split(/\r?\n/).map(line=>upper(line).replace(/\s/g,'').replace(/[^A-Z0-9<]/g,'')).filter(line=>line.length>=40);
    const first=lines.find(line=>line.startsWith('P<'));if(!first)return null;const index=lines.indexOf(first),second=lines[index+1];if(!second||second.length<28)return null;
    const names=first.slice(5).split('<<'),surname=clean(names[0].replace(/</g,' ')),given=clean((names[1]||'').replace(/</g,' '));
    const passport=second.slice(0,9).replace(/</g,''),nationality=second.slice(10,13).replace(/</g,''),birthRaw=second.slice(13,19),expiryRaw=second.slice(21,27);
    const checks=[validMrz(second.slice(0,9),second[9]),validMrz(birthRaw,second[19]),validMrz(expiryRaw,second[27])];
    return {fields:{name:clean([given,surname].filter(Boolean).join(' ')),passport,nationality,dob:parseDate(birthRaw,{birth:true}),passportExpiry:parseDate(expiryRaw)},checks,confidence:checks.filter(Boolean).length===3?99:78};
  }
  function extractPassport(text,ocrConfidence=100){
    const normalized=upper(text),mrz=mrzPassport(text);if(mrz)return {fields:mrz.fields,confidence:Math.min(ocrConfidence,mrz.confidence),machineChecks:mrz.checks};
    return {confidence:Math.min(ocrConfidence,70),machineChecks:[],fields:{
      name:labeled(normalized,'NAME|GIVEN NAMES?|SURNAME','[A-Z][A-Z ]{3,50}'),
      passport:upper(labeled(normalized,'PASSPORT(?: NO)?|DOCUMENT NO','[A-Z0-9]{6,14}')).replace(/\s/g,''),
      nationality:upper(labeled(normalized,'NATIONALITY','[A-Z ]{3,30}')),
      dob:parseDate(labeled(normalized,'DATE OF BIRTH|BIRTH DATE|DOB','[0-9A-Z .\\-/]{6,20}'),{birth:true}),
      passportExpiry:parseDate(labeled(normalized,'DATE OF EXPIRY|EXPIRY DATE|EXPIRES','[0-9A-Z .\\-/]{6,20}'))
    }};
  }
  function extractSeaman(text,ocrConfidence=100){
    const normalized=upper(text);return {confidence:Math.min(ocrConfidence,75),machineChecks:[],fields:{
      name:labeled(normalized,'NAME|GIVEN NAMES?|SURNAME','[A-Z][A-Z ]{3,50}'),
      seamanBook:upper(labeled(normalized,'SEAMAN(?: BOOK)?|SEAFARER(?: BOOK)?|CDC|BOOK NO','[A-Z0-9-]{5,18}')).replace(/\s/g,''),
      seamanBookExpiry:parseDate(labeled(normalized,'DATE OF EXPIRY|EXPIRY DATE|VALID UNTIL|EXPIRES','[0-9A-Z .\\-/]{6,20}'))
    }};
  }
  function extractFlight(text,ocrConfidence=100){
    const normalized=upper(text),route=normalized.match(/\b([A-Z]{3})\s*(?:-|TO|→|>)\s*([A-Z]{3})\b/),labeledNumber=normalized.match(/(?:FLIGHT(?: NO)?|FLT)\s*[:#-]?\s*([A-Z0-9]{2,3})\s*([0-9]{2,4}[A-Z]?)/),fallbackNumber=normalized.match(/\b([A-Z0-9]{2,3})\s*([0-9]{2,4}[A-Z]?)\b/),numberParts=labeledNumber||fallbackNumber,times=[...normalized.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map(match=>match[0]);
    const dateMatch=normalized.match(/\b\d{1,2}[.\-/ ](?:[A-Z]{3,9}|\d{1,2})[.\-/ ]\d{2,4}\b/);
    const nameLine=String(text).split(/\r?\n/).map(line=>upper(line)).map(line=>line.match(/(?:PASSENGER(?: NAME)?|NAME OF PASSENGER|TRAVELL?ER)\s*[:#-]?\s*([A-Z][A-Z ,.'\/-]{3,60})/)?.[1]||'').find(Boolean)||'';
    return {confidence:Math.min(ocrConfidence,72),machineChecks:[],fields:{name:clean(nameLine.replace(/\b(?:MR|MRS|MS|MISS|CAPT|CAPTAIN)\b\.?/g,' '))},flight:{airline:numberParts?.[1]||'',number:numberParts?.[2]||'',date:dateMatch?upper(dateMatch[0]).replace(/[ .\-/]/g,'').slice(0,5):'',from:route?.[1]||'',to:route?.[2]||'',departure:times[0]||'',arrival:times[1]||'',booking:upper(labeled(normalized,'PNR|BOOKING REFERENCE|RESERVATION CODE','[A-Z0-9]{5,8}')).replace(/\s/g,'')}};
  }
  function extractFromText(type,text,confidence=100){
    const result=type==='passport'?extractPassport(text,confidence):type==='seamanBook'?extractSeaman(text,confidence):extractFlight(text,confidence);
    result.type=type;result.rawLength=String(text||'').length;return result;
  }
  function loadScript(src){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[src="${src}"]`);if(existing){if(window.Tesseract)return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(Error('OCR library could not be loaded.')),{once:true});return;}const script=document.createElement('script');script.src=src;script.crossOrigin='anonymous';script.onload=resolve;script.onerror=()=>reject(Error('OCR library could not be loaded.'));document.head.append(script);});}
  async function pdfLibrary(){if(!pdfPromise)pdfPromise=import(PDF_JS).then(module=>{module.GlobalWorkerOptions.workerSrc=PDF_WORKER;return module;});return pdfPromise;}
  async function tesseract(){if(!tesseractPromise)tesseractPromise=loadScript(TESSERACT_JS).then(()=>window.Tesseract);return tesseractPromise;}
  async function recognize(image,onProgress){const api=await tesseract(),worker=await api.createWorker('eng',1,{logger:message=>{if(message.status==='recognizing text')onProgress?.(Math.round((message.progress||0)*100));}});try{const output=await worker.recognize(image);return {text:output.data.text||'',confidence:Number(output.data.confidence||0)};}finally{await worker.terminate();}}
  async function readPdf(file,onProgress){
    const pdfjs=await pdfLibrary(),pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;let text='',confidence=100;const images=[];
    for(let pageNumber=1;pageNumber<=Math.min(pdf.numPages,3);pageNumber++){const page=await pdf.getPage(pageNumber),content=await page.getTextContent();text+='\n'+content.items.map(item=>item.str).join(' ');if(clean(text).length<80){const viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;images.push(canvas);}}
    if(clean(text).length<80&&images.length){text='';const values=[];for(let index=0;index<images.length;index++){const result=await recognize(images[index],progress=>onProgress?.(Math.round(((index+progress/100)/images.length)*100)));text+='\n'+result.text;values.push(result.confidence);}confidence=values.reduce((sum,value)=>sum+value,0)/values.length;}
    return {text,confidence};
  }
  async function read(file,type,onProgress){
    if(!file)throw Error('Please choose a document.');if(file.size>MAX_FILE_BYTES)throw Error('File is larger than 30 MB.');
    const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),image=/^image\//.test(file.type)||/\.(png|jpe?g|webp|bmp)$/i.test(file.name);if(!pdf&&!image)throw Error('Use a PDF, JPG, PNG, WebP or BMP file.');
    onProgress?.(0);const source=pdf?await readPdf(file,onProgress):await recognize(file,onProgress),result=extractFromText(type,source.text,source.confidence);result.fileName=file.name;result.checkedAt=new Date().toISOString();return result;
  }
  const daysUntil=value=>value?Math.ceil((new Date(`${value}T00:00:00Z`)-new Date())/86400000):null;
  function applyToPerson(person,result){
    const next=structuredClone(person||{}),changes=[],conflicts=[],warnings=[];next.documentChecks={...(next.documentChecks||{})};
    const assign=(key,value,label)=>{if(!value)return;if(!clean(next[key])){next[key]=value;changes.push(label);}else if(upper(next[key])!==upper(value))conflicts.push(`${label}: ข้อมูลเดิม “${next[key]}” ต่างจากไฟล์ “${value}”`);};
    if(result.type==='flightTicket'){
      const flight=result.flight||{},hasFlight=Object.values(flight).some(Boolean);if(hasFlight){if(!Array.isArray(next.flights))next.flights=[];const matching=next.flights.find(item=>(flight.number&&upper(item.number)===upper(flight.number))&&(flight.date?upper(item.date)===upper(flight.date):true));if(matching){for(const [key,value] of Object.entries(flight)){if(value&&!matching[key])matching[key]=value;else if(value&&matching[key]&&upper(matching[key])!==upper(value))conflicts.push(`Flight ${key}: ข้อมูลเดิม “${matching[key]}” ต่างจากไฟล์ “${value}”`);}}else next.flights.push(flight);changes.push('Flight details');}else warnings.push('ไม่พบข้อมูลเที่ยวบินที่อ่านได้');
    }else{
      const labels={name:'Name - Surname',passport:'Passport',passportExpiry:'Passport expiry',nationality:'Nationality',dob:'Date of birth',seamanBook:'Seaman book',seamanBookExpiry:'Seaman book expiry'};
      for(const [key,value] of Object.entries(result.fields||{}))assign(key,value,labels[key]||key);
      const expiry=result.type==='passport'?result.fields?.passportExpiry:result.fields?.seamanBookExpiry,remaining=daysUntil(expiry);
      if(remaining!==null&&remaining<0)warnings.push(`${result.type==='passport'?'Passport':'Seaman book'} หมดอายุแล้ว`);
      else if(remaining!==null&&remaining<=SIX_MONTHS_DAYS)warnings.push(`${result.type==='passport'?'Passport':'Seaman book'} เหลืออายุไม่เกิน 6 เดือน (${remaining} วัน)`);
      if(!expiry)warnings.push('ไม่พบวันหมดอายุ กรุณาตรวจเอกสาร');
      if(result.type==='passport'&&!result.fields?.passport)warnings.push('ไม่พบเลข Passport');
      if(result.type==='seamanBook'&&!result.fields?.seamanBook)warnings.push('ไม่พบเลข Seaman book');
    }
    if(result.confidence<80)warnings.push(`ความมั่นใจในการอ่าน ${Math.round(result.confidence)}% กรุณาตรวจทุกช่อง`);
    if(result.machineChecks?.length&&result.machineChecks.some(value=>!value))warnings.push('MRZ check digit บางช่องไม่ตรง กรุณาตรวจต้นฉบับ');
    warnings.push(...conflicts);
    const status=warnings.length?'warning':'ok';next.documentChecks[result.type]={fileName:result.fileName||'',confidence:Math.round(result.confidence||0),checkedAt:result.checkedAt||new Date().toISOString(),status,messages:warnings,changes,expiry:result.type==='passport'?result.fields?.passportExpiry:result.type==='seamanBook'?result.fields?.seamanBookExpiry:''};
    return {person:next,changes,conflicts,warnings,status};
  }
  window.HarborFlowDocumentImport={read,extractFromText,applyToPerson,parseDate,daysUntil,limits:{maxFileBytes:MAX_FILE_BYTES,maxBatchFiles:20}};
})();
