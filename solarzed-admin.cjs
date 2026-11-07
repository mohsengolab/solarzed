// Solarzed administration: roll registry, warranty review and activation, coverage settings and admin sessions.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const ROLL_STATUS=['in_stock','shipped','consumed','void'];
const QC=['pending','approved','rejected'];
const FILM_YEARS=[3,5,7,10],INSTALL_YEARS=[1,2,3];
const DEFAULT_SETTINGS={durations:{tint:{film:null,install:null},ppf:{film:null,install:null}}};
const FLAG_TEXT={
 roll_unknown:'Roll serial is not in the Solarzed roll registry.',
 roll_not_approved:'Roll has not passed Solarzed quality control.',
 roll_not_distributed:'Roll is still marked as in stock (registered before distribution).',
 roll_void:'Roll is marked as void.',
 type_mismatch:'Roll product type does not match the registered product.',
 vin_repeat:'Another registration of this product type exists for the same VIN.'};

// A JSON collection kept in a local file, or in SQL through storage.collection(name).
function createCollection(name,options){
 if(options.storage?.collection)return options.storage.collection(name);
 const file=path.join(options.dataDirectory||path.join(__dirname,'.data'),name+'.json');
 return {
  async load(){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}},
  async persist(items){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(items,null,2),{mode:0o600});await fs.rename(tmp,file);}};
}

