import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('Original Settings layout is restored with every live preference and support entry',()=>{
 const html=read('index.html');
 for(const id of ['settings','pushMaster','notifyOff','notifyOn','notifyChanges',
  'notifyEmergency','notifyTomorrow','betaAnalyticsConsent','manualRefresh',
  'checkAppUpdate','addFromSettings','shareApp','appearanceSummary','offlineDataState'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<h1>Опції<\/h1>/);
 assert.doesNotMatch(html,/id="settingsPlacesPanel"|id="settingsNavHub"|settings-quick-nav/);
 assert.doesNotMatch(html,/src="\.\/ux-rebuild\.js"|href="\.\/ux-rebuild\.css"/);
});

test('Original Home hierarchy and place cards are restored without changing schedule logic',()=>{
 const html=read('index.html'),app=read('app.js');
 for(const id of ['homeIntro','primaryPicker','heroStatus','overviewBar','hoursOn',
  'hoursOff','tomorrowCard','placeList','addFromHome','betaAd','pushInvite',
  'homeQuickPlaces'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.doesNotMatch(html,/id="homeDashboardIntro"|id="homeWeekDays"/);
 assert.match(app,/copy\.append\(el\('strong','',label\(item\)\)/);
 assert.match(app,/list\.dataset\.renderKey!==placeKey/);
 assert.doesNotMatch(app,/setText\('settingsPlacesCount'|setText\('homeDashboardDate'/);
 assert.match(app,/updatePushSubscription\(\)/);
});

test('Twelve-subqueue grouped and comparison instrument remains available from graph details',()=>{
 const html=read('index.html'),js=read('all-queues.js');
 for(const id of ['allQueuesDetailOpen','allQueuesDialog','allQueuesMatrix','allQueuesDays'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const key of ["'groups'","'compare'",'compareSummary','all-queues-group-card',
  'function toggleQueue(queue)','src().timeline(selected,queue)'])
  assert.ok(js.includes(key),key);
});

test('Only address picker retains Beta visual overrides and shell cache refreshes',()=>{
 const html=read('index.html'),css=read('redesign-7913.css'),sw=read('sw.js');
 assert.match(html,/redesign-7913\.css/);
 assert.doesNotMatch(html,/redesign-7913\.js|ux-rebuild\.js|ux-rebuild\.css/);
 assert.match(css,/\.redesigned-places-sheet/);
 assert.match(css,/:root\[data-theme="dark"\]/);
 assert.doesNotMatch(css,/#home|#settings/);
 assert.match(sw,/svitlo-cherkasy-shell-v7\.9\.13-beta-ui-rollback-v2/);
 assert.match(html,/data-deployment-channel="beta"/);
});