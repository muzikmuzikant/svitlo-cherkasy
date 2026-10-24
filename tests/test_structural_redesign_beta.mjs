import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Beta restores pre-redesign Home and Settings and keeps all-queues assets offline',()=>{
 const html=read('index.html'),sw=read('sw.js'),build=read('scripts/build_pages.py');
 assert.ok(html.includes('data-deployment-channel="beta"'));
 assert.doesNotMatch(html,/src="\.\/ux-rebuild\.js"|href="\.\/ux-rebuild\.css"/);
 for(const asset of ['all-queues-core.js','all-queues.js','all-queues.css']){
  assert.ok(html.includes('./'+asset),asset);
  assert.ok(sw.includes('./'+asset),asset);
  assert.ok(build.includes("'"+asset+"'"),asset);
 }
});

test('Settings keeps direct visible sections rather than relocating controls into subpages',()=>{
 const html=read('index.html');
 for(const id of ['settings','pushMaster','notifyOff','notifyOn','notifyChanges',
  'notifyEmergency','notifyTomorrow','appearanceSummary','betaAnalyticsConsent',
  'manualRefresh','checkAppUpdate','shareApp','addFromSettings'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<h1>Опції<\/h1>/);
 assert.match(html,/class="surface settings-card appearance-card"/);
 assert.doesNotMatch(html,/id="settingsNavHub"|id="settingsPlacesPanel"/);
});

test('Home has original visual sequence with no injected timeline or folded cards',()=>{
 const html=read('index.html'),app=read('app.js');
 for(const id of ['overviewBar','heroStatus','heroCountdown','primaryPicker','homeQuickPlaces',
  'tomorrowCard','placeList','betaAd','hoursOn','hoursOff'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<div class="stats-row">/);
 assert.match(html,/<div class="section-head"><h2>Мої місця<\/h2>/);
 assert.doesNotMatch(html,/home-dashboard-intro|home-rebuilt|home-timeline-head/);
 assert.match(app,/renderHome\(\)/);
});

test('All-queues modes keep exact original source and never issue extra network calls',()=>{
 const js=read('all-queues.js');
 for(const term of ["mode='all'","'groups'","'compare'",'compareSummary','all-queues-group-card',
  'all-queues-detail-panel','function toggleQueue(queue)','function render()',
  'src().timeline(selected,queue)','canvas.toBlob'])
  assert.ok(js.includes(term),term);
 assert.doesNotMatch(js,/fetch\(/);
});