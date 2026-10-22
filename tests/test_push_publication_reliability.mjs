import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync(new URL('../push-server/server.js',import.meta.url),'utf8');
const begin=code.indexOf('async function send(rec,message,key,options={}){');
const end=code.indexOf('\nasync function forEachLimited(',begin);
assert.ok(begin>0&&end>begin,'automatic push sender exists');
const senderSource=code.slice(begin,end);

function harness({status=null,saveFails=false}={}){
 const sent={},subscribers={fixture:{subscription:{endpoint:'https://web.push.apple.com/sub'}}};
 const writes=[],errors=[],calls=[];
 const deliveryStats={lastAttempt:null,lastAccepted:null,lastFailure:null,totalAcceptedSinceBoot:0,totalFailedSinceBoot:0};
 const context={
  sent,subscribers,deliveryStats,appUrl:'https://svitlo-cherkasy.pp.ua/',
  pendingPushKeys:new Set(),hash:()=> 'fixture',
  webpush:{async sendNotification(subscription,payload,opts){
   calls.push({subscription,payload:JSON.parse(payload),opts});
   if(status)throw Object.assign(new Error('Provider rejected'),{statusCode:status});
  }},
  save(){writes.push(JSON.stringify({sent,subscribers}));if(saveFails)throw Error('Volume unavailable')},
  console:{error:(...args)=>errors.push(args.join(' ')),warn:(...args)=>errors.push(args.join(' ')),info(){}}
 };
 vm.createContext(context);
 vm.runInContext(senderSource+'\nthis.deliverPush=send;',context);
 const invoke=(key='device:off:2026-10-22:1080')=>context.deliverPush(subscribers.fixture,{title:'Нагадування',body:'Підчерга 1.1'},key,{
  notificationId:'transition:1.1:2026-10-22:1080:off',ttl:1200,urgency:'high'
 });
 return {invoke,context,sent,subscribers,deliveryStats,calls,writes,errors};
}

test('provider acceptance saves dedupe before the next message and prevents repeats',async()=>{
 const h=harness();
 assert.equal(await h.invoke(),'accepted');
 assert.equal(h.writes.length,1,'persist accepted event immediately');
 assert.ok(h.sent['device:off:2026-10-22:1080']);
 assert.equal(await h.invoke(),'already-sent');
 assert.equal(h.calls.length,1,'one Push only for the same event and device');
 assert.equal(h.writes.length,1);
});

test('temporary provider failure remains retryable and does not create sent records',async()=>{
 const h=harness({status:503});
 assert.equal(await h.invoke(),'failed');
 assert.equal(h.writes.length,0);
 assert.deepEqual(Object.keys(h.sent),[]);
 assert.equal(h.deliveryStats.totalFailedSinceBoot,1);
 assert.equal(h.calls.length,1);
});

test('invalid Apple subscription is removed and the removal is persisted',async()=>{
 const h=harness({status:410});
 assert.equal(await h.invoke(),'failed');
 assert.equal(h.subscribers.fixture,undefined);
 assert.equal(h.writes.length,1);
});

test('volume error after provider acceptance must not cause another immediate Push',async()=>{
 const h=harness({saveFails:true});
 assert.equal(await h.invoke(),'accepted');
 assert.equal(await h.invoke(),'already-sent');
 assert.equal(h.calls.length,1);
 assert.equal(h.deliveryStats.totalFailedSinceBoot,0);
 assert.match(h.errors.join(' '),/dedupe save failed/);
});

test('new verified Railway publication starts both regular and transition dispatchers',()=>{
 const begin=code.indexOf("if(req.url==='/api/internal/schedules'");
 const end=code.indexOf("if(requestPath==='/api/telemetry'",begin);
 assert.ok(begin>0&&end>begin,'protected publisher route exists');
 const route=code.slice(begin,end);
 assert.match(route,/officialSchedules\.update\(body\.schedules,body\.review\)/);
 assert.match(route,/response\(res,200,\{ok:true,\.\.\.state\}\)/);
 assert.match(route,/queueMicrotask\(\(\)=>\{/);
 assert.match(route,/void job\(\)\.catch/);
 assert.match(route,/void transitionJob\(\)\.catch/);
});
