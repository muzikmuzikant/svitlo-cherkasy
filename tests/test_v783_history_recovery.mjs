import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createAppConfig} from '../push-server/app-config.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('revision recovery restores published content, keeps old state in history and never resends Push',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-history-'));
 const audit=[];
 try{
  const store=createAppConfig({directory:dir,record:(...args)=>audit.push(args)});
  const first=store.get();
  store.update({...first,announcements:[{id:'message_alpha',active:true,title:'Перша версія',
   body:'Повідомлення з попередньої редакції.',delivery:'both',kind:'info',queue:'all',pushSentAt:null}]});
  const firstSaved=store.get();
  store.update({...firstSaved,maintenance:{...firstSaved.maintenance,enabled:true},
   announcements:[{...firstSaved.announcements[0],title:'Друга версія',pushSentAt:new Date().toISOString()}]});
  const active=store.get();
  const revision=store.historyView().find(x=>x.messages===1&&x.maintenance===false);
  assert.ok(revision);
  assert.ok(revision.changes.edited>=1);
  assert.equal(revision.changes.maintenance,true);
  assert.throws(()=>store.restoreHistory(revision.id,firstSaved.updatedAt),/Налаштування змінилися/);
  assert.throws(()=>store.restoreHistory('1234567890123-badbad',active.updatedAt),/Редакцію не знайдено/);
  const restored=store.restoreHistory(revision.id,active.updatedAt);
  assert.equal(restored.announcements[0].title,'Перша версія');
  assert.equal(restored.maintenance.enabled,false);
  assert.ok(restored.announcements[0].pushSentAt,'Restored push notice marked delivered');
  assert.deepEqual(store.duePush(),[],'Old notice never rebroadcast');
  assert.ok(audit.some(x=>x[0]==='app.restore'));
  assert.ok(store.historyView().some(x=>x.maintenance===true),'Current version saved before restore');
  const restarted=createAppConfig({directory:dir});
  assert.equal(restarted.get().announcements[0].title,'Перша версія','Restored state persisted to disk');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('restore rejects missing IDs, concurrent changes and invalid format',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-history-'));
 try{
  const st=createAppConfig({directory:dir});
  st.update({...st.get(),site:{...st.get().site,flags:{...st.get().site.flags,sharing:false}}});
  st.update({...st.get(),site:{...st.get().site,flags:{...st.get().site.flags,sharing:true}}});
  const id=st.historyView()[0].id;
  assert.throws(()=>st.restoreHistory(id,null),/Налаштування змінилися/);
  assert.throws(()=>st.restoreHistory('../../secrets',st.get().updatedAt),/Некоректний ID/);
  assert.equal(st.restoreHistory(id,st.get().updatedAt).site.flags.sharing,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('admin UI has separate Audit and Revisions panels with wired role-based recovery',()=>{
 const html=read('admin.html'),controller=read('admin-control.js'),server=read('push-server/admin.js');
 assert.equal((html.match(/data-admin-panel="audit"/g)||[]).length,1);
 assert.equal((html.match(/data-admin-panel="revisions"/g)||[]).length,1);
 assert.match(html,/data-admin-tab="revisions"/);
 assert.match(html,/id="opsRestoreStatus"/);
 assert.match(controller,/if\(!confirm\('Відновити редакцію/);
 assert.match(controller,/adminRole!=='owner'/);
 assert.match(controller,/api\('app-config\/history\/restore'/);
 assert.match(controller,/expectedUpdatedAt:historyBaseline/);
 assert.match(controller,/document\.querySelector\('\[data-admin-tab="revisions"\]'\)/);
 assert.match(server,/role!=='owner'/);
 assert.match(server,/body\.confirmRestore!==true/);
 assert.match(server,/siteControls\.restoreHistory\(body\.id,body\.expectedUpdatedAt\)/);
});
test('sources display actual GitHub workflow statuses, not synthetic counters',()=>{
 const html=read('admin.html'),js=read('admin-command.js');
 assert.match(html,/id="controlActionsList"/);
 assert.match(html,/id="controlActionsRefresh"/);
 assert.match(js,/api\.github\.com\/repos\/muzikmuzikant\/svitlo-cherkasy\/actions\/runs/);
 assert.match(js,/run\.conclusion==='failure'/);
 assert.match(js,/when\(run\.created_at\)/);
 assert.match(js,/tab==='sources'\)refreshActions\(\)/);
});
test('release and PWA cache refreshed for history recovery',()=>{
 const meta=JSON.parse(read('release.json'));
 assert.equal(meta.version,'7.8.3');
 assert.match(read('sw.js'),/svitlo-cherkasy-shell-v7\.8\.3/);
 assert.match(read('index.html'),/name="svitlo-version" content="7\.8\.3"/);
 for(const file of ['admin-control.js','admin-command.js','site-mode.js','sw.js']){
  assert.doesNotThrow(()=>new Function(read(file)),file);
 }
});
