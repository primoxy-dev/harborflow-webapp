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
  assert.equal(result.fields.name,'ANNA MARIA ERIKSSON');
  assert.equal(result.fields.passport,'L898902C3');
  assert.equal(result.fields.nationality,'UTO');
  assert.equal(result.fields.dob,'1974-08-12');
  assert.equal(result.fields.passportExpiry,'2012-04-15');
  assert.deepEqual([...result.machineChecks],[true,true,true]);
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

test('creates a flight row from a ticket without replacing existing flights',()=>{
  const result=reader.extractFromText('flightTicket','FLIGHT: TG 123\nBKK - HKT\n21 OCT 2026\n08:30 09:50\nPNR: DEMO1',96);
  const applied=reader.applyToPerson({flights:[{airline:'SQ',number:'711'}]},result);
  assert.equal(applied.person.flights.length,2);
  assert.deepEqual({...applied.person.flights[1]}, {airline:'TG',number:'123',date:'21OCT',from:'BKK',to:'HKT',departure:'08:30',arrival:'09:50',booking:'DEMO1'});
});
