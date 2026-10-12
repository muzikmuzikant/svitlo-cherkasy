import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createMediaStore} from '../push-server/media-store.js';
import {cleanMessage} from '../push-server/manual-push.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('Railway media gallery actually lists uploaded files, with safe opaque IDs',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-media-'));
 try{
  const store=createMediaStore(dir);
  assert.equal(store.list().length,0);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sLfRFsAAAAASUVORK5CYII=';
  const result=store.save({mime:'image/png',data:png});
  assert.match(result.id,/^[a-f0-9]{30}\.png$/);
  const rows=store.list();
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,result.id);
  assert.equal(rows[0].mime,'image/png');
  assert.ok(rows[0].size>20);
  assert.ok(Number.isFinite(Date.parse(rows[0].uploadedAt)));
  assert.ok(store.read(result.id).data.byteLength>20);
  assert.equal(store.read('../../etc/passwd'),null);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Push-only manual payload explicitly suppresses Inbox storage',()=>{
 const a=cleanMessage({title:'Повідомлення',body:'Службова інформація',queue:'all',
  notificationId:'notice:test_123456',inbox:false});
 assert.equal(a.inbox,false);
 assert.equal(a.notificationId,'notice:test_123456');
 assert.equal(cleanMessage({title:'Звичайне',body:'Текст',notificationId:'notice:test_654321'}).inbox,true);
});
test('backup restoration requires file inspection, explicit confirmation and suppresses old Push',()=>{
 const html=read('admin.html'),ui=read('admin-command.js');
 for(const id of ['controlBackupExport','controlBackupFile','controlBackupRestore','controlBackupPreview'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/format:'svitlo-cherkasy-admin-backup'/);
 assert.match(ui,/JSON\.parse\(await file\.text\(\)\)/);
 assert.match(ui,/if\(!confirm\('Замінити поточні повідомлення/);
 assert.match(ui,/maintenance:\{\.\.\.live\.maintenance,\.\.\.recovery\.config\.maintenance,enabled:false\}/);
 assert.match(ui,/pushSentAt:\(n\.active&&\['both','push'\]\.includes\(n\.delivery\)\)\?stamp/);
 assert.match(ui,/api\('help',\{method:'PUT'/);
 assert.doesNotMatch(ui,/api\('push\/send'/);
});
test('media gallery, filtering and safely retiring expired CMS notices have wired actions',()=>{
 const admin=read('admin-control.js'),control=read('admin-command.js');
 for(const id of ['opsNoticeStatusFilter','opsNoticeSort','opsNoticesExport','opsExpireNotices','controlMediaUpload']){
  assert.match(read('admin.html'),new RegExp('id="'+id+'"'));
 }
 assert.match(admin,/opsExpireNotices'\)\.onclick=async/);
 assert.match(admin,/await saveConfig\(\{scope:'content'\}\)/);
 assert.match(control,/const \[config,library\]=await Promise\.all\(\[api\('app-config'\),api\('media'\)\]\)/);
 assert.match(control,/await api\('media',\{method:'POST'/);
 assert.match(read('push-server/admin.js'),/mediaStore\.list\(\)/);
 assert.match(read('push-server/server.js'),/inbox:notice\.delivery!=='push'/);
});
