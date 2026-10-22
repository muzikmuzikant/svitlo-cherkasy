import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timeline,dueTransition,latestOfficialEvent,freshEvent,freshSchedule,dueTransitionAcrossDays,usableSchedule,verifiedScheduleDay,preferFreshSchedule} from '../push-server/schedule-engine.js';
const source='https://www.cherkasyoblenergo.com/media/a';
const mk=(knownFrom,off)=>({date:'2026-10-10',verified:true,queues:{'2.1':{knownFrom,off}}});
test('known schedule is ON outside outage intervals; before publication is UNKNOWN',()=>{
 const v=timeline(mk('16:29',[['16:00','18:30'],['23:00','24:00']]),'2.1');
 assert.equal(v[12*60],-1); assert.equal(v[16*60+28],-1);
 assert.equal(v[16*60+29],1);assert.equal(v[18*60+29],1);
 assert.equal(v[18*60+30],0);assert.equal(v[22*60+59],0);assert.equal(v[23*60],1);
});
test('full-day zero outages is known ON, unknown queue never assumes electricity',()=>{
 assert.equal(timeline(mk('00:00',[]),'2.1')[1300],0);
 assert.equal(timeline(mk('24:00',[]),'2.1')[1300],-1);
 assert.equal(timeline(mk('00:00',[]),'6.1')[1300],0); // omitted in confirmed day
 assert.equal(timeline({...mk('00:00',[]),verified:false},'2.1'),null);
});
test('bad intervals are rejected and do not yield misleading predictions',()=>{
 assert.equal(timeline(mk('00:00',[['12:00','11:00']]),'2.1'),null);
 assert.equal(timeline(mk('00:00',[['10:00','12:00'],['11:00','13:00']]),'2.1'),null);
 assert.equal(timeline(mk('00:00',[['12:xx','13:00']]),'2.1'),null);
});
test('reminder detects proper OFF/ON boundaries with delay tolerance and never UNKNOWN->ON',()=>{
 const v=timeline(mk('00:00',[['10:00','12:00']]),'2.1');
 assert.equal(dueTransition(v,9*60+30,30,1),10*60);
 assert.equal(dueTransition(v,9*60+33,30,1,4),10*60);
 assert.equal(dueTransition(v,11*60+45,15,0),12*60);
 assert.equal(dueTransition(v,11*60+50,15,0,4),null);
 const partial=timeline(mk('11:00',[]),'2.1');
 assert.equal(dueTransition(partial,10*60+45,15,0),null);
});
test('freshest official cancellation supersedes active notification',()=>{
 const now=Date.parse('2026-10-10T12:00:00Z');
 const events=[
  {id:'a',status:'active',publishedAt:'2026-10-10T11:10:00Z',source},
  {id:'b',status:'ended',publishedAt:'2026-10-10T11:30:00Z',source},
  {id:'c',status:'active',publishedAt:'2026-10-10T11:59:00Z',source:'https://evil.example/media/c'}
 ];
 const e=latestOfficialEvent(events,now);
 assert.equal(e.id,'b');assert.equal(e.status,'ended');assert.equal(freshEvent(e,now),true);
 assert.equal(freshEvent(e,now+70*60000),false);
});

test('stale, invalid or disputed imports cannot generate schedule reminders',()=>{
 const now=Date.parse('2026-10-11T18:00:00Z');
 const good={lastChecked:new Date(now-5*60_000).toISOString(),reviewPending:false,days:[]};
 assert.equal(freshSchedule(good,now),true);
 assert.equal(freshSchedule({...good,reviewPending:true},now),false);
 assert.equal(freshSchedule({...good,lastChecked:new Date(now-2*3600_000).toISOString()},now),false);
 assert.equal(freshSchedule({...good,lastChecked:null},now),false);
});
test('30 minute reminder sees tomorrow midnight without inventing power state',()=>{
 const today=new Int8Array(1440),tomorrow=new Int8Array(1440);
 tomorrow.fill(1,0,120);
 assert.equal(dueTransitionAcrossDays(today,tomorrow,1410,30,1),1440);
 assert.equal(dueTransitionAcrossDays(today,null,1410,30,1),null);
});

test('late Railway dispatch recovers a published OFF reminder without sending after start',()=>{
 const day=timeline(mk('00:00',[['10:00','12:00']]),'2.1');
 assert.equal(dueTransitionAcrossDays(day,null,9*60+30,30,1,12),10*60);
 assert.equal(dueTransitionAcrossDays(day,null,9*60+40,30,1,12),10*60);
 assert.equal(dueTransitionAcrossDays(day,null,9*60+43,30,1,12),null);
 assert.equal(dueTransitionAcrossDays(day,null,10*60,30,1,12),null);
});

test('a warning for a different date cannot mute verified day notifications',()=>{
 const now=Date.parse('2026-10-14T09:00:00Z');
 const base={lastChecked:new Date(now).toISOString(),reviewPending:true,
  unresolvedDates:['2026-10-15'],days:[mk('00:00',[['10:00','12:00']]),
    {date:'2026-10-15',verified:true,queues:{'2.1':{off:[['12:00','13:00']]}}}]};
 assert.equal(freshSchedule(base,now),false,'legacy global freshness contract stays conservative');
 assert.equal(usableSchedule(base,now),true);
 assert.equal(verifiedScheduleDay(base,'2026-10-10',now)?.verified,true);
 assert.equal(verifiedScheduleDay(base,'2026-10-15',now),null);
 assert.equal(verifiedScheduleDay({...base,unresolvedDates:[]},'2026-10-10',now),null);
 assert.equal(verifiedScheduleDay({...base,lastChecked:new Date(now-60*60000).toISOString()},'2026-10-10',now),null);
});
test('fresh verified fallback beats stale publisher without accepting unsafe days',()=>{
 const now=Date.parse('2026-10-14T09:00:00Z');
 const stale={lastChecked:new Date(now-70*60000).toISOString(),days:[],reviewPending:false};
 const fallback={lastChecked:new Date(now-5*60000).toISOString(),days:[],reviewPending:false};
 assert.equal(preferFreshSchedule(stale,fallback,now),fallback);
 assert.equal(preferFreshSchedule(fallback,stale,now),fallback);
 const newer={...fallback,lastChecked:new Date(now-1000).toISOString()};
 assert.equal(preferFreshSchedule(newer,fallback,now),newer);
 assert.equal(usableSchedule(stale,now),false);
 assert.equal(usableSchedule({...fallback,reviewPending:true},now),false);
});
