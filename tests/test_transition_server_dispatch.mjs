import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {timeline,dueTransitionAcrossDays,freshSchedule,usableSchedule,verifiedScheduleDay,preferFreshSchedule,QUEUES} from '../push-server/schedule-engine.js';
import {transitionCopy} from '../push-server/notification-copy.js';

const server=readFileSync(new URL('../push-server/server.js',import.meta.url),'utf8');
const start=server.indexOf('async function transitionJob(){');
const end=server.indexOf('async function job(){',start);
assert.ok(start>0&&end>start,'standalone transition dispatcher found');
const dispatch=server.slice(start,end);
const date='2026-10-14';
function fixture({minute=570,off=true,on=true,stale=false,noDate=false,failOnce=false,
 midnight=false,withoutToday=false,nowDate=date,reviewPending=false,unresolvedDates=[]}={}){
 const outageDay={date,verified:true,queues:{'1.1':{knownFrom:'00:00',off:[['10:00','12:00']]}}};
 const nextDay={date:'2026-10-15',verified:true,queues:{'1.1':{knownFrom:'00:00',off:midnight?[['00:00','02:00']]:[]}}};
 const source={lastChecked:new Date(Date.now()-(stale?3600000:0)).toISOString(),
  reviewPending,unresolvedDates,days:[...(withoutToday?[]:[outageDay]),nextDay]};
 if(noDate)source.days=[];
 const record={queue:'1.1',preferences:{off,on},subscription:{endpoint:'https://web.push.apple.com/fixture'}};
 const sent={},deliveryStats={lastFailure:null,lastCycle:null},subscribers={fixture:record};
 const deliveries=[],log=[],updates=[];let fail=failOnce;
 const state={officialSchedules:{schedule:()=>source},lastLoadedSchedule:null,transitionRunning:false,
  dayInKyiv:()=>({date:nowDate,m:state.currentMinute}),currentMinute:minute,
  shiftDay:(d,n)=>new Date(new Date(d+'T12:00:00Z').getTime()+n*86400_000).toISOString().slice(0,10),
  freshSchedule,usableSchedule,verifiedScheduleDay,preferFreshSchedule,timeline,dueTransitionAcrossDays,transitionCopy,QUEUES,subscribers,deliveryStats,sent,
  hash:()=> 'subscriber-hash',
  async forEachLimited(items,limit,callback){for(const rec of items)await callback(rec)},
  async send(rec,message,key,options){
   deliveries.push({rec,message,key,options});
   if(fail){fail=false;deliveryStats.lastFailure={status:503};return 'failed'}
   sent[key]=new Date().toISOString();return 'accepted';
  },
  save(){updates.push(1)},console:{info:(...x)=>log.push(x),warn:(...x)=>log.push(x),error:(...x)=>log.push(x)}
 };
 vm.createContext(state);vm.runInContext(dispatch,state);
 return {tick:()=>vm.runInContext('transitionJob()',state),deliveries,log,updates,
  state,record,sent,source};
}
test('confirmed outage at 10:00 triggers one real 30-minute Web Push',async()=>{
 const s=fixture();await s.tick();
 assert.equal(s.deliveries.length,1);
 assert.equal(s.deliveries[0].message.title,'🔴 Відключення через 30 хв');
 assert.equal(s.deliveries[0].options.urgency,'high');
 assert.match(s.deliveries[0].options.notificationId,/^transition:1\.1:/);
 assert.ok(s.record.automatic.lastAccepted);
 assert.equal(s.state.deliveryStats.lastCycle.transitionAccepted,1);
});
test('confirmed restoration at 12:00 triggers ON reminder 15 minutes prior',async()=>{
 const s=fixture({minute:705});await s.tick();
 assert.equal(s.deliveries.length,1);
 assert.equal(s.deliveries[0].message.title,'🟢 Відновлення через 15 хв');
 assert.equal(s.record.automatic.lastEvent.type,'on');
});
test('fast repeated tick never duplicates accepted notifications',async()=>{
 const s=fixture();await s.tick();await s.tick();await s.tick();
 assert.equal(s.deliveries.length,1);
 assert.equal(Object.keys(s.sent).length,1);
});
test('a delivery provider failure is retried before the transition starts',async()=>{
 const s=fixture({failOnce:true});await s.tick();
 assert.equal(s.deliveries.length,1);assert.equal(s.state.deliveryStats.lastCycle.transitionFailed,1);
 s.state.currentMinute=571;await s.tick();
 assert.equal(s.deliveries.length,2);
 assert.equal(s.deliveries[1].message.title,'🔴 Відключення через 29 хв');
 assert.ok(s.record.automatic.lastAccepted);
});
test('a delayed dispatch catches up but never sends after the event',async()=>{
 const s=fixture({minute:588});await s.tick();
 assert.equal(s.deliveries[0].message.title,'🔴 Відключення через 12 хв');
 s.state.currentMinute=600;await s.tick();
 assert.equal(s.deliveries.length,1);
});
test('disabled preferences, missing published date and stale schedules suppress Push',async()=>{
 const disabled=fixture({off:false,on:false});await disabled.tick();
 const missing=fixture({noDate:true});await missing.tick();
 const old=fixture({stale:true});await old.tick();
 assert.equal(disabled.deliveries.length,0);
 assert.equal(missing.deliveries.length,0);
 assert.equal(old.deliveries.length,0);
});
test('official midnight outage is detected on the prior evening',async()=>{
 const s=fixture({minute:1410,midnight:true});await s.tick();
 assert.equal(s.deliveries.length,1);
 assert.equal(s.deliveries[0].message.title,'🔴 Відключення через 30 хв');
 assert.equal(s.record.automatic.lastEvent.time,'2026-10-15T00:00');
});
test('a late but still relevant outage reminder is recovered up until the outage',async()=>{
 const s=fixture({minute:599});await s.tick();
 assert.equal(s.deliveries.length,1);
 assert.equal(s.deliveries[0].message.title,'🔴 Відключення через 1 хв');
 s.state.currentMinute=600;await s.tick();
 assert.equal(s.deliveries.length,1,'never deliver after the scheduled boundary');
});
test('a review of tomorrow does not suppress todays verified outage reminder',async()=>{
 const s=fixture({reviewPending:true,unresolvedDates:['2026-10-15']});
 await s.tick();
 assert.equal(s.deliveries.length,1);
 assert.equal(s.state.deliveryStats.lastCycle.todayVerified,true);
 assert.equal(s.state.deliveryStats.lastCycle.tomorrowVerified,false);
});
test('an unresolved date does not send reminders for that date',async()=>{
 const blocked=fixture({reviewPending:true,unresolvedDates:[date]});
 await blocked.tick();
 assert.equal(blocked.deliveries.length,0);
 const unknownReview=fixture({reviewPending:true});
 await unknownReview.tick();
 assert.equal(unknownReview.deliveries.length,0,'ambiguous global review must fail closed');
});
test('slow external fetches are not in the transition dispatcher',()=>{
 assert.doesNotMatch(dispatch,/loadJson\(|await fetch\(|Bulletin refresh/);
 assert.match(server,/setInterval\(\(\)=>transitionJob\(\)\.catch\(console\.error\),20_000\)/);
});
