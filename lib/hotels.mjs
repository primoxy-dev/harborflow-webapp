import { randomUUID } from 'node:crypto';
import { json } from './harborflow.mjs';
import { canPeople, canEditService, uuid } from './operations.mjs';
const TYPES=['Crew Change','Visitor','SIRE Inspector','Surveyor'];
const STATUS=['Draft','Requested','Confirmed','Checked in','Checked out','Cancelled'];
const FIELDS=['hotel','address','contact','checkIn','checkOut','roomType','rooms','rate','currency','bookingRef','status','notes'];
export function hotelData(raw={}) {
  const data={kind:'hotel'};
  for(const key of FIELDS)data[key]=String(raw[key]??'').trim().slice(0,key==='notes'?1000:300);
  data.personIds=Array.isArray(raw.personIds)?[...new Set(raw.personIds)]:[];
  return data;
}
export function validateHotel(d) {
  if(!d.hotel)return 'Hotel name is required';
  if(!STATUS.includes(d.status))return 'Invalid booking status';
  for(const key of ['checkIn','checkOut'])if(d[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(d[key])||Number.isNaN(Date.parse(d[key]))||new Date(d[key]).toISOString().slice(0,10)!==d[key]))return 'Invalid stay date';
  if(d.checkIn&&d.checkOut&&d.checkOut<=d.checkIn)return 'Check-out must be after check-in';
  if(d.rooms&&(!/^\d+$/.test(d.rooms)||Number(d.rooms)<1||Number(d.rooms)>1000))return 'Rooms must be between 1 and 1000';
  if(d.rate&&(!/^\d+(\.\d{1,2})?$/.test(d.rate)||Number(d.rate)>10000000))return 'Invalid nightly room rate';
  if(!/^[A-Z]{3}$/.test(d.currency))return 'Currency must be a three-letter code';
  if(!Array.isArray(d.personIds)||d.personIds.length>100||d.personIds.some(id=>!uuid(id)))return 'Invalid guest selection';
  return null;
}
export async function hotelRoute({sql,grant,login,input,read=false}) {
  const fail=(error,status=400)=>json({error},status);
  if(!uuid(input.serviceId))return fail('Invalid Service');
  const [service]=await sql.query('SELECT * FROM operation_services WHERE id=$1 AND removed_at IS NULL',[input.serviceId]);
  if(!service||!TYPES.includes(service.data.type))return fail('Hotel Service not found',404);
  const kind=service.data.type==='Crew Change'?'crew':'visitor';
  if(!canPeople(grant,kind))return fail('Separate person view permission required',403);
  const [job]=await sql.query('SELECT * FROM operation_jobs WHERE id=$1',[service.job_id]);
  const editable=canEditService(grant,login,job,service)&&canPeople(grant,kind,true);
  if(!read&&!editable)return fail('Assigned Service and person edit permission required',403);
  const people=await sql.query('SELECT id,data FROM operation_people WHERE job_id=$1 AND kind=$2 AND removed_at IS NULL',[service.job_id,kind]);
  const linked=people.filter(p=>p.data.serviceIds?.includes(service.id));
  if(read){
    const bookings=await sql.query("SELECT * FROM operation_trips WHERE service_id=$1 AND data->>'kind'='hotel' AND removed_at IS NULL ORDER BY created_at",[service.id]);
    return json({bookings,people:linked.map(p=>({id:p.id,name:p.data.name})),editable});
  }
  const data=hotelData(input.data),invalid=validateHotel(data);
  if(invalid)return fail(invalid);
  if(data.personIds.some(id=>!linked.some(p=>p.id===id)))return fail('Guests must belong to this Service');
  if(input.id){
    if(!uuid(input.id)||!Number.isInteger(input.version))return fail('Invalid booking version');
    const [saved]=await sql.query("WITH old AS (SELECT * FROM operation_trips WHERE id=$1 AND service_id=$2 AND data->>'kind'='hotel' AND removed_at IS NULL AND version=$3 FOR UPDATE), changed AS (UPDATE operation_trips t SET data=$4::jsonb,version=t.version+1,updated_at=now() FROM old WHERE t.id=old.id RETURNING t.*), history AS (INSERT INTO operation_events(scope,record_id,action,actor,before_data,after_data) SELECT 'trip',changed.id::text,'hotel-update',$5,old.data,changed.data FROM changed,old) SELECT * FROM changed",[input.id,service.id,input.version,JSON.stringify(data),login]);
    return saved?json({booking:saved}):fail('Booking changed elsewhere. Reopen it before saving.',409);
  }
  const [saved]=await sql.query("WITH inserted AS (INSERT INTO operation_trips(id,job_id,service_id,data,created_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *), history AS (INSERT INTO operation_events(scope,record_id,action,actor,after_data) SELECT 'trip',id::text,'hotel-create',$5,data FROM inserted) SELECT * FROM inserted",[randomUUID(),service.job_id,service.id,JSON.stringify(data),login]);
  return json({booking:saved},201);
}
