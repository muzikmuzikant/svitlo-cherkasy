import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import vm from 'node:vm';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(join(root,name),'utf8');
const app=read('app.js');
const start=app.indexOf('function scheduleQueueChanged('), end=app.indexOf('function renderSyncStatus()',start);
assert.ok(start!==-1&&end>start,'Queue diff helper must be present');
const ctx=vm.createContext({});
vm.runInContext(app.slice(start,end)+';this.diff=scheduleQueueChanged;',ctx);
const diff=ctx.diff;
const snapshot=(queue,date='2026-10-10')=>({days:[{date,verified:true,queues:{'2.1':queue}}]});
test('queue auto-refresh detects genuine interval change for same day',()=>{
  assert.equal(diff(snapshot({knownFrom:'00:00',off:[['10:00','12:00']]}),snapshot({knownFrom:'00:00',off:[['10:00','13:00']]}),'2.1'),true);
});
test('queue auto-refresh ignores identical data, missing old data, other queue and date rollover',()=>{
 const before=snapshot({knownFrom:'00:00',off:[]});
 assert.equal(diff(before,snapshot({knownFrom:'00:00',off:[]}), '2.1'),false);
 assert.equal(diff({days:[]},snapshot({off:[]}), '2.1'),false);
 assert.equal(diff(before,snapshot({off:[['11:00','12:00']]},'2026-10-11'), '2.1'),false);
 assert.equal(diff(before,snapshot({off:[['11:00','12:00']]}), '3.1'),false);
});
test('installed app visibly reports update timing and checks once per minute when visible',()=>{
 const html=read('index.html');
 assert.match(html,/id="syncStatus"/);assert.match(html,/id="syncNow"/);
 assert.match(app,/setInterval\(\(\)=>\{if\(!document\.hidden\)refreshData\(\)\},AUTO_SCHEDULE_CHECK_MS\)/);
 assert.match(app,/visibilitychange/);assert.match(app,/lastDownloadAt/);assert.match(app,/lastSyncFailed/);
});
test('GitHub schedule importer publishes independently from address refresh',()=>{
 const workflow=read('.github/workflows/update.yml');
 const addresses=read('.github/workflows/update-addresses.yml');
 assert.match(workflow,/schedule:/);
 assert.match(workflow,/Import official schedules/);
 assert.match(workflow,/--schedules-only/);
 assert.match(workflow,/steps\.schedule\.outcome == 'success'/);
 assert.doesNotMatch(workflow,/--addresses-only/);
 assert.match(addresses,/--addresses-only/);
 assert.match(workflow,/svitlo-data-updated/);
 assert.match(addresses,/svitlo-data-updated/);
 assert.doesNotMatch(workflow,/if ! python scripts\/update_data\.py/);
});

test('installation is platform-aware and preserves iOS icon',()=>{
 const html=read('index.html'),js=read('install.js');
 assert.match(html,/id="installLanding"/);
 assert.match(html,/apple-touch-icon-v692.png/);
 assert.match(js,/navigator\.standalone/);
 assert.match(js,/beforeinstallprompt/);
 assert.match(js,/iPhone \/ iPad/);
 assert.match(js,/На початковий екран/);
 assert.match(js,/hour\.onload/);
});