function addYears(date,years){const d=new Date(date+'T00:00:00Z');d.setUTCFullYear(d.getUTCFullYear()+years);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
const statusOf=record=>record.status||'pending';

// Link a new registration to its roll and raise review flags; nothing is rejected automatically.
function assessRegistration(record,rolls,records){
 const flags=[];const roll=rolls.find(r=>r.id.toLowerCase()===record.serial.toLowerCase());
 if(!roll)flags.push('roll_unknown');
 else{
  record.rollId=roll.id;record.batch=roll.batch;record.rollModel=roll.model;
  if(roll.qc!=='approved')flags.push('roll_not_approved');
  if(roll.status==='in_stock')flags.push('roll_not_distributed');
  if(roll.status==='void')flags.push('roll_void');
  if(roll.type!==record.type)flags.push('type_mismatch');
 }
 if(records.some(r=>r.vin===record.vin&&(r.type||'tint')===record.type&&statusOf(r)!=='rejected'))flags.push('vin_repeat');
 record.status='pending';record.flags=flags;record.history=[{at:new Date().toISOString(),action:'registered',by:'installer',note:flags.length?`${flags.length} review flag(s)`:'No review flags'}];
 return record;
}

// Fields the public lookup may show about review status and coverage.
function publicStatus(record){
 const status=statusOf(record);
 const out={status,statusLabel:{pending:'Registered · pending verification',active:'Active warranty',rejected:'Not approved'}[status]||status};
 if(status==='active')out.coverage={start:record.installed,filmEnds:record.coverage?.filmEnds||null,installEnds:record.coverage?.installEnds||null};
 if(status==='rejected')out.statusNote='This registration was not approved. Please contact Solarzed support with your warranty number.';
 return out;
}
const INTERNAL=['flags','history','batch','rollModel','supplier','decision','reviewNote'];
function stripInternal(record){const copy={...record};for(const key of INTERNAL)delete copy[key];return copy;}

function createAdmin(options={}){
 const rolls=createCollection('rolls',options),settingsStore=createCollection('settings',options);
 const password=options.adminPassword||process.env.SOLARZED_ADMIN_PASSWORD||crypto.randomBytes(9).toString('base64url');
 const generated=!options.adminPassword&&!process.env.SOLARZED_ADMIN_PASSWORD;
 const digest=value=>crypto.createHash('sha256').update(String(value)).digest();
 const expected=digest(password);
 const sessions=new Map();const SESSION_MS=8*60*60*1000;
 const attempts=new Map();
 const loginAllowed=key=>{const now=Date.now(),e=attempts.get(key);if(!e||now-e.start>10*60*1000){attempts.set(key,{start:now,count:1});return true;}return ++e.count<=10;};
 const cookieToken=req=>(String(req.headers.cookie||'').match(/(?:^|;\s*)sz_admin=([A-Za-z0-9_-]{20,})/)||[])[1];
 function authorized(req){const token=cookieToken(req),s=token&&sessions.get(token);if(!s)return false;if(s.expires<Date.now()){sessions.delete(token);return false;}return true;}
 async function loadSettings(){const items=await settingsStore.load();const stored=items.find(i=>i.id==='settings');return {...DEFAULT_SETTINGS,...stored,durations:{...DEFAULT_SETTINGS.durations,...stored?.durations}};}

 async function readJson(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){const e=Error('JSON content type required.');e.status=415;throw e;}let body='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>64000){const e=Error('Request is too large.');e.status=413;throw e;}body+=chunk;}try{return JSON.parse(body||'{}');}catch{const e=Error('Invalid JSON.');e.status=400;throw e;}}
 const fail=(status,message)=>{const e=Error(message);e.status=status;return e;};

 function overview(records,allRolls){
  const count=(list,fn)=>list.reduce((m,x)=>{const k=fn(x);m[k]=(m[k]||0)+1;return m;},{});
  const byBatch={};for(const r of allRolls){byBatch[r.batch]??={batch:r.batch,model:r.model,rolls:0,installs:0,flagged:0};byBatch[r.batch].rolls++;}
  for(const rec of records)if(rec.batch&&byBatch[rec.batch]){byBatch[rec.batch].installs++;if(rec.flags?.length)byBatch[rec.batch].flagged++;}
  return {warranties:{total:records.length,...count(records,statusOf),flagged:records.filter(r=>statusOf(r)==='pending'&&r.flags?.length).length},
   byType:count(records,r=>r.type||'tint'),rolls:{total:allRolls.length,byStatus:count(allRolls,r=>r.status),byQc:count(allRolls,r=>r.qc)},
   batches:Object.values(byBatch).sort((a,b)=>b.installs-a.installs),
   pending:records.filter(r=>statusOf(r)==='pending').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,6)};
 }

 // Handles /api/admin/*; ctx gives access to registrations and the shared write queue.
 async function handle(req,res,url,ctx){
  const {json,load,persist,transact}=ctx,route=url.pathname.slice('/api/admin/'.length),ip=req.socket.remoteAddress||'local';
  try{
   if(route==='login'&&req.method==='POST'){
    if(!loginAllowed(ip))return json(res,429,{error:'Too many sign-in attempts. Please wait a few minutes.'});
    const {password:given}=await readJson(req);
    if(typeof given!=='string'||!crypto.timingSafeEqual(digest(given),expected))return json(res,401,{error:'Incorrect password.'});
    const token=crypto.randomBytes(24).toString('base64url');sessions.set(token,{expires:Date.now()+SESSION_MS});
    res.setHeader('Set-Cookie',`sz_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_MS/1000}`);
    return json(res,200,{ok:true});
   }
   if(route==='session'&&req.method==='GET')return json(res,200,{authenticated:authorized(req)});
   if(!authorized(req))return json(res,401,{error:'Please sign in.'});
   if(route==='logout'&&req.method==='POST'){sessions.delete(cookieToken(req));res.setHeader('Set-Cookie','sz_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');return json(res,200,{ok:true});}

   if(route==='overview'&&req.method==='GET'){const [records,allRolls,settings]=await Promise.all([load(),rolls.load(),loadSettings()]);return json(res,200,{...overview(records,allRolls),settings,flagText:FLAG_TEXT});}

   if(route==='warranties'&&req.method==='GET'){
    const status=url.searchParams.get('status'),q=String(url.searchParams.get('q')||'').trim().toLowerCase(),flagged=url.searchParams.get('flagged')==='1';
    let list=await load();
    if(status)list=list.filter(r=>statusOf(r)===status);
    if(flagged)list=list.filter(r=>r.flags?.length);
    if(q)list=list.filter(r=>[r.code,r.vin,r.phone,r.plate,r.serial,r.owner,r.installer,r.vehicle].some(v=>String(v||'').toLowerCase().includes(q)));
    list=list.map(r=>({...r,status:statusOf(r)})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return json(res,200,{records:list.slice(0,500),total:list.length,flagText:FLAG_TEXT});
   }
   const decision=route.match(/^warranties\/(SZ-[A-F0-9]{16})\/decision$/i);
   if(decision&&req.method==='POST'){
    const {status,note}=await readJson(req);
    if(!['active','rejected','pending'].includes(status))throw fail(400,'Choose active, rejected or pending.');
    const reason=typeof note==='string'?note.trim().slice(0,500):'';
    if(status==='rejected'&&!reason)throw fail(400,'A documented reason is required to reject a warranty.');
    const settings=await loadSettings();
    const record=await transact(async()=>{
     const records=await load(),index=records.findIndex(r=>r.code===decision[1].toUpperCase());
     if(index<0)throw fail(404,'Warranty not found.');
     const r=records[index],d=settings.durations[r.type||'tint']||{};
     r.status=status;r.reviewNote=reason||undefined;
     r.coverage=status==='active'?{filmEnds:d.film?addYears(r.installed,d.film):null,installEnds:d.install?addYears(r.installed,d.install):null,filmYears:d.film||null,installYears:d.install||null}:undefined;
     r.decidedAt=new Date().toISOString();
     (r.history||=[]).push({at:r.decidedAt,action:status,by:'admin',note:reason||undefined});
     records[index]=r;await persist(records);return r;});
    return json(res,200,{record});
   }

   if(route==='rolls'&&req.method==='GET'){
    const q=String(url.searchParams.get('q')||'').trim().toLowerCase();const [allRolls,records]=await Promise.all([rolls.load(),load()]);
    const uses={};for(const r of records)if(r.rollId)uses[r.rollId]=(uses[r.rollId]||0)+1;
    let list=allRolls.map(r=>({...r,installs:uses[r.id]||0}));
    if(q)list=list.filter(r=>[r.id,r.model,r.batch,r.supplier].some(v=>String(v||'').toLowerCase().includes(q)));
    return json(res,200,{rolls:list.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,1000),total:list.length});
   }
   if(route==='rolls'&&req.method==='POST'){
    const input=await readJson(req);
    const model=String(input.model||'').trim().toUpperCase(),batch=String(input.batch||'').trim().toUpperCase(),supplier=String(input.supplier||'').trim().toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(model))throw fail(400,'Enter a product model code such as PIR or CP-01.');
    if(!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(batch))throw fail(400,'Enter the internal batch number, e.g. LOT-2608-B17.');
    if(!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(supplier))throw fail(400,'Enter the confidential supplier code, e.g. SUP-02.');
    if(!['tint','ppf'].includes(input.type))throw fail(400,'Choose window film or paint protection film.');
    const qc=QC.includes(input.qc)?input.qc:'pending',quantity=Number(input.quantity||1);
    if(!Number.isInteger(quantity)||quantity<1||quantity>200)throw fail(400,'Quantity must be between 1 and 200 rolls.');
    const created=await transact(async()=>{
     const all=await rolls.load(),yy=String(new Date().getUTCFullYear()).slice(-2),prefix=`SZ-${model}-${yy}-`;
     let next=all.filter(r=>r.id.startsWith(prefix)).reduce((m,r)=>Math.max(m,Number(r.id.slice(prefix.length))||0),0);
     const now=new Date().toISOString(),made=[];
     for(let i=0;i<quantity;i++){next++;made.push({id:prefix+String(next).padStart(6,'0'),model,type:input.type,batch,supplier,qc,status:'in_stock',receivedAt:now.slice(0,10),createdAt:now,history:[{at:now,action:'received',note:`QC ${qc}`}]});}
     await rolls.persist([...all,...made]);return made;});
    return json(res,201,{rolls:created});
   }
   const rollRoute=route.match(/^rolls\/([A-Z0-9-]{6,48})$/i);
   if(rollRoute&&req.method==='POST'){
    const input=await readJson(req);
    if(input.status!==undefined&&!ROLL_STATUS.includes(input.status))throw fail(400,'Unknown roll status.');
    if(input.qc!==undefined&&!QC.includes(input.qc))throw fail(400,'Unknown QC result.');
    const roll=await transact(async()=>{
     const all=await rolls.load(),r=all.find(x=>x.id.toLowerCase()===rollRoute[1].toLowerCase());
     if(!r)throw fail(404,'Roll not found.');
     const changes=[];if(input.status&&input.status!==r.status){changes.push(`status ${r.status} → ${input.status}`);r.status=input.status;}if(input.qc&&input.qc!==r.qc){changes.push(`QC ${r.qc} → ${input.qc}`);r.qc=input.qc;}
     const note=typeof input.note==='string'?input.note.trim().slice(0,300):'';
     if(!changes.length&&!note)throw fail(400,'Nothing to update.');
     (r.history||=[]).push({at:new Date().toISOString(),action:changes.join(', ')||'note',note:note||undefined});
     await rolls.persist(all);return r;});
    return json(res,200,{roll});
   }

   if(route==='settings'&&req.method==='GET')return json(res,200,{settings:await loadSettings(),options:{film:FILM_YEARS,install:INSTALL_YEARS}});
   if(route==='settings'&&req.method==='POST'){
    const input=await readJson(req),durations={};
    for(const type of ['tint','ppf']){const d=input.durations?.[type]||{};const film=d.film===null||d.film===''||d.film===undefined?null:Number(d.film),install=d.install===null||d.install===''||d.install===undefined?null:Number(d.install);
     if(film!==null&&!FILM_YEARS.includes(film))throw fail(400,'Film warranty must be 3, 5, 7 or 10 years.');
     if(install!==null&&!INSTALL_YEARS.includes(install))throw fail(400,'Installation warranty must be 1, 2 or 3 years.');
     durations[type]={film,install};}
    const settings={id:'settings',durations,updatedAt:new Date().toISOString()};
    await transact(async()=>{const items=(await settingsStore.load()).filter(i=>i.id!=='settings');await settingsStore.persist([...items,settings]);});
    return json(res,200,{settings});
   }
   return json(res,404,{error:'Admin route not found.'});
  }catch(error){if(error.status)return json(res,error.status,{error:error.message});throw error;}
 }
 return {handle,rolls,generatedPassword:generated?password:undefined};
}
module.exports={createAdmin,assessRegistration,publicStatus,stripInternal,FLAG_TEXT,addYears};
