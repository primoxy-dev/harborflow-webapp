import test from 'node:test';
import assert from 'node:assert/strict';
import {groupDocumentPages,pageIdentityStatus} from '../lib/crew-document-batch.mjs';

test('keeps different people in one PDF separate',()=>{
 const groups=groupDocumentPages([{fields:{name:'ALEX ONE',dob:'1990-01-02'}},{fields:{name:'BEE TWO',dob:'1991-02-03'}}]);
 assert.equal(groups.length,2);
});
test('combines only same name and same calendar birth date',()=>{
 const groups=groupDocumentPages([{fields:{name:'ALEX ONE',dob:'1990-01-02'}},{fields:{name:'ALEX ONE',dob:'02-JAN-1990'}}]);
 assert.equal(groups.length,1);assert.equal(groups[0].pages.length,2);
});
test('same name with a different or missing birth date is not merged',()=>{
 const groups=groupDocumentPages([{fields:{name:'ALEX ONE',dob:'1990-01-02'}},{fields:{name:'ALEX ONE',dob:'1991-01-02'}},{fields:{name:'ALEX ONE'}}]);
 assert.equal(groups.length,3);
 assert.ok(groups.every(group=>group.status==='needs-review'));
});
test('unreadable name is marked for review',()=>{
 assert.equal(groupDocumentPages([{fields:{passport:'A1234567'}}])[0].status,'needs-review');
});
test('multiple visible passport identities on one page require review',()=>{
 assert.equal(pageIdentityStatus('P<UTOONE<<ALEX<<<\nP<UTOTWO<<BEE<<<').safe,false);
 assert.equal(pageIdentityStatus('SURNAME: ONE\nSURNAME: TWO').safe,false);
});
