import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSupportTicketNotifier} from '../push-server/support-ticket-notifier.js';
const src=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

const TOKEN='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';
test('Telegram alerts require Railway secret and at least one numeric chat ID',async()=>{
 let calls=0;
 const disabled=createSupportTicketNotifier({token:'',chatIds:'123456789',fetchImpl:async()=>{calls++}});
 const result=await disabled.notify({id:'SC-AABBCCDD11',topic:'bug'});
 assert.equal(result.enabled,false);
 assert.equal(calls,0);
 const bad=createSupportTicketNotifier({token:TOKEN,chatIds:'@public-channel',fetchImpl:async()=>{calls++}});
 assert.equal((await bad.notify({id:'SC-AABBCCDD11'})).enabled,false);
 assert.equal(calls,0);
});
test('new ticket messages contain only ID and category, never private contents',async()=>{
 const calls=[];
 const notifier=createSupportTicketNotifier({
  token:TOKEN,chatIds:'-1001234567890,123456789',
  fetchImpl:async(url,opts)=>{calls.push({url,opts});return {ok:true}}
 });
 const result=await notifier.notify({id:'SC-AABBCCDD11',topic:'address',
  message:'Секретний зміст',email:'secret@example.com',token:'access-secret',
  attachments:[{name:'document.jpeg'}]});
 assert.equal(result.delivered,2);
 assert.equal(calls.length,2);
 for(const {url,opts} of calls){
  assert.match(url,/^https:\/\/api.telegram.org\/bot/);
  const payload=JSON.parse(opts.body);
  assert.match(payload.text,/SC-AABBCCDD11/);
  assert.match(payload.text,/Адреса або підчерга/);
  for(const secret of ['Секретний зміст','secret@example.com','access-secret','document.jpeg'])
   assert.doesNotMatch(payload.text,new RegExp(secret.replace(/[.*+?^$`{}()|[\]\\]/g,'\\$&')));
 }
 await notifier.notify({id:'SC-AABBCCDD11',topic:'address'});
 assert.equal(calls.length,2,'retry of same ticket should not duplicate notification');
});
test('invalid ticket IDs do not send Telegram notifications',async()=>{
 let calls=0;
 const notifier=createSupportTicketNotifier({token:TOKEN,chatIds:'123456789',
  fetchImpl:async()=>{calls++;return {ok:true}}});
 await notifier.notify({id:'admin-password',topic:'bug'});
 assert.equal(calls,0);
});
test('new support alerts are visible in admin; other tabs get low-frequency checks',()=>{
 const page=src('admin.html'),ui=src('admin-ticket-alerts.js'),
  admin=src('admin.js'),server=src('push-server/server.js');
 assert.match(page,/src="\.\/admin-ticket-alerts\.js"/);
 assert.match(page,/href="\.\/admin-ticket-alerts\.css"/);
 assert.match(ui,/svitlo:tickets-loaded/);
 assert.match(ui,/Notification\.requestPermission/);
 assert.match(ui,/newCases\.filter\(x=>!known\.has\(x\.id\)\)/);
 assert.match(admin,/lastBackgroundTicketCheck/);
 assert.match(server,/supportTicketNotifier\.notify\(\{id:saved\.id,topic:data\.topic\}\)/);
});
test('frontend upload affordance remains visible when staging backend is outdated',()=>{
 const html=src('feedback.html'),client=src('feedback.js'),css=src('ticket-media.css');
 assert.match(html,/id="newTicketMediaSection"/);
 assert.doesNotMatch(html,/id="newTicketMediaSection" hidden/);
 assert.match(html,/id="newTicketMediaRetry"/);
 assert.match(html,/id="replyTicketMediaRetry"/);
 assert.match(client,/\.hidden=false/);
 assert.match(client,/data\.capabilities\?\.attachments===true/);
 assert.match(css,/ticket-media-unavailable/);
});
test('night-mode landing styles cover the actual current install components',()=>{
 const css=src('theme.css'),install=src('install.css');
 for(const name of ['install-landing','install-panel','install-steps','install-benefit','install-phone','install-instructions']){
  assert.ok(css.includes(name),'missing dark '+name);
  assert.ok(install.includes(name),'missing light '+name);
 }
});
