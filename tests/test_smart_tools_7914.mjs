import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),sw=read('sw.js'),build=read('scripts/build_pages.py'),release=JSON.parse(read('release.json'));
const scriptNames=[...html.matchAll(/<script defer src="\.\/([^"]+)"/g)].map(x=>x[1]);

test('PWA explicitly loads its required runtime chain before the new features',()=>{
 for(const file of ['notification-center.js','notification-text.js','message-format.js','inbox-ui.js','support-inbox.js','data-merge.js','address-lookup.js','hour-paint.js','app.js','smart-tools-7914.js','all-queues-core.js','all-queues.js'])assert.ok(scriptNames.includes(file),file);
 assert.ok(scriptNames.indexOf('app.js')<scriptNames.indexOf('smart-tools-7914.js'));
 assert.ok(scriptNames.indexOf('smart-tools-7914.js')<scriptNames.indexOf('all-queues.js'));
});

test('day planner, comparison and history use the existing schedule source of truth',()=>{
 assert.match(app,/window\.SvitloCore=/);
 assert.match(app,/history:Array\.isArray\(obj\.history\)/);
 assert.match(app,/svitlo:smart-tools-refresh/);
 assert.match(read('smart-tools-7914.js'),/getTimeline/);
 assert.match(read('smart-tools-7914.js'),/Було:/);
 assert.match(read('smart-tools-7914.js'),/Стало:/);
});

test('per-address Push hours are sent to the API and verified against server state',()=>{
 assert.match(app,/allowedHours:window\.SvitloSmartTools/);
 const tools=read('smart-tools-7914.js');
 assert.match(tools,/function createDayRow/);
 assert.match(tools,/Додати ще один проміжок/);
 assert.match(tools,/days:Array\.from/);
 assert.match(tools,/Цілодобово/);
 assert.match(app,/sameAllowed/);
 const server=read('push-server/server.js');
 assert.match(server,/normalizeAllowedHours\(data\.allowedHours\)/);
 assert.match(server,/notificationAllowed\(record\.allowedHours/);
 assert.match(server,/allowedHours:rec\?\.allowedHours/);
});

test('new feature assets are published and available to an installed offline PWA',()=>{
 assert.match(build,/smart-tools-7914\.js/);
 assert.match(build,/smart-tools-7914\.css/);
 assert.match(sw,/smart-tools-7914\.js/);
 assert.match(sw,/smart-tools-7914\.css/);
 assert.equal(release.version,'7.9.14');
 assert.equal(release.channel,'beta');
});

test('history is stored by the authoritative schedule publisher, not fabricated in the browser',()=>{
 const publisher=read('push-server/schedule-publication.js');
 assert.match(publisher,/buildScheduleHistory/);
 assert.match(publisher,/changes\[queue\] = \{before,after\}/);
});
