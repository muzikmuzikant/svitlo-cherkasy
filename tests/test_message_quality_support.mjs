import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {validateAppConfig} from '../push-server/app-config.js';
import {resolvePublicMessage} from '../push-server/public-message.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('message text keeps complete emoji graphemes at the storage boundary',()=>{
 const family='👨‍👩‍👧‍👦';
 const config=validateAppConfig({maintenance:{title:'Сервіс працює',message:'Повідомлення для користувачів сервісу'},
  announcements:[{id:'notice_01',title:'A'.repeat(89)+family,body:'B'.repeat(499)+family,
   content:'Текст '+family,source:'https://www.cherkasyoblenergo.com/news/test',active:true}]});
 const notice=config.announcements[0];
 assert.ok(notice.title.endsWith(family));
 assert.ok(notice.body.endsWith(family));
 assert.equal(notice.source,'https://www.cherkasyoblenergo.com/news/test');
});

test('persisted Inbox messages do not split emoji graphemes when limiting text',()=>{
 const context={self:{},URL,Intl};
 vm.runInNewContext(read('notification-center.js'),context);
 const family='👨‍👩‍👧‍👦';
 const normalized=context.self.SvitloInbox.normalize({id:'notice:test',title:'A'.repeat(99)+family,body:'ok',content:'ok',kind:'announcement'});
 assert.ok(normalized.title.endsWith(family));
});

test('public notice resolves its configured external source URL',()=>{
 const message=resolvePublicMessage('notice:notice_01',{announcements:[{
  id:'notice_01',active:true,title:'Оновлення',body:'Текст',source:'https://www.cherkasyoblenergo.com/news/test'
 }]});
 assert.equal(message.url,'https://www.cherkasyoblenergo.com/news/test');
});

test('Inbox never labels an application homepage as an official source',()=>{
 const inbox=read('inbox-ui.js');
 assert.match(inbox,/u\.origin!==location\.origin/);
 assert.match(inbox,/url:a\.source\|\|a\.url/);
 assert.doesNotMatch(inbox,/u\.origin===location\.origin/);
});

test('home top bar links directly to the existing support center',()=>{
 const html=read('index.html');
 assert.match(html,/id="supportTop" href="\\.\\/support-project\\.html"/);
 assert.match(html,/aria-label="Підтримати проєкт"/);
 assert.match(read('style.css'),/\.topbar-actions/);
});

test('official schedule history gives its first item a top gap',()=>{
 assert.match(read('inbox-refresh.css'),/\.inbox-history \.update-list\{margin-top:10px\}/);
});
