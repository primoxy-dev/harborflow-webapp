import { randomUUID } from 'node:crypto';
import { nodeHandler, json, sameOrigin, sessionLogin } from '../lib/harborflow.mjs';
import { db, permission, uuid, textField } from '../lib/operations.mjs';
import { CURRENCIES, customerProjection, quoteTotals, numeric, roundMoney, timeCostPerTrip } from '../quotation-model.mjs';
import { ensureQuotationSchema } from '../lib/quotation-schema.mjs';

const fail=(message,status=400)=>json({error:message},status);
const loginPattern=/^[a-z0-9-]{1,39}$/;
const fields=['number','date','customer','vessel','jobNo','port','category','currency','exchangeRate','exchangeDate','notes'];
const lineFields=['id','description','unit','saleQuantity','salePrice','vatMode','vatRate','customerNote'];
const costFields=['costUnit','costQuantity','costVatMode','costVatRate','costNote','rateId','rateVersion','rateDateConfirmed','markupType','markup','markupBase','billingType','costBaseUnit','minimumHours','hoursPerTrip','additionalHourlyRate'];
const pick=(object,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(object||{},key)).map(key=>[key,object[key]]));
const validText=(x,max=500)=>typeof x==='string'&&x.length<=max;
const categoryName=value=>/^crew\s+change$/i.test(String(value||'').trim())?'Crew Change':String(value||'').trim().replace(/\s+/g,' ');
const validDate=x=>x===''||typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const safeRate=rate=>rate&&typeof rate==='object'&&validText(rate.port,150)&&validText(rate.category,100)&&validText(rate.description,500)&&validText(rate.unit,80)&&validText(rate.conditions||'',2000)&&validText(rate.source||'',300)&&validText(rate.direction||'',100)&&validDate(rate.validFrom||'')&&validDate(rate.validUntil||'')&&(rate.amount==null||numeric(rate.amount))&&(!rate.billingType||['flat','hours'].includes(rate.billingType))&&(!rate.validFrom||!rate.validUntil||rate.validFrom<=rate.validUntil);

function validate(data) {
  if (!data || typeof data!=='object' || !CURRENCIES.includes(data.currency) || !validDate(data.date||'') || !validDate(data.exchangeDate||'') || (data.exchangeRate!==''&&data.exchangeRate!=null&&(!numeric(data.exchangeRate)||Number(data.exchangeRate)<=0))) return 'Invalid quotation details';
  if(fields.filter(k=>!['currency','exchangeRate','date','exchangeDate'].includes(k)).some(k=>!validText(data[k]??'',k==='notes'?3000:500)))return 'Invalid quotation text';
  if(!Array.isArray(data.lines)||data.lines.length>200)return 'Invalid quotation lines';
  const seen=new Set();
  for(const line of data.lines){
    if(!uuid(line.id)||seen.has(line.id)||!validText(line.description||'',500)||!validText(line.unit||'',80)||!validText(line.customerNote||'',1000))return 'Invalid quotation line';
    seen.add(line.id);
    for(const k of ['saleQuantity','salePrice','vatRate','costUnit','costQuantity','costVatRate','markup','markupBase','costBaseUnit','minimumHours','hoursPerTrip','additionalHourlyRate'])if(line[k]!==''&&line[k]!=null&&!numeric(line[k]))return 'Invalid amount';
    if(numeric(line.salePrice)&&roundMoney(Number(line.salePrice))!==Number(line.salePrice))return 'Selling price must have at most two decimal places';
    if(line.vatMode&&!['included','excluded','none'].includes(line.vatMode))return 'Invalid VAT mode';
    if(line.costVatMode&&!['included','excluded','none','unknown'].includes(line.costVatMode))return 'Invalid cost VAT';
    if(line.rateId&&!uuid(line.rateId))return 'Invalid cost reference';
    if(line.costNote&&!validText(line.costNote,2000))return 'Invalid cost note';
  }
  return '';
}
function complete(data) {
  return !!(data.number?.trim()&&validDate(data.date)&&data.date&&data.customer?.trim()&&data.port?.trim()&&data.category?.trim()&&
    (data.currency==='THB'||numeric(data.exchangeRate)&&Number(data.exchangeRate)>0&&validDate(data.exchangeDate)&&data.exchangeDate)&&quoteTotals(data).complete);
}
function project(row,maySeeCost) {
  return {...row,data:maySeeCost?row.data:customerProjection(row.data)};
}
const scopedJob=(op,login,job)=>!!job&&(op.role==='owner'||op.role==='viewer'||op.role==='editor'&&job.data?.pic===login);
const canSee=(q,login,op,grant,jobs)=>op.role==='owner'||!!grant.quoteView&&(q.job_id?scopedJob(op,login,jobs.get(q.job_id)):q.created_by===login||(q.shared_with||[]).includes(login));
const canEdit=(q,login,op,grant,jobs)=>op.role==='owner'||!!grant.quoteEdit&&op.role==='editor'&&(q.job_id?scopedJob(op,login,jobs.get(q.job_id)):q.created_by===login||(q.shared_with||[]).includes(login));

