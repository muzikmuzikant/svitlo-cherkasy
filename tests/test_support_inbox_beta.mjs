import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const ID='SC-ABCDEF1234',TOKEN='a'.repeat(40);
const ticket=(overrides={})=>({id:ID,status:'new',createdAt:'2026-10-21T16:00:00.000Z',updatedAt:'2026-10-21T16:01:00.000Z',messages:[],canReply:true,...overrides});
async function harness({saved=[{id:ID,token:TOKEN,status:'new',createdAt:'2026-10-21T16:00:00.000Z'}],snapshot=null,current=ticket(),offline=false}={}){
 const values=new Map([['svitlo-support-tickets-v1',JSON.stringify(saved)]]);
 if(snapshot)values.set('svitlo-ticket-inbox-state-v1',JSON.stringify(snapshot));
 const messages=new Map(),listeners={},visited=[];
 let result=current;
 const store={add:async batch=>{for(const item of batch)messages.set(item.id,item);return [...messages.values()]},all:async()=>[...messages.values()]};
 const window={SvitloInbox:store,addEventListener:(key,fn)=>listeners[key]=fn,dispatchEvent:()=>{},SvitloInboxUI:{refresh:async()=>{}}};
 const doc={hidden:false,addEventListener:(key,fn)=>listeners[key]=fn,querySelectorAll:()=>[]};
 const sandbox={
  window,document:doc,navigator:{onLine:!offline},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},
  fetch:async(url,opt={})=>{
   visited.push(String(url));
   if(String(url).includes('push-config.json'))return{ok:true,json:async()=>({apiBase:'https://svitlo-beta-api-staging.up.railway.app'})};
   assert.match(url,/\/api\/ticket\/status$/);
   assert.equal(opt.method,'POST');
   const body=JSON.parse(opt.body);
   assert.equal(body.id,ID);assert.equal(body.token,TOKEN);
   return{ok:true,json:async()=>result};
  },
  URL,AbortSignal,Date,Promise,CustomEvent:class{constructor(type,arg){this.type=type;this.detail=arg?.detail}},
  setInterval:()=>1,console:{warn:()=>{}}
 };
 runInNewContext(file('support-inbox.js'),sandbox);
 await window.SvitloSupportInbox.scan();
 return{window,values,messages,visited,setCurrent:x=>{result=x},setOnline:value=>{sandbox.navigator.onLine=value}};
}
test('one support reply means exactly one private Inbox message even after repeated checks',async()=>{
 const m={id:'012345abcdef',from:'admin',text:'Private user correspondence must stay in Railway',at:'2026-10-21T16:03:00.000Z'};
 const h=await harness({snapshot:{[ID]:{status:'new',replyIds:[]}},current:ticket({messages:[m],status:'in_progress'})});
 assert.equal(h.messages.size,1,'automatic new to in_progress transition must not spam a second notice');
 const item=[...h.messages.values()][0];
 assert.equal(item.kind,'support');assert.match(item.title,/Відповідь від підтримки/);
 assert.ok(!JSON.stringify(item).includes(m.text));
 assert.ok(!JSON.stringify(item).includes(TOKEN));
 await h.window.SvitloSupportInbox.scan();
 assert.equal(h.messages.size,1);
});
test('status changes create one separate Inbox message and preserve individual status change IDs',async()=>{
 const h=await harness({snapshot:{[ID]:{status:'new',replyIds:[]}},current:ticket({status:'resolved'})});
 assert.equal(h.messages.size,1);
 assert.match([...h.messages.values()][0].body,/Вирішено/);
 await h.window.SvitloSupportInbox.scan();assert.equal(h.messages.size,1);
 h.setCurrent(ticket({status:'in_progress',updatedAt:'2026-10-21T17:08:00.000Z'}));
 await h.window.SvitloSupportInbox.scan();assert.equal(h.messages.size,2);
});
test('existing ticket history is not delivered as a swarm of old messages on first update',async()=>{
 const m={id:'012345abcdef',from:'admin',text:'old support reply',at:'2026-10-21T16:03:00.000Z'};
 const h=await harness({current:ticket({messages:[m]})});
 assert.equal(h.messages.size,0);
 h.setCurrent(ticket({messages:[m,{...m,id:'fedcba987654',at:new Date().toISOString()}],updatedAt:new Date().toISOString()}));
 await h.window.SvitloSupportInbox.scan();assert.equal(h.messages.size,1);
});
test('private ticket requires a valid receipt token; offline does not contact server',async()=>{
 const empty=await harness({saved:[{id:ID,token:'',status:'new'}]});
 assert.equal(empty.visited.length,0);assert.equal(empty.messages.size,0);
 const offline=await harness({offline:true});assert.equal(offline.visited.length,0);
});
test('support receipt seed and import baseline do not expose tokens in snapshot',async()=>{
 const h=await harness({saved:[]});
 assert.equal(h.window.SvitloSupportInbox.remember({id:ID,token:TOKEN}),true);
 const raw=h.values.get('svitlo-ticket-inbox-state-v1')||'';
 // Only receipts actually saved on this device can get a snapshot.
 assert.ok(!raw.includes(TOKEN));
});
test('support notifications never have public share buttons and link only to an owned ticket',()=>{
 const ui=file('inbox-ui.js'),html=file('feedback.html'),feedback=file('feedback.js');
 assert.ok(ui.includes("if(item.kind!=='support')action('Поділитися'"));
 assert.ok(ui.includes("if(item.kind!=='support')action('Копіювати посилання'"));
 assert.ok(ui.includes('support:\\'Підтримка\\''));
 assert.ok(ui.includes('feedback.html?tab=tickets&ticket='));
 assert.ok(feedback.includes("ticketParams.get('ticket')"));
 assert.ok(html.includes('./support-inbox.js'));
 assert.ok(file('install.js').includes("support.src='./support-inbox.js'"));
});
test('support sync script shipped in staged site and pre-cache',()=>{
 for(const asset of ['support-inbox.js']){
  assert.ok(file('scripts/build_pages.py').includes("'"+asset+"'"));
  assert.ok(file('sw.js').includes('"./'+asset+'"'));
 }
 assert.match(file('notification-center.js'),/'support'\].includes\(item.kind\)/);
});
