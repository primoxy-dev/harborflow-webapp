import test from 'node:test';
import assert from 'node:assert/strict';
import {hotelBranchKey,hotelEmailRoute} from '../lib/hotel-email.mjs';

const bookingId='10000000-0000-4000-8000-000000000001';
const booking={id:bookingId,data:{hotel:'Harbor View',address:'88 Seaside Road'}};
const email={to:'hotel@example.com',cc:'',subject:'Request for {{vessel}}',body:'<p>Three rooms</p>'};

test('hotel branch identity normalizes case and spacing and separates addresses',()=>{
  const key=hotelBranchKey(booking.data);
  assert.equal(key,hotelBranchKey({hotel:' HARBOR   VIEW ',address:'88 seaside road'}));
  assert.notEqual(key,hotelBranchKey({...booking.data,address:'99 Seaside Road'}));
  assert.equal(hotelBranchKey({hotel:'Harbor View'}),null);
});

test('hotel email storage scopes drafts to the current login and templates to the saved branch',async()=>{
  const calls=[];
  const sql={query:async(query,args)=>{
    calls.push([query,args]);
    if(query.startsWith('SELECT * FROM operation_trips'))return args[1]==='service'?[booking]:[];
    if(query.startsWith('INSERT INTO hotel_email_drafts'))return [{version:1}];
    return [];
  }};
  const invoke=(action,input={},context={})=>hotelEmailRoute({
    sql,grant:{role:'editor'},login:'alice',input:{action,bookingId,...input},
    service:{id:'service'},job:{data:{vessel:'MV TEST'}},editable:true,...context
  });
  const key=hotelBranchKey(booking.data);
  assert.equal((await invoke('hotelEmail')).status,200);
  assert.deepEqual(calls[1][1],[key]);
  assert.deepEqual(calls[2][1],[bookingId,'alice']);
  assert.equal((await invoke('saveHotelEmailDraft',{data:email,version:0,login:'someone-else'})).status,200);
  assert.deepEqual(calls.at(-1)[1].slice(0,2),[bookingId,'alice']);
  assert.equal((await invoke('saveHotelEmailDraft',{data:email,version:1})).status,409);
  assert.equal((await invoke('saveHotelEmailTemplate',{branch:key,data:email,version:0})).status,403);
  assert.equal((await invoke('saveHotelEmailTemplate',{branch:'different',data:email,version:0},{grant:{role:'owner'}})).status,409);
  assert.equal((await invoke('hotelEmail',{}, {editable:false})).status,403);
  assert.equal((await invoke('hotelEmail',{}, {service:{id:'other'}})).status,404);
});
