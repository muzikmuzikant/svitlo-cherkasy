import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createOperationsStore,validateOperations} from '../push-server/operations-controls.js';
import {validateAppConfig} from '../push-server/app-config.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('new operations defaults preserve existing 30/15 minute reminders',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-ops-'));
 try{
  const store=createOperationsStore({directory:dir});
  const initial=store.get();
  assert.equal(initial.reminders.off.leadMinutes,30);
  assert.equal(initial.reminders.on.leadMinutes,15);
  assert.equal(initial.monitoring.warnAfterMinutes,120);
  assert.equal(initial.reminders.off.enabled,true);
  assert.equal(store.list().length,0);
  const next={...initial,monitoring:{warnAfterMinutes:180},reminders:{
   ...initial.reminders,off:{...initial.reminders.off,leadMinutes:20,title:'🔴 За {minutes} хв',body:'Підчерга {queue}. За плановим графіком о {time}.'}
  }};
  const saved=store.update(next,initial.revision);
  assert.equal(saved.monitoring.warnAfterMinutes,180);
  assert.equal(saved.reminders.off.leadMinutes,20);
  assert.throws(()=>store.update(next,initial.revision),e=>e.statusCode===409);
  assert.equal(store.list().length,1);
  const restored=store.restore(initial.revision,saved.revision);
  assert.equal(restored.reminders.off.leadMinutes,30);
  const reopened=createOperationsStore({directory:dir});
  assert.equal(reopened.get().reminders.off.leadMinutes,30);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('templates cannot contain unsafe markup or unknown tokens',()=>{
 const state=createOperationsStore({directory:fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-temp-'))}).get();
 const invalid={
  noHours:{...state,reminders:{...state.reminders,off:{...state.reminders.off,leadMinutes:0}}},
  badMarkup:{...state,reminders:{...state.reminders,off:{...state.reminders.off,title:'<script>{minutes}</script>'}}},
  missingQueue:{...state,reminders:{...state.reminders,on:{...state.reminders.on,body:'За графіком о {time}'}}},
  extraToken:{...state,reminders:{...state.reminders,on:{...state.reminders.on,body:'Підчерга {queue}. Плановим графіком о {time}, {address}'}}},
  mislead:{...state,reminders:{...state.reminders,on:{...state.reminders.on,body:'Підчерга {queue} о {time}'}}},
  overBound:{...state,monitoring:{warnAfterMinutes:600}}
 };
 for(const [name,candidate] of Object.entries(invalid))
  assert.throws(()=>validateOperations(candidate),undefined,name);
});
test('home intro is validated, preserves other site flags, and forbids HTML',()=>{
 const original=validateAppConfig({schemaVersion:1,announcements:[]});
 assert.equal(original.site.home.headline,'Все під контролем.');
 const updated=validateAppConfig({...original,site:{...original.site,home:{
  eyebrow:'ГРАФІКИ',headline:'Оновлений заголовок',subtitle:'Пояснення для користувачів.',layout:'compact'
 }}});
 assert.equal(updated.site.home.layout,'compact');
 assert.equal(updated.site.home.headline,'Оновлений заголовок');
 assert.equal(updated.site.flags.inbox,true);
 assert.throws(()=>validateAppConfig({...original,site:{...original.site,home:{...original.site.home,headline:'<iframe>'}}}));
});
test('all four admin interfaces are actually published and wired',()=>{
 const build=read('scripts/build_pages.py'),html=read('admin.html'),server=read('push-server/server.js'),router=read('push-server/admin.js');
 for(const file of ['admin-operations.js','admin-address-manager.js','admin-home-builder.js']){
  assert.ok(build.includes("'"+file+"'"),file+' not in Pages');
  assert.ok(html.includes('src="./'+file+'"'),file+' missing in admin');
 }
 for(const id of ['addressMgrPublish','opsSourceSave','opsPushSave','homeBuilderSave'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(router,/\/api\/admin\/operations/);
 assert.match(router,/\/api\/admin\/home/);
 assert.match(server,/operationalControls\.get\(\)\.reminders/);
 assert.match(server,/preset\?\.leadMinutes/);
 assert.match(read('site-mode.js'),/hero\.dataset\.homeLayout/);
});
