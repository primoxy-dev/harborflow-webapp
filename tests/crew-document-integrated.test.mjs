import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePrintedFields} from '../lib/crew-document-integrated.mjs';

test('adds a printed birth date only when book number agrees',()=>{
 const text='SRB NO: A1234567\nDATE OF BIRTH: 20 OCT 1990';
 assert.equal(reconcilePrintedFields({fields:{seamanBook:'A1234567'}},text,'seamanBook').fields.dob,'1990-10-20');
 assert.equal(reconcilePrintedFields({fields:{seamanBook:'A7654321'}},text,'seamanBook').fields.dob,undefined);
});
test('does not overwrite a conflicting MRZ value',()=>{
 const result=reconcilePrintedFields({fields:{passport:'A1234567'}},'PASSPORT NO: B1234567','passport');
 assert.equal(result.fields.passport,'A1234567');assert.ok(result.extractionWarnings.length);
});
