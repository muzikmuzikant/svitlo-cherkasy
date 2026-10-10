import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import crypto from 'node:crypto';
import { createManualPush, cleanMessage, selectRecipients } from '../push-server/manual-push.js';

const records = () => {
  const a = { subscription: { endpoint: 'https://web.push.apple.com/a' }, queue: '1.1' };
  const b = { subscription: { endpoint: 'https://web.push.apple.com/b' }, queue: '2.2' };
  return Object.fromEntries([a,b].map(r=>[crypto.createHash('sha256').update(r.subscription.endpoint).digest('hex'),r]));
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function createFake(){
  const accepted=[];
  const subscribers=records();
  const service=createManualPush({ subscribers, hash, appUrl:'https://example.github.io/svitlo-cherkasy/', save:()=>{}, webpush:{async sendNotification(subscription,payload){accepted.push({endpoint:subscription.endpoint,data:JSON.parse(payload)});return true;}} });
  return {service,accepted,subscribers};
}

test('title/body length and queue validated',()=>{
  assert.throws(()=>cleanMessage({title:'',body:'hello'}));
  assert.throws(()=>cleanMessage({title:'Hi',body:' ' }));
  assert.throws(()=>cleanMessage({title:'x'.repeat(86),body:'x'}));
  assert.throws(()=>cleanMessage({title:'Title',body:'x'.repeat(281)}));
  assert.throws(()=>cleanMessage({title:'hi',body:'ok',queue:'7.2'}));
  assert.deepEqual(cleanMessage({title:' Test ',body:' Text ',queue:'3.1'}),{title:'Test',body:'Text',queue:'3.1'});
});
test('recipient selection by queue and device endpoint',()=>{
  const s=records();
  assert.equal(selectRecipients(s,{queue:'1.1'}).length,1);
  assert.equal(selectRecipients(s,{queue:'all'}).length,2);
  assert.equal(selectRecipients(s,{target:'mine',endpoint:'https://web.push.apple.com/b'}).length,1);
});
test('test sends only to current subscriber and does not email blast',async()=>{
  const {service,accepted}=createFake();
  const result=await service.test({target:'mine',endpoint:'https://web.push.apple.com/a'});
  assert.equal(result.accepted,1);
  assert.equal(accepted.length,1);
  assert.match(accepted[0].data.title,/Тест/);
  assert.equal(accepted[0].data.url,'https://example.github.io/svitlo-cherkasy/');
});
test('all-subscriber test needs explicit confirmation',async()=>{
  const {service}=createFake();
  await assert.rejects(service.test({target:'all'}),/підтвердження/);
});
test('custom broadcast restricted to selected queue',async()=>{
  const {service,accepted}=createFake();
  const result=await service.broadcast({title:'Оголошення',body:'Перевірка',queue:'2.2',confirmSend:true});
  assert.equal(result.accepted,1);
  assert.equal(accepted[0].endpoint,'https://web.push.apple.com/b');
  assert.equal(accepted[0].data.body,'Перевірка');
});
test('custom broadcast needs explicit confirmation',async()=>{
  const {service}=createFake();
  await assert.rejects(service.broadcast({title:'Hi',body:'Hello',queue:'all'}),/підтвердження/);
});
test('expired subscriptions removed after provider returns 410',async()=>{
  const s=records();
  const service=createManualPush({ subscribers:s, hash, appUrl:'https://example.github.io/svitlo-cherkasy/', save:()=>{}, webpush:{async sendNotification(){const e=Error('gone');e.statusCode=410;throw e;}} });
  const result=await service.test({target:'mine',endpoint:'https://web.push.apple.com/a'});
  assert.equal(result.expired,1);
  assert.equal(Object.keys(s).length,1);
});

test('admin login issues an expiring session; logout revokes it',async()=>{
  process.env.APP_ORIGIN='https://example.github.io';
  process.env.ADMIN_PASSWORD='local-test-only-strong-password';
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPOSITORY;
  const {adminRouter}=await import('../push-server/admin.js');
  const {service,accepted}=createFake();
  const server=http.createServer((req,res)=>adminRouter(req,res,service));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function call(route,{token='',body,method}={}){
    const r=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:{Origin:'https://example.github.io',Authorization:token?'Bearer '+token:'','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json()};
  }
  try{
    assert.equal((await call('/api/admin/status')).status,401);
    assert.equal((await call('/api/admin/login',{body:{password:'bad-password'}})).status,401);
    const login=await call('/api/admin/login',{body:{password:'local-test-only-strong-password'}});
    assert.equal(login.status,200);
    assert.equal(login.data.ok,true);
    assert.ok(login.data.token.length>=40);
    const token=login.data.token;
    assert.equal((await call('/api/admin/status',{token})).data.editingEnabled,false);
    assert.equal((await call('/api/admin/push/status',{token})).data.subscribers,2);
    const testResult=await call('/api/admin/push/test',{token,body:{target:'mine',endpoint:'https://web.push.apple.com/b'}});
    assert.equal(testResult.status,200);assert.equal(testResult.data.accepted,1);
    const custom=await call('/api/admin/push/send',{token,body:{title:'Тест',body:'Повідомлення',queue:'1.1',confirmSend:true}});
    assert.equal(custom.data.accepted,1);assert.equal(accepted.length,2);
    assert.equal((await call('/api/admin/logout',{token,body:{}})).status,200);
    assert.equal((await call('/api/admin/push/status',{token})).status,401);
    assert.equal((await call('/api/admin/status',{token:'local-test-only-strong-password'})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
