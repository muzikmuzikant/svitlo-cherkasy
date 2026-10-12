import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../admin-features.js',import.meta.url),'utf8');
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.className='';this.value='';this.checked=false;this.hidden=false;this.textContent='';this.dataset={};}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes]}
 addEventListener(type,cb){this.listeners[type]=cb}
 querySelectorAll(className){if(className!=='.feature-toggle')return [];const result=[];const walk=node=>{if(node.className==='feature-toggle')result.push(node);for(const x of node.children)walk(x)};walk(this);return result}
}
test('Features tab truly persists flags to Railway without destroying maintenance and CMS messages',async()=>{
 const ids=['featuresGrid','featuresStatus','featuresSearch','featuresActiveCount','featuresSave','featuresReload',
  'opsFlagInbox','opsFlagSharing','opsFlagHelp','opsLinkHelp','opsLinkFeedback','opsLinkOfficial',
  'opsBannerActive','opsBannerTitle','opsBannerBody','opsBannerButton','opsBannerUrl'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Node('input')]));
 const featureTab=new Node('button');
 const registry=[];
 const document={
  getElementById:id=>elements[id]||null,
  createElement:tag=>{const node=new Node(tag);registry.push(node);return node},
  querySelector:q=>q==='[data-admin-tab="features"]'?featureTab:null,
  addEventListener(){}
 };
 let state={
  maintenance:{enabled:false,title:'Технічні роботи',message:'Виконуємо оновлення системи'},
  announcements:[{id:'msg_12345',active:true,title:'Текст',body:'Зміст'}],
  site:{flags:{inbox:true,sharing:true,help:true,pushPrompt:true,tomorrowPreview:true},
   links:{help:'./help.html',feedback:'./feedback.html',official:'https://www.cherkasyoblenergo.com/news'},
   banner:{enabled:false,title:'Важливе',body:'Деталі',button:'Переглянути',url:''}}
 };
 const writes=[];
 const api=async(route,opts={})=>{
  assert.equal(route,'app-config');
  if(opts.method==='PUT'){state=JSON.parse(opts.body);writes.push(state);return structuredClone(state)}
  return structuredClone(state);
 };
 const window={};
 vm.runInNewContext(script,{document,window,api,remote:true,console,Date});
 await featureTab.listeners.click();
 const prompt=registry.find(x=>x.tag==='input'&&x.name==='pushPrompt');
 const tomorrow=registry.find(x=>x.tag==='input'&&x.name==='tomorrowPreview');
 assert.ok(prompt);assert.ok(tomorrow);
 assert.equal(prompt.checked,true);
 prompt.checked=false;prompt.listeners.change();
 tomorrow.checked=false;tomorrow.listeners.change();
 await elements.featuresSave.onclick();
 assert.equal(writes.length,1);
 assert.equal(writes[0].site.flags.pushPrompt,false);
 assert.equal(writes[0].site.flags.tomorrowPreview,false);
 assert.equal(writes[0].site.flags.inbox,true);
 assert.equal(writes[0].maintenance.enabled,false);
 assert.deepEqual(writes[0].announcements,[{id:'msg_12345',active:true,title:'Текст',body:'Зміст'}]);
 await featureTab.listeners.click();
 assert.equal(prompt.checked,false);
 assert.equal(tomorrow.checked,false);
});
