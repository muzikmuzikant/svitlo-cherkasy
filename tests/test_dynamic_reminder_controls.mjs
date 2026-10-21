import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {timeline,dueTransitionAcrossDays,QUEUES} from '../push-server/schedule-engine.js';
import {transitionCopy} from '../push-server/notification-copy.js';
const src=fs.readFileSync(new URL('../push-server/server.js',import.meta.url),'utf8');
const start=src.indexOf('async function transitionJob(){');
const end=src.indexOf('async function job(){',start);
assert.ok(start>=0&&end>start);
const job=src.slice(start,end);
function fixture({minute=580,offLead=20,enabled=true}={}){
 const source={lastChecked:new Date().toISOString(),days:[
  {date:'2026-10-21',verified:true,queues:{'1.1':{knownFrom:'00:00',off:[['10:00','12:00']]}}},
  {date:'2026-10-22',verified:true,queues:{'1.1':{knownFrom:'00:00',off:[]}}}
 ]};
 const deliveries=[],sent={},record={queue:'1.1',preferences:{off:true,on:true},subscription:{endpoint:'https://web.push.apple.com/example'}};
 const config={
  off:{enabled,leadMinutes:offLead,title:'⚠️ Планова зміна за {minutes} хв',body:'Підчерга {queue}, за плановим графіком о {time}'},
  on:{enabled:true,leadMinutes:15,title:'🟢 Відновлення за {minutes} хв',body:'Підчерга {queue}, за плановим графіком о {time}'}
 };
 const ctx={
  transitionRunning:false,operationalControls:{get:()=>({reminders:config})},
  officialSchedules:{schedule:()=>source},lastLoadedSchedule:null,
  dayInKyiv:()=>({date:'2026-10-21',m:minute}),
  shiftDay:()=> '2026-10-22',freshSchedule:()=>true,timeline,dueTransitionAcrossDays,QUEUES,transitionCopy,
  subscribers:{one:record},deliveryStats:{lastFailure:null,lastCycle:null},
  hash:()=> 'hashed',Date,console:{info(){},warn(){},error(){}},sent,
  forEachLimited:async(items,limit,fn)=>{for(const item of items)await fn(item)},
  send:async(rec,msg,key,options)=>{deliveries.push({msg,key,options});sent[key]=new Date().toISOString();return 'accepted'},
  save:()=>{}
 };
 vm.createContext(ctx);vm.runInContext(job+'\nthis.dispatch=transitionJob',ctx);
 return {run:()=>ctx.dispatch(),deliveries,ctx};
}
test('custom lead minutes and safe copied templates are really used by worker',async()=>{
 const f=fixture();await f.run();await f.run();
 assert.equal(f.deliveries.length,1);
 assert.equal(f.deliveries[0].msg.title,'⚠️ Планова зміна за 20 хв');
 assert.equal(f.deliveries[0].msg.body,'Підчерга 1.1, за плановим графіком о 10:00');
 assert.equal(f.deliveries[0].options.ttl,1200);
 assert.match(f.deliveries[0].msg.content,/планов/i);
 assert.equal(Object.keys(f.ctx.sent).length,1);
});
test('one switched off automatic reminder emits no messages',async()=>{
 const f=fixture({enabled:false});await f.run();
 assert.equal(f.deliveries.length,0);
});
test('configured reminder catches up after minor delay and does not send after event',async()=>{
 const f=fixture({minute:587});await f.run();
 assert.equal(f.deliveries.length,1);
 assert.match(f.deliveries[0].msg.title,/13 хв/);
 const late=fixture({minute:600});await late.run();
 assert.equal(late.deliveries.length,0);
});
