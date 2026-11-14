import { json } from './harborflow.mjs';
import { canEditService, uuid } from './operations.mjs';

export const provisionTypes = ['Provision & Store', 'Provisions'];
const columns = 'id,data,email_name AS "emailName",version';
const textFields = {description:500, quantity:30, unit:80, supplier:200, supplierContact:300, deliveryPoint:20, deliveryDate:10, deliveryTime:5, price:30, notes:3000};
const msgSignature = Buffer.from('d0cf11e0a1b11ae1','hex');

export function provisionItemData(raw) {
  if (!['Provision','Store'].includes(raw?.category)) throw Error('Select Provision or Store.');
  const data = {category:raw.category};
  for (const [key, limit] of Object.entries(textFields)) {
    const value = raw[key] ?? '';
    if (typeof value !== 'string' || value.length > limit) throw Error('Invalid '+key+'.');
    data[key] = value.trim();
  }
  if (!data.description) throw Error('Enter a description.');
  for (const key of ['quantity','price']) {
    if (data[key] && !/^\d+(?:\.\d+)?$/.test(data[key])) throw Error('Quantity and price must be non-negative numbers.');
  }
  if (data.deliveryPoint && !['Berth','Anchorage'].includes(data.deliveryPoint)) throw Error('Invalid delivery point.');
  if (data.deliveryDate) {
    const date = new Date(data.deliveryDate+'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.deliveryDate) || !Number.isFinite(+date) || date.toISOString().slice(0,10)!==data.deliveryDate) throw Error('Invalid delivery date.');
  }
  if (data.deliveryTime && (!data.deliveryDate || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.deliveryTime))) throw Error('Enter a delivery date and a valid time.');
  data.customerConfirmed = raw.customerConfirmed === true;
  data.supplierConfirmed = raw.supplierConfirmed === true;
  return data;
}

export async function provisionRoute({sql, service, job, grant, login, input}) {
  const fail = (message, status=400) => json({error:message},status);
  if (!service || service.removed_at || !provisionTypes.includes(service.data.type)) return fail('Provision & Store service not found.',404);
  const editable = canEditService(grant,login,job,service);
  const action = input.action;
  if (action === 'provisionItems') {
    const items = await sql.query('SELECT '+columns+' FROM operation_provision_items WHERE service_id=$1 ORDER BY created_at,id',[service.id]);
    return json({items,editable});
  }
  if (!editable) return fail('Assigned Service required.',403);
  if (!uuid(input.id)) return fail('Invalid item.');
  if (action === 'provisionEmail') {
    const [item] = await sql.query('SELECT email_name,encode(email_data,\'base64\') AS content FROM operation_provision_items WHERE service_id=$1 AND id=$2',[service.id,input.id]);
    if (!item?.email_name) return fail('Attachment not found.',404);
    const encoded = encodeURIComponent(item.email_name).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16));
    return new Response(Buffer.from(item.content,'base64'),{headers:{
      'Content-Type':'application/octet-stream',
      'Content-Disposition':"attachment; filename=\"customer-email.msg\"; filename*=UTF-8''"+encoded,
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff'
    }});
  }
  if (!Number.isInteger(input.version) || input.version<0) return fail('Invalid item version.');
  if (action === 'removeProvisionItem') {
    const result = await sql.query('DELETE FROM operation_provision_items WHERE service_id=$1 AND id=$2 AND version=$3 RETURNING id',[service.id,input.id,input.version]);
    return result.length?json({id:input.id}):fail('Item changed. Reopen the service before deleting.',409);
  }
  let data, emailName=null, emailContent=null;
  try {
    data = provisionItemData(input.data);
    if (input.email != null) {
      const {name,content} = input.email;
      if (typeof name!=='string' || name.length>200 || !/\.msg$/i.test(name) || /[\x00-\x1f\x7f/\\]/.test(name) ||
          typeof content!=='string' || content.length>4000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw Error('Choose an Outlook .msg file up to 3 MB.');
      const bytes = Buffer.from(content,'base64');
      if (bytes.length>3000000 || !bytes.subarray(0,8).equals(msgSignature)) throw Error('The attachment is not a supported Outlook .msg file.');
      emailName=name;
      emailContent=content;
    }
  } catch(error) { return fail(error.message); }
  const values=[service.id,input.id,JSON.stringify(data),emailName,emailContent];
  const [item] = input.version===0
    ? await sql.query('INSERT INTO operation_provision_items(service_id,id,data,email_name,email_data) VALUES($1,$2,$3::jsonb,$4,decode($5,\'base64\')) ON CONFLICT DO NOTHING RETURNING '+columns,values)
    : await sql.query('UPDATE operation_provision_items SET data=$3::jsonb, email_name=CASE WHEN $7 THEN $4 ELSE email_name END, email_data=CASE WHEN $7 THEN decode($5,\'base64\') ELSE email_data END, version=version+1 WHERE service_id=$1 AND id=$2 AND version=$6 RETURNING '+columns,[...values,input.version,Boolean(emailName||input.removeEmail===true)]);
  return item?json({item}):fail('Item changed. Reopen the service before saving.',409);
}
