import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createFeedbackStore} from '../push-server/feedback-store.js';

const require=createRequire(import.meta.url);
const lookup=require('../address-lookup.js');
const merge=require('../data-merge.js');
const root=new URL('../',import.meta.url);

test('support emits generic lifecycle notifications only after saved mutations',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-live-feedback-'));
 try{
  const notifications=[];
  const store=createFeedbackStore({filePath:path.join(dir,'feedback.json'),onChange:kind=>notifications.push(kind)});
  const receipt=store.submit({topic:'bug',message:'Проблема з пошуком адреси у списку'},'test-origin');
  assert.deepEqual(notifications,['created']);
  assert.throws(()=>store.change(receipt.id,{status:'bogus'}));
  assert.deepEqual(notifications,['created']);
  store.change(receipt.id,{status:'in_progress',reply:'Перевіряємо повідомлення'});
  store.reply(receipt.id,receipt.token,'Дякую, зможу уточнити адресу','test-origin');
  store.change(receipt.id,{status:'resolved'});
  store.rate(receipt.id,receipt.token,5);
  store.remove(receipt.id);
  assert.deepEqual(notifications,['created','updated','replied','updated','rated','deleted']);
  assert.throws(()=>store.getStatus(receipt.id,receipt.token),e=>e.statusCode===404);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('reported addresses appear as candidates without guessed queue assignments',()=>{
 const current=JSON.parse(fs.readFileSync(new URL('data/addresses.json',root),'utf8'));
 const historical=JSON.parse(fs.readFileSync(new URL('data/published_street_fallback.json',root),'utf8'));
 const joined=merge.mergeIndexes(current,historical);
 for(const [index,settlement,street] of [
  [joined,'Черкаси','Івана Кожедуба'],
  [joined.localities.слобода,'Слобода','Філатова']
 ]){
  const result=lookup.resolve({idx:index,settlement,street});
  assert.equal(result.status,'possible');
  assert.equal(result.reason,'reported-only');
  assert.deepEqual(result.queues,[]);
  assert.equal(result.queue,undefined);
 }
});

test('browser clients use origin-restricted generic WebSocket events with SSE fallback',()=>{
 const server=fs.readFileSync(new URL('push-server/server.js',root),'utf8');
 const admin=fs.readFileSync(new URL('admin.js',root),'utf8');
 const client=fs.readFileSync(new URL('feedback.js',root),'utf8');
 assert.match(server,/originPolicy\.isAllowed\(req\.headers\.origin/);
 assert.match(server,/publishLive\('feedback'/);
 assert.match(server,/\/api\/socket/);
 assert.match(server,/type:'feedback'/);
 assert.match(client,/error\.status===404/);
 assert.match(client,/forgetTicket\(id/);
 assert.match(client,/new WebSocket\(/);
 assert.match(client,/new EventSource\(/);
 assert.match(admin,/new WebSocket\(/);
 assert.match(admin,/new EventSource\(/);
});
