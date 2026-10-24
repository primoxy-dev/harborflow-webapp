import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source=await readFile(new URL('../document-import.js',import.meta.url),'utf8');
const context={window:{},structuredClone,Date,console};
vm.createContext(context);
vm.runInContext(source,context);
const reader=context.window.HarborFlowDocumentImport;

test('reads a machine-readable passport and validates its check digits',()=>{
  const result=reader.extractFromText('passport',[
    'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
    'L898902C36UTO7408122F1204159ZE184226B<<<<<10'
  ].join('\n'));
  assert.equal(result.fields.name,'MS. ANNA MARIA ERIKSSON');
  assert.equal(result.sex,'F');
  assert.equal(result.fields.passport,'L898902C3');
  assert.equal(result.fields.nationality,'UTO');
  assert.equal(result.fields.dob,'1974-08-12');
  assert.equal(result.fields.passportExpiry,'2012-04-15');
  assert.deepEqual([...result.machineChecks],[true,true,true]);
});

test('formats passport name by sex and maps passport nationality to the dropdown value',()=>{
  const result=reader.extractFromText('passport',[
    'P<THASOMCHAI<<ANAN<KIT<<<<<<<<<<<<<<<<<<<<',
    'AB12345670THA9001011M3012315<<<<<<<<<<<<<<'
  ].join('\n'));
  assert.equal(result.fields.name,'MR. ANAN KIT SOMCHAI');
  assert.equal(result.fields.nationality,'THAI');
  assert.equal(result.nameNeedsTitle,false);
  assert.equal(reader.nationalityChoice('PHL'),'FILIPINO');
  assert.equal(reader.nationalityChoice('THAILAND'),'THAI');
});

test('an uncertain passport sex requires title choice and does not fill the name',()=>{
  const result=reader.extractFromText('passport','GIVEN NAMES: ALEX KIM\nSURNAME: MORGAN\nNATIONALITY: THAILAND\nPASSPORT NO: AA1234567\nDATE OF EXPIRY: 01 JAN 2030',94);
  assert.equal(result.nameNeedsTitle,true);
  assert.equal(result.nameWithoutTitle,'ALEX KIM MORGAN');
  const applied=reader.applyToPerson({},result);
  assert.equal(applied.person.name,undefined);
  assert.match(applied.warnings.join('\n'),/MR\. หรือ MS\./);
});

test('repairs an Indian passport MRZ with OCR filler and a Z read as 2',()=>{
  const result=reader.extractFromText('passport',[
    'REPUBLIC OF INDIA',
    'sm Sumame',
    'io KUMAR',
    'ft Ar / Gvenomet) ad',
    'Wd ARJUN DEV 08',
    'P<INDKUMAR<<ARJUNKDEV<CLLLLLLLLLLLLLLLLLLK',
    '21234567<1IND9001011M3012316<<<<<<<<<<<<<<<<'
  ].join('\n'),57);
  assert.equal(result.fields.name,'MR. ARJUN DEV KUMAR');
  assert.equal(result.fields.passport,'Z1234567');
  assert.equal(result.fields.nationality,'INDIAN');
  assert.equal(result.fields.dob,'1990-01-01');
  assert.equal(result.fields.passportExpiry,'2030-12-31');
  assert.deepEqual([...result.machineChecks],[true,true,true]);
});

test('reads Indian Given Name(s) before Surname from the printed passport fields',()=>{
  const result=reader.extractFromText('passport',[
    'REPUBLIC OF INDIA',
    'Surname: SWAMY',
    'Given Name(s): SREENATH NARAYANA',
    'Nationality: INDIAN',
    'Passport No: Z6975453',
    'Date of Birth: 30/10/1986',
    'Sex: M',
    'Date of Expiry: 05/09/2032'
  ].join('\n'),92);
  assert.equal(result.fields.name,'MR. SREENATH NARAYANA SWAMY');
});

