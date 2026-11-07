const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createSolarzedServer}=require('./solarzed-server.cjs');
const base=()=>({make:'Toyota',model:'Camry',year:'2024',owner:'Sample Customer',phone:'09121111111',plate:'DEMO123',vin:'JTDBE32K123456789',film:'Solarzed Premium IR',serial:'UNKNOWN-ROLL',installed:'2026-01-15',invoice:'INV1',sellerName:'Sample Seller',sellerPhone:'09122222222',installer:'Sample Shop',windows:['left-front','right-front','rear']});
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'solarzed-admin-'));const server=createSolarzedServer({dataDirectory:dir,adminPassword:'correct horse'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+server.address().port;let cookie='';
 const call=async(method,route,body)=>{const response=await fetch(url+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return {status:response.status,data:await response.json()};};
 const login=()=>call('POST','/api/admin/login',{password:'correct horse'});
 return {dir,call,login,register:data=>call('POST','/api/registrations',data),find:(by,q)=>call('GET','/api/warranty?by='+by+'&q='+encodeURIComponent(q))};
}

test('admin routes require a signed-in session',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('GET','/api/admin/overview')).status,401);
 assert.equal((await f.call('POST','/api/admin/login',{password:'wrong'})).status,401);
 assert.equal((await f.call('GET','/api/admin/session')).data.authenticated,false);
 assert.equal((await f.login()).status,200);
 assert.equal((await f.call('GET','/api/admin/session')).data.authenticated,true);
 assert.equal((await f.call('GET','/api/admin/overview')).status,200);
 assert.equal((await f.call('POST','/api/admin/logout',{})).status,200);
 assert.equal((await f.call('GET','/api/admin/overview')).status,401);
});

test('creates numbered rolls and flags registrations against the registry without rejecting them',async t=>{
 const f=await fixture(t);await f.login();
 const made=await f.call('POST','/api/admin/rolls',{model:'pir',type:'tint',batch:'lot-2608-b17',supplier:'sup-02',quantity:3});
 assert.equal(made.status,201);const ids=made.data.rolls.map(r=>r.id);const yy=String(new Date().getUTCFullYear()).slice(-2);
 assert.deepEqual(ids,[1,2,3].map(n=>`SZ-PIR-${yy}-00000${n}`));
 assert.equal(made.data.rolls[0].qc,'pending');assert.equal(made.data.rolls[0].status,'in_stock');
 const flagged=await f.register({...base(),serial:ids[0].toLowerCase()});assert.equal(flagged.status,201);
 assert.equal(flagged.data.record.status,'pending');assert.equal(flagged.data.record.flags,undefined);assert.equal(flagged.data.record.batch,undefined);
 const unknown=await f.register({...base(),invoice:'INV2'});assert.equal(unknown.status,201);
 const list=(await f.call('GET','/api/admin/warranties?flagged=1')).data.records;
 const first=list.find(r=>r.code===flagged.data.record.code),second=list.find(r=>r.code===unknown.data.record.code);
 assert.deepEqual(first.flags.sort(),['roll_not_approved','roll_not_distributed']);assert.equal(first.rollId,ids[0]);assert.equal(first.batch,'LOT-2608-B17');
 assert.deepEqual(second.flags.sort(),['roll_unknown','vin_repeat']);
 const approved=await f.call('POST',`/api/admin/rolls/${ids[1]}`,{qc:'approved',status:'shipped'});assert.equal(approved.status,200);
 const clean=await f.register({...base(),vin:'WVWZZZ1KZ6W000001',serial:ids[1],invoice:'INV3'});
 assert.deepEqual((await f.call('GET','/api/admin/warranties?q='+clean.data.record.code)).data.records[0].flags,[]);
 const ppfOnTint=await f.register({...base(),type:'ppf',windows:undefined,panels:['hood'],vin:'WVWZZZ1KZ6W000002',serial:ids[1],invoice:'INV4'});
 assert.ok((await f.call('GET','/api/admin/warranties?q='+ppfOnTint.data.record.code)).data.records[0].flags.includes('type_mismatch'));
 const overview=(await f.call('GET','/api/admin/overview')).data;
 assert.equal(overview.warranties.pending,4);assert.equal(overview.rolls.total,3);assert.equal(overview.batches[0].installs,3);
});

test('activation applies configured coverage periods and rejection needs a reason',async t=>{
 const f=await fixture(t);await f.login();
 assert.equal((await f.call('POST','/api/admin/settings',{durations:{tint:{film:4,install:2}}})).status,400);
 assert.equal((await f.call('POST','/api/admin/settings',{durations:{tint:{film:5,install:2},ppf:{film:null,install:null}}})).status,200);
 const {data:{record}}=await f.register(base());
 assert.equal((await f.find('code',record.code)).data.records[0].statusLabel,'Registered · pending verification');
 const active=await f.call('POST',`/api/admin/warranties/${record.code}/decision`,{status:'active'});
 assert.equal(active.status,200);assert.equal(active.data.record.coverage.filmEnds,'2031-01-14');assert.equal(active.data.record.coverage.installEnds,'2028-01-14');
 const shown=(await f.find('vin',base().vin)).data.records[0];
 assert.equal(shown.status,'active');assert.equal(shown.coverage.filmEnds,'2031-01-14');assert.equal(shown.history,undefined);assert.equal(shown.flags,undefined);
 assert.equal((await f.call('POST',`/api/admin/warranties/${record.code}/decision`,{status:'rejected'})).status,400);
 assert.equal((await f.call('POST',`/api/admin/warranties/${record.code}/decision`,{status:'rejected',note:'Roll serial belongs to another market.'})).status,200);
 const rejected=(await f.find('code',record.code)).data.records[0];
 assert.equal(rejected.status,'rejected');assert.equal(rejected.coverage,undefined);assert.equal(rejected.reviewNote,undefined);
 const full=(await f.call('GET','/api/admin/warranties?status=rejected')).data.records[0];
 assert.deepEqual(full.history.map(h=>h.action),['registered','active','rejected']);
});
