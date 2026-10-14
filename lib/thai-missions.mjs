// Public office contacts only. A saved document snapshot is never silently refreshed.
export function missionContactLines(mission){
 if(!mission)return [];
 return [mission.name,mission.address,mission.phone&&'Tel: '+mission.phone,mission.fax&&'Fax: '+mission.fax,
  mission.emails?.general?.length&&'Email (general inquiries): '+mission.emails.general.join(' / '),
  mission.emails?.visa?.length&&'Email (visa inquiries): '+mission.emails.visa.join(' / ')].filter(Boolean);
}
export function validateMissionDirectory(records){
 if(!Array.isArray(records))throw Error('Invalid mission directory');
 const ids=new Set();
 for(const r of records){
  if(!r.id||ids.has(r.id)||!r.name||!['embassy','consulate-general'].includes(r.kind)||!['verified','incomplete'].includes(r.status))throw Error('Invalid or duplicate mission');
  ids.add(r.id);let url;try{url=new URL(r.sourceUrl);}catch{throw Error('Invalid mission source');}
  if(!['http:','https:'].includes(url.protocol))throw Error('Invalid mission source');
  if(r.status==='verified'&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.verifiedAt)||!/(^|\.)(thaiembassy\.org|mfa\.go\.th)$/.test(url.hostname)||!r.address||!r.phone))throw Error('Verified mission requires official contact evidence');
  if(!r.emails||!Array.isArray(r.emails.general)||!Array.isArray(r.emails.visa))throw Error('Invalid mission emails');
 }
 return records;
}
export function selectedMission(id,snapshot,directory){
 if(snapshot?.id===id)return structuredClone(snapshot);
 const mission=directory.find(r=>r.id===id||r.name===id);
 return mission?structuredClone(mission):null;
}
