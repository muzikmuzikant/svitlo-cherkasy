import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateAppConfig} from '../push-server/app-config.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('all admin workspaces are separate destinations, not buried in notifications',()=>{
 const html=read('admin.html');
 for(const key of ['operations','maintenance','features','help','audit']){
  assert.match(html,new RegExp('data-admin-tab="'+key+'"'));
  assert.match(html,new RegExp('data-admin-panel="'+key+'"'));
 }
 assert.match(html,/id="featuresGrid"/);
 assert.match(html,/id="opsMaintenanceSave"/);
 assert.match(html,/id="opsSave"/);
 assert.match(html,/id="featuresSave"/);
 assert.match(html,/src="\.\/admin-features\.js"/);
 assert.match(read('admin-control.css'),/max-width:1680px!important/);
});

test('all feature switches have real runtime effects and can be searched, saved and restored',()=>{
 const admin=read('admin-features.js'),runtime=read('site-mode.js'),css=read('style.css');
 const defaults=validateAppConfig({maintenance:{title:'Технічні роботи',message:'Ми тимчасово оновлюємо сервіс'},announcements:[]}).site.flags;
 const expected=['inbox','inboxFilters','inboxHistory','sharing','sharePreview','copySchedule',
  'help','feedback','addressSearch','pushPrompt','pushSettings','tomorrowPreview',
  'quickAddresses','homePlaces','dailyStats','overviewTimeline','statusCountdown',
  'weekNavigation','dayStats','scheduleLegend','offlineStatus','scheduleSource',
  'manualRefresh','homeQuickActions','animations','quickQueueLookup','nextChangeCard','dayShortcuts','detailSourceLink','hourlyLabels','inboxMarkAll','inboxClearRead','appUpdateCheck','editAddressFromGraph','syncStatus','settingsFooter','tomorrowOpenShortcut','scheduleOpenShortcut','allQueues','allQueuesGroups','allQueuesCompare','allQueuesDetails','allQueuesRowIntervals','allQueuesNowMarker','allQueuesExport','microMotion','panelMotion','selectionMotion'];
 assert.equal(Object.keys(defaults).length,expected.length);
 for(const key of expected){
  assert.ok(key in defaults,'Config must validate '+key);
  assert.match(admin,new RegExp("['\\x22]"+key+"['\\x22]"),'Admin switch '+key);
  assert.ok(runtime.includes(key),'Live site runtime '+key);
  const consumers=[css,read('app.js'),read('all-queues.js'),read('all-queues.css'),read('micro-motion.js'),read('micro-motion.css')];
  assert.ok(consumers.some(source=>source.includes('feature-off-'+key)||source.includes("enabled('"+key+"')")),'Runtime behavior for toggle '+key);
 }
 assert.match(admin,/api\('app-config'\)/);
 assert.match(admin,/method:'PUT'/);
 assert.match(admin,/const cfg=await api\('app-config'\)/);
 assert.match(read('admin-control.js'),/next=\{\.\.\.latest,announcements:noticeChanges\}/);
});

test('feature flags are whitelisted on the server and stored with safe defaults',()=>{
 const base={maintenance:{title:'Технічні роботи',message:'Ми тимчасово оновлюємо сервіс'},
  site:{flags:{pushPrompt:false,tomorrowPreview:false,sharing:false,elevatePermissions:true}},announcements:[]};
 const result=validateAppConfig(base);
 assert.equal(result.site.flags.pushPrompt,false);
 assert.equal(result.site.flags.tomorrowPreview,false);
 assert.equal(result.site.flags.sharing,false);
 assert.equal(result.site.flags.help,true);
 assert.equal('elevatePermissions' in result.site.flags,false);
});

test('the opt-in banner remains until a real push subscription is active',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('style.css');
 for(const id of ['pushInvite','pushInviteTitle','pushInviteAction','pushInviteText'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/function updatePushInvite\(\)/);
 assert.match(app,/box\.hidden=!supported\|\|pushActive/);
 assert.match(app,/Notification\.permission==='denied'/);
 assert.match(app,/action\.onclick=denied\?/);
 assert.match(app,/pushActive=true;localStorage\.setItem\(PUSH_CONSENT,'yes'\);updatePushInvite\(\)/);
 assert.match(css,/\.push-invite\{/);
 assert.match(css,/html\.feature-off-pushPrompt #pushInvite/);
});

test('share image opens a real preview before user chooses Share or Save',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('style.css');
 for(const id of ['sharePreviewDialog','sharePreviewImage','sharePreviewShare','sharePreviewSave','sharePreviewClose'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/async function openSharePreview\(blob,filename,date,queue\)/);
 assert.match(app,/dialog\.showModal\(\)/);
 assert.match(app,/URL\.createObjectURL\(blob\)/);
 assert.match(app,/URL\.revokeObjectURL\(url\)/);
 assert.match(app,/navigator\.share\(\{files:\[file\]/);
 assert.match(app,/a\.download=filename/);
 assert.match(app,/await openSharePreview\(blob,filename,date,info\.queue\)/);
 assert.match(app,/for\(let hour=0;hour<24;hour\+\+\)/);
 assert.match(css,/\.share-preview-scroll img/);
});

test('new files are part of both GitHub Pages and SW cache',()=>{
 const build=read('scripts/build_pages.py'),sw=read('sw.js');
 assert.match(build,/admin-features\.js/);
 assert.match(sw,/"\.\/admin-features\.js"/);
 const release=JSON.parse(read('release.json'));
 assert.match(release.version,/^7\.(?:7|[89]|[1-9]\d)\./);
 assert.match(sw,new RegExp('svitlo-cherkasy-shell-v'+release.version.replaceAll('.','\\.')));
 assert.match(read('index.html'),new RegExp('name="svitlo-version" content="'+release.version.replaceAll('.','\\.')+'"'));
 for(const path of ['app.js','admin-control.js','admin-features.js','site-mode.js','sw.js'])
  assert.doesNotThrow(()=>new Function(read(path)),path);
});
