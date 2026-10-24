import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Production release 7.9.13 preserves domain, PWA identity and production Push',()=>{
 const r=JSON.parse(read('release.json'));
 const push=JSON.parse(read('push-config.json'));
 const manifest=JSON.parse(read('manifest.webmanifest'));
 const html=read('index.html'),sw=read('sw.js');
 assert.equal(r.version,'7.9.13');
 assert.equal(r.channel,'production');
 assert.match(push.apiBase,/svitlo-cherkasy-production\.up\.railway\.app/);
 assert.equal(manifest.id,'./');
 assert.match(html,/data-deployment-channel="production"/);
 assert.match(html,/name="robots" content="index,follow"/);
 assert.doesNotMatch(html,/stagingBadge|svitlo-cherkasy\.pages\.dev/);
 assert.match(sw,/svitlo-cherkasy-shell-v7\.9\.13-production/);
 assert.equal(read('CNAME').trim(),'svitlo-cherkasy.pp.ua');
});
test('Rolled-back Home and Settings coexist with the 12-queue graph',()=>{
 const html=read('index.html'),app=read('app.js'),all=read('all-queues.js');
 for(const id of ['heroStatus','primaryPicker','placeList','settings','addFromSettings','allQueuesDialog','allQueuesDetailOpen','allQueuesMatrix'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<h1>Опції<\/h1>/);
 assert.doesNotMatch(html,/settingsNavHub|settingsPlacesPanel|homeDashboardIntro/);
 assert.match(app,/list\.dataset\.renderKey!==placeKey/);
 assert.match(all,/function toggleQueue\(queue\)/);
});
test('New micro motion and graph assets are packaged for offline PWA',()=>{
 const html=read('index.html'),sw=read('sw.js'),build=read('scripts/build_pages.py');
 for(const file of ['micro-motion.js','micro-motion.css','all-queues-core.js','all-queues.js','all-queues.css','redesign-7913.css','message-format.js']){
  assert.ok(html.includes(file),file+' in index');
  assert.ok(sw.includes(file),file+' in service worker');
  assert.ok(build.includes("'"+file+"'"),file+' in built output');
 }
});
