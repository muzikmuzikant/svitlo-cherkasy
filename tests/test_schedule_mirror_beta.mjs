import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSchedulePublication} from '../push-server/schedule-publication.js';
import {createScheduleMirror} from '../push-server/schedule-mirror.js';

const NOW=Date.parse('2026-10-16T00:00:00.000Z');
const ORIGIN='https://svitlo-cherkasy-production.up.railway.app';
const silent={info(){},warn(){}};
const q=Object.fromEntries(Array.from({length:6},(_,i)=>[i+1+'.1',i+1+'.2']).flat().map(id=>[id,{off:[]}]));
function fixture(at='2026-10-15T23:58:00.000Z'){
 return {
  schedule:{schemaVersion:3,lastChecked:at,days:[{date:'2026-10-16',verified:true,queues:q}],changes:[]},
  review:{lastChecked:at,items:[]}
 };
}
function stubFetch(data,rec=[]){
 return async url=>{
  rec.push(url);
  const value=url.endsWith('/schedules.json')?data.schedule:data.review;
  return {ok:true,status:200,text:async()=>JSON.stringify(value)};
 };
}
test('Beta mirrors public validated schedule and review into its own persistent volume',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schedule-mirror-'));
 try{
  const publisher=createSchedulePublication({directory:dir,token:'beta-token'});
  const hits=[],data=fixture();
  const mirror=createScheduleMirror({publisher,sourceOrigin:ORIGIN,clock:()=>NOW,fetcher:stubFetch(data,hits),logger:silent});
  assert.equal(publisher.status().ready,false);
  assert.equal(await mirror.sync(),true);
  assert.equal(publisher.status().ready,true);
  assert.equal(publisher.status().lastChecked,data.schedule.lastChecked);
  assert.deepEqual(hits,[ORIGIN+'/api/data/schedules.json',ORIGIN+'/api/data/source_review.json']);
  assert.equal(createSchedulePublication({directory:dir,token:'beta-token'}).status().ready,true,'mirrored snapshot must survive restart');
  assert.equal(await mirror.sync(),false,'do not overwrite with the same publication');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Beta refuses stale source and untrusted origin without touching its volume',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schedule-mirror-stale-'));
 try{
  const publisher=createSchedulePublication({directory:dir,token:'beta-token'});
  assert.throws(()=>createScheduleMirror({publisher,sourceOrigin:'https://unknown.example'}),/read-only public Production API/);
  const mirror=createScheduleMirror({publisher,sourceOrigin:ORIGIN,fetcher:stubFetch(fixture('2026-10-15T20:00:00.000Z')),clock:()=>NOW,logger:silent});
  assert.equal(await mirror.sync(),false);
  assert.equal(publisher.status().ready,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Production stays isolated when mirror setting is not configured',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schedule-mirror-off-'));
 try{
  const publisher=createSchedulePublication({directory:dir,token:'prod-token'});
  let calls=0;
  const mirror=createScheduleMirror({publisher,fetcher:async()=>{calls++}});
  assert.equal(mirror.enabled,false);
  assert.equal(await mirror.sync(),false);
  assert.equal(calls,0);
  assert.equal(publisher.status().ready,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
