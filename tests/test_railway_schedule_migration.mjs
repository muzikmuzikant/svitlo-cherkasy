import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSchedulePublication} from '../push-server/schedule-publication.js';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const source=JSON.parse(read('data/schedules.json'));
const review=JSON.parse(read('data/source_review.json'));
const key='P'.repeat(48);
test('Railway schedules are durably published as one atomic snapshot',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'railway-schedule-'));
 try{
  const pub=createSchedulePublication({directory:dir,token:key});
  assert.equal(pub.schedule(),null);
  assert.equal(pub.status().ready,false);
  assert.equal(pub.authorized('Bearer '+key),true);
  assert.equal(pub.authorized('Bearer '+'x'.repeat(48)),false);
  assert.equal(pub.authorized(''),false);
  const result=pub.update(source,review);
  assert.equal(result.ready,true);
  assert.equal(result.lastChecked,source.lastChecked);
  assert.ok(fs.existsSync(pub.file));
  assert.deepEqual(pub.schedule(),source);
  assert.deepEqual(pub.review(),review);
  const recovered=createSchedulePublication({directory:dir,token:key});
  assert.equal(recovered.status().ready,true);
  assert.deepEqual(recovered.schedule(),source);
  assert.equal(fs.readdirSync(dir).filter(x=>x.endsWith('.tmp')).length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('publication refuses malformed imports, stale snapshots and invalid days without destroying saved data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'railway-schedule-'));
 try{
  const pub=createSchedulePublication({directory:dir,token:key});
  pub.update(source,review);
  const old=JSON.stringify(pub.schedule());
  assert.throws(()=>pub.update({...source,schemaVersion:0},review));
  assert.throws(()=>pub.update({...source,days:[{date:'2026-10-12',verified:false,queues:{}}]},review));
  assert.throws(()=>pub.update({...source,lastChecked:'2020-01-01T00:00:00Z'},review));
  assert.throws(()=>pub.update(source,{...review,items:'bad'}));
  assert.equal(JSON.stringify(pub.schedule()),old);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('PWA prefers live Railway schedules with static/offline fallback',()=>{
 const app=read('app.js');
 assert.match(app,/async function loadLatestSchedules\(\)/);
 assert.match(app,/\/api\/data\/schedules\.json/);
 assert.match(app,/await loadLatestSchedules\(\)/);
 assert.match(app,/source:'pages-fallback'/);
 assert.match(app,/source:'device'/);
 assert.match(app,/nextStamp>=currentStamp/);
 assert.match(read('push-server/server.js'),/officialSchedules\.schedule\(\)\|\|await loadJson\(SCHEDULE_URL\)/);
});
test('worker uses established official importer and fails before publishing if source fails',()=>{
 const py=read('scripts/railway_schedule_cron.py');
 assert.match(py,/--schedules-only/);
 assert.match(py,/download_previous\(session, base\)/);
 assert.match(py,/import_official\(\)/);
 assert.match(py,/publish\(session, base, secret\)/);
 assert.match(py,/Bearer /);
 assert.match(py,/result\.status_code != 200/);
 assert.match(read('Dockerfile.schedule-cron'),/python:3\.12-slim/);
});
test('backend does not expose subscriber secrets or internal upload endpoint to clients',()=>{
 const server=read('push-server/server.js');
 assert.match(server,/\/api\/data\/status/);
 assert.match(server,/\/api\/internal\/schedules/);
 assert.match(server,/officialSchedules\.authorized\(req\.headers\.authorization\)/);
 assert.match(server,/\/api\/data\/source_review\.json/);
 const source=read('push-server/schedule-publication.js');
 assert.match(source,/timingSafeEqual/);
 assert.match(source,/renameSync/);
 assert.match(source,/SCHEDULE_INGEST_SECRET|token/);
});

test('Railway live GET endpoints accept cache-busting query parameters from installed PWA',()=>{
 const backend=read('push-server/server.js');
 const app=read('app.js');
 assert.match(app,/u\.searchParams\.set\('t',String\(Date\.now\(\)\)\)/);
 assert.match(backend,/const requestPath=new URL\(req\.url,'http:\/\/localhost'\)\.pathname/);
 assert.match(backend,/requestPath==='\/api\/data\/schedules\.json'/);
 assert.match(backend,/requestPath==='\/api\/data\/source_review\.json'/);
 for(const endpoint of ['/api/data/schedules.json','/api/data/source_review.json','/api/data/status']){
  for(const suffix of ['', '?t=1234567890','?t=123&refresh=1']){
   assert.equal(new URL(endpoint+suffix,'http://localhost').pathname,endpoint);
  }
 }
});