test('restores spaces in a noisy Indian MRZ name from a matching document filename',()=>{
  const result=reader.extractFromText('passport',[
    'REPUBLIC OF INDIA',
    'P<INDSWAMY<<SREENATHKNARAYANAS<<<<<<<<<<<<<<',
    'Z6975453<4IND8610304M3209055<<<<<<<<<<<<<<24'
  ].join('\n'),57,'1.MR. SREENATH NARAYANA SWAMY - PASSPORT.pdf');
  assert.equal(result.fields.name,'MR. SREENATH NARAYANA SWAMY');
});

test('recovers the Indian passport name when printed labels and MRZ separators are misread',()=>{
  const text=[
    'REPUBLIC OF INDIA',
    'SWAMY',
    'fermt am SP / Given Namels',
    'rs AW SREENATH NARAYANA',
    'Date of Birth fo / Sex',
    'Bb amam Ba dha FT',
    'se sumame',
    'SWAMY',
    'feat Given Nomet) 32',
    'SREENATH NARAYANA iS |',
    'fi / Date of Birth fis',
    '30/10/1986 HM =',
    'P<INDSWAMY<<SREENATHKNARAYANAS<CLLLLLLLLLRLK',
    '26975453<4INDB610304M320905505C4069336622<24'
  ].join('\n');
  const result=reader.extractFromText('passport',text,44,'passport-scan.pdf');
  assert.equal(result.fields.name,'MR. SREENATH NARAYANA SWAMY');
  assert.equal(result.fields.dob,'1986-10-30');
});

test('printed surname, given names and middle name override a noisy MRZ name',()=>{
  const result=reader.extractFromText('passport',[
    'Apelyido/Surname',
    'ALPHA',
    'Pangalan/Given names',
    'BRAVO',
    'Panggitnang apelyido/Middle name',
    'CHARLIE',
    'Nasyonalidad/Nationality',
    'FILIPINO',
    'Kasarian/Sex',
    'M',
    'P<PHLALPHA<<BRAVOLLLLLLLLLLLLLLLLLLLLLLLL<<<',
    'X00000000PHL9001011M3012315<<<<<<<<<<<<<<'
  ].join('\n'),95);
  assert.equal(result.fields.name,'MR. BRAVO CHARLIE ALPHA');
  assert.equal(result.fields.nationality,'FILIPINO');
  assert.doesNotMatch(result.fields.name,/[LK]{8,}/);
});

test('an unclear short printed name field is corrected from its matching MRZ field',()=>{
  const result=reader.extractFromText('passport',[
    'Surname: AZ',
    'Given names: BRAVO',
    'Middle name: CHARLIE',
    'Sex: M',
    'P<PHLECHO<<BRAVOLLLLLLLLLLLLLLLLLLLLLLL<<<',
    'X00000000PHL9001011M3012315<<<<<<<<<<<<<<'
  ].join('\n'),95);
  assert.equal(result.fields.name,'MR. BRAVO CHARLIE ECHO');
  assert.match(result.extractionWarnings.join(' '),/MRZ field was used to correct it/);
});

test('fills blank passport fields, warns on expiry, and never overwrites a conflict',()=>{
  const result=reader.extractFromText('passport','Passport No: X1234567\nDate of Expiry: 01 JAN 2027',93);
  result.fileName='passport.jpg';
  const applied=reader.applyToPerson({passport:'KEEP-ME'},result);
  assert.equal(applied.person.passport,'KEEP-ME');
  assert.equal(applied.person.passportExpiry,'2027-01-01');
  assert.match(applied.warnings.join('\n'),/ต่างจากไฟล์/);
  assert.match(applied.warnings.join('\n'),/ไม่เกิน 6 เดือน/);
  assert.equal(applied.person.documentChecks.passport.status,'warning');
});

test('reads a seaman book number and adds the missing expiry field',()=>{
  const result=reader.extractFromText('seamanBook','SEAMAN BOOK NO: SB123456\nVALID UNTIL: 01 JAN 2030',95);
  const applied=reader.applyToPerson({},result);
  assert.equal(applied.person.seamanBook,'SB123456');
  assert.equal(applied.person.seamanBookExpiry,'2030-01-01');
  assert.ok(applied.changes.includes('Seaman book expiry'));
});

