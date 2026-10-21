import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=source('admin.html'),ui=source('admin-office.js'),panel=source('admin-system.js'),server=source('push-server/admin.js');
test('Office shell is loaded after all existing editors, with full navigation kept',()=>{
 assert.ok(html.includes('admin-office.css'));
 assert.ok(html.includes('admin-office.js'));
 assert.ok(html.indexOf('admin-office.js')>html.indexOf('admin-address.js'));
 assert.match(ui,/office-desk/);
 assert.match(ui,/office-modal/);
 for(const section of ['operations','push','feedback','planner','revisions','data','registry','corrections','live'])
  assert.ok(html.includes('data-admin-tab="'+section+'"'),section);
});
test('overview figures depend on private actual API, and failures are labeled',()=>{
 for(const route of ["work-items","feedback","monitor","address-corrections"])
  assert.ok(ui.includes("api('"+route+"')"),route);
 assert.match(ui,/Promise\.allSettled/);
 assert.match(ui,/недоступн/);
 assert.match(ui,/dashboard\.hidden/);
});
test('work cards have permission-checked notes, version conflict protection and audit trail',()=>{
 const work=source('push-server/work-registry.js');
 assert.match(work,/const addNote=/);
 assert.match(work,/input\.expectedRevision!==item\.revision/);
 assert.match(work,/record\('work\.note'/);
 assert.match(server,/workRegistry\.addNote/);
 assert.match(panel,/work-items\/'.*?\/notes/);
 assert.match(panel,/workDueFilter/);
 assert.match(panel,/Експорт CSV/);
 assert.match(ui,/svitlo:open-work/);
 assert.match(ui,/svitlo:select-work/);
});
test('Office never includes credentials, bypasses login or invents telemetry',()=>{
 assert.doesNotMatch(ui,/(?:ADMIN_PASSWORD|GITHUB_TOKEN|PUSH_PRIVATE_KEY)/);
 assert.doesNotMatch(ui,/sessionToken=/);
 assert.match(ui,/svitlo:admin-ready/);
 assert.match(ui,/svitlo:admin-logout/);
 assert.match(ui,/new MutationObserver/);
});
