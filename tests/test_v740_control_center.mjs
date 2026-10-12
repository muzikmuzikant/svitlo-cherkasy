import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createAppConfig,validateAppConfig} from '../push-server/app-config.js';
import {createMediaStore,validateUpload} from '../push-server/media-store.js';
import {cleanMessage} from '../push-server/manual-push.js';

const example=()=>({schemaVersion:1,maintenance:{enabled:false,title:'Технічні роботи застосунку',message:'Ми оновлюємо деякі розділи застосунку.',mode:'limited',theme:'violet',icon:'🛠️'},announcements:[]});
test('validated rich announcements retain photos and scheduled Push audience',()=>{
 const a={id:'notice_abcdef',title:'Новий графік відключень',body:'Перевірте графік для своєї підчерги.',
  content:'## Деталі\nНовий розклад\n- Перевірте свою чергу',images:['https://example.com/image.png'],
  kind:'schedule',queue:'2.1',delivery:'both',active:true,priority:'important',pinned:true};
 const config=validateAppConfig({...example(),announcements:[a]});
 assert.equal(config.maintenance.mode,'limited');
 assert.equal(config.maintenance.theme,'violet');
 assert.equal(config.announcements[0].images.length,1);
 assert.equal(config.announcements[0].queue,'2.1');
 assert.match(config.announcements[0].content,/Деталі/);
 assert.equal(config.announcements[0].pinned,true);
});
test('drafts and future publications stay invisible until published',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-v740-'));
 try{
  const store=createAppConfig({directory:dir});
  const announcements=[
   {id:'future_abcdef',title:'Заплановане повідомлення',body:'Завтра буде важлива інформація.',active:true,scheduledAt:'2099-12-01T12:00:00Z',delivery:'both'},
   {id:'draft_abcdef',title:'Чернетка повідомлення',body:'Ми ще редагуємо цей текст.',active:false},
   {id:'visible_abcde',title:'Важливе повідомлення',body:'Уже доступне користувачам.',active:true,delivery:'both'}
  ];
  store.update({...example(),announcements});
  assert.deepEqual(store.publicState().announcements.map(x=>x.id),['visible_abcde']);
  assert.deepEqual(store.duePush().map(x=>x.id),['visible_abcde']);
  assert.equal(store.markPushed('visible_abcde'),true);
  assert.equal(store.duePush().length,0);
  const restarted=createAppConfig({directory:dir});
  assert.equal(restarted.get().announcements.find(x=>x.id==='visible_abcde').pushSentAt!==null,true);
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
});
test('upload only small real PNG/JPEG/WebP payloads',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-media-'));
 try{
  const valid=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(70)]);
  const input={mime:'image/png',data:valid.toString('base64')};
  assert.equal(validateUpload(input).bytes.length,78);
  const store=createMediaStore(dir),result=store.save(input),restored=store.read(result.id);
  assert.equal(restored.mime,'image/png');assert.ok(restored.data.equals(valid));
  assert.match(result.id,/^[a-f0-9]{30}\.png$/);
  assert.throws(()=>validateUpload({mime:'image/svg+xml',data:valid.toString('base64')}));
  assert.throws(()=>validateUpload({mime:'image/png',data:Buffer.from('fake PNG text').toString('base64')}));
  assert.equal(store.read('../../etc/passwd'),null);
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
});
test('manual push carries stable link for a published admin notice',()=>{
 const msg=cleanMessage({title:'Важливе повідомлення',body:'Тепер є докладний текст.',notificationId:'notice:abcdef11'});
 assert.equal(msg.notificationId,'notice:abcdef11');
 assert.deepEqual(cleanMessage({title:'Hi',body:'Bye'}),{title:'Hi',body:'Bye',queue:'all'});
});
test('admin UI, media endpoints, offline and Push deep links wired',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('push-server/admin.js'),/api\/admin\/media/);
 assert.match(read('push-server/server.js'),/api\/media\//);
 assert.match(read('push-server/server.js'),/duePush\(\)/);
 assert.match(read('sw.js'),/notificationId/);
 assert.match(read('sw.js'),/SVITLO_OPEN_INBOX/);
 assert.match(read('inbox-ui.js'),/showModal\(\)/);
 assert.match(read('admin.html'),/id="opsNoticeContent"/);
 assert.match(read('admin.html'),/id="opsMaintenanceFile"/);
 assert.match(read('app.js'),/OFFLINE_SCHEDULE/);
});
