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


test('grouped notifications have visible names and message sharing creates a direct URL',async()=>{
 class Node{
  constructor(tag='div'){
   this.tag=tag;this.children=[];this.textContent='';this.hidden=false;this.className='';
   this.open=false;this.dataset={};this.listeners={};this.classes=new Set();
   this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),
    contains:x=>this.classes.has(x),toggle:(x,state)=>{if(state)this.classes.add(x);else this.classes.delete(x)}};
  }
  get childElementCount(){return this.children.length}
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=[...nodes]}
  setAttribute(name,value){this[name]=value}
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener)}
  showModal(){this.open=true}
  close(){this.open=false;for(const fn of this.listeners.close||[])fn()}
 }
 const items=[
  {id:'notice:welcome_2026',title:'Вітаємо у Світло Черкаси',body:'Важлива інформація',kind:'announcement',
   pinned:true,read:true,at:'2026-10-18T11:00:00Z'},
  {id:'day:6.1:2026-10-18:alpha',title:'Графік 18 жовтня',body:'Оновлення',kind:'schedule',
   read:true,at:'2026-10-18T10:00:00Z'},
  {id:'change:6.1:2026-10-18:bravo',title:'Графік змінено',body:'Коригування',kind:'schedule',
   read:true,at:'2026-10-18T09:00:00Z'}
 ];
 const elements=Object.fromEntries(['inboxList','inboxUnread','navUnread','inboxMarkAll','inboxClear'].map(id=>[id,new Node()]));
 const body=new Node('body'),shared=[],copied=[],events=[],nav={click(){}};
 const location={href:'https://svitlo-cherkasy.pages.dev/',origin:'https://svitlo-cherkasy.pages.dev',
  pathname:'/',hash:'',search:''};
 const store={all:async()=>items,mark:async()=>{},unmark:async()=>{},add:async()=>{},clearRead:async()=>{}};
 const window={SvitloInbox:store,addEventListener(){},dispatchEvent:e=>events.push(e),
  matchMedia:()=>({matches:false}),prompt(){}};
 const document={body,documentElement:{classList:{contains:()=>false}},
  getElementById:id=>elements[id]||null,createElement:tag=>new Node(tag),
  createTextNode:text=>({textContent:text}),
  querySelectorAll:()=>[],querySelector:selector=>selector==='[data-go="updates"]'?nav:null,
  addEventListener(){}};
 const navigator={serviceWorker:{addEventListener(){}},
  share:async args=>{shared.push(args)},
  clipboard:{writeText:async value=>{copied.push(value)}}};
 const timeout=(callback,delay)=>delay>1000?0:setTimeout(callback,delay);
 const context={window,document,navigator,location,history:{replaceState(){}},
  localStorage:{getItem:()=>null},matchMedia:()=>({matches:false}),
  fetch:async()=>({ok:true,json:async()=>({days:[],changes:[],events:[]})}),
  Date,URL,Intl,Promise,console,setTimeout:timeout,clearTimeout,setInterval(){},
  CustomEvent:class{constructor(type,details){this.type=type;this.detail=details?.detail}}};
 vm.runInNewContext(read('inbox-ui.js'),context);
 await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
 const group=elements.inboxList.children.find(x=>x.className==='inbox-auto-group');
 assert.ok(group,'automatic messages must be grouped');
 const caption=group.children[0].children;
 assert.match(caption[0].textContent,/Графік · 18 жовтня · підчерга 6\.1/);
 assert.match(caption[1].textContent,/2 повідомл/);
 const noticeCard=elements.inboxList.children.find(x=>x.tag==='article');
 const menu=noticeCard.children.find(x=>x.tag==='details');
 const buttons=menu.children.find(x=>x.className==='inbox-context-actions').children;
 menu.open=true;
 buttons.find(x=>x.textContent==='Поділитися').onclick({stopPropagation(){}});
 assert.equal(shared.length,1);
 assert.equal(shared[0].title,items[0].title);
 assert.equal(shared[0].url,'https://svitlo-cherkasy.pages.dev/?message=notice%3Awelcome_2026');
 assert.equal(shared[0].text,undefined,'sharing must not paste message content');
 buttons.find(x=>x.textContent==='Копіювати посилання').onclick({stopPropagation(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(copied[0],shared[0].url);
 const style=read('style.css');
 assert.match(style,/\.inbox-context\[open\]\.is-closing \.inbox-context-actions/);
 assert.match(style,/prefers-reduced-motion:reduce/);
 await new Promise(resolve=>setTimeout(resolve,220));
 assert.equal(menu.open,false,'menu closes after exit animation');
});

test('a shared schedule link opens that message, not a different screen',async()=>{
 const inbox=read('inbox-ui.js');
 assert.match(inbox,/function routeMessage\(id\)/);
 assert.match(inbox,/pendingLinkId=target/);
 assert.match(inbox,/if\(shared\)routeMessage\(shared\)/);
 assert.match(inbox,/if\(pendingLinkId&&rows\.some\(x=>x\.id===pendingLinkId\)\)/);
 assert.match(inbox,/url\.searchParams\.set\('message',item\.id\)/);
 assert.doesNotMatch(inbox,/title\.append\(el\('span','', 'Графік/);
});


test('shared schedule URL routes to the exact message rather than the schedule tab',async()=>{
 const source=read('inbox-ui.js');
 const start=source.indexOf(' function routeMessage(id){');
 const end=source.indexOf(' function routePush(id,pushClick=false){',start);
 assert.ok(start>=0&&end>start);
 const opened=[],events=[];
 const context={
  pendingLinkId:null,
  document:{querySelector:()=>({click:()=>events.push('inbox')})},
  open:id=>{opened.push(id);return true},
  sync:async()=>{},console
 };
 const route=vm.runInNewContext(source.slice(start,end)+'\nrouteMessage',context);
 route('day:6.1:2026-10-18:alpha');
 assert.equal(opened[0],'day:6.1:2026-10-18:alpha');
 assert.deepEqual(events,['inbox']);
 assert.equal(context.pendingLinkId,null);
 // The target remains pending if a different device has not synchronized it yet.
 context.open=()=>false;
 let synchronized=false;
 context.sync=async()=>{synchronized=true};
 route('notice:welcome_2026');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(context.pendingLinkId,'notice:welcome_2026');
 assert.equal(synchronized,true);
 route('https://malicious.invalid');
 assert.equal(context.pendingLinkId,'notice:welcome_2026','reject invalid inbound ids');
});
