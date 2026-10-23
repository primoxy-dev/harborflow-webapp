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
