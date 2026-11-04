import {nodeHandler,json,sameOrigin,sessionLogin,readJson,gh} from '../lib/harborflow.mjs';
import {db,permission} from '../lib/operations.mjs';
import {CREW_CATALOG_PATH,validCatalog,updateCatalog} from '../lib/crew-price-master.mjs';
const fail=(error,status=400)=>json({error},status);
export function createPriceMasterRoute(deps={}){return async request=>{
 if(!['GET','POST'].includes(request.method))return fail('Unsupported method',405);
 if(request.method==='POST'&&!sameOrigin(request))return fail('Invalid origin',403);
 const login=(deps.sessionLogin||sessionLogin)(request);if(!login)return fail('Sign in required',401);
 try{
  const sql=(deps.db||db)(),grant=await (deps.permission||permission)(login,sql);
  if(grant?.role!=='owner')return fail('Owner permission required',403);
  const catalog=await (deps.readJson||readJson)(CREW_CATALOG_PATH);
  if(!catalog?.sha||!validCatalog(catalog.data))return fail('CREW service template is unavailable',503);
  if(request.method==='GET')return json({login,sha:catalog.sha,currency:'USD',items:catalog.data.items.map(({name,category,unit,price,margin=0})=>({name,category,unit,price,margin}))});
  const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>300000)return fail('Catalog is too large',413);
  let input;try{input=JSON.parse(raw);}catch{return fail('Invalid JSON');}
  if(input.login!==login)return fail('Account changed; reload',409);
  if(input.sha!==catalog.sha)return fail('Price Master changed in another session. Reload before saving.',409);
  let next;try{next=updateCatalog(catalog.data,input.items);}catch{return fail('Invalid catalog items');}
  try{await (deps.gh||gh)('PUT',CREW_CATALOG_PATH,{message:'Update CREW Price Master',sha:catalog.sha,content:Buffer.from(JSON.stringify(next,null,2)+'\n').toString('base64')});}
  catch(error){if(/\b409\b|\b422\b/.test(error.message))return fail('Price Master changed in another session. Reload before saving.',409);throw error;}
  return json({ok:true});
 }catch(error){console.error('Price Master:',error.message);return fail('Could not load or save Price Master',500);}
};}
export default nodeHandler(createPriceMasterRoute());
