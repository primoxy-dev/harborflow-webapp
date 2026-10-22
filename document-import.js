/* Local-only document reading for Crew Change. Files never leave this browser. */
(() => {
  const PDF_JS='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
  const PDF_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const TESSERACT_JS='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const SIX_MONTHS_DAYS=183,MAX_FILE_BYTES=30*1024*1024;
  let pdfPromise,tesseractPromise;
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const upper=value=>clean(value).toUpperCase();
  const NATIONALITIES={AFG:'AFGHAN',ALB:'ALBANIAN',DZA:'ALGERIAN',USA:'AMERICAN',AGO:'ANGOLAN',ARG:'ARGENTINIAN',ARM:'ARMENIAN',AUS:'AUSTRALIAN',AUT:'AUSTRIAN',AZE:'AZERBAIJANI',BHR:'BAHRAINI',BGD:'BANGLADESHI',BLR:'BELARUSIAN',BEL:'BELGIAN',BOL:'BOLIVIAN',BIH:'BOSNIAN',BRA:'BRAZILIAN',GBR:'BRITISH',BGR:'BULGARIAN',KHM:'CAMBODIAN',CMR:'CAMEROONIAN',CAN:'CANADIAN',CHL:'CHILEAN',CHN:'CHINESE',COL:'COLOMBIAN',HRV:'CROATIAN',CUB:'CUBAN',CYP:'CYPRIOT',CZE:'CZECH',DNK:'DANISH',NLD:'DUTCH',ECU:'ECUADORIAN',EGY:'EGYPTIAN',ARE:'EMIRATI',EST:'ESTONIAN',ETH:'ETHIOPIAN',FJI:'FIJIAN',PHL:'FILIPINO',FIN:'FINNISH',FRA:'FRENCH',GEO:'GEORGIAN',DEU:'GERMAN',GHA:'GHANAIAN',GRC:'GREEK',HUN:'HUNGARIAN',ISL:'ICELANDIC',IND:'INDIAN',IDN:'INDONESIAN',IRN:'IRANIAN',IRQ:'IRAQI',IRL:'IRISH',ISR:'ISRAELI',ITA:'ITALIAN',JAM:'JAMAICAN',JPN:'JAPANESE',JOR:'JORDANIAN',KAZ:'KAZAKH',KEN:'KENYAN',KOR:'KOREAN',PRK:'KOREAN',KWT:'KUWAITI',LAO:'LAO',LVA:'LATVIAN',LBN:'LEBANESE',LBR:'LIBERIAN',LTU:'LITHUANIAN',MDG:'MALAGASY',MYS:'MALAYSIAN',MDV:'MALDIVIAN',MLT:'MALTESE',MEX:'MEXICAN',MNG:'MONGOLIAN',MAR:'MOROCCAN',MOZ:'MOZAMBICAN',MMR:'MYANMAR',NPL:'NEPALESE',NZL:'NEW ZEALANDER',NGA:'NIGERIAN',NOR:'NORWEGIAN',OMN:'OMANI',PAK:'PAKISTANI',PAN:'PANAMANIAN',PER:'PERUVIAN',POL:'POLISH',PRT:'PORTUGUESE',QAT:'QATARI',ROU:'ROMANIAN',RUS:'RUSSIAN',SAU:'SAUDI',SEN:'SENEGALESE',SRB:'SERBIAN',SGP:'SINGAPOREAN',SVK:'SLOVAK',SVN:'SLOVENIAN',ZAF:'SOUTH AFRICAN',ESP:'SPANISH',LKA:'SRI LANKAN',SDN:'SUDANESE',SWE:'SWEDISH',CHE:'SWISS',SYR:'SYRIAN',TWN:'TAIWANESE',TZA:'TANZANIAN',THA:'THAI',TUN:'TUNISIAN',TUR:'TURKISH',UGA:'UGANDAN',UKR:'UKRAINIAN',URY:'URUGUAYAN',UZB:'UZBEK',VEN:'VENEZUELAN',VNM:'VIETNAMESE',YEM:'YEMENI',ZMB:'ZAMBIAN',ZWE:'ZIMBABWEAN'};
  const NATIONALITY_ALIASES={THAILAND:'THAI',PHILIPPINES:'FILIPINO','UNITED STATES':'AMERICAN','UNITED STATES OF AMERICA':'AMERICAN','UNITED KINGDOM':'BRITISH',ENGLAND:'BRITISH',VIETNAM:'VIETNAMESE',INDONESIA:'INDONESIAN',INDIA:'INDIAN',CHINA:'CHINESE',MYANMAR:'MYANMAR',BURMA:'MYANMAR','SOUTH KOREA':'KOREAN','REPUBLIC OF KOREA':'KOREAN',RUSSIA:'RUSSIAN',UKRAINE:'UKRAINIAN'};
  const nationalityChoice=value=>{const raw=upper(value).replace(/[^A-Z ]/g,'').trim();if(NATIONALITIES[raw])return NATIONALITIES[raw];if(NATIONALITY_ALIASES[raw])return NATIONALITY_ALIASES[raw];if(Object.values(NATIONALITIES).includes(raw))return raw;const alias=Object.keys(NATIONALITY_ALIASES).find(value=>raw.includes(value));return alias?NATIONALITY_ALIASES[alias]:raw;};
  const passportTitle=sex=>sex==='M'?'MR.':sex==='F'?'MS.':'';
  const passportName=(given,surname,sex,middle='')=>clean([passportTitle(sex),clean(given),clean(middle),clean(surname)].filter(Boolean).join(' '));
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
  function printedPassport(text){
    const lines=String(text).split(/\r?\n/).map(line=>upper(line)).filter(Boolean);
    const anyLabel=/(?:SURNAME|FAMILY NAME|GIVEN NAMES?|FIRST NAMES?|MIDDLE NAME|NATIONALITY|SEX|GENDER|PASSPORT(?: NO)?|DOCUMENT NO|DATE OF BIRTH|BIRTH DATE|DOB|DATE OF EXPIRY|EXPIRY DATE|EXPIRES)/;
    const read=(labels,pattern=/^[A-Z][A-Z .,'/-]{0,60}$/)=>{
      const label=new RegExp(`(?:${labels})`);
      for(let index=0;index<lines.length;index++){
        const match=label.exec(lines[index]);if(!match)continue;
        const tail=clean(lines[index].slice(match.index+match[0].length).replace(/^\s*[:#/-]+\s*/,''));
        if(tail&&!anyLabel.test(tail)&&pattern.test(tail))return tail;
        for(let offset=1;offset<=2&&index+offset<lines.length;offset++){
          const candidate=clean(lines[index+offset].replace(/^\s*[:#/-]+\s*/,''));
          if(anyLabel.test(candidate))break;
          if(pattern.test(candidate))return candidate;
        }
      }
      return '';
    };
    const given=read('GIVEN(?: NAMES?)?|FIRST(?: NAMES?)?'),middle=read('MIDDLE(?: NAME)?'),surname=read('SURNAME|FAMILY NAME');
    const sexText=read('SEX|GENDER',/^(?:MALE|FEMALE|M|F)$/),sex=/^M(?:ALE)?$/.test(sexText)?'M':/^F(?:EMALE)?$/.test(sexText)?'F':'';
    return {given,middle,surname,sex,nationality:nationalityChoice(read('NATIONALITY')),passport:upper(read('PASSPORT(?: NO)?|DOCUMENT NO',/^[A-Z0-9]{6,14}$/)).replace(/\s/g,'')};
  }
  const noisyMrzName=value=>/([A-Z])\1{5,}/.test(value)||/[LK]{8,}/.test(value)||String(value||'').length>70;
  function mrzPassport(text){
    const lines=String(text).split(/\r?\n/).map(line=>upper(line).replace(/\s/g,'').replace(/[^A-Z0-9<]/g,'')).filter(line=>line.length>=40);
    const first=lines.find(line=>line.startsWith('P<'));if(!first)return null;const index=lines.indexOf(first),second=lines[index+1];if(!second||second.length<28)return null;
    const names=first.slice(5).split('<<'),surname=clean(names[0].replace(/</g,' ')),given=clean((names[1]||'').replace(/</g,' '));
    const passport=second.slice(0,9).replace(/</g,''),nationality=nationalityChoice(second.slice(10,13).replace(/</g,'')),birthRaw=second.slice(13,19),sex=['M','F'].includes(second[20])?second[20]:'',expiryRaw=second.slice(21,27);
    const checks=[validMrz(second.slice(0,9),second[9]),validMrz(birthRaw,second[19]),validMrz(expiryRaw,second[27])];
    const nameWithoutTitle=clean([given,surname].filter(Boolean).join(' '));
    return {fields:{name:passportName(given,surname,sex)||nameWithoutTitle,passport,nationality,dob:parseDate(birthRaw,{birth:true}),passportExpiry:parseDate(expiryRaw)},given,surname,sex,nameWithoutTitle,nameNeedsTitle:!sex,checks,confidence:checks.filter(Boolean).length===3?99:78};
  }
  function extractPassport(text,ocrConfidence=100){
    const normalized=upper(text),printed=printedPassport(text),mrz=mrzPassport(text),warnings=[];
    const mrzName=mrz?.nameWithoutTitle||'',mrzNameNoisy=noisyMrzName(mrzName),useMrzGiven=printed.given&&printed.given.length<3&&mrz?.given&&!noisyMrzName(mrz.given),useMrzSurname=printed.surname&&printed.surname.length<3&&mrz?.surname&&!noisyMrzName(mrz.surname),given=useMrzGiven?mrz.given:printed.given,surname=useMrzSurname?mrz.surname:printed.surname;
    const printedName=clean([given,printed.middle,surname].filter(Boolean).join(' '));
    if(mrzNameNoisy)warnings.push('MRZ name contains repeated OCR characters; used the printed name fields instead');
    if(useMrzGiven||useMrzSurname)warnings.push('A short printed name field was unclear; the matching MRZ field was used to correct it');
    const sex=printed.sex||mrz?.sex||'',nameWithoutTitle=printedName||(!mrzNameNoisy?mrzName:'')||labeled(normalized,'NAME','[A-Z][A-Z ]{3,50}');
    if(printedName&&mrzName&&!mrzNameNoisy&&upper(printedName)!==upper(mrzName))warnings.push('Printed name and MRZ name differ; the printed Surname / Given names / Middle name fields were used');
    const printedFullName=printedName?passportName(given,surname,sex,printed.middle):'';
    return {confidence:Math.min(ocrConfidence,mrz?.confidence||70),machineChecks:mrz?.checks||[],sex,nameWithoutTitle,nameNeedsTitle:!sex,nameSource:printedName?'printed':mrzName&&!mrzNameNoisy?'mrz':'fallback',printedFieldsDetected:{given:Boolean(printed.given),middle:Boolean(printed.middle),surname:Boolean(printed.surname)},extractionWarnings:warnings,fields:{
      name:printedFullName||(!mrzNameNoisy?mrz?.fields.name:'')||nameWithoutTitle,
      passport:printed.passport||mrz?.fields.passport||upper(labeled(normalized,'PASSPORT(?: NO)?|DOCUMENT NO','[A-Z0-9]{6,14}')).replace(/\s/g,''),
      nationality:printed.nationality||mrz?.fields.nationality||nationalityChoice(labeled(normalized,'NATIONALITY','[A-Z ]{3,30}')),
      dob:mrz?.fields.dob||parseDate(labeled(normalized,'DATE OF BIRTH|BIRTH DATE|DOB','[0-9A-Z .\\-/]{6,20}'),{birth:true}),
      passportExpiry:mrz?.fields.passportExpiry||parseDate(labeled(normalized,'DATE OF EXPIRY|EXPIRY DATE|EXPIRES','[0-9A-Z .\\-/]{6,20}'))
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
  async function preparePassportNameArea(file){
    if(typeof createImageBitmap!=='function')return file;
    const bitmap=await createImageBitmap(file),sourceX=0,sourceY=Math.round(bitmap.height*.08),sourceWidth=Math.round(bitmap.width*.58),sourceHeight=Math.round(bitmap.height*.56),scale=Math.min(4,Math.max(2.5,1600/sourceWidth)),canvas=document.createElement('canvas');
    canvas.width=Math.round(sourceWidth*scale);canvas.height=Math.round(sourceHeight*scale);
    const context=canvas.getContext('2d',{willReadFrequently:true});context.filter='grayscale(1) contrast(1.45)';context.drawImage(bitmap,sourceX,sourceY,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);bitmap.close?.();
    return canvas;
  }
  async function preparePhilippineNameFields(file){
    if(typeof createImageBitmap!=='function')return [];
    // Philippine ePassport identity fields are stacked at the left of the data page.
    // Crop the value line only so the portrait, labels and adjacent fields cannot
    // be mistaken for a part of the person's name.
    const bitmap=await createImageBitmap(file),specs=[['surname',.325,.252,.25,.047],['given',.325,.333,.25,.047],['middle',.325,.413,.25,.05]],fields=[];
    for(const [key,x,y,width,height] of specs){
      const sourceX=Math.round(bitmap.width*x),sourceY=Math.round(bitmap.height*y),sourceWidth=Math.round(bitmap.width*width),sourceHeight=Math.round(bitmap.height*height),scale=Math.min(6,Math.max(3,1500/sourceWidth)),canvas=document.createElement('canvas');
      canvas.width=Math.round(sourceWidth*scale);canvas.height=Math.round(sourceHeight*scale);
      const context=canvas.getContext('2d',{willReadFrequently:true});context.filter='grayscale(1) contrast(1.4)';context.drawImage(bitmap,sourceX,sourceY,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);fields.push([key,canvas]);
    }
    bitmap.close?.();return fields;
  }
  async function recognize(image,onProgress,parameters){const api=await tesseract(),worker=await api.createWorker('eng',1,{logger:message=>{if(message.status==='recognizing text')onProgress?.(Math.round((message.progress||0)*100));}});try{if(parameters)await worker.setParameters(parameters);const output=await worker.recognize(image);return {text:output.data.text||'',confidence:Number(output.data.confidence||0)};}finally{await worker.terminate();}}
  async function recognizePhilippineNameFields(file,onProgress){
    const areas=await preparePhilippineNameFields(file);if(!areas.length)return {text:'',confidence:0};
    const api=await tesseract(),values=[],confidences=[],worker=await api.createWorker('eng');
    try{
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ .-'"});
      for(let index=0;index<areas.length;index++){
        const [key,canvas]=areas[index],output=await worker.recognize(canvas),value=clean(upper(output.data.text).replace(/[^A-Z .'-]/g,' ')),labels={surname:'SURNAME',given:'GIVEN NAMES',middle:'MIDDLE NAME'};values.push(`${labels[key]}: ${value}`);confidences.push(Number(output.data.confidence||0));onProgress?.(Math.round(((index+1)/areas.length)*100));
      }
    }finally{await worker.terminate();}
    return {text:values.join('\n'),confidence:confidences.reduce((sum,value)=>sum+value,0)/confidences.length};
  }
  async function readPdf(file,onProgress){
    const pdfjs=await pdfLibrary(),pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;let text='',confidence=100;const images=[];
    for(let pageNumber=1;pageNumber<=Math.min(pdf.numPages,3);pageNumber++){const page=await pdf.getPage(pageNumber),content=await page.getTextContent();text+='\n'+content.items.map(item=>item.str).join(' ');if(clean(text).length<80){const viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;images.push(canvas);}}
    if(clean(text).length<80&&images.length){text='';const values=[];for(let index=0;index<images.length;index++){const result=await recognize(images[index],progress=>onProgress?.(Math.round(((index+progress/100)/images.length)*100)));text+='\n'+result.text;values.push(result.confidence);}confidence=values.reduce((sum,value)=>sum+value,0)/values.length;}
    return {text,confidence};
  }
  async function read(file,type,onProgress){
    if(!file)throw Error('Please choose a document.');if(file.size>MAX_FILE_BYTES)throw Error('File is larger than 30 MB.');
    const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),image=/^image\//.test(file.type)||/\.(png|jpe?g|webp|bmp)$/i.test(file.name);if(!pdf&&!image)throw Error('Use a PDF, JPG, PNG, WebP or BMP file.');
    onProgress?.(0);let source;
    if(pdf)source=await readPdf(file,onProgress);
    else if(type==='passport'){
      const full=await recognize(file,progress=>onProgress?.(Math.round(progress*.35)));
      if(/(?:PHILIPPINES|FILIPINO|PHL)/i.test(full.text)){
        const fields=await recognizePhilippineNameFields(file,progress=>onProgress?.(35+Math.round(progress*.65)));source={text:`${fields.text}\n${full.text}`,confidence:Math.max(full.confidence,fields.confidence)};
      }else{
        const nameArea=await recognize(await preparePassportNameArea(file),progress=>onProgress?.(35+Math.round(progress*.65)),{tessedit_pageseg_mode:'6'});source={text:`${nameArea.text}\n${full.text}`,confidence:Math.max(full.confidence,nameArea.confidence)};
      }
    }else source=await recognize(file,onProgress);
    const result=extractFromText(type,source.text,source.confidence);result.fileName=file.name;result.checkedAt=new Date().toISOString();return result;
  }
  const daysUntil=value=>value?Math.ceil((new Date(`${value}T00:00:00Z`)-new Date())/86400000):null;
  function applyToPerson(person,result){
    const next=structuredClone(person||{}),changes=[],conflicts=[],warnings=[];next.documentChecks={...(next.documentChecks||{})};
    const assign=(key,value,label)=>{if(!value)return;if(!clean(next[key])){next[key]=value;changes.push(label);}else if(upper(next[key])!==upper(value))conflicts.push(`${label}: ข้อมูลเดิม “${next[key]}” ต่างจากไฟล์ “${value}”`);};
    if(result.type==='flightTicket'){
      const flight=result.flight||{},hasFlight=Object.values(flight).some(Boolean);if(hasFlight){if(!Array.isArray(next.flights))next.flights=[];const matching=next.flights.find(item=>(flight.number&&upper(item.number)===upper(flight.number))&&(flight.date?upper(item.date)===upper(flight.date):true));if(matching){for(const [key,value] of Object.entries(flight)){if(value&&!matching[key])matching[key]=value;else if(value&&matching[key]&&upper(matching[key])!==upper(value))conflicts.push(`Flight ${key}: ข้อมูลเดิม “${matching[key]}” ต่างจากไฟล์ “${value}”`);}}else next.flights.push(flight);changes.push('Flight details');}else warnings.push('ไม่พบข้อมูลเที่ยวบินที่อ่านได้');
    }else{
      const labels={name:'Name - Surname',passport:'Passport',passportExpiry:'Passport expiry',nationality:'Nationality',dob:'Date of birth',seamanBook:'Seaman book',seamanBookExpiry:'Seaman book expiry'};
      for(const [key,value] of Object.entries(result.fields||{})){if(key==='name'&&result.nameNeedsTitle)continue;assign(key,value,labels[key]||key);}
      const expiry=result.type==='passport'?result.fields?.passportExpiry:result.fields?.seamanBookExpiry,remaining=daysUntil(expiry);
      if(remaining!==null&&remaining<0)warnings.push(`${result.type==='passport'?'Passport':'Seaman book'} หมดอายุแล้ว`);
      else if(remaining!==null&&remaining<=SIX_MONTHS_DAYS)warnings.push(`${result.type==='passport'?'Passport':'Seaman book'} เหลืออายุไม่เกิน 6 เดือน (${remaining} วัน)`);
      if(!expiry)warnings.push('ไม่พบวันหมดอายุ กรุณาตรวจเอกสาร');
      if(result.type==='passport'&&!result.fields?.passport)warnings.push('ไม่พบเลข Passport');
      if(result.type==='seamanBook'&&!result.fields?.seamanBook)warnings.push('ไม่พบเลข Seaman book');
    }
    warnings.push(...(result.extractionWarnings||[]));
    if(result.nameNeedsTitle)warnings.push('อ่านเพศจาก Passport ไม่ชัดเจน กรุณาเลือก MR. หรือ MS. ก่อนกรอกชื่อ');
    if(result.confidence<80)warnings.push(`ความมั่นใจในการอ่าน ${Math.round(result.confidence)}% กรุณาตรวจทุกช่อง`);
    if(result.machineChecks?.length&&result.machineChecks.some(value=>!value))warnings.push('MRZ check digit บางช่องไม่ตรง กรุณาตรวจต้นฉบับ');
    warnings.push(...conflicts);
    const status=warnings.length?'warning':'ok';next.documentChecks[result.type]={fileName:result.fileName||'',confidence:Math.round(result.confidence||0),checkedAt:result.checkedAt||new Date().toISOString(),status,messages:warnings,changes,expiry:result.type==='passport'?result.fields?.passportExpiry:result.type==='seamanBook'?result.fields?.seamanBookExpiry:''};
    return {person:next,changes,conflicts,warnings,status};
  }
  window.HarborFlowDocumentImport={read,extractFromText,applyToPerson,parseDate,daysUntil,nationalityChoice,passportName,limits:{maxFileBytes:MAX_FILE_BYTES,maxBatchFiles:20}};
})();
