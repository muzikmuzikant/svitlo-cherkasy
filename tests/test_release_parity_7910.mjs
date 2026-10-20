import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createAppConfig} from '../push-server/app-config.js';

const repoFile=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('scheduled maintenance creates a live Inbox notice and supports custom banner palette',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-799-'));
 try{
  const cfg=createAppConfig({directory:dir});
  const current=cfg.get();
  const before=new Date(Date.now()-60*60*1000).toISOString();
  const after=new Date(Date.now()+60*60*1000).toISOString();
  cfg.update({...current,maintenance:{...current.maintenance,enabled:true,startsAt:before,until:after,
   plannedBanner:{...current.maintenance.plannedBanner,background:'#def1fa',foreground:'#123456',
    accent:'#ff8800',showButton:false}}});
  const live=cfg.publicState();
  assert.equal(live.maintenance.plannedBanner.background,'#def1fa');
  assert.equal(live.maintenance.plannedBanner.accent,'#ff8800');
  assert.equal(live.maintenance.plannedBanner.showButton,false);
  assert.equal(live.announcements.length,1);
  assert.match(live.announcements[0].title,/тривають/i);
  assert.equal(live.announcements[0].pinned,true);
  const completed=cfg.get();
  cfg.update({...completed,maintenance:{...completed.maintenance,
   startsAt:new Date(Date.now()-3*60*60*1000).toISOString(),
   until:new Date(Date.now()-60*60*1000).toISOString()}});
  const archived=cfg.publicState().announcements[0];
  assert.match(archived.title,/завершено/i);
  assert.equal(archived.pinned,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('release notice strips internal implementation references, but keeps user changes',async()=>{
 const elements=new Map();
 const el=id=>{
  if(!elements.has(id))elements.set(id,{hidden:true,dataset:{},textContent:'',disabled:false,handlers:{},children:[],
   addEventListener(event,fn){this.handlers[event]=fn},replaceChildren(){this.children=[]},
   append(node){this.children.push(node)}});
  return elements.get(id);
 };
 const document={baseURI:'https://svitlo-cherkasy.pages.dev/',readyState:'complete',hidden:false,
  body:{dataset:{}},getElementById:el,querySelector:()=>({content:'7.9.9'}),
  createElement:()=>({textContent:''}),addEventListener:()=>{}};
 const context={document,window:{addEventListener:()=>{},setInterval:()=>{},location:{reload(){}}},
  navigator:{onLine:true,serviceWorker:{}},
  localStorage:{getItem:()=>null,setItem:()=>{}},
  sessionStorage:{getItem:()=>null,setItem:()=>{}},
  URL,Date,console,setTimeout,clearTimeout,fetch:async()=>({
   ok:true,json:async()=>({version:'7.9.10',title:'Адмінка та сервер',
    description:'Socket та backend оптимізовано',
    notes:['Оновили серверну частину','Зручніший вигляд графіків']})
  })};
 vm.runInNewContext(repoFile('version-check.js'),context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el('appUpdateBanner').hidden,false);
 assert.doesNotMatch(el('appUpdateTitle').textContent,/адмінк|сервер/i);
 assert.doesNotMatch(el('appUpdateText').textContent,/socket|backend/i);
 assert.deepEqual(el('appUpdateNotes').children.map(x=>x.textContent),['Зручніший вигляд графіків']);
});

test('admin has unsent banner preview controls and server streams config changes',()=>{
 const admin=repoFile('admin.html'),source=repoFile('admin-control.js');
 const site=repoFile('site-mode.js'),api=repoFile('push-server/server.js');
 for(const id of ['opsTestUpdate','opsTestPlanned','opsPlannedBackground','opsPlannedForeground',
  'opsPlannedAccent','opsPlannedButtonVisible'])assert.ok(admin.includes('id="'+id+'"'),id);
 assert.ok(source.includes('SVITLO_PREVIEW_UPDATE_BANNER'));
 assert.ok(site.includes('new EventSource(apiBase'));
 assert.ok(site.includes('pendingRefresh'));
 assert.ok(api.includes("publishLive('config'"));
 assert.ok(api.includes("'text/event-stream; charset=utf-8'"));
});

test('the iPhone full-screen message dismisses with actual exit animations, not an instant disappearance',()=>{
 const ui=repoFile('inbox-ui.js'),css=repoFile('style.css');
 assert.match(ui,/dialog\.classList\.add\('is-leaving'\)/);
 assert.match(ui,/detailCloseTimer=setTimeout[\s\S]{0,90}300\)/);
 assert.match(css,/\.inbox-detail\[open\]\.is-leaving\{pointer-events:none;animation:inboxReaderDismiss/);
 assert.match(css,/@keyframes inboxContentsDismiss/);
 assert.match(css,/inboxBackdropDismiss/);
 assert.match(css,/prefers-reduced-motion/);
});

test('production PWA and API retain their identity; no Beta mirroring or commercial ads',async()=>{
 if(JSON.parse(repoFile('release.json')).channel==='beta'){
  assert.equal(JSON.parse(repoFile('release.json')).version,'7.9.11');
  assert.equal(JSON.parse(repoFile('push-config.json')).apiBase,'https://svitlo-beta-api-staging.up.railway.app');
  assert.match(repoFile('index.html'),/data-deployment-channel="beta"/);
  assert.match(repoFile('app.js'),/street_catalog\.json/);
  return
 }
 const index=repoFile('index.html'),release=JSON.parse(repoFile('release.json'));
 const push=JSON.parse(repoFile('push-config.json'));
 const server=repoFile('push-server/server.js'),source=repoFile('push-server/ads.js');
 assert.equal(release.version,'7.9.10');
 assert.equal(release.channel,'production');
 assert.match(index,/data-deployment-channel="production"/);
 assert.doesNotMatch(index,/id="stagingBadge"/);
 assert.equal(push.apiBase,'https://svitlo-cherkasy-production.up.railway.app');
 assert.doesNotMatch(server,/betaScheduleMirror|SCHEDULE_MIRROR_API_BASE/);
 assert.match(source,/if\(!commercialAllowed\)return/);
 assert.match(index,/id="appUpdateNotes"/);
 assert.match(repoFile('app.js'),/svitlo:live-schedules/);
});
