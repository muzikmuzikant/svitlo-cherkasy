import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAnalyticsStore} from '../push-server/analytics.js';
import {validateFeedback} from '../push-server/feedback-store.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('only aggregated popular queues, settlements, platforms and versions are reported',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-devices-'));const file=path.join(dir,'data.json');
 try{
  const now=Date.parse('2026-10-15T15:20:00Z');
  const store=createAnalyticsStore({filePath:file,clock:()=>now});
  for(let i=0;i<5;i++)assert.equal(store.record('locality_sample','direct','Слобода'),true);
  assert.equal(store.record('locality_sample','direct','Мала Вулиця'),true);
  assert.equal(store.record('queue_sample','direct','2.1'),true);
  assert.equal(store.record('platform_sample','direct','iPhone'),true);
  assert.equal(store.record('version_sample','direct','7.9.8'),true);
  assert.equal(store.record('locality_sample','direct','Київ / 13'),false);
  assert.equal(store.record('queue_sample','direct','12.9'),false);
  assert.equal(store.record('platform_sample','direct','iPhone 15 Pro Max'),false);
  assert.equal(store.record('version_sample','direct','OS version and UA'),false);
  let r=store.report();
  assert.equal(r.popularity48.queue_sample.items[0].label,'2.1');
  assert.equal(r.popularity48.platform_sample.items[0].label,'iPhone');
  assert.equal(r.popularity48.version_sample.items[0].label,'7.9.8');
  assert.equal(r.popularity48.locality_sample.items[0].label,'Слобода');
  assert.equal(r.popularity48.locality_sample.other,1);
  store.flush();
  const raw=fs.readFileSync(file,'utf8');
  for(const marker of ['userAgent','street','houseNumber','deviceId','ipAddress'])assert.equal(raw.includes(marker),false);
  r=createAnalyticsStore({filePath:file,clock:()=>now}).report();
  assert.equal(r.popularity30.locality_sample.items[0].count,5);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('user-submitted device diagnostics are strictly opt-in and sanitized',()=>{
 const body={topic:'bug',message:'Після запуску не відкривається розклад.',subject:'Помилка'};
 const diag={platform:'iPhone',os:'iOS 18',browser:'Safari',appVersion:'7.9.8'};
 assert.equal(validateFeedback({...body,diagnostics:diag}).diagnostics,undefined);
 assert.deepEqual(validateFeedback({...body,includeDiagnostics:true,diagnostics:diag}).diagnostics,diag);
 assert.throws(()=>validateFeedback({...body,includeDiagnostics:true,diagnostics:{...diag,userAgent:'full',platform:'iPhone 15 Pro'}}));
 assert.throws(()=>validateFeedback({...body,includeDiagnostics:true,diagnostics:{...diag,appVersion:'<script>'}}));
});
test('legal pages disclose telemetry, diagnostics and retention before release',()=>{
 const privacy=read('privacy.html'),terms=read('terms.html'),form=read('feedback.html');
 assert.match(privacy,/менше п'яти|менше п’яти|менше 5/);
 assert.match(privacy,/90 днів/);
 assert.match(privacy,/45 днів/);
 assert.match(privacy,/Push/);
 assert.match(terms,/незалежним/);
 assert.match(form,/id="includeDiagnostics"/);
 assert.match(read('scripts/build_pages.py'),/terms\.html/);
 assert.match(read('sw.js'),/\.\/terms\.html/);
});
