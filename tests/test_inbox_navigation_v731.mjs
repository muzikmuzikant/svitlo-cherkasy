import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.hidden=false;this.className='';this.dataset={};this.classList={toggle(){}}}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[...children]}
 setAttribute(name,value){this[name]=value}
 addEventListener(name,listener){this[name]=listener}
}

async function mountInbox(item){
 const elements=Object.fromEntries(['inboxList','inboxUnread','navUnread','inboxMarkAll','inboxClear'].map(id=>[id,new Element()]));
 let markedRead=false;const events=[];
 const store={
  async all(){return [{...item,read:markedRead}]},
  async mark(){markedRead=true},
  async clearRead(){},
  async add(){}
 };
 const window={
  SvitloInbox:store,
  addEventListener(){},
  dispatchEvent(event){events.push(event)}
 };
 const document={
  getElementById(id){return elements[id]||null},
  createElement(tag){return new Element(tag)},
  querySelectorAll(){return []},
  addEventListener(){}
 };
 const context={window,document,location:{href:'https://svitlo-cherkasy.pp.ua/',origin:'https://svitlo-cherkasy.pp.ua'},
  localStorage:{getItem(){return null}},
  navigator:{serviceWorker:{addEventListener(){}}},
  fetch:async()=>({ok:true,json:async()=>({days:[],changes:[],events:[]})}),
  CustomEvent:class {constructor(type,config){this.type=type;this.detail=config.detail}},
  Intl,Date,URL,console,setInterval(){}};
 vm.runInNewContext(read('inbox-ui.js'),context);
 await new Promise(resolve=>setImmediate(resolve));
 await new Promise(resolve=>setImmediate(resolve));
 const cards=elements.inboxList.children;
 const buttons=[];
 const traverse=node=>{
  if(!node||typeof node!=='object')return;
  if(node.tag==='button')buttons.push(node);
  (node.children||[]).forEach(traverse);
 };
 cards.forEach(traverse);
 return {buttons,events,elements,readState:()=>markedRead};
}

test('schedule message opens the app graph on its publication date',async()=>{
 const view=await mountInbox({id:'day:2.1:2026-10-12:2026-10-12T09:55:00+03:00',
  title:'🗓️ Графік на 12 жовтня',body:'Підчерга 2.1',
  kind:'schedule',at:'2026-10-12T06:55:00Z',url:'https://www.cherkasyoblenergo.com/media/official'});
 const action=view.buttons.find(b=>b.textContent==='Переглянути графік');
 assert.ok(action,'internal graph button should exist');
 action.onclick();
 assert.equal(view.events[0].type,'svitlo:open-schedule');
 assert.equal(view.events[0].detail.date,'2026-10-12');
 assert.ok(!view.buttons.some(b=>b.textContent==='Переглянути ↗'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(view.readState(),true);
});

test('tomorrow Push opens tomorrow based on original Kyiv notification time',async()=>{
 const view=await mountInbox({id:'push:tomorrow:queue_1:random',
  title:'🗓️ Графік на завтра',body:'Для підчерги 1.1 опубліковано графік',
  kind:'push',at:'2026-10-12T14:00:00Z'});
 const action=view.buttons.find(b=>b.textContent==='Переглянути графік');
 assert.ok(action);
 action.onclick();
 assert.equal(view.events[0].detail.date,'2026-10-13');
});

test('manual announcements do not pretend to be a schedule',async()=>{
 const view=await mountInbox({id:'notice:announcement1',title:'📣 Оголошення',
  body:'Зверніть увагу на повідомлення сервісу',kind:'announcement',
  at:'2026-10-12T10:00:00Z'});
 assert.ok(!view.buttons.some(b=>b.textContent==='Переглянути графік'));
});

test('existing app navigation handles the event without reloading or leaving the app',()=>{
 const app=read('app.js'),ui=read('inbox-ui.js');
 assert.match(app,/addEventListener\('svitlo:open-schedule'/);
 assert.match(app,/navigate\('detail'\)/);
 assert.match(app,/showDay\(wanted\)/);
 assert.match(ui,/Джерело ↗/);
 assert.doesNotMatch(ui,/el\('a','Переглянути ↗'\)/);
});
