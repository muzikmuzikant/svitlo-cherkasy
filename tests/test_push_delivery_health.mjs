import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const client=read('app.js'),server=read('push-server/server.js'),html=read('index.html');
const start=client.indexOf('function pushHealthMessage('),end=client.indexOf('async function getPushConfig()',start);
assert.ok(start>=0&&end>start,'Push registration diagnostic remains available');
const script=client.slice(start,end);
function harness({registered=true,queue='1.1',off=true,on=true,checkError=null,upcoming=null,latest=null}={}){
 const status={textContent:''},requests=[];let repairs=0;
 const subscription={endpoint:'https://web.push.apple.com/fixture'};
 const prefs={off:true,on:true,changes:false,tomorrow:false,emergency:false},Notification={permission:'granted'};
 const fetch=async(url,options)=>{
  requests.push({url,body:JSON.parse(options.body)});
  return {ok:true,json:async()=>({
   registered,queue,preferences:{off,on,changes:false,tomorrow:false,emergency:false},lastPushCheck:'2026-10-14T10:00:00Z',
   checkError,upcoming,latestAutomatic:latest})};
 };
 const ctx={Notification,window:{Notification},navigator:{serviceWorker:{ready:Promise.resolve({
  pushManager:{getSubscription:async()=>subscription}})}},
  pushConfig:{apiBase:'https://example.test'},pushActive:false,pushHealthBusy:null,pushHealthLast:0,
  PUSH_CONSENT:'consent',localStorage:{getItem:()=> 'yes'},primary:()=>({queue:'1.1'}),
  prefs,$:id=>id==='pushDeliveryStatus'?status:null,
  updatePushSubscription:async()=>{repairs++},fetch,console,Date,
  renderSettings(){},formatDate:date=>date,fmtStamp:date=>date,flash(){}};
 vm.createContext(ctx);vm.runInContext(script,ctx);
 return {ctx,status,requests,get repairs(){return repairs},
  check:()=>vm.runInContext('checkPushDelivery(true)',ctx)};
}
test('registered device confirms real server subscription without sending a test Push',async()=>{
 const h=harness();await h.check();
 assert.equal(h.ctx.pushActive,true);
 assert.equal(h.repairs,0);
 assert.equal(h.status.textContent,'','Do not expose internal Push telemetry in UI');
 assert.equal(h.requests.length,1);
 assert.match(h.requests[0].url,/\/api\/push\/subscription-status$/);
});
test('missing subscription is re-registered when app becomes active',async()=>{
 const h=harness({registered:false});await h.check();
 assert.equal(h.repairs,1);
 assert.equal(h.ctx.pushActive,false,'Repair keeps pending delivery state until next validation');
});
test('wrong queue or missing OFF/ON preferences automatically refreshes server subscription',async()=>{
 const h=harness({queue:'2.2',off:false});await h.check();
 assert.equal(h.repairs,1);
});
test('device status shows actual upcoming OFF and ON events and previous automatic delivery',async()=>{
 const h=harness({upcoming:{off:{date:'2026-10-14',time:'16:00'},on:{date:'2026-10-14',time:'18:00'}},
  latest:{lastAccepted:'2026-10-14T08:30:00Z'}});await h.check();
 assert.equal(h.ctx.pushActive,true);
 assert.equal(h.repairs,0);
 assert.equal(h.status.textContent,'','Internal delivery timestamps are not displayed');
});
test('freshness problem is surfaced instead of reporting healthy reminders',async()=>{
 const h=harness({checkError:'Schedule data stale'});await h.check();
 assert.equal(h.ctx.pushActive,true,'Registered subscription must remain active even if the schedule is stale');
 assert.equal(h.status.textContent,'','Health warning is internal, not a developer-facing status panel');
});
test('technical Push status box is removed while registration checks still run',()=>{
 assert.doesNotMatch(html,/id="pushDeliveryStatus"/);
 assert.match(client,/async function checkPushDelivery\(/);
});
test('test Push is fully removed from settings, app logic, and public API',()=>{
 assert.doesNotMatch(html,/pushTestDevice|Надіслати тестовий Push/);
 assert.doesNotMatch(client,/testDevicePush|\/api\/push\/test-device/);
 assert.doesNotMatch(server,/\/api\/push\/test-device|deviceTests/);
});
test('independent 20-second OFF and ON dispatcher tracks results and has priority',()=>{
 assert.match(server,/async function transitionJob\(\)/);
 assert.match(server,/setInterval\(\(\)=>transitionJob\(\)\.catch\(console\.error\),20_000\)/);
 assert.match(server,/dueTransitionAcrossDays\(values,valuesTomorrow,minutes,offset,target,offset-1,timestamp,now\.date\)/);
 assert.match(server,/ttl:Math\.max\(60,Math\.floor\(eta\*60\)\),urgency:'high'/);
 assert.match(server,/record\.automatic\.lastAccepted/);
 assert.match(server,/deliveryStats\.lastCycle=cycle/);
 assert.match(server,/automatic:subscribers\[key\]\?\.automatic\|\|\{\}/);
});
