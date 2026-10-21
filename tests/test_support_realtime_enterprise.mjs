import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('customers receive replies while ticket is open, without reloading',()=>{
 const source=read('feedback.js'),ui=read('feedback.html');
 assert.match(source,/const CHAT_REFRESH_MS=4500/);
 assert.match(source,/setInterval\(\(\)=>\{void refreshOpenChat\(\)\},CHAT_REFRESH_MS\)/);
 assert.match(source,/async function refreshOpenChat\(\)/);
 assert.match(source,/if\(hash===chatFingerprint\)return/);
 assert.match(source,/root\.append\(node\)/);
 assert.match(source,/requestGeneration!==chatGeneration/);
 assert.match(source,/document\.addEventListener\('visibilitychange'/);
 assert.match(source,/window\.addEventListener\('online'/);
 assert.match(source,/chatRequestBusy/);
 assert.match(ui,/id="chatLiveStatus"/);
 assert.match(ui,/id="chatRefresh"/);
 assert.match(ui,/aria-live="polite"/);
 assert.doesNotMatch(source,/location\.reload\(\)/);
});
test('operator gets updates in the register even when the reply editor has focus',()=>{
 const source=read('admin.js'),extension=read('admin-workstation-v3.js');
 assert.match(source,/const TICKET_LIVE_MS=4500/);
 assert.match(source,/window\.refreshTickets=refreshTickets/);
 assert.match(source,/updateLiveTicketThread\(prior,updated\)/);
 assert.match(source,/for\(const entry of curr\.slice\(prev\.length\)\)thread\.append\(supportThreadEntry\(entry\)\)/);
 assert.match(source,/root\.contains\(document\.activeElement\)/);
 assert.match(source,/if\(!editing\)renderTicketDetail\(\)/);
 assert.match(source,/document\.addEventListener\('visibilitychange'/);
 assert.match(source,/window\.svitloTicketAutoSyncEnabled\?\.\(\)===false/);
 assert.match(extension,/window\.svitloTicketAutoSyncEnabled=/);
 assert.doesNotMatch(source,/localStorage\.setItem\([^;]*(?:supportTickets|supportDrafts|noteDrafts)/);
});
test('all enterprise module bars call existing module actions',()=>{
 const source=read('admin-office-plus.js'),html=read('admin.html');
 const modules=[...new Set([...html.matchAll(/data-admin-panel="([^"]+)"/g)].map(m=>m[1]))];
 assert.equal(modules.length,23);
 for(const part of ["registry","corrections","insights","quality","operations","push",
   "media","feedback","live","features","sources","planner","security","audit","revisions"]){
  assert.ok(source.includes(part+":"),'Missing module action '+part);
 }
 assert.match(source,/reloadTarget\.click\(\)/);
 assert.doesNotMatch(source,/operations:'opsReload'/);
 assert.doesNotMatch(source,/features:'featuresReload'/);
 assert.doesNotMatch(source,/planner:'plannerReload'/);
 assert.match(source,/operations:'opsMetricsRefresh'/);
 assert.match(source,/sessionStorage\.setItem\('svitlo-office-density'/);
 assert.match(source,/const workStatus=node\('div',undefined,'office-work-status'\)/);
 assert.match(source,/const strip=node\('div',undefined,'office-modulebar'\)/);
 assert.match(source,/aria-pressed/);
});
test('enterprise style covers modules, compact mode and responsive mobile operator layout',()=>{
 const css=read('admin-workstation-v3.css'),support=read('feedback.css');
 assert.match(css,/SVITLO OFFICE \/ ENTERPRISE WORKSPACE 2026/);
 for(const selector of ['.office-context','.office-modulebar','.office-work-status',
  '.office-density','.registry-list','.support-workspace','.desk-pane',
  '.ops-section','.analytics-chart-card','.office-nav-link']){
  assert.ok(css.includes(selector),selector);
 }
 assert.match(css,/data-office-density="compact"/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(support,/\.support-chat-meta/);
 assert.match(support,/\.support-chat-live/);
});
