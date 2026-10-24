// Offline-PWA Push regression: self-registration handles push without an open tab.
// Node vm intentionally simulates only the web APIs exercised by Push/notificationclick.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const origin='https://svitlo-cherkasy.pp.ua/';
function worker(openTabs=[]){
 const handlers=new Map(),notifications=[],inbox=[],opened=[];
 const registration={scope:origin,showNotification:async (title,opts)=>{notifications.push({title,...opts})}};
 const self={registration,location:new URL(origin),clients:{
  matchAll:async()=>openTabs,
  openWindow:async url=>{opened.push(url);return null},
  claim:async()=>{}
 },SvitloInbox:{add:async entry=>{inbox.push(entry)}},
 addEventListener:(type,handler)=>handlers.set(type,handler),
 skipWaiting:async()=>{}};
 vm.runInNewContext(script,{self,importScripts:()=>{},URL,Promise,Date,console,Math,setTimeout,clearTimeout});
 const invoke=async(type,data)=>{
  const pending=[];
  const event=type==='notificationclick'?{notification:data,waitUntil:p=>pending.push(Promise.resolve(p))}:{data,waitUntil:p=>pending.push(Promise.resolve(p))};
  handlers.get(type)(event);
  await Promise.all(pending);
 };
 return {self,invoke,notifications,inbox,opened};
}
test('Push displays and stores an official OFF reminder even when no PWA window is open',async()=>{
 const w=worker([]);
 await w.invoke('push',{json:()=>({
  title:'Скоро відключення',body:'Орієнтовно за 30 хвилин',
  content:'Графік оновлено',notificationId:'transition:4.1:2026-10-16:1140:off',
  kind:'schedule',at:'2026-10-16T15:00:00.000Z'
 })});
 assert.equal(w.notifications.length,1);
 assert.equal(w.notifications[0].body,'Орієнтовно за 30 хвилин');
 assert.match(w.notifications[0].tag,/^transition:4\.1:2026-10-16:1140:off-[a-z0-9]+$/,'Browser tag has a deterministic collision-resistant suffix');
 assert.equal(w.inbox.length,1);
 assert.equal(w.inbox[0].id,'transition:4.1:2026-10-16:1140:off');
 assert.equal(w.inbox[0].content,'Графік оновлено');
});
test('ON reminder retains the same canonical tag for redelivery and does not require an open tab',async()=>{
 const w=worker([]);
 const json=()=>({title:'Повернення світла',body:'Приблизно через 15 хв',
  notificationId:'transition:4.1:2026-10-16:1260:on'});
 await w.invoke('push',{json});
 await w.invoke('push',{json});
 assert.equal(w.notifications.length,2,'browser notification is always visible when iOS receives a Push');
 assert.equal(w.notifications[0].tag,w.notifications[1].tag,'stable tag lets browser replace repeated notification');
 assert.equal(w.inbox[0].id,w.inbox[1].id,'stable inbox ID enables storage deduplication');
});
test('tapping a closed-PWA notification opens PWA with the inbox message ID',async()=>{
 const w=worker([]);
 let closed=false;
 await w.invoke('notificationclick',{close(){closed=true},data:{
  inbox:true,inboxId:'transition:4.1:2026-10-16:1140:off'}});
 assert.equal(closed,true);
 assert.equal(w.opened.length,1);
 const url=new URL(w.opened[0]);
 assert.equal(url.origin,'https://svitlo-cherkasy.pp.ua');
 assert.equal(url.searchParams.get('inbox'),'transition:4.1:2026-10-16:1140:off');
});
test('Push-only notice is still visible but does not enter the notification inbox',async()=>{
 const w=worker([]);
 await w.invoke('push',{json:()=>({title:'Оголошення',body:'Тест',
  notificationId:'notice:1234567',kind:'announcement',inbox:false})});
 assert.equal(w.notifications.length,1);
 assert.equal(w.inbox.length,0);
});
