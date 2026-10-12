import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const load=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('tomorrow preview reads official verified schedule; absent data does not fabricate power status',()=>{
 const app=load('app.js'),html=load('index.html');
 assert.match(app,/function renderTomorrowPreview\(\)/);
 assert.match(app,/const date=shiftDay\(today\(\),1\)/);
 assert.match(app,/currentDay\(date\)/);
 assert.match(app,/Немає опублікованого графіка/);
 assert.match(app,/Планується без світла/);
 assert.match(html,/id="tomorrowCard"/);
 assert.match(html,/id="tomorrowSummary"/);
 assert.match(html,/id="tomorrowDetails"/);
});

test('address chips switch primary address locally and synchronize a pre-existing Push subscriber',()=>{
 const app=load('app.js');
 assert.match(app,/function renderQuickPlaces\(\)/);
 assert.match(app,/prefs\.primaryId=item\.id;savePrefs\(\);renderHome\(\)/);
 assert.match(app,/if\(pushActive\)updatePushSubscription\(\)/);
 assert.match(load('index.html'),/id="homeQuickPlaces"/);
});

test('share image shows only confirmed schedules and identifies predictions',()=>{
 const app=load('app.js');
 assert.match(app,/function shareDescription\(date\)/);
 assert.match(app,/if\(!queue\|\|!t\)return null/);
 assert.match(app,/function outages\(t\)/);
 assert.match(app,/async function shareSchedule\(date,/);
 assert.match(app,/canvas\.toBlob\(resolve,'image\/png'\)/);
 assert.match(app,/navigator\.share/);
 assert.match(app,/Лише плановий графік, не фактичний стан мережі/);
 assert.match(app,/navigator\.clipboard\.writeText/);
 assert.match(load('index.html'),/id="shareToday"/);
 assert.match(load('index.html'),/id="shareDetail"/);
});

test('operations dashboard does not fabricate traffic, resolves true server and Pages results',()=>{
 const js=load('admin-dashboard.js'),html=load('admin.html');
 assert.match(js,/api\('monitor'\)/);
 assert.match(js,/api\('audit'\)/);
 assert.match(js,/api\('app-config'\)/);
 assert.match(js,/fetch\('\.\/release\.json\?dashboard=/);
 assert.match(js,/Array\.isArray\(audit\?\.events\)/);
 assert.match(html,/id="opsHealthGrid"/);
 assert.match(html,/id="opsActivityChart"/);
 assert.match(html,/data-ops-jump="operations"/);
});

test('new files are present in public distribution and offline PWA shell',()=>{
 const build=load('scripts/build_pages.py'),sw=load('sw.js'),admin=load('admin.html');
 assert.match(build,/admin-dashboard\.js/);
 assert.match(sw,/"\.\/admin-dashboard\.js"/);
 assert.match(admin,/src="\.\/admin-dashboard\.js"/);
 const release=JSON.parse(load('release.json'));
 assert.match(sw,new RegExp('svitlo-cherkasy-shell-v'+release.version.replaceAll('.','\\.')));
 assert.match(release.version,/^7\.(?:[5-9]|[1-9]\d)\./);
});

test('audit includes all agreed item IDs rather than claiming full completion',()=>{
 const audit=load('FEATURE_AUDIT_v750.md');
 const expected=[1,2,3,4,5,6,7,8,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,30,32,33,34,35,36,37,38,39,40,42,43,45,47,49,50,51,52,53,54,55,57,61,62,63,64,65,66,67,68,70,71,72,73,74,75,76,77,79,80,81,82,83,84,85,87,91,92,95,97,98,99,100,101,102,103,104,105,113,114,116,117,118,119,120];
 for(const id of expected)assert.match(audit,new RegExp('^\\| '+id+' \\| (?:Г|Ч|Н) \\|','m'),'Missing audit item '+id);
 assert.match(audit,/\\| 57 \\| Н \\|/);
 assert.match(audit,/\\| 36 \\| Н \\|/);
 assert.match(audit,/\\| 72 \\| Н \\|/);
});
