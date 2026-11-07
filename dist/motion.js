// Cinematic motion layer: header state, hero particles, car parallax, count-ups and scroll reveals.
(()=>{
 const root=document.documentElement,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,capture=new URLSearchParams(location.search).get('capture')==='1';
 const header=document.querySelector('.sv-header');
 const onScroll=()=>header?.classList.toggle('is-scrolled',scrollY>24);
 addEventListener('scroll',onScroll,{passive:true});onScroll();
 if(reduce||capture)return;
 root.classList.add('sz-motion');

 // Reveal on scroll; content stays visible if the observer never fires.
 const revealTargets=document.querySelectorAll('.sv-intro-copy>*,.sv-intro figure,.sv-facts h2,.sv-facts-inner>p,.sv-fact-grid>div,.sv-section-title,.sv-photo-card,.sv-registration h2,.sv-registration p,.sv-registration-actions a,.sv-contact>div,.page-intro>*');
 if('IntersectionObserver' in window){
  const io=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){e.target.classList.add('sz-in');io.unobserve(e.target);}},{threshold:.12,rootMargin:'0px 0px -40px 0px'});
  revealTargets.forEach((el,i)=>{el.classList.add('sz-reveal');el.style.setProperty('--sz-delay',`${(i%4)*90}ms`);io.observe(el);});
  setTimeout(()=>revealTargets.forEach(el=>el.classList.add('sz-in')),4000);

  // Count numbers up when they come into view.
  const counters=[...document.querySelectorAll('.sv-fact-grid strong,.sz-hero-strip b')].map(el=>{const node=[...el.childNodes].find(n=>n.nodeType===3&&/\d/.test(n.textContent));const match=node&&node.textContent.match(/^(\s*)(\d+)(.*)$/s);return match&&{el,node,pre:match[1],target:+match[2],post:match[3]};}).filter(Boolean);
  const co=new IntersectionObserver(entries=>{for(const e of entries){if(!e.isIntersecting)continue;const c=counters.find(c=>c.el===e.target);co.unobserve(e.target);const start=performance.now(),dur=1100;const tick=t=>{const p=Math.min(1,(t-start)/dur),v=Math.round(c.target*(1-Math.pow(1-p,3)));c.node.textContent=c.pre+v+c.post;if(p<1)requestAnimationFrame(tick);};requestAnimationFrame(tick);}},{threshold:.5});
  counters.forEach(c=>{c.node.textContent=c.pre+'0'+c.post;co.observe(c.el);});
 }

 const hero=document.querySelector('.sz-hero');
 if(!hero)return;

 // Gentle parallax on the vehicle.
 const car=hero.querySelector('.sz-car-wrap');
 if(car&&matchMedia('(pointer:fine)').matches)hero.addEventListener('pointermove',e=>{const r=hero.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;car.style.transform=`translate3d(${x*-18}px,${y*-10}px,0) rotateY(${x*4}deg)`;});
 hero.addEventListener('pointerleave',()=>{if(car)car.style.transform='';});

 // Drifting light particles.
 const canvas=hero.querySelector('.sz-particles'),ctx=canvas?.getContext('2d');
 if(!ctx)return;
 let w,h,dots=[],raf,visible=true;
 const resize=()=>{const dpr=Math.min(devicePixelRatio||1,2);w=canvas.clientWidth;h=canvas.clientHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);const n=Math.round(Math.min(90,w*h/14000));dots=Array.from({length:n},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.6+.3,vx:(Math.random()-.5)*.15,vy:-(Math.random()*.25+.05),a:Math.random()*.6+.2,tw:Math.random()*Math.PI*2}));};
 const draw=()=>{ctx.clearRect(0,0,w,h);for(const d of dots){d.x+=d.vx;d.y+=d.vy;d.tw+=.02;if(d.y<-5){d.y=h+5;d.x=Math.random()*w;}if(d.x<-5)d.x=w+5;if(d.x>w+5)d.x=-5;const a=d.a*(.6+.4*Math.sin(d.tw));ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fillStyle=`rgba(${d.r>1.3?'120,235,240':'255,255,255'},${a})`;ctx.fill();}if(visible)raf=requestAnimationFrame(draw);};
 resize();addEventListener('resize',resize);draw();
 new IntersectionObserver(([e])=>{visible=e.isIntersecting;cancelAnimationFrame(raf);if(visible)draw();}).observe(hero);
 document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(raf);if(!document.hidden&&visible)draw();});
})();
