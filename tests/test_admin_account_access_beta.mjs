import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Session is restored via server validation without persisting credentials',()=>{
 const js=read('admin.js'),server=read('push-server/admin.js');
 assert.match(js,/sessionStorage\.setItem\(SESSION_KEY/);
 assert.match(js,/sessionStorage\.removeItem\(SESSION_KEY/);
 assert.match(js,/await api\('status'\)/);
 assert.match(js,/await activateSession\(status/);
 assert.match(js,/clearSession\(\)/);
 assert.doesNotMatch(js,/localStorage\.setItem\(.*(?:token|password|otp)/i);
 assert.match(server,/expiresAt:new Date\(session\.expires\)/);
 assert.match(server,/username:session\.username,role,permissions:session\.permissions/);
 assert.match(server,/current\.revision!==session\.revision/);
});
test('Every managed scope has independent read authorization and role write limits',()=>{
 const server=read('push-server/admin.js');
 assert.match(server,/session\.permissions\.includes\(permission\)/);
 assert.doesNotMatch(server,/session\.permissions\.includes\('view'\)\|\|session\.permissions/);
 assert.match(server,/role==='operator'&&permission==='feedback'/);
 assert.match(server,/method==='GET'\|\|canWrite/);
 assert.match(server,/method==='DELETE'&&pathName\.startsWith\('\/api\/admin\/feedback\/'\)/);
 assert.match(server,/session\.permissions\.includes\('push'\)/);
 assert.match(server,/pathName\.startsWith\('\/api\/admin\/users'\)\?'owner'/);
});
test('Authenticated Office home names current user, role and rights and hides disallowed modules',()=>{
 const html=read('admin.html'),js=read('admin-access.js');
 assert.match(html,/admin-access\.css/);
 assert.match(html,/admin-access\.js/);
 assert.match(js,/office-my-account/);
 assert.match(js,/office-identity/);
 assert.match(js,/data-admin-tab/);
 assert.match(js,/data-ops-jump/);
 assert.match(js,/data-admin-target/);
 assert.match(js,/canTab:allowedTab/);
 assert.match(js,/office-recent-list/);
 assert.match(js,/CHANGE\.test\(label\)/);
});
test('Previously disliked Settings and queue filter are rolled back with functionality preserved',()=>{
 const html=read('index.html'),queue=read('all-queues.js');
 assert.match(html,/<h1>Опції<\/h1>/);
 assert.match(html,/id="addFromSettings"/);
 assert.match(html,/class="surface settings-card appearance-card"/);
 assert.doesNotMatch(html,/id="settingsNavHub"|id="settingsPlacesPanel"/);
 assert.doesNotMatch(html,/class="settings-quick-nav"/);
 assert.doesNotMatch(html,/data-queue-group=/);
 assert.match(queue,/function toggleQueue\(queue\)/);
 assert.match(queue,/signature===currentSignature/);
});
test('Account assets ship in Beta static/offline build',()=>{
 const html=read('admin.html'),build=read('scripts/build_pages.py'),sw=read('sw.js');
 for(const filename of ['admin-access.js','admin-access.css']){
  assert.ok(html.includes(filename),filename+' not linked');
  assert.ok(build.includes("'"+filename+"'"),filename+' not built');
  assert.ok(sw.includes('"./'+filename+'"'),filename+' not cached');
 }
});
