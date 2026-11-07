// Solarzed admin panel: sign-in, overview, warranty review, roll registry and coverage settings.
(()=>{
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=String(text);return n;};
 const names={'left-front':'Left front','right-front':'Right front','left-rear':'Left rear','right-rear':'Right rear',rear:'Rear windshield',hood:'Hood','front-bumper':'Front bumper',roof:'Roof',trunk:'Trunk lid','rear-bumper':'Rear bumper','left-front-fender':'Left front fender','right-front-fender':'Right front fender','left-doors':'Left doors','right-doors':'Right doors','left-rear-quarter':'Left rear quarter','right-rear-quarter':'Right rear quarter',mirrors:'Mirrors'};
 const typeLabel=t=>(t||'tint')==='ppf'?'PPF':'Window film';
 const statusLabel={pending:'Pending',active:'Active',rejected:'Rejected'};
 const rollStatus={in_stock:'In stock',shipped:'Shipped',consumed:'Consumed',void:'Void'};
 const qcLabel={pending:'Pending',approved:'Approved',rejected:'Rejected'};
 let flagText={},view='overview',warrantyFilter={status:'pending',flagged:false,q:''};

 async function api(path,body){
  const response=await fetch('/api/admin/'+path,body===undefined?{credentials:'same-origin'}:{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(response.status===401&&path!=='login'){showLogin();throw Error(data.error||'Please sign in.');}
  if(!response.ok)throw Error(data.error||'The request could not be completed.');
  return data;
 }
 const badge=(status,text)=>el('span','pill pill-'+status,text||statusLabel[status]||status);

 // ---- Sign-in ----
 function showLogin(){$('#app-view').hidden=true;$('#login-view').hidden=false;$('#login-password').focus();}
 function showApp(){$('#login-view').hidden=true;$('#app-view').hidden=false;open(view);}
 $('#login-form').addEventListener('submit',async e=>{e.preventDefault();$('#login-error').textContent='';try{await api('login',{password:$('#login-password').value});$('#login-password').value='';showApp();}catch(error){$('#login-error').textContent=error.message;}});
 $('#logout').addEventListener('click',async()=>{try{await api('logout',{});}catch{}showLogin();});

 // ---- Navigation ----
 function open(next){view=next;$$('[data-view]').forEach(b=>b.toggleAttribute('aria-current',b.dataset.view===next));$$('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==next);({overview:loadOverview,warranties:loadWarranties,rolls:loadRolls,settings:loadSettings})[next]().catch(()=>{});}
 $$('[data-view]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.view)));
 $$('[data-refresh]').forEach(b=>b.addEventListener('click',()=>open(view)));

 // ---- Overview ----
 async function loadOverview(){
  const d=await api('overview');flagText=d.flagText||{};
  $('#nav-pending').textContent=d.warranties.pending||'';
  const tiles=[['Pending review',d.warranties.pending||0,'pending'],['Flagged for review',d.warranties.flagged||0,'flag'],['Active warranties',d.warranties.active||0,'active'],['Not approved',d.warranties.rejected||0,'rejected'],['Rolls in stock',d.rolls.byStatus.in_stock||0,'roll'],['Rolls awaiting QC',d.rolls.byQc.pending||0,'roll']];
  $('#kpis').replaceChildren(...tiles.map(([label,value,kind])=>{const t=el('div','kpi kpi-'+kind);t.append(el('b','',value),el('span','',label));return t;}));
  const queue=$('#queue');queue.replaceChildren();
  if(!d.pending.length)queue.append(el('p','muted','Nothing waiting for review.'));
  for(const r of d.pending){const b=el('button','queue-item');b.type='button';const top=el('span','queue-top');top.append(el('b','',r.vehicle),el('span','',r.code));const sub=el('span','queue-sub',`${typeLabel(r.type)} · ${r.installer} · ${r.installed}`);b.append(top,sub);if(r.flags?.length)b.append(badge('flag',`${r.flags.length} flag${r.flags.length>1?'s':''}`));b.addEventListener('click',()=>openWarranty(r.code));queue.append(b);}
  const rows=$('#batches');rows.replaceChildren();
  if(!d.batches.length){const tr=el('tr');const td=el('td','muted','No batches yet.');td.colSpan=5;tr.append(td);rows.append(tr);}
  for(const b of d.batches){const tr=el('tr');for(const v of [b.batch,b.model,b.rolls,b.installs])tr.append(el('td','',v));const f=el('td');f.append(b.flagged?badge('flag',b.flagged):el('span','muted','0'));tr.append(f);rows.append(tr);}
 }

 // ---- Warranties ----
 async function loadWarranties(){
  const p=new URLSearchParams({status:warrantyFilter.status,q:warrantyFilter.q});if(warrantyFilter.flagged)p.set('flagged','1');
  const d=await api('warranties?'+p);flagText=d.flagText||flagText;
  const rows=$('#warranty-rows');rows.replaceChildren();$('#warranty-empty').hidden=d.records.length>0;
  for(const r of d.records){const tr=el('tr');tr.tabIndex=0;const code=el('td');code.append(el('b','mono',r.code));const veh=el('td');veh.append(el('b','',r.vehicle),el('small','',r.vin));tr.append(code,veh,el('td','',typeLabel(r.type)),el('td','',r.installer),el('td','',r.installed));const rev=el('td');rev.append(r.flags?.length?badge('flag',`${r.flags.length} flag${r.flags.length>1?'s':''}`):el('span','muted','Clear'));const st=el('td');st.append(badge(r.status));tr.append(rev,st);const go=()=>openWarranty(r.code);tr.addEventListener('click',go);tr.addEventListener('keydown',e=>{if(e.key==='Enter')go();});rows.append(tr);}
 }
 $$('#status-filter [data-status]').forEach(b=>b.addEventListener('click',()=>{warrantyFilter.status=b.dataset.status;$$('#status-filter [data-status]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));loadWarranties();}));
 $('#flagged-only').addEventListener('change',e=>{warrantyFilter.flagged=e.target.checked;loadWarranties();});
 let searchTimer;$('#warranty-search').addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{warrantyFilter.q=e.target.value.trim();loadWarranties();},250);});

 async function openWarranty(code){
  const d=await api('warranties?q='+encodeURIComponent(code));const r=d.records.find(x=>x.code===code);if(!r)return;flagText=d.flagText||flagText;
  const box=$('#warranty-detail');box.replaceChildren();
  const head=el('div','detail-head');const h=el('div');h.append(el('span','eyebrow',typeLabel(r.type).toUpperCase()),el('h2','',r.vehicle+(r.year?' · '+r.year:'')),el('code','',r.code));head.append(h,badge(r.status));box.append(head);
  if(r.flags?.length){const f=el('div','flags');f.append(el('b','','Review flags'));const ul=el('ul');for(const flag of r.flags)ul.append(el('li','',flagText[flag]||flag));f.append(ul,el('p','muted','A flag is a review signal, not proof of fraud. Check the evidence before deciding.'));box.append(f);}
  const groups=[['Customer',[['Name',r.owner],['Mobile',r.phone]]],['Vehicle',[['VIN',r.vin],['Plate',r.plate],['Make & model',r.vehicle],['Year',r.year||'—']]],['Product',[['Film',r.film],['Roll serial',r.serial],['Registry roll',r.rollId||'Not found'],['Batch',r.batch||'—']]],['Installation',[['Installed on',r.installed],['Center',r.installer],['Seller',r.sellerName],['Seller mobile',r.sellerPhone],['Invoice',r.invoice]]]];
  const grid=el('div','detail-grid');for(const [title,items] of groups){const g=el('section');g.append(el('h3','',title));const dl=el('dl');for(const [k,v] of items){const row=el('div');row.append(el('dt','',k),el('dd','',v||'—'));dl.append(row);}g.append(dl);grid.append(g);}box.append(grid);
  const areas=el('div','detail-areas');areas.append(el('h3','',(r.type||'tint')==='ppf'?'Protected panels':'Tinted windows'));const chips=el('div','chips');for(const a of ((r.type||'tint')==='ppf'?r.panels:r.windows)||[])chips.append(el('span','',names[a]||a));areas.append(chips);box.append(areas);
  if(r.coverage){const c=el('div','detail-coverage');c.append(el('h3','','Coverage'),el('p','',`Film: ${r.coverage.filmEnds?'until '+r.coverage.filmEnds:'per approved product terms'} · Installation: ${r.coverage.installEnds?'until '+r.coverage.installEnds:'per approved product terms'}`));box.append(c);}
  const hist=el('div','history');hist.append(el('h3','','History'));const ol=el('ol');for(const h of r.history||[]){const li=el('li');li.append(el('b','',h.action),el('span','',new Date(h.at).toLocaleString()+' · '+(h.by||'')));if(h.note)li.append(el('p','',h.note));ol.append(li);}hist.append(ol);box.append(hist);
  const form=el('form','decision');form.append(el('h3','','Decision'));const note=el('textarea');note.rows=3;note.maxLength=500;note.placeholder='Note (required to reject): the documented reason or evidence reviewed';note.setAttribute('aria-label','Decision note');const msg=el('p','form-msg');msg.setAttribute('role','status');const actions=el('div','decision-actions');
  for(const [status,label,cls] of [['active','Activate warranty','button dark'],['pending','Keep pending','admin-ghost'],['rejected','Reject','admin-danger']]){const b=el('button',cls,label);b.type='button';b.disabled=r.status===status;b.addEventListener('click',async()=>{msg.textContent='';try{await api(`warranties/${r.code}/decision`,{status,note:note.value});await openWarranty(r.code);if(view==='warranties')loadWarranties();else loadOverview();}catch(error){msg.textContent=error.message;}});actions.append(b);}
  form.append(note,actions,msg);box.append(form);
  const dialog=$('#warranty-dialog');if(!dialog.open)dialog.showModal();
 }
 $('#warranty-dialog').addEventListener('click',e=>{if(e.target.id==='warranty-dialog'||e.target.closest('[data-close]'))e.currentTarget.close();});

 // ---- Rolls ----
 async function loadRolls(){
  const d=await api('rolls?q='+encodeURIComponent($('#roll-search').value.trim()));
  const rows=$('#roll-rows');rows.replaceChildren();$('#roll-empty').hidden=d.rolls.length>0;
  for(const r of d.rolls){const tr=el('tr');const id=el('td');id.append(el('b','mono',r.id));tr.append(id,el('td','',r.model),el('td','',typeLabel(r.type)),el('td','',r.batch),el('td','',r.supplier));
   for(const [field,options] of [['qc',qcLabel],['status',rollStatus]]){const td=el('td');const s=el('select','mini');s.setAttribute('aria-label',`${field==='qc'?'QC':'Status'} for ${r.id}`);for(const [v,l] of Object.entries(options)){const o=el('option','',l);o.value=v;o.selected=r[field]===v;s.append(o);}s.addEventListener('change',async()=>{try{await api('rolls/'+r.id,{[field]:s.value});s.classList.add('saved');setTimeout(()=>s.classList.remove('saved'),900);}catch(error){alert(error.message);loadRolls();}});td.append(s);tr.append(td);}
   tr.append(el('td','',r.installs));rows.append(tr);}
 }
 let rollTimer;$('#roll-search').addEventListener('input',()=>{clearTimeout(rollTimer);rollTimer=setTimeout(loadRolls,250);});
 $('#roll-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target),msg=$('#roll-msg');msg.textContent='';try{const d=await api('rolls',{model:f.get('model'),type:f.get('type'),batch:f.get('batch'),supplier:f.get('supplier'),qc:f.get('qc'),quantity:Number(f.get('quantity'))});msg.textContent=`${d.rolls.length} roll ID${d.rolls.length>1?'s':''} created.`;renderLabels(d.rolls);loadRolls();}catch(error){msg.textContent=error.message;}});
 function renderLabels(rolls){const box=$('#labels');box.replaceChildren();for(const r of rolls){const l=el('div','roll-label');l.append(el('span','label-brand','SOLARZED'),el('b','mono',r.id),el('span','',`${typeLabel(r.type)} · Model ${r.model}`),el('small','',`Batch ${r.batch}`));box.append(l);}$('#labels-card').hidden=false;}
 $('#print-labels').addEventListener('click',()=>{document.body.classList.add('printing-labels');window.print();});
 addEventListener('afterprint',()=>document.body.classList.remove('printing-labels'));

 // ---- Settings ----
 async function loadSettings(){
  const d=await api('settings');const fill=(name,years,value)=>{const s=$(`[name="${name}"]`);s.replaceChildren();const none=el('option','','Not set');none.value='';s.append(none);for(const y of years){const o=el('option','',`${y} year${y>1?'s':''}`);o.value=y;s.append(o);}s.value=value??'';};
  for(const t of ['tint','ppf']){fill(t+'-film',d.options.film,d.settings.durations[t].film);fill(t+'-install',d.options.install,d.settings.durations[t].install);}
 }
 $('#settings-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target),val=k=>f.get(k)===''?null:Number(f.get(k));try{await api('settings',{durations:{tint:{film:val('tint-film'),install:val('tint-install')},ppf:{film:val('ppf-film'),install:val('ppf-install')}}});$('#settings-msg').textContent='Coverage periods saved. They apply to warranties activated from now on.';}catch(error){$('#settings-msg').textContent=error.message;}});

 api('session').then(d=>d.authenticated?showApp():showLogin()).catch(showLogin);
})();
