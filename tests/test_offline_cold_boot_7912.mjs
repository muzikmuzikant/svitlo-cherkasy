import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ORIGIN='https://svitlo-cherkasy.pp.ua/';
const saved={lastChecked:'2026-10-18T20:00:00+03:00',days:[{date:'2026-10-19',verified:true,queues:{'1.1':{off:[['12:00','14:00']]}}}]};
const pathOf=input=>new URL(typeof input==='string'?input:input.url,ORIGIN).href;
function harness(){
 const listeners={},cachesMap=new Map(),network=[],state={online:true,unavailable:new Set()};
 const cacheStorage={
  async open(name){
   if(!cachesMap.has(name)){
    const entries=new Map();
    cachesMap.set(name,{
     async match(req){return entries.get(pathOf(req))?.clone()},
     async put(req,res){entries.set(pathOf(req),res.clone())},
     async addAll(requests){
      const prepared=await Promise.all(requests.map(async req=>{
       const response=await fetcher(req);
       if(!response.ok)throw Error('Asset not found: '+pathOf(req));
       return [pathOf(req),response.clone()];
      }));
      prepared.forEach(([key,value])=>entries.set(key,value));
     },
     _entries:entries
    });
   }
   return cachesMap.get(name);
  },
  async keys(){return [...cachesMap.keys()]},
  async delete(name){return cachesMap.delete(name)}
 };
 class BrowserRequest {
  constructor(url,opts={}){
   this.url=pathOf(url);
   this.method='GET';
   this.mode=opts.mode||'cors';
   this.destination=opts.destination||'';
   this.signal=opts.signal;
  }
 }
 async function fetcher(req){
  network.push(pathOf(req));
  if(!state.online)throw Error('network offline');
  const path=new URL(pathOf(req)).pathname;
  if(state.unavailable.has(path))return new Response('Missing optional file',{status:404});
  if(path.endsWith('/data/schedules.json'))return new Response(JSON.stringify(saved),{headers:{'Content-Type':'application/json'}});
  return new Response(path.endsWith('/index.html')||path==='/'?'<html>Cached application shell</html>':'// static asset '+path);
 }
 const self={
  location:{origin:ORIGIN.slice(0,-1)},
  registration:{scope:ORIGIN},
  addEventListener(type,callback){listeners[type]=callback},
  skipWaiting:async()=>{},
  clients:{claim:async()=>{}}
 };
 vm.runInNewContext(sw,{self,importScripts(){},caches:cacheStorage,
  fetch:fetcher,Request:BrowserRequest,Response,Headers,URL,AbortController,
  setTimeout,clearTimeout,console});
 return {
  caches:cacheStorage,network,state,
  async install(){
   let task;
   listeners.install({waitUntil(p){task=p}});
   await task;
   listeners.activate({waitUntil(p){task=p}});
   await task;
  },
  async request(path,{mode='cors',destination=''}={}){
   const req=new BrowserRequest(path,{mode,destination});
   let task;
   listeners.fetch({request:req,respondWith(p){task=p}});
   assert.ok(task,'SW must handle same-origin PWA request');
   return task;
  }
 };
}

test('freshly installed iOS PWA retains an entire bootable offline shell',async()=>{
 const h=harness();
 await h.install();
 assert.ok(h.network.length<40,'installation must not request 70+ optional assets');
 h.state.online=false;
 const count=h.network.length;
 const home=await h.request(ORIGIN+'?message=notice:example123',{mode:'navigate'});
 assert.equal(home.status,200);
 assert.match(await home.text(),/Cached application shell/);
 for(const asset of ['app.js','install.js','address-lookup.js','data-merge.js',
  'notification-center.js','inbox-ui.js','site-mode.js','version-check.js',
  'notification-text.js','style.css','motion.css','legal-consent.js']){
   const response=await h.request(ORIGIN+asset);
   assert.equal(response.status,200,'offline bootstrap asset: '+asset);
 }
 assert.equal(h.network.length,count,'offline shell must be cache-first: no network attempts');
 const graph=await h.request(ORIGIN+'data/schedules.json?refresh=123');
 assert.equal(graph.status,200);
 assert.equal(graph.headers.get('X-Svitlo-Cache'),'offline');
 assert.equal((await graph.json()).days[0].date,'2026-10-19');
});


test('a missing optional script or icon never prevents installing an offline PWA',async()=>{
 const h=harness();
 h.state.unavailable.add('/assets/icon-192-v692.png');
 h.state.unavailable.add('/notification-text.js');
 await h.install();
 h.state.online=false;
 const home=await h.request(ORIGIN+'?source=offline',{mode:'navigate'});
 assert.equal(home.status,200,'cached HTML must still open without Internet');
 const app=await h.request(ORIGIN+'app.js');
 assert.equal(app.status,200,'all critical application files remain cached');
});

test('offline app reads installer-seeded schedule before its first online app launch',async()=>{
 const h=harness();await h.install();h.state.online=false;
 const start=app.indexOf('async function readCachedSchedule(){');
 const end=app.indexOf('function saveCachedSchedule(value){',start);
 assert.ok(start>=0&&end>start);
 const fn=vm.runInNewContext(app.slice(start,end)+';readCachedSchedule',{
  OFFLINE_SCHEDULE:'unused-localStorage-key',
  OFFLINE_CACHE:'svitlo-cherkasy-offline-snapshots-v1',
  OFFLINE_CACHE_KEY:'./offline-schedules-snapshot.json',
  safeJSON:()=>null,
  retainWeeklySchedules:x=>x,
  window:{caches:h.caches},caches:h.caches,console,Date
 });
 const loaded=await fn();
 assert.equal(loaded.lastChecked,saved.lastChecked);
 assert.equal(loaded.days[0].queues['1.1'].off[0][0],'12:00');
});

test('cold startup has a bounded splash even if live schedule refresh stalls',()=>{
 assert.match(app,/Promise\.race\(\[refresh\.then\(\(\)=> 'loaded'\),deadline\]\)/);
 assert.match(app,/navigator\.onLine===false\?350:1800/);
 assert.match(app,/splash\.classList\.add\('is-complete'\)/);
 assert.match(sw,/OFFLINE_CORE\.map\(url=>new Request\(url,\{cache:'reload'\}\)\)/);
 assert.match(sw,/Promise\.allSettled\(OFFLINE_BOOT\.filter/);
 assert.doesNotMatch(sw,/Promise\.allSettled\(SHELL\.filter/);
});