test('reads an Indian CDC when OCR places both labels before both dates',()=>{
  const result=reader.extractFromText('seamanBook',[
    'GOVERNMENT OF INDIA',
    'Name of Seafarer in ful WME, Wem cocne,. MUM 246810 b',
    '| KUMAR ARJUN DEV. 4 iq coi, MUMBAI',
    'Date of issue Date of expiry',
    '17/12/2020 16/12/2030',
    'Date of birth 01/01/1990',
    'Nationality INDIAN'
  ].join('\n'),42);
  assert.equal(result.fields.name,'ARJUN DEV KUMAR');
  assert.equal(result.fields.seamanBook,'MUM246810');
  assert.equal(result.fields.seamanBookExpiry,'2030-12-16');
});

test('reads CDC No. and matches surname-first Indian renewal scan without trusting sideways noise',()=>{
  const result=reader.extractFromText('seamanBook',[
    'BR EEE 258132: |B=ES',
    'GOVERNMENT OF INDIA',
    'Name of Seafarer in full Ah. wwm/cocne, MUM 135604',
    'SWAMY SREENATH NARAYANA a ot Port of issue MUMBAI',
    'Date of issue Date of expiry',
    '17/12/2016 16/12/2026',
    'SPACE FOR RENEWAL STICKER',
    'a period of Ten years with effect from 21/09/2026'
  ].join('\n'),43);
  assert.equal(result.fields.name,'SREENATH NARAYANA SWAMY');
  assert.equal(result.fields.seamanBook,'MUM135604');
  assert.equal(result.fields.seamanBookExpiry,'');
  assert.match(result.extractionWarnings.join(' '),/confirm the new expiry date/);
});

test('reads the Filipino SRB number from the labelled top-right field',()=>{
  const result=reader.extractFromText('seamanBook','REPUBLIC OF THE PHILIPPINES\nMARITIME INDUSTRY AUTHORITY\nSRB NO. A0578403',94);
  assert.equal(result.fields.seamanBook,'A0578403');
});

test('reads the Filipino seaman book number from the lower legacy field',()=>{
  const result=reader.extractFromText('seamanBook','REPUBLIC OF THE PHILIPPINES\nNAME\nSAMPLE CREW\n1358735\nC1271467',94);
  assert.equal(result.fields.seamanBook,'C1271467');
});

test('treats FILIPINO and PHILIPPINES as the same seaman book profile',()=>{
  const filipino=reader.extractFromText('seamanBook','FILIPINO\nSEAMAN NAME: ALPHA B. CHARLIE\nSRB NO. A0578403',94);
  const philippines=reader.extractFromText('seamanBook','PHILIPPINES\nSEAMAN NAME: ALPHA B. CHARLIE\nSRB NO. A0578403',94);
  assert.equal(filipino.fields.name,'ALPHA CHARLIE');
  assert.equal(filipino.fields.seamanBook,'A0578403');
  assert.equal(filipino.matchStrategy,'given-surname');
  assert.deepEqual(filipino.fields,philippines.fields);
});

test('scores an upright combined Passport and Seaman Book scan above unreadable sideways OCR',()=>{
  const sideways=reader.documentSignal('passport','mw | ll | 11',28);
  const upright=reader.documentSignal('passport',[
    'PASSPORT',
    'P<PHLALPHA<<BRAVO<<<<<<<<<<<<<<<<<<<<<<<<',
    'X12345670PHL9001011M3012315<<<<<<<<<<<<<<',
    'REPUBLIC OF THE PHILIPPINES',
    'MARITIME INDUSTRY AUTHORITY',
    'SRB NO. A0578403'
  ].join('\n'),88);
  assert.ok(upright>sideways);
});

test('merges Passport and Seaman Book fields from a combined scan without changing the requested name',()=>{
  const passport=reader.extractFromText('passport','P<PHLALPHA<<BRAVO<<<<<<<<<<<<<<<<<<<<<<<<\nX12345670PHL9001011M3012315<<<<<<<<<<<<<<',90);
  const seaman=reader.extractFromText('seamanBook','PHILIPPINES\nSEAMAN NAME: BRAVO ALPHA\nSRB NO. A0578403',90);
  const combined=reader.mergeCombinedResults('passport',passport,seaman);
  assert.equal(combined.fields.name,passport.fields.name);
  assert.equal(combined.fields.passport,passport.fields.passport);
  assert.equal(combined.fields.seamanBook,seaman.fields.seamanBook);
});

