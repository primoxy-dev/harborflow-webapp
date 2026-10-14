// Online-only, in-memory queue. No browser storage, background retries or implicit conflict resolution.
export function createDocumentAutosave({load,save,onState=()=>{},onConflict=()=>{},delayMs=800,clock=globalThis}){
 const records=new Map(),pending=new Map();let sourceFingerprint='',timer=null,busy=null,closed=false,lastError=null;
 const status=(state,error)=>{if(!closed)onState(state,error);};
 function cancel(){if(timer!==null)clock.clearTimeout(timer);timer=null;}
 const api={
  async load(){
   if(closed)throw Error('Document closed');const state=await load();if(closed)throw Error('Document closed');
   records.clear();for(const r of state.sections||[])records.set(r.section,structuredClone(r));sourceFingerprint=state.sourceFingerprint;
   pending.clear();lastError=null;status('saved');return state;
  },
  change(section,patch){
   if(closed)return;pending.set(section,{...pending.get(section),...structuredClone(patch)});cancel();
   if(lastError)return;status('unsaved');timer=clock.setTimeout(()=>api.flush().catch(()=>{}),delayMs);
  },
  async flush(){
   if(closed)throw Error('Document closed');cancel();if(lastError?.status===409)throw lastError;if(busy)return busy;
   if(!pending.size)return;
   lastError=null;
   busy=(async()=>{
    try{
     while(pending.size&&!closed){
      const [section,patch]=pending.entries().next().value;pending.delete(section);
      const original=records.get(section),base=Object.fromEntries(Object.keys(patch).map(k=>[k,original?.data[k]??null]));status('saving');
      try{
       const result=await save({section,patch:structuredClone(patch),base,version:original?.version||0,sourceFingerprint});
       if(closed)return;if(!result.record)throw Error('No saved document returned');records.set(section,structuredClone(result.record));
      }catch(error){
       if(closed)return;pending.set(section,{...patch,...pending.get(section)});lastError=error;status(error.status===409?'conflict':'error',error);
       if(error.status===409)onConflict({section,error,local:structuredClone(pending.get(section)),original:original?.data||{}});
       throw error;
      }
     }
     if(!closed)status('saved');
    }finally{busy=null;}
   })();return busy;
  },
  resolve(section,patch,freshState){
   if(closed||busy)throw Error('Document is not ready for conflict resolution');
   const record=freshState.sections.find(r=>r.section===section);if(record)records.set(section,structuredClone(record));else records.delete(section);
   sourceFingerprint=freshState.sourceFingerprint;pending.delete(section);lastError=null;api.change(section,patch);
  },
  snapshot(){return {sourceFingerprint,sections:[...records.values()].map(r=>structuredClone(r))};},
  hasPending(){return !closed&&(pending.size>0||busy!==null);},
  dispose(){closed=true;cancel();pending.clear();records.clear();}
 };
 return api;
}
