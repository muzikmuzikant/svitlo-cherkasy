import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const store=()=>{
 const memory=new Map();
 const self={localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)}};
 vm.runInNewContext(read('notification-center.js'),{self,window:self,URL,Date,console});
 return self.SvitloInbox;
};
test('verified server snapshot purges old manual admin Push and deleted CMS notices without deleting operator alerts',async()=>{
 const inbox=store(),at=new Date().toISOString();
 await inbox.add([
  {id:'push:svitlo-admin-m41',title:'Старе повідомлення адміністратора',body:'Видалене в адмінпанелі',kind:'push',at},
  {id:'notice:removed_123',title:'Видалена публікація',body:'Не має відображатися',kind:'announcement',at},
  {id:'notice:active_123',title:'Актуальна публікація',body:'Залишається',kind:'announcement',at,authoritative:true},
  {id:'push:off:2026-10-12:400',title:'Відключення',body:'Нагадування',kind:'push',at},
  {id:'day:1.1:2026-10-12',title:'Графік',body:'Оновлення',kind:'schedule',at}
 ]);
 await inbox.reconcileAnnouncements(['notice:active_123']);
 const ids=(await inbox.all()).map(x=>x.id);
 assert.deepEqual(ids.filter(x=>x.startsWith('notice:')),['notice:active_123']);
 assert.ok(!ids.some(x=>x.startsWith('push:svitlo-admin-')));
 assert.ok(ids.includes('push:off:2026-10-12:400'));
 assert.ok(ids.includes('day:1.1:2026-10-12'));
});
test('empty authoritative list clears every old admin message and repeated reconciliation remains idempotent',async()=>{
 const inbox=store(),at=new Date().toISOString();
 await inbox.add({id:'push:svitlo-admin-expired',title:'Push',body:'Legacy',kind:'push',at});
 await inbox.add({id:'notice:expired_x',title:'Old',body:'Legacy',kind:'announcement',at});
 await inbox.reconcileAnnouncements([]);
 await inbox.reconcileAnnouncements([]);
 assert.equal((await inbox.all()).length,0);
});
test('opening notifications requests a new server config and keeps native reminders',()=>{
 const ui=read('inbox-ui.js');
 assert.match(ui,/svitlo:refresh-content/);
 assert.match(ui,/SvitloControls\?\.refresh/);
 assert.match(read('site-mode.js'),/serverVerified:true/);
});
