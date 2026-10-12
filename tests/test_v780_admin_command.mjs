import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createAppConfig,validateAppConfig} from '../push-server/app-config.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const base=()=>({maintenance:{title:'Планові технічні роботи',message:'Проводимо оновлення системи'},announcements:[]});
test('new admin workspaces are separate, searchable, and do not overlap in grid',()=>{
 const html=read('admin.html'),css=read('admin-control.css'),script=read('admin-command.js');
 const tabs=['overview','insights','quality','operations','push','media','feedback','help','features','design','maintenance','sources','planner','tools','data','security','audit'];
 for(const tab of tabs){
  assert.match(html,new RegExp('data-admin-tab="'+tab+'"'));
  assert.match(html,new RegExp('data-admin-panel="'+tab+'"'));
 }
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'Admin IDs unique');
 assert.match(css,/#adminDashboard>\[data-admin-panel\]:not\(\[hidden\]\)/);
 assert.match(css,/grid-row:auto!important/);
 assert.match(script,/ctrlKey\|\|e\.metaKey/);
 assert.match(script,/controlRunChecks/);
 for(const id of ['controlInsightsMetrics','controlChecks','controlMediaGrid','controlAccessCards','designSave','designAccent'])
  assert.match(html,new RegExp('id="'+id+'"'));
});
test('real appearance preferences validate and persist without publishing new notices',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-appearance-'));
 try{
  const ctrl=createAppConfig({directory:dir});
  const initial=ctrl.get();
  assert.equal(initial.site.appearance.accent,'#377dff');
  const updated=ctrl.update({...initial,site:{...initial.site,appearance:{accent:'#2255aa',background:'#eaefff',surface:'#ffffff',density:'compact',rounded:false}}});
  assert.equal(updated.site.appearance.accent,'#2255aa');
  assert.equal(updated.site.appearance.rounded,false);
  const store=createAppConfig({directory:dir});
  assert.equal(store.get().site.appearance.density,'compact');
  const unchecked=validateAppConfig({...base(),site:{appearance:{accent:'url(javascript:alert(1))',density:'exploit'}}});
  assert.equal(unchecked.site.appearance.accent,'#377dff');
  assert.equal(unchecked.site.appearance.density,'comfortable');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Push-only announcement is queued for Web Push but never published to Inbox API',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-push-only-'));
 try{
  const ctrl=createAppConfig({directory:dir});
  const msg={id:'noticePushOnly12',title:'Системне сповіщення',body:'Коротке нагадування користувачу.',
   active:true,delivery:'push',queue:'all',kind:'info'};
  ctrl.update({...ctrl.get(),announcements:[msg]});
  assert.equal(ctrl.duePush().length,1);
  assert.equal(ctrl.publicState().announcements.length,0);
  const alt={...msg,id:'noticePublic121',delivery:'both'};
  ctrl.update({...ctrl.get(),announcements:[msg,alt]});
  assert.equal(ctrl.duePush().length,2);
  assert.equal(ctrl.publicState().announcements.length,1);
  ctrl.markPushed(msg.id);
  assert.equal(ctrl.duePush().length,1);
  assert.equal(ctrl.publicState().announcements.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Push-only delivery avoids local Inbox writes and deep link to Inbox',()=>{
 const server=read('push-server/server.js'),manual=read('push-server/manual-push.js'),sw=read('sw.js');
 assert.match(server,/inbox:notice\.delivery!=='push'/);
 assert.match(manual,/inbox:msg\.inbox!==false/);
 assert.match(sw,/const inboxAllowed=msg\.inbox!==false/);
 assert.match(sw,/inboxAllowed\?self\.SvitloInbox\.add/);
 assert.match(sw,/if\(inboxAllowed\)tab\.postMessage/);
});
test('limited maintenance can suspend nine independently managed noncritical modules',()=>{
 const config=validateAppConfig({...base(),maintenance:{...base().maintenance,mode:'limited',
 disabledModules:['inbox','address-search','help','sharing','push-settings','quick-addresses','manual-refresh','feedback','copy-schedule']}});
 assert.equal(config.maintenance.disabledModules.length,9);
 const mode=read('site-mode.js'),admin=read('admin-control.js');
 assert.match(mode,/const limited=\[/);
 assert.match(mode,/push-settings/);
 assert.match(admin,/opsDisableQuickAddresses/);
 assert.match(read('admin.html'),/id="opsDisableManualRefresh"/);
});
test('CMS and maintenance have independent save scopes',()=>{
 const source=read('admin-control.js');
 assert.match(source,/async function saveConfig\(\{silent=false,scope='content'\}/);
 assert.match(source,/if\(scope==='maintenance'\)/);
 assert.match(source,/next=\{\.\.\.latest,announcements:noticeChanges\}/);
 assert.match(source,/saveConfig\(\{scope:'maintenance'\}\)/);
});
test('maintenance layout presets persist securely and render live previews',()=>{
 const m=validateAppConfig({...base(),maintenance:{...base().maintenance,layout:'split'}});
 assert.equal(m.maintenance.layout,'split');
 const bad=validateAppConfig({...base(),maintenance:{...base().maintenance,layout:'compact'}});
 assert.equal(bad.maintenance.layout,'compact');
 assert.throws(()=>validateAppConfig({...base(),maintenance:{...base().maintenance,layout:'javascript'}}));
 assert.match(read('site-mode.js'),/overlay\.dataset\.layout=/);
 assert.match(read('admin.html'),/id="opsLayout"/);
 assert.match(read('admin-control.js'),/layout:read\('opsLayout'\)/);
 assert.match(read('style.css'),/maintenance-screen\[data-layout="split"\]/);
});
test('new admin script and source files ship in Pages and SW shell',()=>{
 const release=JSON.parse(read('release.json'));
 assert.match(release.version,/^7\.8\.\d+$/);
 assert.match(read('scripts/build_pages.py'),/admin-command\.js/);
 assert.match(read('sw.js'),new RegExp('svitlo-cherkasy-shell-v'+release.version.replaceAll('.','\\.')));
 assert.match(read('sw.js'),/"\.\/admin-command\.js"/);
 for(const p of ['admin-command.js','admin-features.js','admin-control.js','site-mode.js','app.js','sw.js'])
  assert.doesNotThrow(()=>new Function(read(p)),p);
});
