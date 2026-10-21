import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../support-inbox.js',import.meta.url),'utf8');
const userSource=readFileSync(new URL('../feedback.js',import.meta.url),'utf8');
const supportHtml=readFileSync(new URL('../feedback.html',import.meta.url),'utf8');
const ID='SC-ABCDEF1234';
const TOKEN='A'.repeat(40);
const KEY='svitlo-support-tickets-v1';
const SNAP='svitlo-ticket-inbox-state-v1';
const receipt={id:ID,token:TOKEN,createdAt:'2026-10-21T10:00:00Z',status:'new'};
const initial=()=>new Map([[KEY,JSON.stringify([receipt])],
 [SNAP,JSON.stringify({[ID]:{status:'new',replyIds:[]}})]]);

function harness(code,storage=initial()){
 const events=[],requests=[];
 const localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,String(value))
 };
 const answer={
  ok:code===200,status:code,
  async json(){return code===404?{error:'Звернення не знайдено.'}:
   code===200?{id:ID,status:'new',canReply:true,messages:[]}:
   {error:code===429?'Забагато перевірок. Спробуйте за хвилину.':'Недоступно'};}
 };
 const fetch=async(url,options)=>{
  requests.push({url,options});
  if(url==='./push-config.json')return {ok:true,async json(){return {apiBase:'https://beta-api.example.org'}}};
  assert.match(url,/\/api\/ticket\/status$/);
  return answer;
 };
 const window={
  SvitloInbox:{async add(){}},
  dispatchEvent(event){events.push(event)},
  addEventListener(){},
  SvitloInboxUI:{async refresh(){}}
 };
 const sandbox={
  window,fetch,localStorage,URL,AbortSignal,navigator:{onLine:true},
  document:{hidden:false,addEventListener(){},querySelectorAll(){return []}},
  setInterval(){return 1},
  console:{warn(){}},
  CustomEvent:class{constructor(type,opts={}){this.type=type;this.detail=opts.detail}}
 };
 vm.runInNewContext(source,sandbox,{filename:'support-inbox.js'});
 return {window,storage,events,requests};
}

test('confirmed 404 removes a deleted ticket receipt and snapshot',async()=>{
 const h=harness(404);
 await h.window.SvitloSupportInbox.scan();
 assert.deepEqual(JSON.parse(h.storage.get(KEY)),[]);
 assert.deepEqual(JSON.parse(h.storage.get(SNAP)),{});
 assert.equal(h.events.filter(e=>e.type==='svitlo:support-ticket-deleted').length,1);
 assert.equal(h.events.find(e=>e.type==='svitlo:support-ticket-deleted').detail.id,ID);
 const request=h.requests.find(x=>x.url.endsWith('/api/ticket/status'));
 assert.equal(JSON.parse(request.options.body).token,TOKEN);
 assert.equal(request.options.cache,'no-store');
});
for(const code of [403,429,503]){
 test('HTTP '+code+' never erases a stored ticket',async()=>{
  const h=harness(code);
  await h.window.SvitloSupportInbox.scan();
  assert.equal(JSON.parse(h.storage.get(KEY)).length,1);
  assert.equal(h.events.some(e=>e.type==='svitlo:support-ticket-deleted'),false);
 });
}
test('only the authoritative not-found 404 can remove a ticket',async()=>{
 const h=harness(404);
 // Even a 404 route misconfiguration is not proof the case was deleted.
 const original=h.window.SvitloSupportInbox.scan;
 const s=source.replace("if(body?.error==='Звернення не знайдено.')return {deleted:true};",
  "if(body?.error==='a different message')return {deleted:true};");
 const other=initial(),e=harness(429,other);
 assert.match(source,/if\(body\?\.error==='Звернення не знайдено\.'\)/);
 assert.ok(s.includes("a different message"));
 await e.window.SvitloSupportInbox.scan();
 assert.equal(JSON.parse(other.get(KEY)).length,1);
});
test('user lists, open chats and other tabs reconcile deletion',()=>{
 assert.match(userSource,/function syncSavedReceipts\(\)/);
 assert.match(userSource,/function forgetDeletedTicket\(id\)/);
 assert.match(userSource,/error\?\.status===404&&error\?\.message==='Звернення не знайдено\.'/);
 assert.match(userSource,/window\.addEventListener\('storage'/);
 assert.match(userSource,/window\.addEventListener\('svitlo:support-ticket-deleted'/);
 assert.match(userSource,/setInterval\(\(\)=>scanVisibleReceipts\(4\),20000\)/);
 assert.match(userSource,/if\(wasDeleted\(error\)\)forgetDeletedTicket\(item\.id\)/);
 assert.match(supportHtml,/id="supportTicketsNotice"/);
 assert.doesNotMatch(userSource,/location\.reload/);
});
