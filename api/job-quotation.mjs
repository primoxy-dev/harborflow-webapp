import {nodeHandler,json,sameOrigin,sessionLogin} from '../lib/harborflow.mjs';
import {db,permission,uuid,canEditJob} from '../lib/operations.mjs';
import {invoiceSchema,sellerSchema,buyerSchema,calculateItemTotals,calculateInvoiceTotal} from '../lib/job-quotation-schema.mjs';
const fail=(error,status=400)=>json({error},status);
export async function ensureJobQuotationSchema(sql){
 await sql.query(`CREATE TABLE IF NOT EXISTS job_quotation_documents(job_id uuid PRIMARY KEY REFERENCES operation_jobs(id),document jsonb NOT NULL,profiles jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`);
 await sql.query(`CREATE TABLE IF NOT EXISTS job_quotation_history(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,job_id uuid NOT NULL REFERENCES operation_jobs(id),version integer NOT NULL,document jsonb NOT NULL,profiles jsonb NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(job_id,version))`);
}
export function createJobQuotationRoute(deps={}){return async request=>{
 if(!['GET','POST'].includes(request.method))return fail('Unsupported method',405);
 if(request.method==='POST'&&!sameOrigin(request))return fail('Invalid origin',403);
 const login=(deps.sessionLogin||sessionLogin)(request);if(!login)return fail('Sign in required',401);
 try{
 const sql=(deps.db||db)(),grant=await (deps.permission||permission)(login,sql);if(!grant)return fail('Operations access required',403);
 let input;if(request.method==='POST'){const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>4400000)return fail('Document is too large',413);try{input=JSON.parse(raw);}catch{return fail('Invalid JSON');}}else input=Object.fromEntries(new URL(request.url).searchParams);
 if(!uuid(input.jobId))return fail('Invalid Job');
 const [job]=await sql.query('SELECT id,data FROM operation_jobs WHERE id=$1',[input.jobId]);
 if(!job||grant.role==='editor'&&job.data.pic!==login)return fail('Job not found',404);
 const canEdit=canEditJob(grant,login,job);
 if(request.method==='POST'&&(!canEdit||input.login!==login))return fail('Job edit permission required',403);
 await (deps.ensureSchema||ensureJobQuotationSchema)(sql);
 if(request.method==='GET'){const [record]=await sql.query('SELECT * FROM job_quotation_documents WHERE job_id=$1',[job.id]);return json({login,job:{id:job.id,data:{vessel:job.data.vessel,jobNo:job.data.jobNo,port:job.data.port,principal:job.data.principal}},canEdit,record:record||null});}
 if(!Number.isInteger(input.version)||input.version<0)return fail('Current version required');
 const parsed=invoiceSchema.safeParse(input.document);if(!parsed.success)return fail('Invalid document: '+parsed.error.issues[0]?.message);
 const document=parsed.data;if(document.items.length>200)return fail('Maximum 200 line items');
 const computed=document.items.map(calculateItemTotals);
 if(computed.some((item,index)=>['netAmount','vatAmount','preTaxAmount'].some(key=>item[key]!==document.items[index][key]))||calculateInvoiceTotal(computed)!==document.total)return fail('Document totals changed. Wait for the preview to update and save again.');
 if(document.logo&&!/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(document.logo))return fail('Logo must be an uploaded PNG, JPEG or WebP');
 const profiles={sellers:[],buyers:[]};for(const [key,schema]of [['sellers',sellerSchema],['buyers',buyerSchema]]){const list=input.profiles?.[key]||[];if(!Array.isArray(list)||list.length>50)return fail('Invalid profiles');for(const item of list){const valid=schema.safeParse(item);if(!valid.success)return fail('Invalid '+key+' profile');profiles[key].push(valid.data);}}
 const [record]=await sql.query(`WITH saved AS (INSERT INTO job_quotation_documents(job_id,document,profiles,updated_by) SELECT $1,$2::jsonb,$3::jsonb,$4 WHERE $5=0 ON CONFLICT(job_id) DO NOTHING RETURNING *), updated AS (UPDATE job_quotation_documents SET document=$2::jsonb,profiles=$3::jsonb,updated_by=$4,updated_at=now(),version=version+1 WHERE job_id=$1 AND version=$5 AND $5>0 RETURNING *), result AS (SELECT * FROM saved UNION ALL SELECT * FROM updated), logged AS (INSERT INTO job_quotation_history(job_id,version,document,profiles,actor) SELECT job_id,version,document,profiles,updated_by FROM result) SELECT * FROM result`,[job.id,JSON.stringify(document),JSON.stringify(profiles),login,input.version]);
 return record?json({record}):fail('This quotation changed in another session. Reopen this Job before saving; your changes have not been overwritten.',409);
 }catch(error){console.error('Job quotation:',error.message);return fail('Could not load or save Job quotation',500);}
};}
export default nodeHandler(createJobQuotationRoute());
