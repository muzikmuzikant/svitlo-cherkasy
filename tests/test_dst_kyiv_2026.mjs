import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {timeline,dueTransitionAcrossDays,kyivWallInstants} from '../push-server/schedule-engine.js';
function day(date,off){return {date,verified:true,queues:{'1.1':{knownFrom:'00:00',off}}}}
function due(date,off,now,epoch,offset=30,target=1){
 const today=timeline(day(date,off),'1.1');
 const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const tomorrow=timeline(day(next.toISOString().slice(0,10),[]),'1.1');
 return dueTransitionAcrossDays(today,tomorrow,now,offset,target,offset-1,epoch,date);
}
test('fall has two 03:30 instances but one 04:00',()=>{
 assert.equal(kyivWallInstants('2026-10-25',210).length,2);
 assert.equal(kyivWallInstants('2026-10-25',240).length,1);
});
test('first 03:30 cannot cause premature 04:00 Push',()=>{
 assert.equal(due('2026-10-25',[['04:00','05:00']],210,Date.parse('2026-10-25T03:30:00+03:00')),null);
});
test('second 03:30 sends 30 true minutes before 04:00',()=>{
 assert.deepEqual(due('2026-10-25',[['04:00','05:00']],210,Date.parse('2026-10-25T03:30:00+02:00')),{boundary:240,eta:30});
});
test('both occurrences of ambiguous 03:45 suppress Push',()=>{
 for(const zone of ['+03:00','+02:00'])
  assert.equal(due('2026-10-25',[['03:45','04:30']],195,Date.parse('2026-10-25T03:15:00'+zone)),null);
});
test('spring skipped 03:30 and 04:00 reminder work',()=>{
 assert.equal(kyivWallInstants('2027-03-28',210).length,0);
 assert.deepEqual(due('2027-03-28',[['04:00','05:00']],150,Date.parse('2027-03-28T02:30:00+02:00')),{boundary:240,eta:30});
});
test('normal day remains normal',()=>{
 assert.deepEqual(due('2026-10-24',[['10:00','11:00']],570,Date.parse('2026-10-24T09:30:00+03:00')),{boundary:600,eta:30});
});
test('iPhone PWA: 03:30 countdown to 04:00 changes from 90 to 30 minutes',()=>{
 const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=src.indexOf('const currentDay='),end=src.indexOf('function stats(a){',start);
 assert.ok(start>0&&end>start);
 const data={days:[day('2026-10-25',[['04:00','05:00']])],lastChecked:'2026-10-25T02:00:00+03:00'};
 for(const [iso,minutes] of [['2026-10-25T03:30:00+03:00',90],['2026-10-25T03:30:00+02:00',30]]){
  const epoch=Date.parse(iso);class MockDate extends Date{static now(){return epoch}}
  const ctx={data,QUEUES:['1.1'],lastSyncFailed:false,Date:MockDate,Intl,TZ:'Europe/Kyiv',
   nowMinutes:()=>210,today:()=> '2026-10-25',
   shiftDay:(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400_000).toISOString().slice(0,10),
   clock:n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
  vm.createContext(ctx);vm.runInContext(src.slice(start,end)+';this.actual=nextChange("2026-10-25","1.1",210)',ctx);
  assert.equal(ctx.actual?.minutesUntil,minutes);
 }
});
