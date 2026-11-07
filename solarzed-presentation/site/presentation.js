const supportForm=document.querySelector('#support-form');
if(supportForm)supportForm.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(supportForm);document.querySelector('#support-status').textContent=`Thank you, ${data.get('name')}. Your ${String(data.get('topic')).toLowerCase()} request is prepared. This design preview does not send messages.`;});

// Reveal content only after an observer is ready; keep forms and focused controls usable.
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
let revealObserver;
function enableReveals(){
 if(motionPreference.matches||!('IntersectionObserver' in window))return;
 const targets=document.querySelectorAll('.section-heading,.service-card,.window-story-grid>div,.journey-grid article,.final-cta,.guide-body article,.support-grid article,.contact-editorial>div,.help-banner');
 revealObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target);}},{threshold:.08,rootMargin:'0px 0px 20px 0px'});
 targets.forEach((target,index)=>{target.classList.add('reveal');target.style.setProperty('--reveal-delay',`${Math.min(index%3,2)*65}ms`);revealObserver.observe(target);});
 document.documentElement.classList.add('motion-ready');
}
function stopReveals(){revealObserver?.disconnect();document.documentElement.classList.remove('motion-ready');document.querySelectorAll('.reveal').forEach(el=>el.classList.add('is-visible'));}
motionPreference.addEventListener('change',event=>{if(event.matches)stopReveals();else enableReveals();});
try{enableReveals();}catch{stopReveals();}
document.addEventListener('visibilitychange',()=>{document.querySelectorAll('.hero-showcase img,.floating-record,.showcase-orbit').forEach(el=>{el.style.animationPlayState=document.hidden?'paused':'running';});});

// A capture-only mode keeps full-page screenshots free of animation seams.
if(new URLSearchParams(location.search).get('capture')==='1')document.documentElement.classList.add('screenshot-mode');
