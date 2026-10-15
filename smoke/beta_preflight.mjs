// Read-only preflight for the isolated Beta API. Never authenticate, mutate data or send Push.
import assert from 'node:assert/strict';
import {test} from 'node:test';

const origin='https://svitlo-cherkasy.pages.dev';
const api='https://svitlo-beta-api-staging.up.railway.app';
const get=async(path,headers={})=>{
 const r=await fetch(api+path,{
  headers:{accept:'application/json',...headers},
  signal:AbortSignal.timeout(15000),
  cache:'no-store'
 });
 return r;
};

test('Beta server is healthy and its schedule snapshot is ready',async()=>{
 const health=await get('/health');
 assert.equal(health.status,200,'Beta health failed: HTTP '+health.status);
 const result=await health.json();
 assert.equal(result.ok,true);
 const r=await get('/api/data/status',{origin});
 assert.equal(r.status,200);
 assert.equal(r.headers.get('access-control-allow-origin'),origin,'Beta status endpoint is not accessible from Beta PWA');
 const status=await r.json();
 assert.equal(status.ready,true,'Beta has no Railway schedule snapshot: check ingest, SCHEDULE_URL and cron');
 const sched=await get('/api/data/schedules.json',{origin});
 assert.equal(sched.status,200,'Beta schedules unavailable: HTTP '+sched.status);
 const data=await sched.json();
 assert.ok(Array.isArray(data.days));
});

test('Beta admin login preflight and ads GET use the Beta PWA origin',async()=>{
 const pre=await fetch(api+'/api/admin/login',{
  method:'OPTIONS',
  headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'},
  signal:AbortSignal.timeout(15000)
 });
 assert.equal(pre.status,204,'Beta admin login CORS preflight rejected: HTTP '+pre.status);
 assert.equal(pre.headers.get('access-control-allow-origin'),origin,'Beta admin origin mismatch');
 const ads=await get('/api/ads',{origin});
 assert.equal(ads.status,200,'Beta ad management API not reachable');
 assert.equal(ads.headers.get('access-control-allow-origin'),origin,'Beta ad API origin mismatch');
});
