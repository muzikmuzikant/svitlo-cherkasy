import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('function checkNotifications(){');
const end=app.indexOf('\nasync function getPushConfig()',start);
assert.ok(start>=0&&end>start,'find local reminder handler');
const logic=app.slice(start,end);
function run({minute=570,off=600,push=true,permission='denied',stale=false,review=false,midnight=false}={}){
 const today='2026-10-13',dateTomorrow='2026-10-14',saved=[],native=[],refreshes=[],stored={};
 const current=new Int8Array(1440),tomorrow=new Int8Array(1440);
 if(off<1440)current.fill(1,off,Math.min(off+60,1440));
 if(midnight)tomorrow.fill(1,0,60);
 const Notif={permission},notified=new Set();
 const sandbox={
  Date,window:{Notification:Notif,SvitloInbox:{add:async x=>{saved.push(x)}},SvitloInboxUI:{refresh(){refreshes.push(1)}}},
  Notification:Notif,prefs:{off:true,on:false,tomorrow:false,emergency:false},pushActive:push,
  data:{lastChecked:new Date(Date.now()-(stale?3600000:0)).toISOString(),reviewPending:review},
  primary:()=>({id:'test-address',queue:'1.1'}),today:()=>today,nowMinutes:()=>minute,
  shiftDay:()=>dateTomorrow,timeline:date=>date===today?current:tomorrow,
  notified,SEEN:'reminder-test',localStorage:{setItem(k,v){stored[k]=v}},
  clock:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),
  formatDate:d=>d,currentDay:()=>null,notify:(...x)=>native.push(x),
  notifyEmergencyEvent(){},console
 };
 vm.runInNewContext(logic+';checkNotifications();checkNotifications();',sandbox);
 return {saved,native,refreshes,stored};
}
test('in-app outage reminder appears once even with OS notification permission denied',async()=>{
 const result=run();await Promise.resolve();await Promise.resolve();
 assert.equal(result.saved.length,1);
 assert.equal(result.saved[0].id,'transition:1.1:2026-10-13:600:off');
 assert.match(result.saved[0].title,/30 хв/);
 assert.equal(result.refreshes.length,1);
 assert.ok(result.stored['reminder-test'].includes(result.saved[0].id));
});
test('registered Push subscriber still receives in-app record without double native notification',()=>{
 const result=run({permission:'granted'});
 assert.equal(result.saved.length,1);
 assert.equal(result.native.length,0);
});
test('non-subscriber with permission can receive a local notification as fallback',()=>{
 const result=run({permission:'granted',push:false});
 assert.equal(result.saved.length,1);
 assert.equal(result.native.length,1);
});
test('no late reminder after outage starts or when official schedule is stale or under review',()=>{
 assert.equal(run({minute:605}).saved.length,0);
 assert.equal(run({stale:true}).saved.length,0);
 assert.equal(run({review:true}).saved.length,0);
});
test('reminder supports an official outage starting at midnight of following day',()=>{
 const result=run({minute:1410,off:1440,midnight:true});
 assert.equal(result.saved[0]?.id,'transition:1.1:2026-10-13:1440:off');
 assert.match(result.saved[0].title,/30 хв/);
});
