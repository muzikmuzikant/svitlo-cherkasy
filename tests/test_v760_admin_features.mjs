import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAppConfig,validateAppConfig} from '../push-server/app-config.js';
import {createManualPush} from '../push-server/manual-push.js';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const input=()=>({schemaVersion:1,maintenance:{
 enabled:false,title:'Технічні роботи застосунку',message:'Зараз ми оновлюємо деякі розділи застосунку.'
},announcements:[]});
test('legacy site config survives and receives safe editable defaults',()=>{
 const normalized=validateAppConfig(input());
 assert.equal(normalized.site.flags.inbox,true);
 assert.equal(normalized.site.flags.sharing,true);
 assert.match(normalized.site.links.help,/help\.html/);
 assert.equal(normalized.maintenance.colors.background,'#143463');
 assert.equal(normalized.maintenance.noticeBefore,true);
});
test('custom maintenance palette, advance notice and paused modules persist through Railway volume restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-760-'));
 try{
  const state=input();
  state.maintenance={...state.maintenance,theme:'custom',enabled:false,noticeBefore:true,
   colors:{background:'#123abc',foreground:'#ffeeee',accent:'#44ee77'},
   disabledModules:['inbox','address-search','help']};
  state.site={links:{help:'./help.html?from=settings',feedback:'./feedback.html?from=settings',
    official:'https://www.cherkasyoblenergo.com/news'},flags:{inbox:false,sharing:false,help:true},
    banner:{enabled:true,title:'Нова версія застосунку',body:'Додали багато нових функцій',button:'Детальніше',url:'./help.html'}};
  const store=createAppConfig({directory:dir});
  store.update(state);
  const restarted=createAppConfig({directory:dir}),published=restarted.publicState();
  assert.equal(published.site.banner.title,'Нова версія застосунку');
  assert.equal(published.site.flags.inbox,false);
  assert.equal(published.maintenance.theme,'custom');
  assert.equal(published.maintenance.colors.background,'#123abc');
  assert.deepEqual(published.maintenance.disabledModules,['inbox','address-search','help']);
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
});
test('reject injected script links or unknown disabled modules',()=>{
 const bad={...input(),site:{links:{help:'javascript:alert(1)'}}};
 assert.throws(()=>validateAppConfig(bad),/Посилання/);
 assert.throws(()=>validateAppConfig({...input(),maintenance:{...input().maintenance,disabledModules:['payment-security']}}),/модуль/);
});
test('previous content and settings revisions are recorded to volume but never returned publicly',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-history-'));
 try{
  const store=createAppConfig({directory:dir});
  store.update({...input(),announcements:[{id:'notice_abcdef',title:'Перший заголовок',body:'Початкова інформація',active:true}]});
  store.update({...input(),announcements:[{id:'notice_abcdef',title:'Змінений заголовок',body:'Нове пояснення для читача',active:true}]});
  assert.equal(store.historyView().length,1);
  assert.equal(store.historyView()[0].active,1);
  assert.equal(JSON.stringify(store.publicState()).includes('history'),false);
  const restarted=createAppConfig({directory:dir});
  assert.equal(restarted.historyView().length,1);
  assert.equal(restarted.get().announcements[0].title,'Змінений заголовок');
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
});
test('test Push delivers ONLY to endpoint on the current device and rejects broadcasting',async()=>{
 const deliveries=[];
 const subscribers={device1:{subscription:{endpoint:'https://web.push.apple.com/a'},queue:'1.1'},
  device2:{subscription:{endpoint:'https://web.push.apple.com/b'},queue:'1.2'}};
 const manual=createManualPush({subscribers,webpush:{async sendNotification(subscription,payload){
  deliveries.push({endpoint:subscription.endpoint,payload:JSON.parse(payload)});
 }},appUrl:'https://svitlo-cherkasy.pp.ua',hash:x=>x,save(){}});
 const result=await manual.preview({title:'Тестова назва',body:'Короткий текст для мене',
  endpoint:'https://web.push.apple.com/a'});
 assert.equal(result.accepted,1);
 assert.deepEqual(deliveries.map(x=>x.endpoint),['https://web.push.apple.com/a']);
 await assert.rejects(()=>manual.preview({title:'Тестова назва',body:'Для всіх',endpoint:'https://web.push.apple.com/a',confirmAll:true}));
});
test('server roles require an authenticated session and owner-only dangerous operations',()=>{
 const server=read('push-server/admin.js');
 for(const word of ['EDITOR_PASSWORD','OPERATOR_PASSWORD','VIEWER_PASSWORD','Недостатньо прав',
  "role==='viewer'","role==='editor'","role==='operator'","role==='owner'"])assert.ok(server.includes(word),word);
 assert.match(server,/role!=='owner'/);
 assert.match(server,/validateAppConfig\(body\)/);
 assert.match(server,/push\.preview/);
});
test('site settings, features and previews are accessible in CMS and client',()=>{
 const admin=read('admin.html'),site=read('site-mode.js'),editor=read('admin-control.js'),styles=read('style.css');
 for(const id of ['opsLinkHelp','opsLinkFeedback','opsLinkOfficial','opsFlagInbox','opsFlagSharing','opsFlagHelp',
 'opsBannerTitle','opsBannerBody','opsBannerActive','opsBannerButton','opsColorBackground',
 'opsColorForeground','opsColorAccent','opsMaintenanceWarn','opsHistoryList','opsPreviewFull','opsTestNotice'])
  assert.match(admin,new RegExp('id="'+id+'"'));
 for(const key of ['applySite(site)','applyLimitedModules(m,active)','systemBanner','serverVerified:true',
  "data-managed-link","m.noticeBefore!==false"])assert.ok(site.includes(key)||site.includes(key.replaceAll('"','\\\"')),key);
 assert.match(site,/window\.SvitloPublicConfig/);
 assert.match(editor,/getSite\(\)/);
 assert.match(editor,/renderFormatted\(/);
 assert.match(editor,/api\('notices\/test'/);
 assert.match(styles,/maintenance-screen\[data-theme="custom"\]/);
});
test('managed controls do not alter official schedule data or change blank drafts',()=>{
 const server=read('push-server/app-config.js');
 assert.match(server,/site:defaultSite\(\)/);
 assert.match(server,/announcements:state\.announcements\.filter/);
 assert.equal(validateAppConfig({...input(),announcements:[{id:'empty_draft1',title:'',body:'',active:false}]}).announcements[0].active,false);
});
