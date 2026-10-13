import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const client=read('app.js'),server=read('push-server/server.js'),html=read('index.html');
const start=client.indexOf('function pushHealthMessage(');
const end=client.indexOf('async function getPushConfig()',start);
assert.ok(start>=0&&end>start,'Push health functions present');
const script=client.slice(start,end);
function harness({registered=true,queue='1.1',off=true,on=true,checkError=null}={}){
 const status={textContent:''},button={disabled:false};
 const requests=[];let repairs=0;const subscription={endpoint:'https://web.push.apple.com/mocksecret'};
 const prefs={off:true,on:true};const Notification={permission:'granted'};
 const fetch=async(url,options)=>{
  requests.push({url,body:JSON.parse(options.body)});
  if(url.includes('test-device'))return {ok:true,json:async()=>({accepted:true})};
  return {ok:true,json:async()=>({
   registered,queue,preferences:{off,on},lastPushCheck:'2026-10-13T17:00:00Z',checkError})};
 };
 const ctx={Notification,window:{Notification},navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>subscription}})}},
  pushConfig:{apiBase:'https://example.test'},pushActive:false,pushHealthBusy:null,pushHealthLast:0,
  PUSH_CONSENT:'consent',localStorage:{getItem:()=> 'yes'},primary:()=>({queue:'1.1'}),
  prefs,$:id=>id==='pushDeliveryStatus'?status:id==='pushTestDevice'?button:null,
  updatePushSubscription:async()=>{repairs++},fetch,console,Date,
  flash:()=>{}};
 vm.createContext(ctx);vm.runInContext(script,ctx);
 return {ctx,status,button,requests,get repairs(){return repairs},
  check:()=>vm.runInContext('checkPushDelivery(true)',ctx),
  sendTest:()=>vm.runInContext('testDevicePush()',ctx)};
}
test('Push health verifies actual Railway subscription independently of local Inbox',async()=>{
 const h=harness();await h.check();
 assert.equal(h.ctx.pushActive,true);
 assert.equal(h.repairs,0);
 assert.match(h.status.textContent,/підписка є на сервері/);
 assert.equal(h.requests[0].body.subscription.endpoint,'https://web.push.apple.com/mocksecret');
});
test('lost registration is re-created when PWA returns to foreground',async()=>{
 const h=harness({registered:false});await h.check();
 assert.equal(h.repairs,1);
 assert.match(h.status.textContent,/оновлено/);
});
test('wrong queue or disabled reminder setting causes subscription refresh',async()=>{
 const h=harness({queue:'2.2',off:false});await h.check();
 assert.equal(h.repairs,1);
});
test('missing schedule check on server is shown as an alert',async()=>{
 const h=harness({checkError:'Schedule data stale'});await h.check();
 assert.match(h.status.textContent,/проблему з перевіркою графіка/);
});
test('test action calls real-device push route, not the local Inbox',async()=>{
 const h=harness();await h.sendTest();
 assert.ok(h.requests.some(x=>x.url.endsWith('/api/push/test-device')));
 assert.match(h.status.textContent,/прийнято сервісом доставки/);
 assert.equal(h.button.disabled,false);
});
test('server includes transition metrics, high urgency, and rate-limited targeted test',()=>{
 assert.match(server,/deliveryStats\.lastCycle=cycle/);
 assert.match(server,/urgency:'high'/);
 assert.match(server,/cycle\.transitionDue\+\+/);
 assert.match(server,/deviceTests\.set\(endpointId,now\+10\*60_000\)/);
 assert.match(server,/requestPath==='\/api\/push\/test-device'/);
 assert.match(server,/subscribers\[endpointId\]/);
 assert.match(html,/id="pushDeliveryStatus"/);
 assert.match(html,/id="pushTestDevice"/);
});
