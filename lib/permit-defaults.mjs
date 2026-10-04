const schema=`CREATE TABLE IF NOT EXISTS permit_preferences (
 login text PRIMARY KEY, data jsonb NOT NULL DEFAULT '{"staff":[],"car":[]}'::jsonb,
 version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
)`;
export function validatePermitDefaults(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='car,staff')return 'Invalid default tables';
 for(const [key,count] of [['staff',4],['car',2]]){
  if(!Array.isArray(value[key])||value[key].length>100)return 'Maximum 100 rows per default table';
  for(const row of value[key])if(!Array.isArray(row)||row.length!==count||row.some(c=>typeof c!=='string'||c.length>300))return 'Invalid default row';
 }
 return null;
}
export async function readPermitDefaults(sql,login){
 await sql.query(schema);
 const [row]=await sql.query('SELECT data,version FROM permit_preferences WHERE login=$1',[login]);
 return {defaults:row?.data||{staff:[],car:[]},version:row?.version||0};
}
export async function savePermitDefaults(sql,login,value,version){
 const invalid=validatePermitDefaults(value);if(invalid)return {status:400,error:invalid};
 if(!Number.isInteger(version)||version<0)return {status:400,error:'Original version required'};
 await sql.query(schema);
 await sql.query('INSERT INTO permit_preferences(login) VALUES($1) ON CONFLICT(login) DO NOTHING',[login]);
 const [row]=await sql.query('UPDATE permit_preferences SET data=$2::jsonb,version=version+1,updated_at=now() WHERE login=$1 AND version=$3 RETURNING data,version',[login,JSON.stringify(value),version]);
 return row?{status:200,defaults:row.data,version:row.version}:{status:409,error:'ค่าเริ่มต้นเปลี่ยนจากอีกเครื่อง กรุณาเปิดแท็บใหม่เพื่อตรวจ ห้ามเขียนทับ'};
}
