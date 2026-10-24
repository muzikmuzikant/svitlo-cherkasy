import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('7.9.13 remains a Beta-only release candidate',()=>{
 const release=JSON.parse(read('release.json'));
 assert.equal(release.channel,'beta');
 assert.equal(release.version,'7.9.13');
 assert.match(read('sw.js'),/v7\.9\.13-beta/);
});
test('Production Railway schedule safeguards are present in Beta',()=>{
 const server=read('push-server/server.js'),admin=read('push-server/admin.js');
 assert.match(server,/createManualOverridesStore/);
 assert.match(server,/manualOverrides\.applySchedule\(officialSchedules\.schedule\(\)\)/);
 assert.match(server,/\/api\/data\/manual_overrides\.json/);
 assert.match(server,/workRegistry,addressCorrections,manualOverrides/);
 assert.match(admin,/manualOverrides\.update\(input\.contents,input\.sha\)/);
 assert.match(admin,/editable:ghReady\?Object\.keys\(PATHS\):\['overrides'\]/);
 const planner=read('admin-planner.js');
 assert.match(planner,/plannerImport/);assert.match(planner,/preparedKey/);
 assert.match(read('admin.html'),/id="plannerCopyDate"/);
});
test('Maintenance backup is reachable during outages and cached for offline',()=>{
 const html=read('index.html');
 for(const id of ['maintenanceViewSchedule','maintenanceBackup','maintenanceBackupHours','maintenanceBackupPlace'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const path of ['sw.js','scripts/build_pages.py'])
  assert.ok(read(path).includes('maintenance-backup.js'));
 assert.match(html,/src="\.\/maintenance-backup\.js"/);
});
test('Advertising landing page can be hidden independently from ads',()=>{
 assert.match(read('push-server/ads.js'),/pageVisible:s\.pageVisible!==false/);
 assert.match(read('admin-ads.js'),/'pageVisible','toggle'/);
 assert.match(read('beta-ads.js'),/config\.pageVisible!==false/);
 assert.match(read('advertising.html'),/data\.pageVisible===false/);
});
test('micro-motion uses transform/paint, respects reduced motion, and reaches admin and public screens',()=>{
 const css=read('micro-motion.css'),js=read('micro-motion.js'),admin=read('admin-motion.css');
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/micro-pressed/);
 assert.match(js,/pointercancel/);
 assert.match(js,/MutationObserver/);
 assert.match(admin,/adminSectionAppear/);
 assert.match(admin,/prefers-reduced-motion:reduce/);
 for(const file of ['index.html','admin.html','feedback.html','help.html']){
  const html=read(file);
  assert.match(html,/micro-motion\.css/);
  assert.match(html,/micro-motion\.js/);
 }
});
test('schedule redraws do not rebuild all cards each polling tick',()=>{
 const app=read('app.js');
 assert.match(app,/list\.dataset\.renderKey!==placeKey/);
 assert.match(app,/host\.dataset\.renderKey===key/);
 assert.match(app,/grid\.dataset\.paintKey!==paintKey/);
});
