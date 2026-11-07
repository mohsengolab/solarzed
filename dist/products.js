// Series product page (Carbins-style): series menu, large product stage, thumbnail selector,
// spec table and product introduction, all rendered from products-data.js.
(()=>{
 const data=window.SOLARZED_CATALOG,$=s=>document.querySelector(s);
 if(!data||!$('#showcase-stage'))return;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const category=id=>data.categories.find(c=>c.id===id)||{label:'',structure:[]};
 const params=new URLSearchParams(location.search);
 const series=data.series.find(s=>s.id===params.get('series'))||data.series.find(s=>s.category===params.get('category'))||data.series[0];
 const cat=category(series.category);

 // A product visual: the supplied photo, or a film roll in the product's shade with the vehicle.
 function stage(product,large){
  const box=el('div','stage'+(large?' is-large':''));
  if(product.image){const img=el('img','stage-photo');img.src=product.image;img.alt=large?product.name:'';box.append(img);}
  else{box.append(el('span','stage-brand','SOLARZED'));const roll=el('div','roll');roll.style.setProperty('--swatch',product.swatch||'#0b1d3a');roll.append(el('span','roll-end'),el('span','roll-sheet'));const car=el('img','stage-car');car.src='assets/car.png';car.alt='';car.loading=large?'eager':'lazy';box.append(roll,car);}
  if(large){const tag=el('div','stage-tag');tag.append(el('b','',product.model),el('small','',`${cat.label.toUpperCase()} · ${product.name}`));box.append(tag);}
  return box;}

 // Series menu grouped by category.
 const nav=$('#series-nav');
 for(const c of data.categories){const group=el('div','series-group');group.append(el('span','',c.label));for(const s of data.series.filter(s=>s.category===c.id)){const a=el('a','',s.name);a.href='?series='+s.id;if(s===series)a.setAttribute('aria-current','page');group.append(a);}nav.append(group);}

 document.title=`${series.name} | Solarzed`;
 $('#crumb-series').textContent=series.name;
 $('#series-title').textContent=series.name;
 $('#showcase-category').textContent=cat.label.toUpperCase();
 $('#intro-text').textContent=series.description;
 const banner=$('#series-banner');banner.style.setProperty('--banner',`url('${series.banner}')`);$('#banner-category').textContent=cat.label.toUpperCase();$('#banner-title').textContent=series.name;$('#banner-tagline').textContent=series.tagline;

 // Spec table: header row, values below.
 const [head,body]=[$('#spec-grid thead tr'),$('#spec-grid tbody tr')];
 for(const [k,v] of series.specs){const th=el('th','',k);th.scope='col';head.append(th);body.append(el('td','',v));}

 // Layer construction for the category.
 const visual=$('#layers-visual'),list=$('#layers-list');
 cat.structure.forEach(([name,text],i)=>{const layer=el('div','layer');layer.style.setProperty('--i',i);layer.append(el('span','',name));visual.append(layer);const li=el('li');li.append(el('b','',name),el('p','',text));list.append(li);});

 // Product selection.
 const thumbs=$('#thumbs'),buttons=[];
 function select(i,focus){const p=series.products[i];$('#showcase-stage').replaceChildren(stage(p,true));$('#showcase-name').textContent=p.name;$('#showcase-model').textContent=p.model;$('#showcase-text').textContent=`${p.name} from the ${series.name}. ${series.tagline}`;buttons.forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));if(focus)buttons[i].scrollIntoView({block:'nearest',inline:'nearest'});const url=new URL(location);url.searchParams.set('series',series.id);url.searchParams.set('model',p.model);history.replaceState(null,'',url);}
 series.products.forEach((p,i)=>{const b=el('button','thumb');b.type='button';b.setAttribute('aria-label',`${p.name}, model ${p.model}`);b.append(stage(p,false));const meta=el('span','thumb-meta');meta.append(el('b','',p.model),el('span','',p.name));b.append(meta);b.addEventListener('click',()=>select(i,true));thumbs.append(b);buttons.push(b);});
 document.querySelectorAll('.thumbs-arrow').forEach(a=>a.addEventListener('click',()=>thumbs.scrollBy({left:Number(a.dataset.dir)*thumbs.clientWidth*.8,behavior:'smooth'})));
 const start=Math.max(0,series.products.findIndex(p=>p.model===params.get('model')));
 select(start,false);
 if(data.sample)$('#catalog-sample')?.removeAttribute('hidden');
})();
