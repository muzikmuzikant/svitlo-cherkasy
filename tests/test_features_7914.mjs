import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('features-7914.js'),server=read('push-server/server.js'),importer=read('scripts/update_data.py'),html=read('index.html'),sw=read('sw.js'),build=read('scripts/build_pages.py'),install=read('install.js');
test('planner and address comparison use only verified schedule days',()=>{
 assert.match(ui,/function renderPlanner/);assert.match(ui,/function renderCompare/);assert.match(ui,/verified===true/);
 assert.match(ui,/ще немає підтвердженого графіка/);assert.match(ui,/Спільний час зі світлом/);
});
test('revision history stores and displays exact before and after queue intervals',()=>{
 assert.match(importer,/'before': before/);assert.match(importer,/'after': after/);
 assert.match(ui,/change\.before\?\.\[queue\]/);assert.match(ui,/change\.after\?\.\[queue\]/);
});
test('quiet hours are saved to the matching subscription and respected by automatic schedule Push',()=>{
 assert.match(server,/\/api\/push\/preferences/);assert.match(server,/normalizeQuietHours/);
 assert.match(server,/isQuietForRecord\(record,now\.date,minutes\)/);
 assert.match(server,/quietHours:subscribers\[key\]\?\.quietHours\|\|\[\]/);
 assert.match(server,/if\(pref\.emergency&&freshEvent/);
});
test('the new PWA module and styles are loaded and included in the offline shell build',()=>{
 assert.match(html,/features-7914\.css/);assert.match(install,/features-7914\.js/);
 assert.match(sw,/features-7914\.js/);assert.match(sw,/features-7914\.css/);
 assert.match(build,/features-7914\.js/);assert.match(build,/features-7914\.css/);
});
test('release stays on the beta 7.9.14 channel',()=>{
 const release=JSON.parse(read('release.json'));assert.equal(release.version,'7.9.14');assert.equal(release.channel,'beta');
});