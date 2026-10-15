import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAppConfig} from '../push-server/app-config.js';
import {cleanMessage,selectRecipients} from '../push-server/manual-push.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('city-only targeting persists to Railway Inbox config without exposing street or house',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-area-'));
 try{
  const store=createAppConfig({directory:dir});
  const next={...store.get(),announcements:[{id:'localNotice123',title:'Важливо для Черкас',body:'Виконується уточнення графіка.',
    settlement:'Черкаси',queue:'all',active:true,delivery:'both'}]};
  store.update(next);
  const [visible]=store.publicState().announcements;
  assert.equal(visible.settlement,'Черкаси');
  assert.equal(visible.queue,'all');
  assert.equal(store.duePush()[0].settlement,'Черкаси');
  assert.equal(store.get().announcements[0].settlement,'Черкаси');
  assert.equal(JSON.stringify(visible).includes('street'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('settlement and queue are conjunctive filters; historic subscriptions still get global messages',()=>{
 const subs={
  a:{subscription:{endpoint:'https://push.example/a'},queue:'1.1',settlement:'Черкаси'},
  b:{subscription:{endpoint:'https://push.example/b'},queue:'1.1',settlement:'с. Білозір’я'},
  c:{subscription:{endpoint:'https://push.example/c'},queue:'2.1',settlement:'черкаси'},
  d:{subscription:{endpoint:'https://push.example/d'},queue:'1.1'}
 };
 assert.equal(selectRecipients(subs,{queue:'1.1',settlement:'ЧЕРКАСИ'}).length,1);
 assert.equal(selectRecipients(subs,{queue:'all',settlement:'Черкаси'}).length,2);
 assert.equal(selectRecipients(subs,{queue:'1.1',settlement:'Білозірʼя'}).length,1);
 assert.equal(selectRecipients(subs,{queue:'1.1'}).length,3);
 assert.equal(selectRecipients(subs,{queue:'all'}).length,4);
});
test('announcement input validates optional town; no extra fields are added to ordinary Push requests',()=>{
 const x=cleanMessage({title:'Тест',body:'Текст для мешканців',queue:'1.2',
  notificationId:'notice:town12345',settlement:'Черкаси',inbox:false});
 assert.equal(x.settlement,'Черкаси');
 assert.equal(x.inbox,false);
 const y=cleanMessage({title:'Звичайне',body:'Текст',queue:'all'});
 assert.equal(y.settlement,undefined);
 assert.equal(y.inbox,undefined);
});
test('Admin editor, subscription flow and Inbox all enforce locality targeting',()=>{
 const app=read('app.js'),inbox=read('inbox-ui.js'),admin=read('admin-control.js'),
  html=read('admin.html'),server=read('push-server/server.js'),privacy=read('privacy.html');
 assert.match(html,/id="opsNoticeSettlement"/);
 assert.match(admin,/settlement:read\('opsNoticeSettlement'\)/);
 assert.match(admin,/options\('opsNoticeSettlement',n\?\.settlement\|\|''\)/);
 assert.match(app,/settlement:primary\(\)\.settlement\|\|''/);
 assert.match(server,/settlement:notice\.settlement\|\|''/);
 assert.match(server,/subscribers\[key\]=\{subscription:data\.subscription,queue:data\.queue,preferences,settlement,\s*automatic:subscribers\[key\]\?\.automatic\|\|\{\}\}/);
 assert.match(inbox,/const targeted=a=>!a\.settlement/);
 assert.match(inbox,/&&targeted\(a\)/);
 assert.match(inbox,/!targeted\(a\)/);
 assert.match(privacy,/лише назва вибраного населеного пункту/);
});
test('v7.8.1 cache refreshes, and scripts parse',()=>{
 const release=JSON.parse(read('release.json'));
 assert.match(release.version,/^7\.8\.\d+$/);
 assert.match(read('sw.js'),new RegExp('svitlo-cherkasy-shell-v'+release.version.replaceAll('.','\\.')));
 for(const f of ['inbox-ui.js','app.js','admin-control.js','site-mode.js','sw.js'])
  assert.doesNotThrow(()=>new Function(read(f)),f);
});
