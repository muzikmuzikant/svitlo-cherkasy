import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.hidden=false;this.className='';this.open=false;this.dataset={};this.listeners={};this.classList={toggle(){},add(){},remove(){}}}
 get childElementCount(){return this.children.filter(x=>x&&typeof x==='object'&&x.tag).length}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[...children]}
 setAttribute(name,value){this[name]=value}
 addEventListener(name,listener){(this.listeners[name]??=[]).push(listener)}
 showModal(){this.open=true}
 close(){this.open=false;for(const callback of this.listeners.close||[])callback()}
}
const allNodes=root=>{
 const out=[];const scan=n=>{if(!n||typeof n!=='object')return;out.push(n);(n.children||[]).forEach(scan)};
 scan(root);return out
};
async function mountInbox(item){
 const elements=Object.fromEntries(['inboxList','inboxUnread','navUnread','inboxMarkAll','inboxClear'].map(id=>[id,new Element()]));
 let markedRead=false;const events=[],page=new Element('body');
 const store={async all(){return [{...item,read:markedRead}]},async mark(){markedRead=true},async clearRead(){},async add(){}};
 const window={SvitloInbox:store,addEventListener(){},dispatchEvent(event){events.push(event)}};
 const document={body:page,getElementById(id){return elements[id]||null},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}};
 const context={window,document,location:{href:'https://svitlo-cherkasy.pp.ua/',origin:'https://svitlo-cherkasy.pp.ua'},
  localStorage:{getItem(){return null}},navigator:{serviceWorker:{addEventListener(){}}},
  fetch:async()=>({ok:true,json:async()=>({days:[],changes:[],events:[]})}),
  CustomEvent:class{constructor(type,config={}){this.type=type;this.detail=config.detail}},
  Intl,Date,URL,console,setTimeout,clearTimeout,matchMedia:()=>({matches:true}),setInterval(){},history:{replaceState(){}}};
 vm.runInNewContext(read('inbox-ui.js'),context);
 await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
 return {elements,page,events,readState:()=>markedRead,card:()=>elements.inboxList.children.find(n=>n.tag==='article'),
  dialog:()=>page.children.find(n=>n.tag==='dialog')};
}
// The entire card content is a semantic button; the action menu stays separate.
function openCard(view){
 const opener=allNodes(view.card()).find(n=>n.tag==='button'&&n.className.includes('inbox-card-opener'));
 assert.ok(opener,'Notification card has a large accessible opener');
 opener.onclick();
}
test('a tap on the entire schedule card opens detail, then opens in-app graph',async()=>{
 const view=await mountInbox({id:'day:2.1:2026-10-12:2026-10-12T09:55:00+03:00',title:'🗓️ Графік на 12 жовтня',body:'Підчерга 2.1',
  kind:'schedule',at:'2026-10-12T06:55:00Z',url:'https://www.cherkasyoblenergo.com/media/official'});
 assert.equal(view.card().getAttribute,undefined);
 openCard(view);
 assert.equal(view.dialog().open,true);
 const action=allNodes(view.dialog()).find(n=>n.tag==='button'&&n.textContent.includes('Відкрити графік'));
 assert.ok(action,'internal graph action exists in detail');
 action.onclick();
 assert.equal(view.events.find(event=>event.type==='svitlo:open-schedule').type,'svitlo:open-schedule');
 assert.equal(view.events.find(event=>event.type==='svitlo:open-schedule').detail.date,'2026-10-12');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(view.readState(),true);
});
test('tomorrow Push opens next Kyiv day from its original timestamp',async()=>{
 const view=await mountInbox({id:'push:tomorrow:queue_1:random',title:'🗓️ Графік на завтра',body:'Підчерга 1.1',kind:'push',at:'2026-10-12T14:00:00Z'});
 openCard(view);
 const action=allNodes(view.dialog()).find(n=>n.tag==='button'&&n.textContent.includes('Відкрити графік'));
 assert.ok(action);action.onclick();assert.equal(view.events.find(event=>event.type==='svitlo:open-schedule').detail.date,'2026-10-13');
});
test('admin announcement opens a full detail, but has no false schedule shortcut',async()=>{
 const view=await mountInbox({id:'notice:announcement1',title:'📣 Оголошення',body:'Є нові можливості',content:'## Деталі\n**Важливо**',
  images:['https://svitlo-cherkasy-production.up.railway.app/api/media/safe.png'],
  kind:'announcement',at:'2026-10-12T10:00:00Z'});
 openCard(view);
 assert.equal(view.dialog().open,true);
 assert.ok(allNodes(view.dialog()).some(x=>x.tag==='img'));
 assert.ok(!allNodes(view.dialog()).some(x=>x.tag==='button'&&x.textContent.includes('Відкрити графік')));
});
test('schedule deep linking still calls the existing graph tab',()=>{
 const app=read('app.js'),ui=read('inbox-ui.js'),sw=read('sw.js');
 assert.match(app,/addEventListener\('svitlo:open-schedule'/);
 assert.match(app,/navigate\('detail'\)/);
 assert.match(app,/showDay\(wanted\)/);
 assert.match(ui,/SVITLO_OPEN_INBOX/);
 assert.match(sw,/SVITLO_OPEN_INBOX/);
});
