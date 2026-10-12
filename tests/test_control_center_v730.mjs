import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createAppConfig,validateAppConfig} from '../push-server/app-config.js';
const root=path.resolve('..', ''); // Files are always read relative to test file.
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const example=()=>({maintenance:{enabled:false,title:'Технічні роботи застосунку',message:'Ми виконуємо оновлення застосунку і скоро повернемося.',until:null},announcements:[]});
test('maintenance defaults to OFF and persists outside public GitHub Pages',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-ops-'));
 try{
  const first=createAppConfig({directory:dir});
  assert.equal(first.publicState().maintenance.enabled,false);
  first.update({...example(),announcements:[{id:'notice_123456',title:'Нові можливості',body:'Тепер доступний центр повідомлень у застосунку.',kind:'update',active:true,publishedAt:'2026-10-12T12:00:00+03:00'}]});
  const second=createAppConfig({directory:dir});
  assert.equal(second.publicState().announcements.length,1);
  assert.equal(second.publicState().maintenance.enabled,false);
  assert.equal(fs.existsSync(path.join(dir,'app-config.json')),true);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('reject invalid content, overlong fields and invalid dates',()=>{
 assert.throws(()=>validateAppConfig({...example(),maintenance:{enabled:true,title:'',message:'x'}}));
 assert.throws(()=>validateAppConfig({...example(),announcements:[{id:'x',title:'bad',body:'bad',kind:'info'}]}));
 assert.throws(()=>validateAppConfig({...example(),maintenance:{...example().maintenance,until:'nonsense'}}));
});
test('only active and unexpired announcements are public',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-notice-'));
 try{
  const store=createAppConfig({directory:dir});
  store.update({...example(),announcements:[
   {id:'published123',title:'Важливе повідомлення',body:'Інформація для користувачів застосунку',kind:'important',active:true,publishedAt:new Date().toISOString()},
   {id:'hidden_123',title:'Неактивне повідомлення',body:'Видно тільки адміністратору застосунку',kind:'info',active:false},
   {id:'expired123',title:'Застаріле повідомлення',body:'Не слід показувати після завершення строку',kind:'info',active:true,expiresAt:'2020-01-01T00:00:00Z'}]});
  assert.deepEqual(store.publicState().announcements.map(x=>x.id),['published123']);
  assert.equal(store.get().announcements.length,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('installed PWA loads inbox before application and stores background Push',()=>{
 const install=read('install.js'),sw=read('sw.js'),html=read('index.html');
 assert.match(install,/notification-center\.js/);
 assert.match(install,/inbox-ui\.js/);
 assert.match(sw,/importScripts\('\.\/notification-center\.js'\)/);
 assert.match(sw,/SvitloInbox\.add/);
 assert.match(html,/id="inboxList"/);
 assert.match(html,/id="maintenanceScreen"/);
 assert.match(html,/id="inboxMarkAll"/);
});
test('new admin has authenticated app-controls and a safety confirmation',()=>{
 const router=read('push-server/admin.js'),ui=read('admin-control.js'),server=read('push-server/server.js'),builder=read('scripts/build_pages.py');
 assert.match(router,/api\/admin\/app-config/);
 assert.match(server,/\/api\/app-config/);
 assert.match(ui,/confirm\('Увімкнути технічні роботи/);
 assert.match(builder,/admin-control\.js/);
 assert.match(builder,/notification-center\.js/);
});
