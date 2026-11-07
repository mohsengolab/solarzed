const menu=document.querySelector('.menu'),nav=document.querySelector('#navigation');
menu.onclick=()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close menu':'Open menu');};
nav.querySelectorAll('a').forEach(a=>a.onclick=()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');});
const sampleRecord={code:'SV-DEMO-0001',sample:true,vehicle:'Example Sedan',plate:'DEMO 123',film:'Sample Ceramic Tint',serial:'SAMPLE-BATCH-01',installed:'2026-01-15',installer:'Example Tint Studio',invoice:'DEMO-INV-001'};
const storageKey='sunvision-window-warranty-v1';
const registrationForm=document.querySelector('#registration-form');
const installed=registrationForm.elements.installed;
const today=new Date();installed.max=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
function readRecords(){const records=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(records))throw Error('Invalid stored records');return records;}
function saveRecord(record){const records=readRecords();records.push(record);localStorage.setItem(storageKey,JSON.stringify(records));}
function code(){const bytes=crypto.getRandomValues(new Uint32Array(2));return 'SV-'+Array.from(bytes,x=>x.toString(16).padStart(8,'0').toUpperCase()).join('-');}
function message(target,text){target.replaceChildren();const p=document.createElement('p');p.className='error-message';p.textContent=text;target.append(p);}
function showRecord(target,record){
 target.replaceChildren();const card=document.createElement('div');card.className='record';
 const badge=document.createElement('span');badge.className='badge';badge.textContent=record.sample?'SAMPLE RECORD / NOT A WARRANTY':'LOCAL RECORD / NOT AN OFFICIAL WARRANTY';
 const title=document.createElement('h3');title.textContent='Window tint installation';
 const identifier=document.createElement('code');identifier.textContent=record.code;
 const dl=document.createElement('dl');
 for(const [label,value]of [['Vehicle',record.vehicle],['License plate',record.plate],['Film model',record.film],['Film serial / batch',record.serial],['Installed on',record.installed],['Installer',record.installer],['Invoice',record.invoice]]){const group=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;group.append(dt,dd);dl.append(group);}
 const note=document.createElement('p');note.className='record-note';note.textContent='Saved in this browser only. Official coverage, duration and claims are subject to the warranty document issued by your supplier or installer. Keep this code and your original invoice.';
 const actions=document.createElement('div');actions.className='record-actions';const download=document.createElement('button');download.type='button';download.textContent='Download record';download.onclick=()=>{const blob=new Blob([JSON.stringify({notice:'Local demo record. Not an official warranty.',...record},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=record.code+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};actions.append(download);card.append(badge,title,identifier,dl,note,actions);target.append(card);
}
registrationForm.addEventListener('submit',e=>{
 e.preventDefault();const target=document.querySelector('#registration-result'),data=new FormData(registrationForm),record={};
 for(const key of ['owner','phone','vehicle','plate','film','serial','installed','installer','invoice']){record[key]=String(data.get(key)||'').trim();if(!record[key]){message(target,'Please complete all fields with valid details.');return;}}
 if(record.installed>installed.max){message(target,'Installation date cannot be in the future.');return;}
 try{const records=readRecords();const duplicate=records.find(r=>!r.sample&&r.serial.toLowerCase()===record.serial.toLowerCase()&&r.invoice.toLowerCase()===record.invoice.toLowerCase());if(duplicate){message(target,'An installation with this serial and invoice already exists. Its code is '+duplicate.code);return;}record.code=code();record.createdAt=new Date().toISOString();saveRecord(record);showRecord(target,record);document.querySelector('#lookup-code').value=record.code;registrationForm.reset();}catch{message(target,'This browser could not save the record. Check browser storage permissions. No registration was completed.');}
});
document.querySelector('#lookup-form').addEventListener('submit',e=>{e.preventDefault();const target=document.querySelector('#lookup-result'),value=document.querySelector('#lookup-code').value.trim().toUpperCase();try{const record=value===sampleRecord.code?sampleRecord:readRecords().find(r=>r.code===value);if(record)showRecord(target,record);else message(target,'No record found in this browser. Check the code or use the browser where the installation was registered.');}catch{message(target,'Saved records could not be read. Browser storage may be unavailable or damaged.');}});
document.querySelector('#sample').addEventListener('click',()=>{const sample=sampleRecord;document.querySelector('#lookup-code').value=sample.code;showRecord(document.querySelector('#lookup-result'),sample);});
