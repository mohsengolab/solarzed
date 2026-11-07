// Customer warranty inquiry: one field for warranty number, VIN or mobile, then the digital certificate.
(()=>{
 const form=document.querySelector('#inquiry-form');if(!form)return;
 const input=form.querySelector('#inquiry-q'),result=document.querySelector('#inquiry-result'),submit=form.querySelector('#inquiry-submit');
 const isPreview=location.protocol==='file:'||new URLSearchParams(location.search).get('preview')==='1';
 const names={'left-front':'Left front','right-front':'Right front','left-rear':'Left rear','right-rear':'Right rear',rear:'Rear windshield',hood:'Hood','front-bumper':'Front bumper',roof:'Roof',trunk:'Trunk lid','rear-bumper':'Rear bumper','left-front-fender':'Left front fender','right-front-fender':'Right front fender','left-doors':'Left doors','right-doors':'Right doors','left-rear-quarter':'Left rear quarter','right-rear-quarter':'Right rear quarter',mirrors:'Mirrors'};
 const sample={code:'SZ-DEMO-0001',sample:true,type:'ppf',typeLabel:'Paint protection film',vehicle:'Toyota Camry',year:'2024',plate:'DEMO 123',vinMasked:'JTD••••456789',film:'Solarzed Sample PPF',serial:'SZ-SAMPLE-ROLL',installed:'2026-01-15',installer:'Example Tint Studio',panels:['hood','front-bumper','left-front-fender','right-front-fender','mirrors']};
 // Work out what the customer typed: a warranty number, a VIN or a mobile number.
 const digits=v=>v.replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));
 function detect(raw){const v=digits(raw).trim();if(/^SZ-/i.test(v))return 'code';const vin=v.toUpperCase().replace(/[\s-]/g,'');if(/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)&&/[A-Z]/.test(vin))return 'vin';if(/^\+?\d{7,15}$/.test(v.replace(/[\s()-]/g,'')))return 'phone';return null;}
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function notice(text,kind='error'){result.replaceChildren();const box=el('div','inquiry-notice '+kind);box.append(el('b','',kind==='error'?'No warranty found':'Please note'),el('p','',text));result.append(box);}
 function certificate(r){
  const card=el('article','certificate');const tint=(r.type||'tint')==='tint';
  const top=el('div','certificate-top');const brand=el('div','certificate-brand');brand.append(el('span','','SOLARZED'),el('small','','DIGITAL WARRANTY'));
  const badges=el('div','certificate-badges');badges.append(el('span','type-badge '+(tint?'is-tint':'is-ppf'),r.typeLabel||(tint?'Window film':'Paint protection film')),el('span','status-badge is-'+(r.status||'pending'),r.sample?'Sample certificate':(r.statusLabel||'Registered · pending verification')));top.append(brand,badges);
  const id=el('div','certificate-id');id.append(el('small','','Warranty number'));const code=el('code','',r.code);const copy=el('button','copy-code','Copy');copy.type='button';copy.onclick=()=>{navigator.clipboard?.writeText(r.code).then(()=>{copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy',1600);}).catch(()=>{});};const row=el('div','certificate-code');row.append(code,copy);id.append(row);
  const vehicle=el('h3','',`${r.vehicle||''}${r.year?' · '+r.year:''}`);
  const dl=el('dl','certificate-grid');for(const [k,v] of [['VIN',r.vinMasked||'—'],['License plate',r.plate||'—'],['Product',r.film],['Roll serial',r.serial],['Installed on',r.installed],['Installation center',r.installer]]){const g=el('div');g.append(el('dt','',k),el('dd','',v||'—'));dl.append(g);}
  const cover=el('div','certificate-coverage');const ends={film:r.coverage?.filmEnds,install:r.coverage?.installEnds};for(const [key,name] of [['film','Film warranty'],['install','Installation warranty']]){const c=el('div');c.append(el('b','',name));const dates=el('p');dates.append(el('span','','Starts '+r.installed),el('span','',r.status==='active'&&ends[key]?'Ends '+ends[key]:r.status==='active'?'Ends per approved product terms':'Confirmed after verification'));c.append(dates);cover.append(c);}
  const areas=el('div','certificate-areas');areas.append(el('b','',tint?'Tinted windows':'Protected panels'));const chips=el('div','chips');for(const a of (tint?r.windows:r.panels)||[])chips.append(el('span','',names[a]||a));areas.append(chips);
  const foot=el('div','certificate-foot');foot.append(el('p','',r.status==='active'?'This warranty has been verified by Solarzed. Keep your warranty number for any service request.':r.status==='rejected'?(r.statusNote||'This registration was not approved. Please contact Solarzed support.'):'Registration is a record of installation. Coverage is confirmed after the product and installation details are verified.'));const actions=el('div','certificate-actions');const print=el('button','','Print');print.type='button';print.onclick=()=>{card.classList.add('is-printing');window.print();};const claim=el('a','','Request service ↗');claim.href='contact.html';actions.append(print,claim);foot.append(actions);
  if(r.status==='rejected')card.classList.add('is-rejected');card.append(top,id,vehicle,dl,cover,areas,foot);return card;}
 function show(records,heading){result.replaceChildren();if(heading)result.append(el('p','inquiry-count',heading));records.forEach(r=>result.append(certificate(r)));result.querySelector('.certificate')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});}
 async function search(){
  const q=input.value.trim();
  if(!q){input.setCustomValidity('Please enter your warranty number, VIN or mobile number.');input.reportValidity();return;}
  input.setCustomValidity('');
  if(q.toUpperCase()===sample.code){show([sample]);return;}
  const by=detect(q);
  if(!by){notice('Enter your warranty number (starting with SZ-), the 17-character VIN of your vehicle, or the mobile number you gave your installer.','info');return;}
  if(isPreview){notice('Design preview: use “See a sample certificate” to view an example.','info');return;}
  submit.disabled=true;submit.textContent='Searching…';
  try{const response=await fetch('/api/warranty?by='+by+'&q='+encodeURIComponent(q));const data=await response.json();if(!response.ok)throw Error(data.error||'No warranty found.');const n=data.records.length;show(data.records,n>1?`${n} warranties found`:'');}
  catch(error){notice(error.message==='Failed to fetch'?'The warranty service is unavailable right now. Please try again shortly.':error.message);}
  finally{submit.disabled=false;submit.textContent='Query';}
 }
 form.addEventListener('submit',e=>{e.preventDefault();search();});
 document.querySelector('#inquiry-sample')?.addEventListener('click',()=>{input.value=sample.code;show([sample]);});
 addEventListener('afterprint',()=>document.querySelectorAll('.certificate.is-printing').forEach(c=>c.classList.remove('is-printing')));
 // Links from the installer SMS or a QR code: warranty.html?code=… / ?vin=… / ?phone=… / ?q=…
 const params=new URLSearchParams(location.search);for(const key of ['code','vin','phone','q'])if(params.get(key)){input.value=params.get(key);search();break;}
})();
