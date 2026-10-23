import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSchedulePublication} from '../push-server/schedule-publication.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=JSON.parse(read('data/schedules.json')),review=JSON.parse(read('data/source_review.json'));

test('CRITICAL PRODUCT RULE: fresh confirmed absence is light all day; unverified absence is unknown',()=>{
 const app=read('app.js');
 assert.match(app,/if\(!day\)\{[\s\S]*?verifiedNoSchedule\(date\)\?new Int8Array\(1440\):null/);
 assert.match(app,/ГРАФІКА НЕМАЄ · СВІТЛО ВЕСЬ ДЕНЬ/);
 assert.match(app,/Світло весь день/);
 assert.match(app,/Час перевірки невідомий або дані застаріли/);
 assert.match(read('style.css'),/feature-off-quickAddresses #homeQuickPlaces/);
});

test('Railway refuses invalid calendars, broken minutes and overlapping periods atomically',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-validate-'));
 try {
  const api=createSchedulePublication({directory:dir,token:'Q'.repeat(48)});
  api.update(source,review);
  const original=JSON.stringify(api.schedule());
  const mutate=change=>{
   const candidate=structuredClone(source);
   change(candidate);
   assert.throws(()=>api.update(candidate,review));
   assert.equal(JSON.stringify(api.schedule()),original);
  };
  mutate(s=>{s.days[0].date='2026-02-30'});
  mutate(s=>{s.days.push(structuredClone(s.days[0]))});
  mutate(s=>{s.days[0].queues['1.1'].off=[['23:59','24:10']]});
  mutate(s=>{s.days[0].queues['1.1'].off=[['10:00','12:00'],['11:00','13:00']]});
  mutate(s=>{s.days[0].queues['1.1'].knownFrom='25:00'});
  mutate(s=>{s.days[0].queues['1.1'].off=[['12:00','12:00']]});
 } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
