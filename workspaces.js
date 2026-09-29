/* Phase 1 navigation: no financial records, person data, or sync mutations. */
(() => {
  const sidebar = document.getElementById('primaryNav');
  if (!sidebar) return;
  const groups = [
    ['Operations', [['operations','Port Call Calendar','▦'],['allservices','All Services','☷'],['documents','Documents & Permits','▤'],['alerts','Smart Alerts','⚑']]],
    ['Quotation & Payments', [['commercial','Quotation / PDA / FDA','◫'],['pv','Payment Voucher','▧'],['price','Price Master','¤'],['approvals','Approvals','✓']]]
  ];
  const title = document.getElementById('title');
  const crumb = document.getElementById('crumb');
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const empty = (heading, note) => `<div class="panel"><h2>${heading}</h2><p>ยังไม่มีตัวอย่างเผยแพร่</p><p class="small">${note}</p></div>`;
  const views = {
    commercial: '<div class="tabs" aria-label="Document types"><button type="button" class="tab active" data-doc-type="Quotation">Quotation</button><button type="button" class="tab" data-doc-type="PDA">PDA</button><button type="button" class="tab" data-doc-type="FDA">FDA</button></div>' + empty('Quotation / PDA / FDA','อนุมัติเอกสารและเผยแพร่ตัวอย่างเป็นคนละขั้นตอน · ฟอร์มและ workflow จะเพิ่มในระยะที่ 2'),
    pv: empty('Payment Voucher','สาธารณะเห็นเฉพาะตัวอย่างที่เจ้าของเลือกเผยแพร่ · ผู้รับเงิน บัญชีธนาคาร ต้นทุน และหลักฐานจ่ายไม่เปิดสาธารณะ · ดาวน์โหลด PV ต้องลงชื่อเข้าใช้'),
    price: empty('Published selling rates','เผยแพร่เฉพาะราคาขายที่เจ้าของตรวจ · ต้นทุน Supplier, Margin และกฎส่วนลดไม่เปิดสาธารณะ'),
    approvals: empty('Approvals','ข้อมูลการอนุมัติภายในต้องลงชื่อเข้าใช้ · ช่วงทดลองให้เจ้าของอนุมัติเท่านั้น'),
    documents: '<div class="panel"><h2>Documents & Permits</h2><p>OKTB · Terminal Permit · LOI</p><p>ต้องลงชื่อเข้าใช้และได้รับสิทธิ์ Crew / Visitor แยกต่างหาก</p><p class="small">ระยะที่ 2: สร้างจากข้อมูล Job, รายชื่อ และ Travel ชุดเดียวกัน · ใช้ข้อมูลสมมติเท่านั้น</p></div>',
    allservices: '<div class="panel" role="status">กำลังโหลดรายการ Service…</div>'
  };
  for (const [id, html] of Object.entries(views)) {
    let section = document.getElementById(id);
    if (!section) { section = document.createElement('section'); section.id=id; section.className='view'; document.querySelector('.content').append(section); }
    section.innerHTML=html;
  }
  const anchor = sidebar.querySelector('.group');
  for (const [name, items] of groups) {
    const details=document.createElement('details'); details.className='workspace-group'; details.open=true;
    const summary=document.createElement('summary'); summary.textContent=name; details.append(summary);
    for (const [id,label,icon] of items) {
      let button=sidebar.querySelector(`[data-view="${id}"]`);
      if (!button) { button=document.createElement('button'); button.type='button'; button.className='nav'; button.dataset.view=id; }
      button.innerHTML=`<i aria-hidden="true">${icon}</i><span class="nav-label">${label}</span>`; button.setAttribute('aria-label',label); button.title=label;
      button.addEventListener('click',()=>{
        document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
        sidebar.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b===button));
        title.textContent=label; crumb.textContent=name+' / '+label;
        if(id!=='operations') document.getElementById('createJob').hidden=true;
        if(id==='allservices') loadServices();
        if(window.matchMedia('(max-width: 900px)').matches) document.getElementById('closeNav').click();
      });
      details.append(button);
    }
    anchor.after(details);
  }
  // Insertion after the same anchor reverses order; put Operations first.
  anchor.after(sidebar.querySelectorAll('.workspace-group')[1]);
  const marketing=sidebar.querySelector('[data-view="marketing"]');
  const business=document.createElement('div'); business.className='group'; business.textContent='Business Development';
  const last=sidebar.querySelectorAll('.workspace-group')[1]; last.after(business); business.after(marketing);
  document.getElementById('commercial').addEventListener('click',e=>{const b=e.target.closest('[data-doc-type]');if(!b)return;document.querySelectorAll('[data-doc-type]').forEach(x=>x.classList.toggle('active',x===b));document.querySelector('#commercial h2').textContent=b.dataset.docType;});
  let request=0;
  async function loadServices(){
    const own=++request, section=document.getElementById('allservices'); section.innerHTML=views.allservices;
    try {
      const response=await fetch('/api/operations?action=publicState',{cache:'no-store'});
      if(!response.ok) throw Error('โหลดข้อมูลไม่ได้ กรุณาลองใหม่');
      const data=await response.json(); if(own!==request)return;
      section.innerHTML='<div class="panel"><h2>All Services · Public summary</h2><p class="small">ข้อมูลบุคคลและรายละเอียดภายในไม่แสดงในหน้านี้</p>'+(data.services?.length?'<div class="table-wrap"><table class="table"><thead><tr><th>Vessel</th><th>Service</th><th>Status</th></tr></thead><tbody>'+data.services.map(s=>{const job=data.jobs.find(j=>j.id===s.job_id);return `<tr><td>${escape(job?.data.vessel)}</td><td>${escape(s.data.type)} #${escape(s.seq)}</td><td>${escape(s.data.status)}</td></tr>`;}).join('')+'</tbody></table></div>':'<p>ยังไม่มี Service</p>')+'</div>';
    } catch(error){if(own===request)section.innerHTML='<div class="panel" role="alert">'+escape(error.message)+'</div>';}
  }
})();