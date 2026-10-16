// Read-only production baseline; never mutates server state or triggers push delivery.
import assert from 'node:assert/strict';
import {test} from 'node:test';
const production='https://svitlo-cherkasy.pp.ua';
const api='https://svitlo-cherkasy-production.up.railway.app';
const fetchSafely=async(url,headers={})=>{
 let last;
 for(let i=0;i<3;i++){
  try{
   const r=await fetch(url,{headers:{'accept':'application/json',...headers},signal:AbortSignal.timeout(12000),cache:'no-store',redirect:'follow'});
   assert.equal(r.status,200,url+' returned '+r.status);
   return r;
  }catch(e){last=e;if(i<2)await new Promise(resolve=>setTimeout(resolve,1200*(i+1)))}
 }
 throw last;
};
test('production schedule API is available and returns validated official snapshot',async()=>{
 const status=await (await fetchSafely(api+'/api/data/status')).json();
 assert.equal(status.ready,true,'Railway publisher is not ready');
 assert.equal(status.source,'railway-cron');
 assert.ok(Number.isFinite(Date.parse(status.lastChecked)),'missing source timestamp');
 const res=await fetchSafely(api+'/api/data/schedules.json',{'origin':production});
 assert.equal(res.headers.get('access-control-allow-origin'),production,'installed PWA cannot read Railway API cross-origin');
 const data=await res.json();
 assert.equal(data.schemaVersion,3);
 assert.ok(Array.isArray(data.days)&&Array.isArray(data.changes));
 assert.ok(Number.isFinite(Date.parse(data.lastChecked)));
 console.log('Verified public schedule API status and cross-origin access, no writes');
});
test('production PWA, Google proof, and live API routing are consistent',async()=>{
 const [g,m,p,h]=await Promise.all([
  fetchSafely(production+'/google651cc9e5e29fd428.html'),
  fetchSafely(production+'/manifest.webmanifest'),
  fetchSafely(production+'/push-config.json'),
  fetchSafely(api+'/health')
 ]);
 assert.match(await g.text(),/google-site-verification:\s*google651cc9e5e29fd428\.html/);
 const manifest=await m.json(),push=await p.json(),health=await h.json();
 assert.equal(manifest.id,'./');
 assert.equal(push.apiBase,api);
 assert.equal(health.ok,true);
 assert.ok(health.schedulePublisher,'schedulePublisher health unavailable');
 console.log('Verified live Google proof, PWA identity and backend health, no subscriber records read');
});


test('production admin preflight works without exposing a protected panel',async()=>{
 const pre=await fetch(api+'/api/admin/login',{
  method:'OPTIONS',headers:{origin:production,
    'access-control-request-method':'POST','access-control-request-headers':'content-type'},
  signal:AbortSignal.timeout(12000),cache:'no-store'
 });
 assert.equal(pre.status,204,'PWA cannot send owner login to Railway');
 assert.equal(pre.headers.get('access-control-allow-origin'),production);
 const status=await fetch(api+'/api/admin/status',{
  headers:{origin:production},signal:AbortSignal.timeout(12000),cache:'no-store'
 });
 assert.equal(status.status,401,'private admin status is readable without authentication');
 assert.equal(status.headers.get('access-control-allow-origin'),production);
 const foreign='https://invalid-origin.example';
 const denied=await fetch(api+'/api/admin/login',{
  method:'OPTIONS',headers:{origin:foreign,'access-control-request-method':'POST'},
  signal:AbortSignal.timeout(12000),cache:'no-store'
 });
 assert.equal(denied.status,403,'untrusted site could reach admin login');
 assert.notEqual(denied.headers.get('access-control-allow-origin'),foreign);
 console.log('Verified Production admin login CORS and unauthorized protection without login attempts');
});
