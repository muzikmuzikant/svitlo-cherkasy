import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app.js'),sw=read('sw.js');
function extract(start,end){
 const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing function '+start);
 return app.slice(a,b);
}

test('PWA keeps full shell and essential schedule/address seeds for offline launch',()=>{
 for(const path of ['index.html','app.js','style.css','hour-paint.js','address-lookup.js','notification-center.js'])
  assert.ok(sw.includes("'./"+path+"'"),'Shell missing '+path);
 for(const path of ['data/schedules.json','data/addresses.json','data/published_street_fallback.json'])
  assert.ok(sw.includes("'./"+path+"'"),'Offline data missing '+path);
 assert.match(sw,/CACHE_SNAPSHOTS/);
 assert.match(sw,/Promise\.allSettled\(ESSENTIAL_DATA\.map/);
 assert.match(sw,/X-Svitlo-Cache/);
});

test('offline load uses verified device snapshot without network or the operator website',async()=>{
 const saved={days:[{date:'2026-10-18',verified:true,queues:{}}],lastChecked:'2026-10-18T09:00:00+03:00'};
 let calls=0;
 const context={
  navigator:{onLine:false},readCachedSchedule:async()=>saved,
  fetch:async()=>{calls++;throw Error('unexpected request')},
  console,URL,Date,AbortController,normalizeData:x=>x,pushConfig:null
 };
 const load=vm.runInNewContext(extract('async function loadLatestSchedules(){','async function refreshData(manual=false){')+';loadLatestSchedules',context);
 const result=await load();
 assert.equal(result.source,'device');
 assert.equal(result.value,saved);
 assert.equal(calls,0);
});

test('offline unknown days never become falsely green, but online absence retains original convention',()=>{
 const context={
  QUEUES:['1.1'],currentDay:()=>null,isOfflineMode:()=>true,
  Int8Array,minute:()=>0,sourceFresh:()=>false
 };
 const timeline=vm.runInNewContext(extract('function timeline(date,queue){','function stateAt(a,m){')+';timeline',context);
 assert.equal(timeline('2026-10-18','1.1'),null);
 context.isOfflineMode=()=>false;
 const online=timeline('2026-10-18','1.1');
 assert.equal(online.length,1440);
 assert.equal(online.every(v=>v===0),true);
});

test('offline reminders read yesterday-checked verified schedule while foreground PWA is open',()=>{
 const date='2026-10-18',minute=9*60,entries=[];
 const today=new Int8Array(1440);
 today.fill(1,minute+30); // A scheduled outage in 30 minutes.
 const tomorrow=new Int8Array(1440);tomorrow.fill(1);
 const context={
  Notification:{permission:'denied'},prefs:{emergency:false,off:true,on:true,tomorrow:false},
  primary:()=>({queue:'1.1'}),today:()=>date,nowMinutes:()=>minute,
  data:{lastChecked:'2026-10-16T09:00:00+03:00',reviewPending:false},
  currentDay:()=>({date,verified:true}),isOfflineMode:()=>true,
  timeline:d=>d===date?today:tomorrow,shiftDay:()=> '2026-10-19',
  clock:()=> '09:30',formatDate:()=> '18 жовтня',notified:new Set(),
  window:{SvitloInbox:{add:x=>{entries.push(x);return Promise.resolve()}},SvitloInboxUI:{refresh(){}}},
  navigator:{onLine:false},localStorage:{setItem(){}},SEEN:'seen',
  notify:()=>{throw Error('native notification without permission')},Date,
  console
 };
 const check=vm.runInNewContext(extract('function checkNotifications(){','function pushHealthMessage(message){')+';checkNotifications',context);
 check();
 assert.equal(entries.length,1);
 assert.equal(entries[0].kind,'schedule');
 assert.match(entries[0].title,/Відключення/);
 check();assert.equal(entries.length,1,'do not duplicate the same offline reminder');
 context.isOfflineMode=()=>false;
 context.notified=new Set();
 entries.length=0;
 check();
 assert.equal(entries.length,0,'stale online schedule does not emit new reminders');
});

test('offline warning never sends user to a website that is inaccessible',()=>{
 const code=extract('function renderFreshness(){','function renderHome(){');
 assert.doesNotMatch(code,/OFFICIAL|cherkasyoblenergo\.com|Перевірити в оператора|createElement\('a'/);
 assert.match(code,/offline\|\|/);
 assert.match(app,/Немає збереженого графіка/);
 assert.match(app,/offlineLocal&&navigator\.onLine===false&&!document\.hidden/);
 assert.match(app,/localStorage\.getItem\(PUSH_CONSENT\)!=='no'/);
});
