import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('Compact Options preserve settings, consent, saved places and Push contracts',()=>{
 const html=read('index.html');
 for(const id of ['settings','settingsPlacesPanel','settingsManagePlaces','settingsPlacesCount',
                  'settingsAppearance','settingsPushBlock','settingsPrivacyBlock','settingsOfflineBlock',
                  'settingsSupportBlock','pushMaster','notifyOff','notifyOn','betaAnalyticsConsent',
                  'manualRefresh','checkAppUpdate','shareApp','appearanceSummary']){
  assert.ok(html.includes('id="'+id+'"'),'Missing element '+id);
 }
 assert.match(html,/<h1>Опції<\/h1>/);
 assert.doesNotMatch(html,/class="settings-quick-nav"/);
 assert.equal((html.match(/id="settingsManagePlaces"/g)||[]).length,1);
});

test('Home and addresses preserve picker, notifications and lookup logic',()=>{
 const html=read('index.html'),app=read('app.js');
 for(const id of ['primaryPicker','heroStatus','overviewBar','homeDashboardIntro','homeDashboardDate',
                  'homeQuickPlaces','placeList','manageFromHome','addFromHome',
                  'placesSheet','placesOptions','addressSheet','settlement','street','house','queueOverride',
                  'manualQueue','saveAddress']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 for(const fragment of ['place-edit-action','place-edit-option','settingsManagePlaces','manageFromHome',
                        "openAddressSheet(item)","openPicker()","updatePushSubscription()",
                        "setText('settingsPlacesCount'","setText('homeDashboardDate'"]){
  assert.ok(app.includes(fragment),fragment);
 }
 assert.match(app,/row\.append\(b,edit\);list\.append\(row\)/);
 assert.match(app,/sheet\.addEventListener\('close',\(\)=>openAddressSheet\(a\),\{once:true\}\)/);
});

test('Unfiltered 12-row schedule retains stable full-day timelines and detail interactions',()=>{
 const html=read('index.html'),js=read('all-queues.js');
 assert.doesNotMatch(html,/data-queue-group=/);
 assert.match(js,/for\(const queue of math\.QUEUES\)/);
 assert.match(js,/signature===currentSignature/);
 assert.match(js,/src\(\)\.timeline\(selected,queue\)/);
 assert.match(js,/function toggleQueue\(queue\)/);
 assert.match(js,/toLocaleString\('uk-UA'/);
});

test('Redesigned files are packaged and cached for offline PWA, never production',()=>{
 const html=read('index.html'),sw=read('sw.js'),build=read('scripts/build_pages.py');
 for(const asset of ['redesign-7913.css','redesign-7913.js']){
  assert.match(html,new RegExp(asset.replace('.','\\.')));
  assert.ok(sw.includes('"./'+asset+'"'),'uncached '+asset);
  assert.ok(build.includes("'"+asset+"'"),'missing _site '+asset);
 }
 assert.match(sw,/svitlo-cherkasy-shell-v7\.9\.13-beta-rights-v1/);
 assert.match(html,/data-deployment-channel="beta"/);
 const css=read('redesign-7913.css');
 assert.match(css,/:root\[data-theme="dark"\]/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/transition\s*:\s*all\b/);
 assert.match(css,/\[hidden\]/);
});
