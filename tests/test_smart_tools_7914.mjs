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

test('the unwanted day planner is removed and schedule history is discoverable on the schedule screen',()=>{
 assert.match(app,/window\.SvitloCore=/);
 assert.match(app,/history:Array\.isArray\(obj\.history\)/);
 assert.match(app,/svitlo:smart-tools-refresh/);
 const tools=read('smart-tools-7914.js');
 assert.doesNotMatch(tools,/smartDayPlan|renderPlanner|План дня|Найдовше вікно зі світлом/);
 assert.ok(html.includes('id="scheduleHistory"'));
 assert.ok(html.indexOf('id="scheduleHistory"')<html.indexOf('id="updates"'));
 assert.ok(!html.includes('<details class="inbox-history">'));
 assert.match(html,/Історія графіків/);
});

test('per-address Push hours are sent to the API and verified against server state',()=>{
 assert.match(app,/allowedHours:window\.SvitloSmartTools/);
 const tools=read('smart-tools-7914.js');
 assert.match(tools,/function createDayRow/);
 assert.match(tools,/Додати ще один проміжок/);
 assert.match(tools,/days:Array\.from/);
 assert.match(tools,/Увесь день/);
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

test('address comparison is a simple two-address workflow and personal Push reports sync state',()=>{
 const tools=read('smart-tools-7914.js');
 assert.match(tools,/Перша адреса/);
 assert.match(tools,/Друга адреса/);
 assert.match(tools,/smart-compare-segment/);
 assert.match(tools,/smart-compare-common-value/);
 assert.match(tools,/id,'smartCompare'/);
 assert.doesNotMatch(tools,/smart-compare-place|smart-compare-place input/);
 assert.match(tools,/svitlo:push-hours-sync/);
 assert.match(tools,/Години Push синхронізовано/);
 assert.match(app,/svitlo:push-hours-sync/);
});

test('schedule comparison is rendered as two visual 24-hour timelines and the history is on the schedule screen',()=>{
 const tools=read('smart-tools-7914.js');
 assert.match(tools,/smart-compare-track-row/);
 assert.match(tools,/smart-compare-segment/);
 assert.match(tools,/smart-compare-date-pill/);
 assert.match(html,/id="scheduleHistory"/);
 assert.ok(html.indexOf('id="scheduleHistory"')<html.indexOf('id="updates"'));
 assert.ok(!html.includes('<details class="inbox-history">'));
});
test('personal Push hours use the shared draggable bottom sheet and animate changing content',()=>{
 const tools=read('smart-tools-7914.js'),skin=read('smart-tools-7914.css');
 assert.match(tools,/sheet smart-push-dialog/);
 assert.match(tools,/SvitloSheetMotion\?\.bind/);
 assert.match(tools,/SvitloSheetMotion\?\.dismiss/);
 assert.match(tools,/animateItems\(root/);
 assert.match(skin,/smart-hours-day/);
 assert.match(skin,/smart-push-dialog\.sheet/);
 assert.match(skin,/prefers-reduced-motion:no-preference/);
});
