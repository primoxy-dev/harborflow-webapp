import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldForLabel,fieldsFromLabelValuePairs,extractVisibleFields,compareVisibleIdentities,suggestBirthDate,displayDocumentDate,passportNumberRegion,formatPhilippineName,suggestSampleNationality,formatCrewName,matchExistingNationality,suggestMiddleName} from '../lib/crew-document-field-labels.mjs';

test('field labels identify meanings without fixed positions',()=>{
 assert.equal(fieldForLabel('Given Names'),'given');assert.equal(fieldForLabel('Surname'),'surname');
 assert.equal(fieldForLabel('CDC No.'),'seamanBook');assert.equal(fieldForLabel('Date of Birth'),'dob');
 assert.equal(fieldForLabel('Date of Issue'),'');
 const pairs=[{label:'Date of Birth',value:'13 DEC 1980'},{label:'Surname',value:'CRUZ'},{label:'Given Names',value:'ANA'}];
 assert.deepEqual(fieldsFromLabelValuePairs(pairs).fields,fieldsFromLabelValuePairs([...pairs].reverse()).fields);
});
test('dates in different formats compare correctly and conflicts require review',()=>{
 assert.equal(compareVisibleIdentities({dob:'13 DEC 1980'},{dob:'DECEMBER 13, 1980'}).conflicts.length,0);
 assert.deepEqual(compareVisibleIdentities({dob:'3 DEC 1980'},{dob:'DECEMBER 13, 1980'}).conflicts.map(x=>x.field),['dob']);
});
test('shows matched dates as DD-MMM-YYYY and rejects invalid dates',()=>{
 assert.equal(displayDocumentDate('DECEMBER 13, 1980'),'13-DEC-1980');assert.equal(displayDocumentDate('31 FEB 1980'),'');
});
test('formats crew name in requested order and omits an absent middle name',()=>{
 assert.equal(formatCrewName('ANA','MARIA','CRUZ'),'ANA MARIA CRUZ');assert.equal(formatCrewName('ANA','','CRUZ'),'ANA CRUZ');assert.equal(formatCrewName('ANA','',''),'');
});
test('middle-name suggestion uses the book initial without guessing among multiple candidates',()=>{
 assert.equal(suggestMiddleName('ANA\nX\nBAUTISTA\n13 DEC 1980','ANA','ANA B. CRUZ').suggestion,'BAUTISTA');
 assert.equal(suggestMiddleName('ANA\nBAUTISTA\nBROWN\n13 DEC 1980','ANA','ANA B. CRUZ').suggestion,'');
 assert.equal(suggestMiddleName('ANA\nBAUTISTA\n13 DEC 1980','ANA','ANA CRUZ').suggestion,'');
});
test('uses only an unambiguous existing nationality option',()=>{
 const options=['FILIPINO','INDIAN','FIJIAN','FRENCH'];assert.equal(matchExistingNationality('FILIPII',options),'FILIPINO');assert.equal(matchExistingNationality('INDIAN',options),'INDIAN');assert.equal(matchExistingNationality('UNKNOWN',options),'');
});
test('number region follows a detected passport label and rejects ambiguous labels',()=>{
 const words=[{text:'Pasaport',left:717,top:112,width:64,height:28},{text:'big/Passpiirt',left:792,top:112,width:82,height:28}];
 const box=passportNumberRegion(words,1062,607);assert.ok(box&&box.left<717&&box.top>112&&box.height<50);
 assert.equal(passportNumberRegion([{text:'PASSPORT',left:10,top:10,width:50,height:20}],1000,700),null);
});
test('uses middle name in passport and its initial in Filipino seaman book',()=>{
 assert.equal(formatPhilippineName('ANA','BAUTISTA','CRUZ'),'ANA BAUTISTA CRUZ');
 assert.equal(formatPhilippineName('ANA','BAUTISTA','CRUZ',{seaman:true}),'ANA B. CRUZ');
});
test('uncertain sample nationality is only a suggestion and ambiguous results stay blank',()=>{
 assert.equal(suggestSampleNationality('FILIPII').suggestion,'FILIPINO');
 assert.equal(suggestSampleNationality('FILIPINO INDIAN').suggestion,'');assert.equal(suggestSampleNationality('FILIPII').requiresReview,true);
});
test('a separately read printed date can support a missing day digit but never auto-confirms it',()=>{
 const match=suggestBirthDate('3 DEC 1980','DECEMBER 13, 1980',['13 DEC 1980','12 NOV 2030']);
 assert.equal(match.suggestion,'1980-12-13');assert.equal(match.reason,'alternate-printed-ocr');assert.equal(match.requiresReview,true);
 assert.equal(suggestBirthDate('3 DEC 1980','DECEMBER 13, 1980',['12 NOV 2030']).suggestion,'');
 assert.equal(suggestBirthDate('3 DEC 1980','DECEMBER 23, 1980',['23 DEC 1980']).reason,'alternate-printed-ocr');
 assert.equal(suggestBirthDate('3 DEC 1980','DECEMBER 14, 1980',['14 DEC 1980']).suggestion,'');
 assert.equal(suggestBirthDate('','DECEMBER 13, 1980',['13 DEC 1980']).suggestion,'1980-12-13');
 assert.equal(suggestBirthDate('','DECEMBER 13, 1980',['13 DEC 1980','13 DEC 1980']).suggestion,'');
});
test('finds printed labels even when another field label lies between the label and its value',()=>{
 const result=extractVisibleFields(['NAME','ANA B. CRUZ','DATE OF BIRTH','PLACE OF BIRTH','DECEMBER 13, 1980','MANILA','C1234567'].join('\n'),'seamanBook');
 assert.equal(result.fields.name,'ANA B. CRUZ');assert.equal(result.fields.dob,'DECEMBER 13, 1980');assert.equal(result.fields.seamanBook,'C1234567');assert.equal(result.requiresReview,true);
});
test('a labelled Seaman Book expiry is not confused with its issue date',()=>{
 const result=extractVisibleFields('DATE OF ISSUE\n29 JUN 2018\nVALID UNTIL\n26 JUN 2028','seamanBook');
 assert.equal(result.fields.seamanBookExpiry,'26 JUN 2028');
});
test('uses the next printed line after bilingual headings with OCR noise',()=>{
 const result=extractVisibleFields('APELYIDO/SURMOINS.\nCRUZ\nPANGALANY GHEE NOME\nANA','passport');
 assert.equal(result.fields.surname,'CRUZ');assert.equal(result.fields.given,'ANA');
});
test('conflicting visible labels stay blank and MRZ is ignored',()=>{
 const result=extractVisibleFields('SURNAME\nCRUZ\nSURNAME\nREYES\nP<PHLCRUZ<<ANA<<<<<<<<<<','passport');
 assert.equal(result.fields.surname,undefined);assert.ok(result.conflicts.includes('surname'));assert.equal(result.fields.passport,undefined);
});
test('missing, conflicting, and MRZ values never become confirmed fields',()=>{
 const result=fieldsFromLabelValuePairs([{label:'Passport No.',value:'P1234567'},{label:'Passport No.',value:'P9876543'},{label:'Surname',value:'CRUZ<<ANA<<<'}]);
 assert.equal(result.fields.passport,undefined);assert.equal(result.fields.surname,undefined);assert.deepEqual(result.conflicts,['passport']);assert.equal(result.requiresReview,true);
});
