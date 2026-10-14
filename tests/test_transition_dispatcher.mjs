import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {timeline,dueTransitionAcrossDays,QUEUES} from '../push-server/schedule-engine.js';

const sourceText=readFileSync(new URL('../push-server/server.js',import.meta.url),'utf8');
const start=sourceText.indexOf('async function transitionJob(){');
const end=sourceText.indexOf('\nasync function job(){',start);
assert.ok(start>=0&&end>start,'dedicated Railway transition dispatcher exists');
const source=sourceText.slice(start,end);
const makeDay=(date,periods)=>({date,verified:true,queues:{'1.1':{knownFrom:'00:00',off:periods}}});

async function dispatch({minute=570,periods=[['10:00','12:00']],tomorrowPeriods=[],off=true,on=true,fresh=true}={}){
 const today=makeDay('2026-10-14',periods),tomorrow=makeDay('2026-10-15',tomorrowPeriods);
 const record={queue:'1.1',subscription:{endpoint:'https://web.push.apple.com/mock'},preferences:{off,on}};
 const calls=[],sent={},errors=[];let saves=0;
 const ctx={
  transitionRunning:false,officialSchedules:{schedule:()=>({days:[today,tomorrow],lastChecked:new Date().toISOString()})},
  lastLoadedSchedule:null,dayInKyiv:()=>({date:'2026-10-14',m:minute}),
  freshSchedule:()=>fresh,shiftDay:()=> '2026-10-15',
  subscribers:{user:record},timeline,dueTransitionAcrossDays,QUEUES,Date,
  hash:()=> 'hashed-device',deliveryStats:{lastCycle:null,lastFailure:null},
  transitionCopy:(type,queue,boundary,eta,date)=>({title:type+' '+eta,body:queue+' '+date,content:String(boundary)}),
  forEachLimited:async(items,limit,fn)=>{for(const item of items)await fn(item)},
  send:async(rec,msg,key,options)=>{calls.push({rec,msg,key,options});sent[key]=new Date().toISOString();return 'accepted'},
  sent,save:()=>{saves++},
  console:{info(){},warn(){},error:(...args)=>errors.push(args.join(' '))}
 };
 vm.createContext(ctx);
 vm.runInContext(source+'\nthis.runDispatcher=transitionJob;',ctx);
 await ctx.runDispatcher();
 await ctx.runDispatcher();
 return {calls,ctx,record,saves,errors};
}

test('server sends OFF reminder 30 minutes before scheduled outage, with no app process',async()=>{
 const x=await dispatch();
 assert.deepEqual(x.errors,[]);
 assert.equal(x.calls.length,1,'a duplicate interval must not resend');
 assert.equal(x.calls[0].msg.title,'off 30');
 assert.equal(x.calls[0].options.notificationId,'transition:1.1:2026-10-14:600:off');
 assert.equal(x.calls[0].options.urgency,'high');
 assert.equal(x.record.automatic.lastError,null);
 assert.equal(x.ctx.deliveryStats.lastCycle.offEnabled,1);
 assert.equal(x.ctx.deliveryStats.lastCycle.onEnabled,1);
 assert.equal(x.saves,1);
});
test('server sends ON reminder 15 minutes before planned return, without a browser',async()=>{
 const x=await dispatch({minute:705});
 assert.deepEqual(x.errors,[]);
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].msg.title,'on 15');
 assert.equal(x.calls[0].options.notificationId,'transition:1.1:2026-10-14:720:on');
});
test('server honors explicit OFF or ON preference instead of ignoring it',async()=>{
 assert.equal((await dispatch({off:false,on:true})).calls.length,0);
 assert.equal((await dispatch({minute:705,off:true,on:false})).calls.length,0);
});
test('server avoids false or late reminders when source is stale or event has started',async()=>{
 assert.equal((await dispatch({fresh:false})).calls.length,0);
 assert.equal((await dispatch({minute:600})).calls.length,0);
 assert.equal((await dispatch({minute:720})).calls.length,0);
});
test('server recovers late checks, still correctly labels the remaining minutes',async()=>{
 const x=await dispatch({minute:577});
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].msg.title,'off 23');
});
test('server finds an OFF transition across Kyiv midnight',async()=>{
 const x=await dispatch({minute:1410,periods:[],tomorrowPeriods:[['00:00','02:00']]});
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].msg.title,'off 30');
 assert.equal(x.calls[0].options.notificationId,'transition:1.1:2026-10-14:1440:off');
});
