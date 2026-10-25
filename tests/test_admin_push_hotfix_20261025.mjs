import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createManualPush} from '../push-server/manual-push.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const hash=x=>x;
const subscribers=()=>({
 a:{subscription:{endpoint:'https://web.push.apple.com/a'},queue:'1.1'},
 b:{subscription:{endpoint:'https://web.push.apple.com/b'},queue:'1.2'}
});
test('Office saves do not pretend that an Inbox post was pushed',()=>{
 const client=read('admin-control.js');
 assert.match(client,/if\(scope==='content'&&!silent&&toPush\.length\)/);
 assert.match(client,/api\('notices\/send',\{method:'POST',body:JSON\.stringify\(\{id:n\.id,confirmSend:true\}\)\}\)/);
 assert.match(client,/const latestConfig=await api\('app-config'\)/);
 assert.match(client,/if\(!delivered\.ok\)failures\.push/);
 assert.match(client,/Перевірте статус перед повторною спробою/);
 assert.match(client,/Push підготовлено. Натисніть «Зберегти»/);
 assert.match(client,/if\(toPush\.length&&scope==='content'&&!silent&&!confirm/);
 assert.match(read('admin.js'),/location\.pathname\.startsWith\('\/admin-app\/'\)/);
 assert.match(client,/location\.pathname\.startsWith\('\/admin-app\/'\)/);
});
test('One confirmed save calls the private dispatcher then refreshes pushSentAt',async()=>{
 const src=read('admin-control.js');
 const start=src.indexOf('// Inbox publication does not mean that Push was sent.');
 const end=src.indexOf('refreshHistory().catch(console.warn);',start);
 assert.ok(start>=0&&end>start);
 const text=src.slice(start,end);
 const calls=[],messages=[];
 const context={
  scope:'content',silent:false,toPush:[{id:'n_001',title:'Оголошення'}],
  async api(route,opts){
   calls.push({route,opts});
   if(route==='notices/send')return {ok:true,accepted:2,attempted:2};
   return {announcements:[{id:'n_001',pushSentAt:'2026-10-25T10:00:00Z'}]};
  },
  state:null,serverState:null,
  structuredClone,Number,JSON,console,
  fill(){},drawList(){},refreshNoticeMetrics(){return Promise.resolve()},
  status(...args){messages.push(args)}
 };
 vm.createContext(context);
 await vm.runInContext('(async()=>{'+text+'})()',context);
 assert.deepEqual(calls.map(c=>c.route),['notices/send','app-config']);
 assert.equal(JSON.parse(calls[0].opts.body).confirmSend,true);
 assert.match(messages[0][0],/Push прийнято провайдерами: 2 із 2/);
 assert.equal(context.state.announcements[0].pushSentAt,'2026-10-25T10:00:00Z');
});
test('Zero accepted Push does not get a success state',async()=>{
 const src=read('admin-control.js');
 const start=src.indexOf('// Inbox publication does not mean that Push was sent.');
 const end=src.indexOf('refreshHistory().catch(console.warn);',start);
 const messages=[];
 const context={
  scope:'content',silent:false,toPush:[{id:'n_001',title:'Тест'}],
  async api(route){
   if(route==='notices/send')return {ok:false,accepted:0,attempted:0,error:'Немає підписників'};
   return {announcements:[]};
  },
  state:null,serverState:null,structuredClone,Number,JSON,console,
  fill(){},drawList(){},refreshNoticeMetrics(){return Promise.resolve()},
  status(...args){messages.push(args)}
 };
 vm.createContext(context);
 await vm.runInContext('(async()=>{'+src.slice(start,end)+'})()',context);
 assert.equal(messages[0][1],true);
 assert.match(messages[0][0],/Не підтверджено/);
});
test('A notice delivered from HTTP and cron simultaneously reaches each subscriber once',async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve});
 const delivered=[],metrics=[];
 const service=createManualPush({
  subscribers:subscribers(),hash,save(){},appUrl:'https://example.com/',
  onBroadcast(id,r){metrics.push({id,r})},
  webpush:{async sendNotification(s,payload){await gate;delivered.push({s:s.endpoint,payload:JSON.parse(payload)})}}
 });
 const notice={title:'Оголошення',body:'Важливе повідомлення',
  queue:'all',notificationId:'notice:n_a102030405',inbox:true,confirmSend:true};
 const http=service.broadcast(notice);
 const cron=service.broadcast(notice);
 release();
 const [first,second]=await Promise.all([http,cron]);
 assert.equal(first.accepted,2);
 assert.equal(second.accepted,2);
 assert.equal(second.deduplicated,true);
 assert.equal(delivered.length,2,'One push per subscriber, not two');
 assert.equal(metrics.length,1,'Metrics counted once');
 const repeated=await service.broadcast(notice);
 assert.equal(repeated.deduplicated,true);
 assert.equal(delivered.length,2,'No repeat after success');
});
test('Temporary provider failure does not permanently blacklist a notice',async()=>{
 let failed=true,count=0;
 const service=createManualPush({
  subscribers:subscribers(),hash,save(){},appUrl:'https://example.com/',
  webpush:{async sendNotification(){count++;if(failed)throw Error('temporary provider error')}}
 });
 const message={title:'Оголошення',body:'Текст',queue:'all',
  notificationId:'notice:n_retrysample',confirmSend:true};
 assert.equal((await service.broadcast(message)).accepted,0);
 failed=false;
 assert.equal((await service.broadcast(message)).accepted,2);
 assert.equal(count,4);
});
