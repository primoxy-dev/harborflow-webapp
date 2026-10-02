import test from 'node:test';
import assert from 'node:assert/strict';
import { hotelData, validateHotel, hotelRoute } from '../lib/hotels.mjs';
const sid='10000000-0000-4000-8000-000000000001',pid='20000000-0000-4000-8000-000000000001';
const data=()=>hotelData({hotel:'Test Hotel',checkIn:'2026-10-02',checkOut:'2026-10-04',status:'Confirmed',currency:'THB',rooms:'2',rate:'1200',personIds:[pid]});
test('hotel validation permits drafts and rejects invalid stay dates and charges',()=>{
  assert.equal(validateHotel(data()),null);
  assert.equal(validateHotel(hotelData({hotel:'Draft hotel',status:'Draft',currency:'THB'})),null);
  for(const patch of [{checkOut:'2026-10-01'},{checkIn:'2026-13-01'},{checkIn:'2026-02-30'},{rooms:'0'},{rate:'-1'},{personIds:['bad']},{status:'bad'}])assert.ok(validateHotel({...data(),...patch}));
});
function fixture(){
  let saved=[],writes=0;
  const sql={query:async(q,args)=>{
    if(q.startsWith('SELECT * FROM operation_services'))return [{id:sid,job_id:'job',data:{type:'Visitor',pic:'editor'}}];
    if(q.startsWith('SELECT * FROM operation_jobs'))return [{id:'job',data:{pic:'editor'}}];
    if(q.startsWith('SELECT id,data FROM operation_people'))return [{id:pid,data:{name:'Test guest',serviceIds:[sid]}}];
    if(q.startsWith('SELECT * FROM operation_trips'))return saved;
    if(q.startsWith('WITH inserted')){writes++;saved=[{id:args[0],service_id:sid,version:1,data:JSON.parse(args[3])}];return saved;}
    if(q.startsWith('WITH old'))return []; // concurrent version change
    throw Error('Unexpected query');
  }};
  const grant={role:'editor',visitorView:true,visitorEdit:true};
  return {sql,grant,login:'editor',writes:()=>writes};
}
test('hotel booking persists and reloads with service-linked guests',async()=>{
  const f=fixture();
  const saved=await hotelRoute({...f,input:{serviceId:sid,data:data()}});
  assert.equal(saved.status,201);
  const result=await (await hotelRoute({...f,input:{serviceId:sid},read:true})).json();
  assert.equal(result.bookings[0].data.hotel,'Test Hotel');
  assert.equal(result.people[0].id,pid);
  assert.equal(result.editable,true);
});
test('hotel route enforces person grants, service guest links, and edit versions',async()=>{
  const f=fixture();
  assert.equal((await hotelRoute({...f,grant:{...f.grant,visitorView:false},input:{serviceId:sid},read:true})).status,403);
  assert.equal((await hotelRoute({...f,grant:{...f.grant,visitorEdit:false},input:{serviceId:sid,data:data()}})).status,403);
  assert.equal((await hotelRoute({...f,input:{serviceId:sid,data:{...data(),personIds:['20000000-0000-4000-8000-000000000002']}}})).status,400);
  assert.equal((await hotelRoute({...f,input:{serviceId:sid,id:pid,version:1,data:data()}})).status,409);
  assert.equal(f.writes(),0);
});
