export async function prepareDocumentDownload({flush,load,current,login,hasPending=()=>false}){
 await flush();const expected=current(),fresh=await load();
 if(hasPending())throw Error('มีการแก้ไขใหม่ กรุณารอบันทึกและดาวน์โหลดอีกครั้ง');
 if(fresh.login!==login||!fresh.preview?.downloadAllowed)throw Error('สิทธิ์หรือบัญชีเปลี่ยน กรุณาเปิดเอกสารใหม่');
 if(fresh.sourceFingerprint!==expected.sourceFingerprint)throw Error('ข้อมูลต้นทางเปลี่ยน กรุณาเปิดเอกสารใหม่และตรวจความต่าง');
 const versions=state=>JSON.stringify((state.sections||[]).map(r=>[r.section,r.version]).sort());
 if(versions(fresh)!==versions(expected))throw Error('เอกสารถูกแก้จากอีกเครื่อง กรุณาเปิดเอกสารใหม่และตรวจความต่าง');
 return fresh;
}
