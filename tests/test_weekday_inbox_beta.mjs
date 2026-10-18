import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('weekday-only navigation, quick queue inside graph, clean settings',()=>{
 const html=read('index.html'),app=read('app.js');
 assert.match(html,/id="days"[^>]+aria-label="Дні поточного тижня"/);
 assert.doesNotMatch(html,/id="weekPrev"|id="weekNext"|id="weekRange"/);
 assert.ok(html.indexOf('class="quick-queue-lookup"')<html.indexOf('id="articleLink"'));
 assert.equal((html.match(/id="homeQuickPlaces"/g)||[]).length,1);
 assert.match(html,/id="offlineDataState"/);
 assert.doesNotMatch(html,/id="pushDeliveryStatus"/);
 assert.doesNotMatch(app,/налаштуваннях iPhone|сповіщення для .*iPhone/);
 assert.match(app,/Завантажено|Збережено графіків/);
});

test('schedule and transition Push routes to graph, normal notices to Inbox',()=>{
 const inbox=read('inbox-ui.js'),sw=read('sw.js');
 assert.match(inbox,/function routePush\(id,pushClick=false\)/);
 assert.match(inbox,/store\.mark\(\[target\]\)/);
 assert.match(inbox,/svitlo:open-schedule/);
 assert.match(inbox,/inbox-auto-group/);
 assert.match(inbox,/Позначити непрочитаним/);
 assert.match(inbox,/Копіювати текст/);
 assert.match(inbox,/Поділитися/);
 assert.match(sw,/SVITLO_OPEN_INBOX/);
});

test('read and unread state persists in fallback after reload',async()=>{
 const database=new Map();
 const localStorage={getItem:key=>database.get(key)||null,setItem:(key,value)=>database.set(key,value)};
 const load=()=>{
  const self={indexedDB:null,localStorage};
  vm.runInNewContext(read('notification-center.js'),{self,console,Date,URL,Promise});
  return self.SvitloInbox;
 };
 let store=load();
 await store.add({id:'day:6.1:2026-10-18:initial',title:'Графік',body:'Оновлення',at:'2026-10-18T10:00:00Z',kind:'schedule'});
 await store.mark(['day:6.1:2026-10-18:initial']);
 store=load();
 assert.equal((await store.all())[0].read,true);
 await store.unmark(['day:6.1:2026-10-18:initial']);
 store=load();
 assert.equal((await store.all())[0].read,false);
});