export function createQuotationRoute(deps={}) {
  return async request=>{
    if(!['GET','POST'].includes(request.method))return fail('Unsupported method',405);
    if(request.method==='POST'&&!sameOrigin(request))return fail('Invalid origin',403);
    const login=(deps.sessionLogin||sessionLogin)(request);if(!login)return fail('Sign in required',401);
    if(!deps.db&&!process.env.DATABASE_URL)return fail('Database not configured',503);
    try {
      const sql=(deps.db||db)(), op=await (deps.permission||permission)(login,sql);
      if(!op)return fail('Operations permission required',403);
      await (deps.ensureSchema||ensureQuotationSchema)(sql);
      const isOwner=op.role==='owner';
      const [rawGrant]=isOwner?[]:await sql.query('SELECT * FROM quotation_grants WHERE login=$1',[login]);
      const grant=isOwner?{quoteView:true,quoteEdit:true,costView:true,costManage:true}:{quoteView:!!(rawGrant?.quote_view||rawGrant?.quote_edit),quoteEdit:!!rawGrant?.quote_edit,costView:!!(rawGrant?.cost_view||rawGrant?.cost_manage),costManage:!!rawGrant?.cost_manage};
      const q=async(text,params=[])=>sql.query(text,params);
      const getJobs=async()=>new Map((await q('SELECT id,data FROM operation_jobs ORDER BY updated_at DESC LIMIT 500')).filter(j=>scopedJob(op,login,j)).map(j=>[j.id,j]));
      const input=request.method==='GET'?Object.fromEntries(new URL(request.url).searchParams):await (async()=>{const text=await request.text();if(text.length>500000)throw Error('Request too large');return JSON.parse(text||'{}');})();
      const action=input.action||'state';
      if(request.method==='GET'&&action==='state'){
        const jobs=await getJobs();
        const quotes=grant.quoteView?await q('SELECT * FROM quotations ORDER BY updated_at DESC LIMIT 500'):[];
        const rates=grant.costView?await q('SELECT * FROM quotation_rates WHERE removed_at IS NULL ORDER BY updated_at DESC LIMIT 2000'):[];
        const deletedRates=grant.costManage?await q('SELECT * FROM quotation_rates WHERE removed_at IS NOT NULL ORDER BY removed_at DESC LIMIT 2000'):[];
        const categories=grant.costView||grant.quoteView?await q('SELECT port,name FROM quotation_categories ORDER BY port,name'):[];
        const grants=isOwner?await q('SELECT * FROM quotation_grants ORDER BY login'):[];
        const access=isOwner?await q('SELECT login,role FROM operation_grants ORDER BY login'):[];
        return json({login,grant,role:op.role,jobs:[...jobs.values()].map(j=>({id:j.id,data:pick(j.data,['jobNo','vessel','port','principal','eta','pic'])})),quotations:quotes.filter(x=>canSee(x,login,op,grant,jobs)).map(x=>project(x,grant.costView)),rates,deletedRates,categories,grants,access});
      }
      if(request.method==='GET'&&action==='revisions'){
        const jobs=await getJobs(),[quote]=await q('SELECT * FROM quotations WHERE id=$1',[input.id]);
        if(!quote||!canSee(quote,login,op,grant,jobs))return fail('Quotation not found',404);
        const list=await q('SELECT * FROM quotation_revisions WHERE quotation_id=$1 ORDER BY revision DESC',[quote.id]);
        return json({revisions:list.filter(row=>canSee({...quote,job_id:row.job_id},login,op,grant,jobs)).map(row=>project(row,grant.costView))});
      }
      if(request.method!=='POST')return fail('Unknown action',404);
      if(input.login!==login)return fail('Account changed; reopen quotation',409);
      if(action==='grant'){
        if(!isOwner)return fail('Owner permission required',403);
        const target=String(input.target||'').trim().toLowerCase();if(!loginPattern.test(target))return fail('Invalid account');
        const [exists]=await q('SELECT login FROM operation_grants WHERE login=$1',[target]);if(!exists)return fail('Account needs Operations access first');
        const quoteEdit=input.quoteEdit===true,costManage=input.costManage===true;
        const flags=[input.quoteView===true||quoteEdit,quoteEdit,input.costView===true||costManage,costManage];
        await q(`INSERT INTO quotation_grants(login,quote_view,quote_edit,cost_view,cost_manage,updated_by) VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(login) DO UPDATE SET quote_view=$2,quote_edit=$3,cost_view=$4,cost_manage=$5,updated_by=$6,updated_at=now()`,[target,...flags,login]);
        return json({ok:true});
      }
      if(action==='importRates'){
        if(!grant.costManage)return fail('Cost management permission required',403);
        if(!Array.isArray(input.rates)||!input.rates.length||input.rates.length>500||input.rates.some(rate=>!safeRate(rate)))return fail('Invalid import data');
        // A single SQL statement makes the review batch all-or-nothing; nothing is approved on import.
        const entries=input.rates.map(rate=>({id:randomUUID(),data:{...pick(rate,['port','category','description','unit','amount','conditions','source','direction','validFrom','validUntil','warning']),category:categoryName(rate.category)}}));
        await q(`WITH imported AS (INSERT INTO quotation_rates(id,data,status,updated_by) SELECT (x->>'id')::uuid,x->'data','pending',$2 FROM jsonb_array_elements($1::jsonb) x RETURNING data),
          categories AS (INSERT INTO quotation_categories(port,name,created_by) SELECT DISTINCT data->>'port',data->>'category',$2 FROM imported WHERE btrim(data->>'port')<>'' AND btrim(data->>'category')<>'' ON CONFLICT DO NOTHING) SELECT count(*) FROM imported`,[JSON.stringify(entries),login]);
        return json({count:entries.length});
      }
      if(action==='addCategory'){
        if(!grant.costManage)return fail('Cost management permission required',403);
        if(!validText(input.port,150)||!validText(input.name,100))return fail('Invalid service category');
        const port=input.port.trim(),name=categoryName(input.name);if(!port||!name)return fail('Port and category name are required');
        const [created]=await q('INSERT INTO quotation_categories(port,name,created_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING port,name',[port,name,login]);
        if(created)return json({category:created},201);
        return fail('This service category already exists for the Port',409);
      }
      if(['deleteRate','restoreRate'].includes(action)){
        if(!grant.costManage)return fail('Cost management permission required',403);
        if(!uuid(input.id)||!Number.isInteger(input.version)||input.version<1)return fail('Rate and current version required');
        const removing=action==='deleteRate';
        const [changed]=await q(`WITH changed AS (
          UPDATE quotation_rates SET removed_at=${removing?'now()':'NULL'},updated_by=$3,updated_at=now(),version=version+1
          WHERE id=$1 AND version=$2 AND removed_at IS ${removing?'NULL':'NOT NULL'} RETURNING *
        ), logged AS (INSERT INTO quotation_rate_history(rate_id,version,actor,data,status,action)
          SELECT id,version,$3,data,status,$4 FROM changed) SELECT * FROM changed`,[input.id,input.version,login,removing?'delete':'restore']);
        return changed?json({rate:changed}):fail('Rate changed; reload and review',409);
      }
      if(action==='saveRate'){
        if(!grant.costManage)return fail('Cost management permission required',403);
        if(!safeRate(input.data)||!['pending','approved'].includes(input.status)||input.status==='approved'&&(!numeric(input.data.amount)||!input.data.description.trim()||!input.data.unit.trim()||!input.data.port.trim()||input.data.warning?.includes('minimum_and_additional_time')&&input.data.billingType!=='hours'||input.data.billingType==='hours'&&(!numeric(input.data.minimumHours)||!numeric(input.data.additionalHourlyRate))))return fail('Complete rate details before approval');
        const id=input.id||randomUUID();if(!uuid(id)||!Number.isInteger(input.version)||input.version<0)return fail('Invalid rate');
        const data=pick(input.data,['port','category','description','unit','amount','conditions','source','direction','validFrom','validUntil','warning','billingType','minimumHours','additionalHourlyRate']);
        data.category=categoryName(data.category);data.port=data.port.trim();
        if(!data.category||!data.port)return fail('Port and category are required');
        const [saved]=await q(`WITH inserted AS (INSERT INTO quotation_rates(id,data,status,updated_by) SELECT $1,$3::jsonb,$4,$5 WHERE $2=0 ON CONFLICT DO NOTHING RETURNING *),
          updated AS (UPDATE quotation_rates SET data=$3::jsonb,status=$4,updated_by=$5,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND $2>0 AND removed_at IS NULL RETURNING *),
          result AS (SELECT * FROM inserted UNION ALL SELECT * FROM updated), log AS (INSERT INTO quotation_rate_history(rate_id,version,actor,data,status) SELECT id,version,$5,data,status FROM result),
          categories AS (INSERT INTO quotation_categories(port,name,created_by) SELECT data->>'port',data->>'category',$5 FROM result ON CONFLICT DO NOTHING) SELECT * FROM result`,[id,input.version,JSON.stringify(data),input.status,login]);
        return saved?json({rate:saved}):fail('Rate changed; reload and review',409);
      }
      if(!grant.quoteEdit||op.role==='viewer')return fail('Quotation editing permission required',403);
      if(action==='save'){
        const jobs=await getJobs(),id=input.id||randomUUID();if(!uuid(id)||!Number.isInteger(input.version)||input.version<0)return fail('Invalid quotation');
        const [current]=await q('SELECT * FROM quotations WHERE id=$1',[id]);
        if(current&&!canEdit(current,login,op,grant,jobs))return fail('Quotation not found',404);
        if((current?.version||0)!==input.version)return fail('Quotation changed; reload and review',409);
        const jobId=input.jobId||null;if(jobId&&(!uuid(jobId)||!jobs.has(jobId)))return fail('Job access required',403);
        const data={...pick(input.data,fields),lines:(Array.isArray(input.data?.lines)?input.data.lines:[]).map(line=>{
          const base=pick(line,lineFields);const old=current?.data?.lines?.find(item=>item.id===line.id);
          return {...base,...(grant.costView?pick(line,costFields):pick(old,costFields))};
        })};
        const invalid=validate(data);if(invalid)return fail(invalid);
        if(grant.costView){
          for(const line of data.lines){
            if(!line.rateId)continue;
            const old=current?.data?.lines?.find(item=>item.id===line.id);
            const sameSnapshot=old?.rateId===line.rateId&&old?.rateVersion===line.rateVersion&&['billingType','costBaseUnit','minimumHours','additionalHourlyRate','rateDateConfirmed'].every(key=>String(old?.[key]??'')===String(line[key]??''));
            if(sameSnapshot){
              if(line.billingType==='hours'){
                const expected=timeCostPerTrip(line.costBaseUnit,line.minimumHours,line.hoursPerTrip,line.additionalHourlyRate);
                if(expected===null?line.costUnit===''||line.costUnit==null:numeric(line.costUnit)&&Number(line.costUnit)===expected)continue;
              }else if(String(old.costUnit)===String(line.costUnit))continue;
            }
            const [rate]=await q('SELECT * FROM quotation_rates WHERE id=$1',[line.rateId]);
            if(!rate||rate.removed_at||rate.status!=='approved'||rate.version!==Number(line.rateVersion)||rate.data.port!==data.port||categoryName(rate.data.category)!==categoryName(data.category)||line.rateDateConfirmed!==true)return fail('Approved cost rate must be current and confirmed before use',409);
            if(rate.data.billingType==='hours'){
              if(line.billingType!=='hours'||Number(line.costBaseUnit)!==Number(rate.data.amount)||Number(line.minimumHours)!==Number(rate.data.minimumHours)||Number(line.additionalHourlyRate)!==Number(rate.data.additionalHourlyRate))return fail('Review the time-based rate',409);
              const expected=timeCostPerTrip(line.costBaseUnit,line.minimumHours,line.hoursPerTrip,line.additionalHourlyRate);
              if(expected===null?line.costUnit!==''&&line.costUnit!=null:!numeric(line.costUnit)||Number(line.costUnit)!==expected)return fail('Enter and confirm hours for the rate',409);
            }else if(Number(rate.data.amount)!==Number(line.costUnit))return fail('Review the approved cost rate',409);
          }
        }
        const revision=current?.status==='sent'?current.revision+1:(current?.revision||1);
        const [saved]=current?await q(`UPDATE quotations SET job_id=$2,data=$3::jsonb,revision=$4,status='draft',version=version+1,updated_at=now() WHERE id=$1 AND version=$5 RETURNING *`,[id,jobId,JSON.stringify(data),revision,input.version]):await q(`INSERT INTO quotations(id,job_id,created_by,data) VALUES($1,$2,$3,$4::jsonb) RETURNING *`,[id,jobId,login,JSON.stringify(data)]);
        return saved?json({quotation:project(saved,grant.costView)}):fail('Quotation changed; reload and review',409);
      }
      if(!uuid(input.id))return fail('Invalid quotation');
      const jobs=await getJobs(),[quote]=await q('SELECT * FROM quotations WHERE id=$1',[input.id]);
      if(!quote||!canEdit(quote,login,op,grant,jobs))return fail('Quotation not found',404);
      if(input.version!==quote.version)return fail('Quotation changed; reload and review',409);
      if(action==='markSent'){
        if(quote.status!=='draft'||!complete(quote.data))return fail('Complete quotation before marking sent');
        const [saved]=await q(`WITH updated AS (UPDATE quotations SET status='sent',version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND status='draft' RETURNING *),
          revision AS (INSERT INTO quotation_revisions(quotation_id,revision,data,job_id,actor) SELECT id,revision,data,job_id,$3 FROM updated RETURNING id) SELECT * FROM updated`,[quote.id,quote.version,login]);
        return saved?json({quotation:project(saved,grant.costView)}):fail('Quotation changed; reload and review',409);
      }
      if(action==='share'){
        if(quote.job_id||!isOwner&&quote.created_by!==login)return fail('Only creator or owner can share standalone quotations',403);
        const targets=Array.isArray(input.users)?[...new Set(input.users)]:[];if(targets.length>50||targets.some(x=>!loginPattern.test(x)))return fail('Invalid share list');
        const [saved]=await q('UPDATE quotations SET shared_with=$3::text[],version=version+1,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *',[quote.id,quote.version,targets]);
        return saved?json({quotation:project(saved,grant.costView)}):fail('Quotation changed; reload and review',409);
      }
      return fail('Unknown action',404);
    }catch(error){return fail('Quotation service unavailable. Check database setup and retry.',503);}
  };
}
export default nodeHandler(createQuotationRoute());
