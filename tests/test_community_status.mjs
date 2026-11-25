import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCommunityStatusStore,calculatePlannedStats} from '../push-server/community-status.js';
const queue='1.1',client=n=>'client-id-'+String(n).padStart(20,'0');
test('community reports validate input, aggregate only three distinct reports and store no client ids',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-community-'));let now=Date.parse('2026-11-25T10:00:00+02:00');
 try{const store=createCommunityStatusStore({directory:dir,clock:()=>now});
  assert.throws(()=>store.report({queue:'7.1',status:'on',clientId:client(1)}));
  assert.throws(()=>store.report({queue,status:'maybe',clientId:client(1)}));
  store.report({queue,status:'on',clientId:client(1)});store.report({queue,status:'on',clientId:client(2)});
  assert.equal(store.status(queue).state,'unknown');
  store.report({queue,status:'off',clientId:client(3)});
  const status=store.status(queue,client(1));assert.equal(status.state,'on');assert.equal(status.counts.total,3);assert.equal(status.myReport,'on');
  const raw=fs.readFileSync(path.join(dir,'community-status-cherkasy-district.json'),'utf8');assert.equal(raw.includes(client(1)),false);assert.equal(raw.includes('127.0.0.1'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('one browser cannot repeatedly change its report inside the cooldown',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-community-rate-'));let now=Date.now();
 try{const store=createCommunityStatusStore({directory:dir,clock:()=>now});store.report({queue,status:'on',clientId:client(1)});
  assert.throws(()=>store.report({queue,status:'off',clientId:client(1)}),e=>e.statusCode===429);
  now+=120001;assert.equal(store.report({queue,status:'off',clientId:client(1)}).ok,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('actual statistics count only ten-minute buckets with three distinct reports and leave gaps unknown',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-community-stats-'));let now=Date.parse('2026-11-25T10:40:00+02:00');
 try{const store=createCommunityStatusStore({directory:dir,clock:()=>now});
  for(let bucket=0;bucket<2;bucket++){now=Date.parse('2026-11-25T10:00:00+02:00')+bucket*600000;for(let i=1;i<=3;i++)store.report({queue,status:bucket===0?'on':'off',clientId:client(bucket*3+i)})}
  now=Date.parse('2026-11-25T10:40:00+02:00');const result=store.stats(queue,'day');
  assert.equal(result.onMinutes,10);assert.equal(result.offMinutes,10);assert.ok(result.unknownMinutes>0);assert.equal(result.confirmedBuckets,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('planned stats separate verified schedules, confirmed no-schedule days and unknown periods',()=>{
 const now=Date.parse('2026-11-25T10:00:00+02:00');
 const schedule={confirmedNoScheduleDates:['2026-11-25'],days:[{date:'2026-11-24',verified:true,queues:{[queue]:{knownFrom:'00:00',off:[['02:00','04:00']]}}}]};
 const today=calculatePlannedStats(schedule,{events:[]},queue,'day',now);
 assert.equal(today.onMinutes,600);assert.equal(today.offMinutes,0);assert.equal(today.unknownMinutes,0);
 const week=calculatePlannedStats(schedule,{events:[]},queue,'week',now);assert.equal(week.offMinutes,120);assert.equal(week.unknownMinutes,0);assert.equal(week.onMinutes,week.totalMinutes-120);
});
test('emergency outage duration is separate and counted only with explicit timestamps',()=>{
 const now=Date.parse('2026-11-25T10:00:00+02:00');
 const emergency={events:[{status:'ended',queues:[queue],startedAt:'2026-11-25T08:00:00+02:00',endedAt:'2026-11-25T09:30:00+02:00'}]};
 const result=calculatePlannedStats({confirmedNoScheduleDates:['2026-11-25'],days:[]},emergency,queue,'day',now);
 assert.equal(result.emergencyOffMinutes,90);
 const noTime=calculatePlannedStats({confirmedNoScheduleDates:['2026-11-25'],days:[]},{events:[{status:'active',queues:[queue],publishedAt:'2026-11-25T08:00:00+02:00'}]},queue,'day',now);
 assert.equal(noTime.emergencyOffMinutes,null);assert.equal(noTime.emergencyEvents,1);
});

test('region identifiers isolate equal queue numbers and old reports expire after 35 days',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-community-region-'));let now=Date.parse('2026-11-25T10:00:00+02:00');
 try{
  const first=createCommunityStatusStore({directory:dir,clock:()=>now,regionId:'cherkasy-district'});
  first.report({queue,status:'on',clientId:client(1)});
  const other=createCommunityStatusStore({directory:dir,clock:()=>now,regionId:'another-region'});
  assert.equal(other.status(queue).counts.total,0);
  assert.throws(()=>createCommunityStatusStore({directory:dir,clock:()=>now,regionId:'Bad Region'}));
  now+=36*86400000;assert.equal(first.snapshot().reports,0);
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'community-status-cherkasy-district.json'),'utf8'));
  assert.equal(saved.reports.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Kyiv local-day boundaries handle spring and autumn daylight-saving changes',()=>{
 const spring=calculatePlannedStats({days:[]},{events:[]},queue,'day',Date.parse('2026-03-29T12:00:00+03:00'));
 const autumn=calculatePlannedStats({days:[]},{events:[]},queue,'day',Date.parse('2026-10-25T12:00:00+02:00'));
 assert.equal(spring.totalMinutes,11*60);
 assert.equal(spring.onMinutes,11*60);
 assert.equal(autumn.totalMinutes,13*60);
 assert.equal(autumn.onMinutes,13*60);
});

test('region-wide emergency bulletins apply to every queue and no-publication dates follow the all-day-light rule',()=>{
 const now=Date.parse('2026-11-25T10:00:00+02:00');
 const result=calculatePlannedStats({days:[]},{events:[{status:'active',scope:'region',queues:[],publishedAt:'2026-11-24T22:00:00+02:00'}]},queue,'day',now);
 assert.equal(result.onMinutes,600);
 assert.equal(result.offMinutes,0);
 assert.equal(result.unknownMinutes,0);
 assert.equal(result.emergencyEvents,1);
 assert.equal(result.totalDays,1);
});
test('a partial published schedule counts only the known portion of the day',()=>{
 const now=Date.parse('2026-11-25T10:00:00+02:00');
 const result=calculatePlannedStats({days:[{date:'2026-11-25',verified:true,queues:{[queue]:{knownFrom:'08:00',off:[]}}}]},{events:[]},queue,'day',now);
 assert.equal(result.onMinutes,120);
 assert.equal(result.unknownMinutes,480);
 assert.equal(result.totalDays,1);
});
