/* Hotel bookings are permission checked and stored per Service. */
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statuses=['Draft','Requested','Confirmed','Checked in','Checked out','Cancelled'];
  const nights=d=>d.checkIn&&d.checkOut?Math.max(0,Math.round((Date.parse(d.checkOut)-Date.parse(d.checkIn))/86400000)):0;
  async function mount(host,{serviceId,api}) {
    if(!host)return;
    let bookings=[],people=[],editable=false,draft=null,saving=false;
    const input=(label,key,type='text',extra='')=>'<label class="hfo-field"><span>'+label+'</span><input name="'+key+'" type="'+type+'" value="'+esc(draft.data[key])+'" '+extra+'></label>';
    const notice=(text,failed=false)=>{const n=host.querySelector('[data-hotel-message]');if(n){n.textContent=text;n.classList.toggle('hfo-alert',failed);}};
    function form(){
      const d=draft.data;
      return '<form data-hotel-form class="hfo-hotel-form"><h4>'+ (draft.id?'Edit booking':'New booking')+'</h4><div class="hfo-form-grid">'+
        input('Hotel name *','hotel','text','required maxlength="300"')+
        input('Address / location','address')+input('Hotel contact / telephone','contact')+
        input('Check-in','checkIn','date')+input('Check-out','checkOut','date')+
        '<label class="hfo-field"><span>Nights</span><output data-hotel-nights>'+nights(d)+'</output></label>'+
        input('Room type','roomType','text','placeholder="Single / Twin / Double"')+
        input('Number of rooms','rooms','number','min="1" max="1000" step="1"')+
        input('Rate per room / night','rate','number','min="0" step="0.01"')+
        input('Currency','currency','text','maxlength="3" pattern="[A-Z]{3}"')+
        input('Booking / confirmation reference','bookingRef')+
        '<label class="hfo-field"><span>Booking status</span><select name="status">'+statuses.map(v=>'<option '+(v===d.status?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div>'+
        '<fieldset class="hfo-hotel-guests"><legend>Guests from this Service</legend>'+
        (people.length?people.map(p=>'<label><input type="checkbox" name="personIds" value="'+esc(p.id)+'" '+(d.personIds?.includes(p.id)?'checked':'')+'> '+esc(p.name)+'</label>').join(''):'<p>Add people in the roster first, then reopen HOTEL to select guests.</p>')+
        '</fieldset><label class="hfo-field"><span>Notes / meals / special requests</span><textarea name="notes" maxlength="1000">'+esc(d.notes)+'</textarea></label>'+
        '<p class="hfo-muted">Estimated room total: <strong data-hotel-total></strong> · excludes taxes and extras</p>'+
        '<div class="hfo-actions"><button class="hfo-btn primary" type="submit">Save booking</button><button class="hfo-btn" type="button" data-hotel-close>Close</button></div></form>';
    }
    function render(){
      host.innerHTML='<div class="hfo-toolbar"><div><h3>HOTEL</h3><small class="hfo-muted">'+bookings.filter(b=>b.data.status!=='Cancelled').length+' active bookings</small></div>'+(editable&&!draft?'<button class="hfo-btn primary" data-hotel-add>+ Add hotel</button>':'')+'</div><p data-hotel-message role="status"></p>'+
        (draft?form():'')+'<div class="hfo-hotel-list">'+
        (bookings.length?bookings.map(b=>{
          const d=b.data,guestNames=(d.personIds||[]).map(id=>people.find(p=>p.id===id)?.name||'Guest no longer in roster');
          const cost=d.rate&&d.rooms&&nights(d)?Number(d.rate)*Number(d.rooms)*nights(d):null;
          return '<article class="hfo-hotel-card"><div class="hfo-toolbar"><h4>'+esc(d.hotel)+'</h4><span class="hfo-status">'+esc(d.status)+'</span></div><p>'+esc(d.checkIn||'Check-in not set')+' → '+esc(d.checkOut||'Check-out not set')+' · '+nights(d)+' nights</p><p>'+esc(d.roomType||'Room type not set')+' · '+esc(d.rooms||'—')+' rooms</p><p><b>Guests:</b> '+esc(guestNames.join(', ')||'Not selected')+'</p><p><b>Reference:</b> '+esc(d.bookingRef||'—')+'</p><p>'+esc(d.address||'')+' '+esc(d.contact||'')+'</p>'+(cost===null?'':'<p>Estimated rooms: '+cost.toLocaleString(undefined,{maximumFractionDigits:2})+' '+esc(d.currency)+'</p>')+(d.notes?'<p>'+esc(d.notes)+'</p>':'')+(editable?'<button class="hfo-btn" data-hotel-edit="'+esc(b.id)+'">Edit booking</button>':'')+'</article>';
        }).join(''):'<p class="hfo-muted">No hotel bookings yet.</p>')+'</div>';
      updateEstimate();
    }
    function capture(){
      const f=host.querySelector('[data-hotel-form]');if(!draft||!f)return;
      const values=new FormData(f);draft.data=Object.fromEntries(values);draft.data.personIds=values.getAll('personIds');draft.data.currency=String(draft.data.currency||'').toUpperCase();
    }
    function updateEstimate(){
      if(!draft)return;
      const d=draft.data,n=nights(d);
      host.querySelector('[data-hotel-nights]').textContent=String(n);
      host.querySelector('[data-hotel-total]').textContent=d.rate&&d.rooms&&n?((Number(d.rate)*Number(d.rooms)*n).toLocaleString(undefined,{maximumFractionDigits:2})+' '+(d.currency||'')):'—';
    }
    host.addEventListener('input',()=>{if(!saving){capture();updateEstimate();}});
    host.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b||saving)return;
      if(b.hasAttribute('data-hotel-add'))draft={data:{hotel:'',status:'Draft',currency:'THB',rooms:'1',personIds:[]}};
      else if(b.dataset.hotelEdit){const record=bookings.find(r=>r.id===b.dataset.hotelEdit);draft={id:record.id,version:record.version,data:structuredClone(record.data)};}
      else if(b.hasAttribute('data-hotel-close'))draft=null;
      else return;
      render();
    });
    host.addEventListener('submit',async event=>{
      if(!event.target.matches('[data-hotel-form]'))return;
      event.preventDefault();if(saving)return;capture();saving=true;
      event.target.querySelectorAll('input,select,textarea,button').forEach(e=>e.disabled=true);
      notice('Saving booking…');
      try{
        const result=await api('saveHotel',{serviceId,...draft});
        if(!host.isConnected)return;
        const i=bookings.findIndex(b=>b.id===result.booking.id);
        if(i<0)bookings.push(result.booking);else bookings[i]=result.booking;
        draft=null;render();notice('Booking saved');
      }catch(error){if(host.isConnected){notice(error.message,true);event.target.querySelectorAll('input,select,textarea,button').forEach(e=>e.disabled=false);}}
      finally{saving=false;}
    });
    try{const result=await api('hotels',{serviceId},'GET');if(!host.isConnected)return;({bookings,people,editable}=result);render();}
    catch(error){if(host.isConnected)host.textContent=error.message;}
  }
  window.HarborFlowHotels={mount};
})();