test('checks the lower-right identity page first in a combined document scan',()=>{
  assert.deepEqual({...reader.combinedIdentityRegions()[0]},{x:.42,y:.58,width:.44,height:.415});
});

test('checks the lower-left passport data page first in a combined document scan',()=>{
  assert.deepEqual({...reader.combinedPassportRegions()[0]},{x:0,y:.56,width:.42,height:.42});
});

test('keeps the labelled Filipino seaman book number below the numeric MARINA number',()=>{
  const result=reader.extractFromText('seamanBook','REPUBLIC OF THE PHILIPPINES\nNAME\nRUEL L. EPE\n1358735\nC1271467',94);
  assert.equal(result.fields.seamanBook,'C1271467');
});

test('reconciles noisy combined-scan passport fields with a valid MRZ',()=>{
  const result=reader.reconcileCombinedPassportFields(
    {surname:'BREEN',given:'RUE',middle:'LABANDERO'},
    {surname:'EPE',given:'KRUEL',checks:[true,true,true]}
  );
  assert.deepEqual({...result},{surname:'EPE',given:'RUEL',middle:'LABANDERO'});
});

test('uses only Filipino given name and surname from a legacy seaman book',()=>{
  const result=reader.extractFromText('seamanBook','REPUBLIC OF THE PHILIPPINES\nNAME\nALPHA B. CHARLIE\nC1271467',94);
  assert.equal(result.fields.name,'ALPHA CHARLIE');
  assert.equal(result.matchStrategy,'given-surname');
});

test('uses only Filipino given name and surname from the new SRB name order',()=>{
  const result=reader.extractFromText('seamanBook','REPUBLIC OF THE PHILIPPINES\nSRB NO. A0578403\nNAME (Last Name, First Name, Middle Name)\nCHARLIE, ALPHA BRAVO',94);
  assert.equal(result.fields.name,'ALPHA CHARLIE');
});

test('creates a flight row from a ticket without replacing existing flights',()=>{
  const result=reader.extractFromText('flightTicket','PASSENGER NAME: DEMO CREW\nFLIGHT: TG 123\nBKK - HKT\n21 OCT 2026\n08:30 09:50\nPNR: DEMO1',96);
  assert.equal(result.fields.name,'DEMO CREW');
  const applied=reader.applyToPerson({flights:[{airline:'SQ',number:'711'}]},result);
  assert.equal(applied.person.flights.length,2);
  assert.deepEqual({...applied.person.flights[1]}, {airline:'TG',number:'123',date:'21OCT',from:'BKK',to:'HKT',departure:'08:30',arrival:'09:50',booking:'DEMO1'});
});

test('reads an Amadeus marine travel ticket and matches surname-first traveler names',()=>{
  reader.setFlightCodeData({
    airlines:[['PR','PHILIPPINE AIRLINES','','PHILIPPINES']],
    airports:[['MNL','NINOY AQUINO INTERNATIONAL AIRPORT','PASAY','PH'],['BKK','SUVARNABHUMI AIRPORT','BANGKOK','TH']]
  });
  const result=reader.extractFromText('flightTicket',[
    'Your trip Booking ref: 5GIPCV Document Issue Date: 22 October 2026',
    'Traveler EPE/RUEL LABANDERO Agency GLOBAL MARINE TRAVEL',
    'Monday 26 October 2026 Philippine Airlines PR 736',
    'Departure 26 October 16:10 Manila, (Ninoy Aquino Intl) (+) Terminal: 1',
    'Arrival 26 October 18:45 Bangkok, (Suvarnabhumi Intl) (+)',
    'Duration 03:35 (Non stop)'
  ].join(' '),96);
  assert.equal(result.fields.name,'RUEL LABANDERO EPE');
  assert.deepEqual({...result.flight},{airline:'PR',number:'736',date:'26OCT',from:'MNL',to:'BKK',departure:'16:10',arrival:'18:45',booking:'5GIPCV'});
});
