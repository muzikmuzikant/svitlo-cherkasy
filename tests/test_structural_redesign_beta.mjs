import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('three structurally redesigned views are served and work offline',()=>{
 const html=read('index.html'),sw=read('sw.js'),build=read('scripts/build_pages.py');
 for(const asset of ['ux-rebuild.css','ux-rebuild.js']){
  assert.ok(html.includes('./'+asset));
  assert.ok(sw.includes('./'+asset));
  assert.ok(build.includes("'"+asset+"'"));
 }
 assert.ok(html.includes('data-deployment-channel="beta"'));
});
test('settings keeps all live controllers while using an actual subpage router',()=>{
 const html=read('index.html'),ux=read('ux-rebuild.js');
 for(const id of ['settingsPlacesPanel','settingsManagePlaces','pushMaster','notifyOff',
  'notifyOn','notifyChanges','notifyEmergency','notifyTomorrow','appearanceSummary',
  'betaAnalyticsConsent','manualRefresh','checkAppUpdate','shareApp']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 for(const term of ['ios-settings-hub','ios-settings-subview','svitloSettingsPage',
  "history.back()","touchstart","settingsPushBlock","settingsPlacesPanel"]){
  assert.ok(ux.includes(term),term);
 }
});
test('home reuses official minute timeline and preserves all older event IDs',()=>{
 const html=read('index.html'),ux=read('ux-rebuild.js');
 for(const id of ['overviewBar','heroStatus','heroCountdown','primaryPicker','homeQuickPlaces',
 'allQueuesHomeOpen','tomorrowCard','placeList','betaAd'])assert.ok(html.includes('id="'+id+'"'),id);
 for(const term of ['home-whats-next','home-week-days','SvitloAllQueuesSource',
  'SvitloAllQueuesMath','svitlo:open-schedule','home-ad-zone'])assert.ok(ux.includes(term),term);
});
test('queue modes have explicit grouped and comparison structures, never load inferred data',()=>{
 const js=read('all-queues.js');
 for(const term of ["mode='all'","'groups'","'compare'",'compareSummary','all-queues-group-card',
  'all-queues-detail-panel','function toggleQueue(queue)','function render()',
  'src().timeline(selected,queue)','canvas.toBlob'])assert.ok(js.includes(term),term);
 assert.doesNotMatch(js,/fetch\(/);
 assert.match(read('ux-rebuild.css'),/prefers-reduced-motion:reduce/);
 assert.match(read('ux-rebuild.css'),/:root\[data-theme="dark"\]/);
});
