import test from 'node:test';
import assert from 'node:assert/strict';
import {assessExistingMatch} from '../lib/crew-document-match.mjs';

test('same calendar date in different formats can match',()=>{
 assert.equal(assessExistingMatch([{data:{dob:'1990-10-20'}}],{dob:'20-OCT-1990'}).safe,true);
});
test('different dates or passport numbers block automatic updates',()=>{
 const person={data:{dob:'1990-10-20',passport:'AA123456'}};
 assert.equal(assessExistingMatch([person],{dob:'21-OCT-1990'}).safe,false);
 assert.equal(assessExistingMatch([person],{passport:'BB123456'}).safe,false);
});
test('ambiguous people and invalid dates block automatic updates',()=>{
 assert.equal(assessExistingMatch([{data:{}},{data:{}}],{}).safe,false);
 assert.equal(assessExistingMatch([{data:{dob:'1990-10-20'}}],{dob:'not a date'}).safe,false);
 assert.equal(assessExistingMatch([{data:{name:'SAMPLE'}}],{name:'SAMPLE'}).safe,false);
});
