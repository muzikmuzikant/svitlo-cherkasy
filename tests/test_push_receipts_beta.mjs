import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createPushReceipts} from '../push-server/push-receipts.js';

test('display receipts distinguish provider acceptance from an OS display request',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'svitlo-receipts-'));
 try{
  let time=Date.parse('2026-10-24T10:00:00Z');
  const now=()=>time,store=createPushReceipts({directory,clock:now});
  const id=store.begin({category:'transition',queue:'6.1'});
  assert.match(id,/^[A-Za-z0-9_-]{24}$/);
  assert.equal(store.snapshot().pending,1);
  store.accepted(id);
  assert.equal(store.snapshot().accepted,1);
  assert.equal(store.snapshot().displayRequested,0,'provider acceptance is not evidence of display');
  assert.equal(store.acknowledge('invalid'),false);
  assert.equal(store.acknowledge(id),true);
  assert.equal(store.acknowledge(id),true,'idempotent receipt');
  assert.equal(store.snapshot().accepted,0);
  assert.equal(store.snapshot().displayRequested,1);
  const reopened=createPushReceipts({directory,clock:now});
  assert.equal(reopened.snapshot().displayRequested,1,'persists across a Railway restart');
  assert.doesNotMatch(readFileSync(path.join(directory,'push-receipts.json'),'utf8'),/push\.apple\.com|endpoint|address/i);
  time+=49*3600_000;
  assert.equal(reopened.acknowledge(id),false,'old receipts expire');
  assert.equal(reopened.snapshot().displayRequested,0);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

test('failed provider sends do not become accepted receipts',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'svitlo-receipts-'));
 try{
  const store=createPushReceipts({directory});
  const id=store.begin({category:'transition'});
  store.rejected(id,503);
  assert.equal(store.acknowledge(id),false);
  assert.equal(store.snapshot().failedSinceBoot,1);
  assert.equal(store.snapshot().accepted,0);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function serviceWorker({firstShowFails=false,receiptFetchFails=false}={}){
 const handlers={},notifications=[],posted=[],inbox=[],events=[];
 let showCalls=0;
 const worker={
  registration:{scope:'https://svitlo-cherkasy.pages.dev/',
   async showNotification(title,options){
    ++showCalls;
    if(firstShowFails&&showCalls===1)throw Error('Rich options rejected');
    notifications.push({title,options});
   }},
  clients:{async matchAll(){return []}},
  SvitloInbox:{async add(data){inbox.push(data);return []}},
  addEventListener(type,fn){handlers[type]=fn}
 };
 const context={self:worker,importScripts(){},URL,Date,Promise,AbortController,setTimeout,clearTimeout,console,
  fetch:async(url,options)=>{
   events.push({url,options});
   if(String(url).includes('push-config.json'))return {ok:true,json:async()=>({apiBase:'https://svitlo-beta-api-staging.up.railway.app'})};
   if(receiptFetchFails)throw Error('temporarily offline');
   posted.push(JSON.parse(options.body));return {ok:true};
  }
 };
 vm.runInNewContext(source,context);
 return {notifications,inbox,posted,events,async receive(payload){
  let pending;
  handlers.push({data:{json:()=>payload},waitUntil(p){pending=p}});
  assert.ok(pending,'push lifetime is protected with waitUntil');
  await pending;
 }};
}

test('background push shows an OS notification, updates inbox, and confirms display request',async()=>{
 const sw=serviceWorker();
 const id='AbCdEf0123456789ABcDef012';
 await sw.receive({title:'Відключення через 30 хв',body:'Черга 6.1',receiptId:id,
  notificationId:'transition:6.1:2026-10-24:900:off'});
 assert.equal(sw.notifications.length,1);
 assert.equal(sw.inbox.length,1);
 assert.equal(sw.posted.length,1);
 assert.equal(sw.posted[0].receiptId,id);
 assert.equal(sw.posted[0].status,'display-requested');
 assert.equal(sw.notifications[0].options.data.inboxId,sw.inbox[0].id);
});

test('browser-specific rich notification failure retries the minimal visible alert',async()=>{
 const sw=serviceWorker({firstShowFails:true});
 await sw.receive({title:'Графік оновлено',body:'Зміна',receiptId:'AbCdEf0123456789ABcDef012',
  notificationId:'change:6.1:2026-10-24:rev1'});
 assert.equal(sw.notifications.length,1);
 assert.equal(sw.notifications[0].options.icon,undefined);
 assert.equal(sw.posted.length,1);
});

test('failed receipt network never blocks a visible OS notification',async()=>{
 const sw=serviceWorker({receiptFetchFails:true});
 await sw.receive({title:'Відновлення',body:'Повернення світла',
  receiptId:'AbCdEf0123456789ABcDef012'});
 assert.equal(sw.notifications.length,1);
 assert.equal(sw.inbox.length,1);
 assert.equal(sw.posted.length,0);
});

test('long change IDs retain distinct notification tags rather than replacing one another',async()=>{
 const sw=serviceWorker();
 const common='change:6.1:2026-10-24:'+ 'a'.repeat(75);
 await sw.receive({title:'Оновлення',notificationId:common+'1'});
 await sw.receive({title:'Оновлення',notificationId:common+'2'});
 assert.notEqual(sw.notifications[0].options.tag,sw.notifications[1].options.tag);
});
