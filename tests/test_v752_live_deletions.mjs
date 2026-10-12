import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
test('authoritative empty server list purges deleted messages from local device database',async()=>{
 memory.clear();
 const self={localStorage:storage},ctx={self,window:self,URL,Date,console};
 vm.runInNewContext(read('notification-center.js'),ctx);
 const store=self.SvitloInbox,now=new Date().toISOString();
 await store.add([{id:'notice:msg_old1',title:'Оголошення',body:'Повідомлення',kind:'announcement',at:now,authoritative:true},
                  {id:'day:1.1:2026-10-12',title:'Графік',body:'Розклад',kind:'schedule',at:now}]);
 assert.equal((await store.all()).length,2);
 await store.reconcileAnnouncements([]);
 const visible=await store.all();
 assert.equal(visible.length,1);
 assert.equal(visible[0].kind,'schedule');
});
test('admin update unpins a previously pinned message and fresh data wins',async()=>{
 memory.clear();
 const self={localStorage:storage};vm.runInNewContext(read('notification-center.js'),{self,window:self,URL,Date,console});
 const store=self.SvitloInbox,at=new Date().toISOString();
 await store.add({id:'notice:msg_1234',title:'Був закріплений',body:'Перший текст',kind:'announcement',at,pinned:true,authoritative:true});
 await store.add({id:'notice:msg_1234',title:'Відредагований',body:'Другий текст',content:'Деталі',kind:'announcement',at,pinned:false,authoritative:true});
 const all=await store.all();assert.equal(all.length,1);assert.equal(all[0].pinned,false);assert.equal(all[0].title,'Відредагований');
});
test('initial public config fetched before dynamic Inbox script is still considered verified',()=>{
 const ui=read('inbox-ui.js'),controls=read('site-mode.js');
 assert.match(ui,/noticeFeedConfirmed=window\.SvitloPublicConfig\?\.serverVerified===true/);
 assert.match(ui,/if\(window\.SvitloPublicConfig\?\.serverVerified===true\)/);
 assert.match(controls,/window\.SvitloPublicConfig=\{announcements:/);
 assert.match(controls,/serverVerified:true/);
});
test('each successful server response triggers authoritative reconcile including unchanged empty list',()=>{
 const controls=read('site-mode.js'),ui=read('inbox-ui.js');
 assert.doesNotMatch(controls,/lastNoticeHash/);
 assert.match(controls,/window\.dispatchEvent\(new CustomEvent\('svitlo:public-config'/);
 assert.match(ui,/noticeFeedConfirmed=true;[\s\S]*?sync\(\)\.catch/);
 assert.match(ui,/await store\.reconcileAnnouncements\(allowed\)/);
});
test('delete and unpublish save immediately to server, not just a local array',()=>{
 const editor=read('admin-control.js');
 assert.match(editor,/async function saveConfig/);
 assert.match(editor,/await saveConfig\(\{silent:true\}\)/);
 assert.match(editor,/opsNoticeActive','opsNoticePinned/);
 assert.match(editor,/const saved=await api\('app-config',\{method:'PUT'/);
 assert.match(editor,/new BroadcastChannel\('svitlo-content-v1'\)/);
});
test('server refresh failure cannot erase offline saved messages',()=>{
 const site=read('site-mode.js');
 assert.match(site,/if\(lastConfig\)display\(lastConfig,\{offline:true\}\)/);
 assert.match(site,/if\(!offline\)\{/);
});
