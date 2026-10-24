/* Local-only document reading for Crew Change. Files never leave this browser. */
(() => {
  const PDF_JS='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
  const PDF_WORKER='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const TESSERACT_JS='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const SIX_MONTHS_DAYS=183,MAX_FILE_BYTES=30*1024*1024;
  let pdfPromise,tesseractPromise,flightCodePromise,flightCodeData={airlines:[],airports:[]};
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const upper=value=>clean(value).toUpperCase();
  function setFlightCodeData(value){flightCodeData={airlines:Array.isArray(value?.airlines)?value.airlines:[],airports:Array.isArray(value?.airports)?value.airports:[]};return flightCodeData;}
  async function loadFlightCodeData(){
    if(flightCodeData.airports.length||flightCodePromise)return flightCodePromise||flightCodeData;
    if(typeof fetch!=='function')return flightCodeData;
    flightCodePromise=fetch('/data/flight-codes.json',{cache:'no-cache'}).then(response=>response.ok?response.json():Promise.reject(Error('Flight code list unavailable'))).then(setFlightCodeData).catch(()=>flightCodeData);return flightCodePromise;
  }
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
  function dateNearLabel(text,label,{birth=false}={}){
    const lines=String(text).split(/\r?\n/),date=/\b(?:\d{1,2}[.\-/ ]\d{1,2}[.\-/ ]\d{4}|\d{1,2}[.\-/ ]*[A-Z]{3,9}[.\-/ ]*\d{4})\b/i;
    for(let index=0;index<lines.length;index++){
      if(!label.test(lines[index]))continue;
      for(let offset=0;offset<=2&&index+offset<lines.length;offset++){
        const match=lines[index+offset].match(date),value=match&&parseDate(match[0],{birth});if(value)return value;
      }
    }
    return '';
  }
  const labeled=(text,labels,pattern='[A-Z0-9][A-Z0-9 .\\-/]{2,30}')=>{
    const found=text.match(new RegExp(`(?:${labels})\\s*(?:NO\\.?|NUMBER|DATE)?\\s*[:#-]?\\s*(${pattern})`,'i'));
    return clean(found?.[1]||'');
  };
  const mrzValue=char=>char==='<'?0:/\d/.test(char)?Number(char):char.charCodeAt(0)-55;
  function validMrz(value,digit){if(!/\d/.test(digit||''))return false;const weights=[7,3,1];return [...value].reduce((sum,char,index)=>sum+mrzValue(char)*weights[index%3],0)%10===Number(digit);}
  function repairMrzDocumentNumber(value,digit){
    if(validMrz(value,digit))return value;
    const swaps={2:'Z',Z:'2',0:'O',O:'0',1:'I',I:'1',5:'S',S:'5',6:'G',G:'6',8:'B',B:'8'},matches=[];
    for(let index=0;index<value.length;index++){const replacement=swaps[value[index]];if(!replacement)continue;const candidate=value.slice(0,index)+replacement+value.slice(index+1);if(validMrz(candidate,digit))matches.push(candidate);}
    const passportPattern=matches.filter(candidate=>/^[A-Z]\d{7}</.test(candidate));return passportPattern.length===1?passportPattern[0]:matches.length===1?matches[0]:value;
  }
  function restoreMrzNameSpacing(text,value,maxDistance=1){
    const target=upper(value).replace(/[^A-Z]/g,'');if(!target)return '';
    const near=(left,right)=>{if(Math.abs(left.length-right.length)>1)return false;let a=0,b=0,differences=0;while(a<left.length&&b<right.length){if(left[a]===right[b]){a++;b++;continue;}if(++differences>1)return false;if(left.length>right.length)a++;else if(right.length>left.length)b++;else{a++;b++;}}return differences+(a<left.length||b<right.length?1:0)<=1;};
    for(const line of String(text).split(/\r?\n/)){
      const words=upper(line).match(/[A-Z]{2,}/g)||[];
      for(let start=0;start<words.length;start++)for(let end=start+2;end<=Math.min(words.length,start+5);end++){const candidate=words.slice(start,end).join('');if(candidate===target||target.length>=8&&near(candidate,target)||target.length>=12&&maxDistance>1&&editDistance(candidate,target)<=maxDistance)return words.slice(start,end).join(' ');}
    }
    return clean(value);
  }
  function printedPassport(text){
    const lines=String(text).split(/\r?\n/).map(line=>upper(line)).filter(Boolean);
    const anyLabel=/(?:SURNAME|FAMILY NAME|GIVEN(?: NAME(?:\(S\)|S)?)?|FIRST NAMES?|MIDDLE NAME|NATIONALITY|SEX|GENDER|PASSPORT(?: NO)?|DOCUMENT NO|DATE OF BIRTH|BIRTH DATE|DOB|DATE OF EXPIRY|EXPIRY DATE|EXPIRES)/;
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
    const given=read('GIVEN(?: NAME(?:\\(S\\)|S)?)?|FIRST(?: NAMES?)?'),middle=read('MIDDLE(?: NAME)?'),surname=read('SURNAME|FAMILY NAME');
    const sexText=read('SEX|GENDER',/^(?:MALE|FEMALE|M|F)$/),sex=/^M(?:ALE)?$/.test(sexText)?'M':/^F(?:EMALE)?$/.test(sexText)?'F':'';
    return {given,middle,surname,sex,nationality:nationalityChoice(read('NATIONALITY')),passport:upper(read('PASSPORT(?: NO)?|DOCUMENT NO',/^[A-Z0-9]{6,14}$/)).replace(/\s/g,'')};
  }
  const noisyMrzName=value=>/([A-Z])\1{5,}/.test(value)||/[LK]{8,}/.test(value)||String(value||'').length>70;
  function editDistance(left,right){
    const previous=Array.from({length:right.length+1},(_,index)=>index);for(let row=1;row<=left.length;row++){let diagonal=previous[0];previous[0]=row;for(let column=1;column<=right.length;column++){const above=previous[column],cost=left[row-1]===right[column-1]?0:1;previous[column]=Math.min(previous[column]+1,previous[column-1]+1,diagonal+cost);diagonal=above;}}return previous[right.length];
  }
  function repairIndianNameFromFileName(name,fileName,sex){
    const current=upper(name).replace(/^(?:MR|MS|MRS|MISS)\.?\s+/,'').replace(/[^A-Z]/g,''),tokens=upper(String(fileName||'').replace(/\.[^.]+$/,'')).split(/[^A-Z]+/).filter(token=>token&&!/^(?:MR|MS|MRS|MISS|PASSPORT|PASS|INDIA|INDIAN|COPY|SCAN)$/.test(token));
    if(tokens.length<2)return name;const hint=tokens.join(''),surname=tokens.at(-1),currentWords=upper(name).replace(/^(?:MR|MS|MRS|MISS)\.?\s+/,'').split(/\s+/);if(currentWords.at(-1)!==surname)return name;
    const tolerance=Math.max(2,Math.ceil(hint.length*.1));return editDistance(current,hint)<=tolerance?passportName(tokens.slice(0,-1).join(' '),surname,sex):name;
  }
  function mrzPassport(text){
    const lines=String(text).split(/\r?\n/).map(line=>upper(line).replace(/\s/g,'').replace(/[^A-Z0-9<]/g,'')).filter(line=>line.length>=40);
    const first=lines.find(line=>line.startsWith('P<'));if(!first)return null;const index=lines.indexOf(first),second=lines[index+1];if(!second||second.length<28)return null;
    const names=first.slice(5).split('<<'),surname=clean(names[0].replace(/</g,' ')),given=clean((names[1]||'').replace(/(?:<|[CLK]){5,}.*$/,'').replace(/</g,' '));
    const rawPassport=second.slice(0,9),passport=repairMrzDocumentNumber(rawPassport,second[9]).replace(/</g,''),nationality=nationalityChoice(second.slice(10,13).replace(/</g,'')),birthRaw=second.slice(13,19),sex=['M','F'].includes(second[20])?second[20]:'',expiryRaw=second.slice(21,27);
    const checks=[validMrz(passport.padEnd(9,'<'),second[9]),validMrz(birthRaw,second[19]),validMrz(expiryRaw,second[27])];
    const nameWithoutTitle=clean([given,surname].filter(Boolean).join(' '));
    return {fields:{name:passportName(given,surname,sex)||nameWithoutTitle,passport,nationality,dob:parseDate(birthRaw,{birth:true}),passportExpiry:parseDate(expiryRaw)},given,surname,sex,nameWithoutTitle,nameNeedsTitle:!sex,checks,confidence:checks.filter(Boolean).length===3?99:78};
  }
  function extractPassport(text,ocrConfidence=100,fileName=''){
    const normalized=upper(text),printed=printedPassport(text),mrz=mrzPassport(text),warnings=[];
    const indian=/(?:REPUBLIC OF INDIA|\bINDIAN\b|P<IND)/.test(normalized),mrzGiven=restoreMrzNameSpacing(text,mrz?.given||'',indian?2:1),mrzName=clean([mrzGiven,mrz?.surname].filter(Boolean).join(' ')),mrzNameNoisy=noisyMrzName(mrzName),useMrzGiven=printed.given&&printed.given.length<3&&mrzGiven&&!noisyMrzName(mrzGiven),useMrzSurname=printed.surname&&printed.surname.length<3&&mrz?.surname&&!noisyMrzName(mrz.surname),given=useMrzGiven?mrzGiven:printed.given||indian&&!mrzNameNoisy&&mrzGiven||'',surname=useMrzSurname?mrz.surname:printed.surname||indian&&mrz?.surname||'';
    const printedName=clean([given,printed.middle,surname].filter(Boolean).join(' '));
    if(mrzNameNoisy)warnings.push('MRZ name contains repeated OCR characters; used the printed name fields instead');
    if(useMrzGiven||useMrzSurname)warnings.push('A short printed name field was unclear; the matching MRZ field was used to correct it');
    const sex=printed.sex||mrz?.sex||'',nameWithoutTitle=printedName||(!mrzNameNoisy?mrzName:'')||labeled(normalized,'NAME','[A-Z][A-Z ]{3,50}');
    if(printedName&&mrzName&&!mrzNameNoisy&&upper(printedName)!==upper(mrzName))warnings.push('Printed name and MRZ name differ; the printed Surname / Given names / Middle name fields were used');
    const printedFullName=printedName?passportName(given,surname,sex,printed.middle):'',extractedName=printedFullName||(!mrzNameNoisy?passportName(mrzGiven,mrz?.surname||'',sex):'')||nameWithoutTitle,repairedName=/(?:REPUBLIC OF INDIA|\bINDIAN\b|P<IND)/.test(normalized)?repairIndianNameFromFileName(extractedName,fileName,sex):extractedName;
    if(repairedName!==extractedName)warnings.push('MRZ name separators were unclear; spacing was restored from the matching document filename');
    return {confidence:Math.min(ocrConfidence,mrz?.confidence||70),machineChecks:mrz?.checks||[],sex,nameWithoutTitle,nameNeedsTitle:!sex,nameSource:printedName?'printed':mrzName&&!mrzNameNoisy?'mrz':'fallback',printedFieldsDetected:{given:Boolean(printed.given),middle:Boolean(printed.middle),surname:Boolean(printed.surname)},extractionWarnings:warnings,fields:{
      name:repairedName,
      passport:printed.passport||mrz?.fields.passport||upper(labeled(normalized,'PASSPORT(?: NO)?|DOCUMENT NO','[A-Z0-9]{6,14}')).replace(/\s/g,''),
      nationality:printed.nationality||mrz?.fields.nationality||nationalityChoice(labeled(normalized,'NATIONALITY','[A-Z ]{3,30}')),
      dob:mrz?.checks[1]?mrz.fields.dob:dateNearLabel(text,/DATE OF BIRTH|BIRTH DATE|\bDOB\b/i,{birth:true})||mrz?.fields.dob||parseDate(labeled(normalized,'DATE OF BIRTH|BIRTH DATE|DOB','[0-9A-Z .\\-/]{6,20}'),{birth:true}),
      passportExpiry:mrz?.fields.passportExpiry||parseDate(labeled(normalized,'DATE OF EXPIRY|EXPIRY DATE|EXPIRES','[0-9A-Z .\\-/]{6,20}'))
    }};
  }
  function filipinoSeamanName(value){
    const source=upper(value).replace(/[^A-Z ,.'-]/g,' ').replace(/\s+/g,' ').trim();if(!source)return '';
    if(source.includes(',')){
      const [surname,...remainder]=source.split(','),tokens=clean(remainder.join(' ')).split(' ').filter(Boolean);if(!surname||!tokens.length)return '';
      if(tokens.length>1)tokens.pop();return clean([...tokens,clean(surname)].filter(Boolean).join(' '));
    }
    const tokens=source.split(' ').filter(Boolean);if(tokens.length<2)return '';
    if(tokens.length===2)return tokens.join(' ');
    const surname=tokens.pop();tokens.pop();return clean([...tokens,surname].filter(Boolean).join(' '));
  }
  function printedSeamanName(text){
    const lines=String(text).split(/\r?\n/).map(line=>upper(line)).filter(Boolean),blocked=/(?:DATE OF|PLACE OF|HEIGHT|WEIGHT|EYES|HAIR|DISTINGUISHING|VALID UNTIL|SEX|MARITIME|REPUBLIC|SRB NO)/;
    for(let index=0;index<lines.length;index++){
      const match=lines[index].match(/(?:SEAMAN NAME|NAME(?: \([^)]*\))?)\s*[:#-]?\s*(.*)$/);if(!match)continue;
      const candidates=[match[1],lines[index+1]||''];
      for(const candidate of candidates){const cleanCandidate=clean(candidate);if(cleanCandidate&&!blocked.test(cleanCandidate)&&/[A-Z]{2}/.test(cleanCandidate)){const formatted=filipinoSeamanName(cleanCandidate);if(formatted)return formatted;}}
    }
    return '';
  }
  function indianSeamanName(text){
    const lines=String(text).split(/\r?\n/),labelIndex=lines.findIndex(line=>/NAME OF SEAFARER/i.test(line));if(labelIndex<0)return '';
    for(let offset=1;offset<=3&&labelIndex+offset<lines.length;offset++){
      const line=lines[labelIndex+offset],match=line.match(/^\W*([A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})(?=\s+(?:[a-z]|\d)|[.,]|$)/),tokens=clean(match?.[1]||'').split(' ').filter(Boolean);
      if(tokens.length>=2&&!tokens.some(token=>/(?:DATE|PLACE|MUMBAI|GOVERNMENT|NATIONALITY|PORT|ISSUE)/.test(token)))return clean([...tokens.slice(1),tokens[0]].join(' '));
    }
    return '';
  }
  function latestDocumentDate(text){
    const dates=[...String(text).matchAll(/\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b/g)].map(match=>parseDate(match[0])).filter(Boolean).sort();
    return dates.at(-1)||'';
  }
  function extractSeaman(text,ocrConfidence=100){
    const normalized=upper(text),isIndian=/(?:GOVERNMENT OF INDIA|REPUBLIC OF INDIA|\bINDIAN\b)/.test(normalized),isPhilippine=!isIndian&&/(?:REPUBLIC OF THE PHILIPPINES|\bPHILIPPINES\b|\bFILIPINO\b|MARITIME INDUSTRY AUTHORITY|\bSRB\b)/.test(normalized),labelledBook=upper(labeled(normalized,'SRB|SEAMAN(?: BOOK)?|SEAFARER(?: BOOK)?|CDC|BOOK NO','[A-Z0-9-]{5,18}')).replace(/[^A-Z0-9]/g,''),indianText=isIndian?normalized.slice(Math.max(0,normalized.indexOf('GOVERNMENT OF INDIA'))):'',indianBook=indianText.match(/\bCDC\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z]{3})\s*(\d{6})\b/)?.slice(1).join('')||indianText.match(/\b[A-Z]{3}\s*\d{6}\b/)?.[0].replace(/\s/g,'')||'',philippineBooks=isPhilippine?[...normalized.matchAll(/\b[A-Z]\s*\d(?:[\s-]*\d){6}\b/g)].map(match=>upper(match[0]).replace(/[^A-Z0-9]/g,'')):[],renewal=isIndian&&/RENEWAL STICKER/.test(normalized);
    return {confidence:Math.min(ocrConfidence,75),machineChecks:[],matchStrategy:isPhilippine?'given-surname':'exact',extractionWarnings:renewal?['CDC renewal sticker: confirm the new expiry date from the original document.']:[],fields:{
      name:isPhilippine?printedSeamanName(text):isIndian?indianSeamanName(text):labeled(normalized,'NAME|GIVEN NAMES?|SURNAME',"[A-Z][A-Z .,'/-]{3,50}"),
      seamanBook:isIndian?indianBook:labelledBook||philippineBooks.at(-1)||'',
      seamanBookExpiry:isIndian?(renewal?'':latestDocumentDate(text)):parseDate(labeled(normalized,'DATE OF EXPIRY|EXPIRY DATE|VALID UNTIL|EXPIRES','[0-9A-Z .\\-/]{6,20}'))
    }};
  }
  const MONTHS={JANUARY:'JAN',FEBRUARY:'FEB',MARCH:'MAR',APRIL:'APR',MAY:'MAY',JUNE:'JUN',JULY:'JUL',AUGUST:'AUG',SEPTEMBER:'SEP',OCTOBER:'OCT',NOVEMBER:'NOV',DECEMBER:'DEC'};
  const cleanTicketName=value=>{
    const source=clean(upper(value).replace(/\b(?:MR|MRS|MS|MISS|CAPT|CAPTAIN)\b\.?/g,' '));if(!source)return '';
    if(source.includes('/')){const [surname,...given]=source.split('/'),givenNames=clean(given.join(' ').replace(/[^A-Z .'-]/g,' '));return clean(`${givenNames} ${clean(surname.replace(/[^A-Z .'-]/g,' '))}`);}
    if(source.includes(',')){const [surname,...given]=source.split(','),givenNames=clean(given.join(' ').replace(/[^A-Z .'-]/g,' '));return clean(`${givenNames} ${clean(surname.replace(/[^A-Z .'-]/g,' '))}`);}
    return clean(source.replace(/[^A-Z .'-]/g,' '));
  };
  const flightLookupText=value=>upper(value).replace(/\bINTL\b/g,'INTERNATIONAL').replace(/\bAIRPORT\b/g,' ').replace(/[^A-Z0-9]+/g,' ').trim();
  function airportCodeFor(value){
    const source=flightLookupText(value),direct=source.match(/(?:^|\s)([A-Z]{3})(?:\s|$)/)?.[1];if(direct&&flightCodeData.airports.some(row=>row[0]===direct))return direct;
    let best='',score=0;for(const row of flightCodeData.airports){const name=flightLookupText(row[1]),city=flightLookupText(row[2]);let candidate=0;if(name&&source.includes(name))candidate=100+name.length;else if(city&&source.includes(city))candidate=50+city.length;if(candidate>score){score=candidate;best=row[0];}}
    return best;
  }
  function airlineCodeFor(value){const source=flightLookupText(value);let best='',score=0;for(const row of flightCodeData.airlines){const names=[row[1],row[2]].map(flightLookupText).filter(Boolean);for(const name of names)if(source.includes(name)&&name.length>score){score=name.length;best=row[0];}}return best;}
  const ticketDate=(day,month)=>`${String(day||'').padStart(2,'0')}${MONTHS[upper(month)]||upper(month).slice(0,3)}`;
  function extractFlight(text,ocrConfidence=100){
    const normalized=upper(text),route=normalized.match(/\b([A-Z]{3})\s*(?:-|TO|→|>)\s*([A-Z]{3})\b/),traveler=normalized.match(/(?:PASSENGER(?: NAME)?|NAME OF PASSENGER|TRAVELL?ER)\s*[:#-]?\s*(.+?)(?=\s+(?:AGENCY|TELEPHONE|BOOKING|FLIGHT|DEPARTURE|ARRIVAL|PNR)\b|\s+\d{1,2}\s+[A-Z]{3,9}\s+\d{4}\b|$)/)?.[1]||'',ticketFor=normalized.match(/\bFOR\s+([A-Z][A-Z ,.'\/-]{3,60}?)(?=\s+(?:GENERAL|TRAVEL|AIRLINE|DATA|$))/)?.[1]||'',name=cleanTicketName(traveler||ticketFor);
    const departure=normalized.match(/\bDEPARTURE\s+(\d{1,2})\s*([A-Z]{3,9})\s*(?:\d{4}\s*)?([012]\d:[0-5]\d)\s+(.+?)(?=\s+TERMINAL\s*:|\s+ARRIVAL\b|\s+DURATION\b)/),arrival=normalized.match(/\bARRIVAL\s+(\d{1,2})\s*([A-Z]{3,9})\s*(?:\d{4}\s*)?([012]\d:[0-5]\d)\s+(.+?)(?=\s+DURATION\b|\s+DISTANCE\b|\s+BOOKING STATUS\b|$)/);
    const labeledNumber=normalized.match(/(?:FLIGHT(?: NO)?|FLT)\s*[:#-]?\s*([A-Z0-9]{2,3})\s*([0-9]{2,4}[A-Z]?)/),airlineHeader=normalized.match(/\b([A-Z][A-Z &.'-]{2,45}(?:AIRLINES?|AIRWAYS?))\s+([A-Z0-9]{2})\s*([0-9]{2,4}[A-Z]?)\b/),fallbackNumber=normalized.match(/\b([A-Z0-9]{2,3})\s+([0-9]{2,4}[A-Z]?)\b/),numberParts=labeledNumber||airlineHeader&&[airlineHeader[0],airlineHeader[2],airlineHeader[3]]||fallbackNumber;
    const dateMatch=normalized.match(/\b\d{1,2}[.\-/ ](?:[A-Z]{3,9}|\d{1,2})[.\-/ ]\d{2,4}\b/),booking=normalized.match(/\b(?:PNR|BOOKING\s*(?:REFERENCE|REF|CODE)\b|RESERVATION CODE)\s*[:#-]?\s*([A-Z0-9]{5,8})\b/)?.[1]||normalized.match(/\b[A-Z0-9]{2}\s*\([^)]*(?:AIRLINES?|AIRWAYS?)[^)]*\)\s*:\s*([A-Z0-9]{5,8})\b/)?.[1]||'';
    const airline=numberParts?.[1]||airlineCodeFor(airlineHeader?.[1]||normalized),number=numberParts?.[2]||'',date=departure?ticketDate(departure[1],departure[2]):dateMatch?upper(dateMatch[0]).replace(/[ .\-/]/g,'').slice(0,5):'',times=[...normalized.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map(match=>match[0]);
    return {confidence:Math.min(ocrConfidence,86),machineChecks:[],fields:{name},flight:{airline,number,date,from:airportCodeFor(departure?.[4]||'')||route?.[1]||'',to:airportCodeFor(arrival?.[4]||'')||route?.[2]||'',departure:departure?.[3]||times[0]||'',arrival:arrival?.[3]||times[1]||'',booking}};
  }
  function extractFromText(type,text,confidence=100,fileName=''){
    const result=type==='passport'?extractPassport(text,confidence,fileName):type==='seamanBook'?extractSeaman(text,confidence):extractFlight(text,confidence);
    result.type=type;result.rawLength=String(text||'').length;return result;
  }
  function documentSignal(type,text,confidence=0){
    const result=extractFromText(type,text,confidence),fields=result.fields||{},number=type==='passport'?fields.passport:type==='seamanBook'?fields.seamanBook:result.flight?.number,markers=(upper(text).match(/\b(?:PASSPORT|SURNAME|GIVEN|PHILIPPINES|FILIPINO|MARITIME|SEAFARER|SRB|INDIA|INDIAN|CDC|VALID|FLIGHT|PNR)\b/g)||[]).length;
    return (fields.name?12:0)+(number?10:0)+(fields.passportExpiry||fields.seamanBookExpiry||result.flight?.date?2:0)+Math.min(markers,10)+Math.min(Number(confidence||0)/25,4);
  }
  function mergeCombinedResults(requestedType,passportResult,seamanResult){
    const primary=requestedType==='seamanBook'?seamanResult:passportResult,secondary=requestedType==='seamanBook'?passportResult:seamanResult,fields={};
    for(const source of [secondary?.fields||{},primary?.fields||{}])for(const [key,value] of Object.entries(source))if(value)fields[key]=value;
    return {...primary,fields,extractionWarnings:[...(passportResult?.extractionWarnings||[]),...(seamanResult?.extractionWarnings||[])]};
  }
  const combinedIdentityRegions=()=>[
    {x:.42,y:.58,width:.44,height:.415},
    {x:.02,y:.58,width:.44,height:.415},
    {x:.48,y:.46,width:.50,height:.53},
    {x:.02,y:.46,width:.50,height:.53}
  ];
  const combinedPassportRegions=()=>[
    {x:0,y:.56,width:.42,height:.42},
    {x:.58,y:.56,width:.42,height:.42},
    {x:0,y:.46,width:.50,height:.53},
    {x:.50,y:.46,width:.50,height:.53}
  ];
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
  function rotateCanvas(source,degrees){
    const sideways=Math.abs(degrees)%180===90,canvas=document.createElement('canvas');canvas.width=sideways?source.height:source.width;canvas.height=sideways?source.width:source.height;const context=canvas.getContext('2d');
    if(degrees===-90){context.translate(0,canvas.height);context.rotate(-Math.PI/2);}else if(degrees===90){context.translate(canvas.width,0);context.rotate(Math.PI/2);}else if(Math.abs(degrees)===180){context.translate(canvas.width,canvas.height);context.rotate(Math.PI);}context.drawImage(source,0,0);return canvas;
  }
  function cropCanvas(source,spec){
    const sourceX=Math.max(0,Math.round(source.width*spec.x)),sourceY=Math.max(0,Math.round(source.height*spec.y)),sourceWidth=Math.min(source.width-sourceX,Math.round(source.width*spec.width)),sourceHeight=Math.min(source.height-sourceY,Math.round(source.height*spec.height)),canvas=document.createElement('canvas');canvas.width=sourceWidth;canvas.height=sourceHeight;canvas.getContext('2d').drawImage(source,sourceX,sourceY,sourceWidth,sourceHeight,0,0,sourceWidth,sourceHeight);return canvas;
  }
  async function recognizeBestOrientation(image,type,onProgress){
    const candidates=[image,rotateCanvas(image,-90),rotateCanvas(image,90),rotateCanvas(image,180)],segment=100/candidates.length;let best=null;
    for(let index=0;index<candidates.length;index++){
      const result=await recognize(candidates[index],progress=>onProgress?.(Math.round(index*segment+progress*segment/100))),score=documentSignal(type,result.text,result.confidence),candidate={canvas:candidates[index],result,score};if(!best||score>best.score)best=candidate;
      if(score>=18)break;
    }
    return best;
  }
  async function recognizePhilippineNameFields(file,onProgress){
    const areas=await preparePhilippineNameFields(file);if(!areas.length)return {text:'',confidence:0};
    const api=await tesseract(),values=[],fields={},confidences=[],worker=await api.createWorker('eng');
    try{
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ .-'"});
      for(let index=0;index<areas.length;index++){
        const [key,canvas]=areas[index],output=await worker.recognize(canvas),value=clean(upper(output.data.text).replace(/[^A-Z .'-]/g,' ')),labels={surname:'SURNAME',given:'GIVEN NAMES',middle:'MIDDLE NAME'};fields[key]=value;values.push(`${labels[key]}: ${value}`);confidences.push(Number(output.data.confidence||0));onProgress?.(Math.round(((index+1)/areas.length)*100));
      }
    }finally{await worker.terminate();}
    return {text:values.join('\n'),fields,confidence:confidences.reduce((sum,value)=>sum+value,0)/confidences.length};
  }
  async function prepareFilipinoSeamanNumberAreas(file){
    if(typeof createImageBitmap!=='function')return [];
    const bitmap=await createImageBitmap(file),specs=[['legacy',.29,.65,.22,.12],['srb',.82,.165,.17,.06]],fields=[];
    for(const [key,x,y,width,height] of specs){
      const sourceX=Math.round(bitmap.width*x),sourceY=Math.round(bitmap.height*y),sourceWidth=Math.round(bitmap.width*width),sourceHeight=Math.round(bitmap.height*height),scale=Math.min(7,Math.max(3,1400/sourceWidth)),canvas=document.createElement('canvas');
      canvas.width=Math.round(sourceWidth*scale);canvas.height=Math.round(sourceHeight*scale);
      const context=canvas.getContext('2d',{willReadFrequently:true});context.filter='grayscale(1) contrast(1.55)';context.drawImage(bitmap,sourceX,sourceY,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);fields.push([key,canvas]);
    }
    bitmap.close?.();return fields;
  }
  async function recognizeFilipinoSeamanNumbers(file,onProgress){
    const areas=await prepareFilipinoSeamanNumberAreas(file);if(!areas.length)return {text:'',confidence:0};
    const api=await tesseract(),values=[],confidences=[],worker=await api.createWorker('eng');
    try{
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
      for(let index=0;index<areas.length;index++){
        const [key,canvas]=areas[index];await worker.setParameters({tessedit_pageseg_mode:key==='legacy'?'6':'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});const output=await worker.recognize(canvas),compact=upper(output.data.text).replace(/[^A-Z0-9]/g,''),number=compact.match(/[A-Z]\d{7}/)?.[0]||'';
        if(number)values.push(`SRB NO: ${number}`);confidences.push(Number(output.data.confidence||0));onProgress?.(Math.round(((index+1)/areas.length)*100));
      }
    }finally{await worker.terminate();}
    return {text:values.join('\n'),confidence:confidences.reduce((sum,value)=>sum+value,0)/Math.max(1,confidences.length)};
  }
  async function prepareFilipinoSeamanNameAreas(file){
    if(typeof createImageBitmap!=='function')return [];
    const bitmap=await createImageBitmap(file),specs=[['legacy-compact',.305,.13,.32,.075],['legacy-full',.305,.19,.32,.075],['srb',.315,.275,.48,.10]],fields=[];
    for(const [key,x,y,width,height] of specs){
      const sourceX=Math.round(bitmap.width*x),sourceY=Math.round(bitmap.height*y),sourceWidth=Math.round(bitmap.width*width),sourceHeight=Math.round(bitmap.height*height),scale=Math.min(6,Math.max(3,1500/sourceWidth)),canvas=document.createElement('canvas');
      canvas.width=Math.round(sourceWidth*scale);canvas.height=Math.round(sourceHeight*scale);
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,sourceX,sourceY,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);
      const image=context.getImageData(0,0,canvas.width,canvas.height),pixels=image.data;
      for(let offset=0;offset<pixels.length;offset+=4){const red=pixels[offset],green=pixels[offset+1],blue=pixels[offset+2],annotation=red>150&&red-green>45&&red-blue>45,gray=annotation?255:Math.max(0,Math.min(255,(.299*red+.587*green+.114*blue-128)*1.5+128));pixels[offset]=gray;pixels[offset+1]=gray;pixels[offset+2]=gray;}
      context.putImageData(image,0,0);fields.push([key,canvas]);
    }
    bitmap.close?.();return fields;
  }
  async function recognizeFilipinoSeamanName(file,onProgress){
    const areas=await prepareFilipinoSeamanNameAreas(file);if(!areas.length)return {text:'',confidence:0};
    const api=await tesseract(),blocked=/(?:DATE|BIRTH|PLACE|HEIGHT|WEIGHT|EYES|HAIR|VALID|SEX|MARITIME|REPUBLIC|AUTHORITY|SRB)/,worker=await api.createWorker('eng'),candidates=[];
    try{
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ ,.-'"});
      for(let index=0;index<areas.length;index++){
        const [key,canvas]=areas[index],output=await worker.recognize(canvas),value=clean(upper(output.data.text).replace(/[^A-Z ,.'-]/g,' ')).replace(/^NAME(?: \([^)]*\))?\s*/,'');
        if(value&&!blocked.test(value)&&value.split(/\s+/).filter(Boolean).length>=2)candidates.push({key,value,confidence:Number(output.data.confidence||0)});onProgress?.(Math.round(((index+1)/areas.length)*100));
      }
    }finally{await worker.terminate();}
    const candidate=candidates[0];return {text:candidate?`SEAMAN NAME: ${candidate.value}`:'',confidence:candidate?.confidence||0};
  }
  async function recognizeSeamanSource(image,onProgress,knownFull){
    const full=knownFull||await recognize(image,progress=>onProgress?.(Math.round(progress*.35))),isIndian=/(?:GOVERNMENT OF INDIA|REPUBLIC OF INDIA|\bINDIAN\b)/i.test(full.text),numbers=isIndian?{text:'',confidence:0}:await recognizeFilipinoSeamanNumbers(image,progress=>onProgress?.(35+Math.round(progress*.3))),isPhilippine=!isIndian&&(/(?:PHILIPPINES|FILIPINO|MARITIME INDUSTRY AUTHORITY|\bSRB\b)/i.test(full.text)||Boolean(numbers.text)),name=isPhilippine?await recognizeFilipinoSeamanName(image,progress=>onProgress?.(65+Math.round(progress*.35))):{text:'',confidence:0};
    return {text:`${numbers.text}\n${name.text}\n${full.text}`,confidence:Math.max(full.confidence,numbers.confidence,name.confidence)};
  }
  async function recognizeCombinedSeaman(image,onProgress){
    let best={text:'',confidence:0,score:0};const regions=combinedIdentityRegions();
    for(let index=0;index<regions.length;index++){
      const start=index/regions.length,end=(index+1)/regions.length,source=await recognizeSeamanSource(cropCanvas(image,regions[index]),progress=>onProgress?.(Math.round((start+(progress/100)*(end-start))*100))),result=extractSeaman(source.text,source.confidence),score=(result.fields.name?12:0)+(result.fields.seamanBook?10:0)+source.confidence/100;
      if(score>best.score)best={...source,score};if(result.fields.name&&result.fields.seamanBook)return source;
    }
    return best;
  }
  function reconcileCombinedPassportFields(printed,mrz){
    const fields={...(printed||{})},reliable=mrz&&mrz.checks?.length===3&&mrz.checks.every(Boolean)&&!noisyMrzName(clean(`${mrz.given||''} ${mrz.surname||''}`));if(!reliable)return fields;
    const printedGiven=clean(fields.given),mrzGiven=clean(mrz.given),withoutLeading=mrzGiven.slice(1),consensus=withoutLeading.startsWith(printedGiven)&&withoutLeading.length-printedGiven.length<=1?withoutLeading:mrzGiven.startsWith(printedGiven)&&mrzGiven.length-printedGiven.length<=1?mrzGiven:printedGiven;
    fields.given=consensus||mrzGiven;fields.surname=clean(mrz.surname)||fields.surname;return fields;
  }
  async function recognizeCombinedPassport(image,onProgress,knownFull){
    let best={text:knownFull.text,confidence:knownFull.confidence,score:0};const regions=combinedPassportRegions();
    for(let index=0;index<regions.length;index++){
      const start=index/regions.length,end=(index+1)/regions.length,fields=await recognizePhilippineNameFields(cropCanvas(image,regions[index]),progress=>onProgress?.(Math.round((start+(progress/100)*(end-start))*100))),corrected=reconcileCombinedPassportFields(fields.fields,mrzPassport(knownFull.text)),correctedText=`SURNAME: ${corrected.surname||''}\nGIVEN NAMES: ${corrected.given||''}\nMIDDLE NAME: ${corrected.middle||''}`,source={text:`${correctedText}\n${knownFull.text}`,confidence:Math.max(knownFull.confidence,fields.confidence)},result=extractPassport(source.text,source.confidence),printedCount=Object.values(result.printedFieldsDetected||{}).filter(Boolean).length,score=(result.fields.name?10:0)+printedCount*5+fields.confidence/100;
      if(score>best.score)best={...source,score};if(printedCount===3)return source;
    }
    return best;
  }
  const looksCombinedDocuments=text=>/(?:\bPASSPORT\b|P<[A-Z]{3})/i.test(text)&&/(?:SEAFARER|MARITIME INDUSTRY AUTHORITY|\bSRB\b|VALID UNTIL)/i.test(text);
  async function readPdf(file,onProgress,type){
    const pdfjs=await pdfLibrary(),pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;let text='',confidence=100,combined=false;const images=[];
    for(let pageNumber=1;pageNumber<=Math.min(pdf.numPages,3);pageNumber++){const page=await pdf.getPage(pageNumber),content=await page.getTextContent(),pageText=content.items.map(item=>item.str).join(' ');text+='\n'+pageText;if(clean(pageText).length<80){const viewport=page.getViewport({scale:3}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;images.push(canvas);}}
    if(images.length){const values=[];for(let index=0;index<images.length;index++){
      const pageStart=index/images.length,pageEnd=(index+1)/images.length,pageProgress=value=>onProgress?.(Math.round((pageStart+(value/100)*(pageEnd-pageStart))*100)),oriented=await recognizeBestOrientation(images[index],type,value=>pageProgress(value*.6));let pageText=oriented.result.text,pageConfidence=oriented.result.confidence;
      const isCombined=looksCombinedDocuments(pageText);combined=combined||isCombined;
      if(isCombined){const passport=await recognizeCombinedPassport(oriented.canvas,value=>pageProgress(60+value*.2),oriented.result),seaman=await recognizeCombinedSeaman(oriented.canvas,value=>pageProgress(80+value*.2));pageText=`${passport.text}\n${seaman.text}`;pageConfidence=Math.max(pageConfidence,passport.confidence,seaman.confidence);}else if(type==='passport'){const nameArea=await recognize(await preparePassportNameArea(oriented.canvas),value=>pageProgress(60+value*.4),{tessedit_pageseg_mode:'6'});pageText=`${nameArea.text}\n${pageText}`;pageConfidence=Math.max(pageConfidence,nameArea.confidence);}else if(type==='seamanBook'){const seaman=await recognizeSeamanSource(oriented.canvas,value=>pageProgress(60+value*.4),oriented.result);pageText+=`\n${seaman.text}`;pageConfidence=Math.max(pageConfidence,seaman.confidence);}text+='\n'+pageText;values.push(pageConfidence);
    }confidence=values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);}
    return {text,confidence,combined};
  }
  async function read(file,type,onProgress){
    if(!file)throw Error('Please choose a document.');if(file.size>MAX_FILE_BYTES)throw Error('File is larger than 30 MB.');
    const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),image=/^image\//.test(file.type)||/\.(png|jpe?g|webp|bmp)$/i.test(file.name);if(!pdf&&!image)throw Error('Use a PDF, JPG, PNG, WebP or BMP file.');
    onProgress?.(0);if(type==='flightTicket')await loadFlightCodeData();let source;
    if(pdf)source=await readPdf(file,onProgress,type);
    else if(type==='passport'){
      const full=await recognize(file,progress=>onProgress?.(Math.round(progress*.35)));
      if(/(?:PHILIPPINES|FILIPINO|PHL)/i.test(full.text)){
        const fields=await recognizePhilippineNameFields(file,progress=>onProgress?.(35+Math.round(progress*.65)));source={text:`${fields.text}\n${full.text}`,confidence:Math.max(full.confidence,fields.confidence)};
      }else{
        const nameArea=await recognize(await preparePassportNameArea(file),progress=>onProgress?.(35+Math.round(progress*.65)),{tessedit_pageseg_mode:'6'});source={text:`${nameArea.text}\n${full.text}`,confidence:Math.max(full.confidence,nameArea.confidence)};
      }
    }else if(type==='seamanBook'){
      source=await recognizeSeamanSource(file,onProgress);
    }else source=await recognize(file,onProgress);
    let result=extractFromText(type,source.text,source.confidence,file.name);if(pdf&&source.combined){const passportResult=extractFromText('passport',source.text,source.confidence,file.name),seamanResult=extractFromText('seamanBook',source.text,source.confidence,file.name);result=mergeCombinedResults(type,passportResult,seamanResult);result.type=type;result.rawLength=source.text.length;}result.fileName=file.name;result.checkedAt=new Date().toISOString();onProgress?.(100);return result;
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
  window.HarborFlowDocumentImport={read,extractFromText,applyToPerson,parseDate,daysUntil,nationalityChoice,passportName,documentSignal,mergeCombinedResults,combinedIdentityRegions,combinedPassportRegions,reconcileCombinedPassportFields,setFlightCodeData,limits:{maxFileBytes:MAX_FILE_BYTES,maxBatchFiles:20}};
})();
