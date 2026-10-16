import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('style.css');
const begin=app.indexOf('let pushControlBusy=false;\nfunction renderSettings(){');
const end=app.indexOf('\nfunction fillQueueSelect()',begin);
assert.ok(begin>=0&&end>begin,'Extract the actual Settings renderer');
const actual=app.slice(begin,end);

function simulate({pushActive=false,consent='no',configured=true,permission='granted',queue='2.1',busy=false,supported=true}={}){
 const ids=['pushMaster','notifyOff','notifyOn','notifyChanges','notifyTomorrow','notifyEmergency','pushCategorySettings','pushHeadline','pushDescription'];
 const elements=Object.fromEntries(ids.map(id=>[id,{
  checked:false,disabled:false,textContent:'',dataset:{},attributes:{},
  classList:{statuses:{},toggle(key,state){this.statuses[key]=state}},
  setAttribute(k,v){this.attributes[k]=v}
 }]));
 const prefs={off:true,on:false,changes:true,tomorrow:false,emergency:true};
 const localStorage={getItem(key){return key==='svitlo-push-consent-v6'?consent:null}};
 const context={prefs,pushActive,localStorage,PUSH_CONSENT:'svitlo-push-consent-v6',
  pushConfig:configured?{apiBase:'https://example.test',publicKey:'test'}:null,
  Notification:{permission},window:supported?{Notification:{permission}}:{},navigator:supported?{serviceWorker:{}}:{},
  primary:()=>queue?{queue}:null,$:id=>elements[id],
  setText:(id,text)=>{elements[id].textContent=text}};
 if(!supported)delete context.Notification;
 vm.runInNewContext(actual+'\n pushControlBusy='+JSON.stringify(busy)+'; globalThis.run=renderSettings;',context);
 context.run();
 return {elements,prefs};
}
const notifications=['notifyOff','notifyOn','notifyChanges','notifyTomorrow','notifyEmergency'];

test('Push enabled: all saved notification choices remain editable',()=>{
 const {elements}=simulate({pushActive:true,consent:'yes'});
 assert.equal(elements.pushMaster.checked,true);
 assert.equal(elements.pushMaster.disabled,false);
 assert.equal(elements.pushHeadline.textContent,'Підключено');
 assert.equal(elements.pushCategorySettings.classList.statuses['push-categories-disabled'],false);
 for(const name of notifications)assert.equal(elements[name].disabled,false,name);
 assert.equal(elements.notifyOff.checked,true);
 assert.equal(elements.notifyOn.checked,false);
});
test('Push off: disable dependent categories without deleting their saved choices',()=>{
 const {elements}=simulate({pushActive:false,consent:'no'});
 assert.equal(elements.pushMaster.checked,false);
 assert.equal(elements.pushMaster.disabled,false);
 assert.equal(elements.pushHeadline.textContent,'Вимкнено');
 for(const name of notifications)assert.equal(elements[name].disabled,true,name);
 assert.equal(elements.notifyOff.checked,true);
 assert.equal(elements.notifyOn.checked,false);
});
test('push status handles operating system refusal, unsupported browsers and no address',()=>{
 for(const scenario of [
  {options:{permission:'denied'},label:'Заборонено'},
  {options:{supported:false},label:'Недоступно'},
  {options:{configured:false},label:'Немає з’єднання'},
  {options:{queue:null},label:'Потрібна адреса'}
 ]){
  const {elements}=simulate(scenario.options);
  assert.equal(elements.pushMaster.checked,false);
  assert.equal(elements.pushMaster.disabled,true,scenario.label);
  assert.equal(elements.pushHeadline.textContent,scenario.label);
  for(const name of notifications)assert.equal(elements[name].disabled,true,name);
 }
});
test('while a subscription is being changed, the master and category toggles lock',()=>{
 const {elements}=simulate({pushActive:true,consent:'yes',busy:true});
 assert.equal(elements.pushMaster.disabled,true);
 assert.equal(elements.pushHeadline.textContent,'Застосовуємо…');
 for(const name of notifications)assert.equal(elements[name].disabled,true);
});
test('Options title matches the tab; Push UI has exactly one master control',()=>{
 assert.match(html,/<section id="settings"[\s\S]*?<h1>Опції<\/h1>/);
 assert.match(html,/data-go="settings"[\s\S]*?<span>Опції<\/span>/);
 assert.equal(html.split('id="pushMaster"').length-1,1);
 assert.equal(html.split('id="pushCategorySettings"').length-1,1);
 assert.ok(!html.includes('id="enableNotifications"'),'duplicate action button is gone');
 assert.ok(!html.includes('id="disableNotifications"'),'duplicate action button is gone');
 assert.match(css,/\.push-categories\.push-categories-disabled/);
 assert.match(app,/\$\('pushMaster'\)\.onchange=async event=>/);
 assert.match(app,/if\(want\)await enableNotifications\(\)/);
 assert.match(app,/else await disableNotifications\(\)/);
 assert.match(app,/finally\{\s*pushControlBusy=false;\s*renderSettings\(\)/);
});
