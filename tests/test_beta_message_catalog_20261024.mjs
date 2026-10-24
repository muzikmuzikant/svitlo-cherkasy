import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {noticeDisplayTitle} from '../push-server/notification-copy.js';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('one emoji prefix is shared between Push and Inbox',()=>{
 assert.equal(noticeDisplayTitle({title:'Новини',kind:'important',icon:'📣'}),'📣 Новини');
 assert.equal(noticeDisplayTitle({title:'📣 Новини',kind:'important',icon:'📣'}),'📣 Новини');
 assert.equal(noticeDisplayTitle({title:'⚠️ Аварійно',kind:'emergency'}),'⚠️ Аварійно');
 assert.match(read('push-server/admin.js'),/noticeDisplayTitle\(entry\)/);
 assert.match(read('push-server/server.js'),/noticeDisplayTitle\(notice\)/);
 assert.match(read('push-server/public-message.js'),/noticeDisplayTitle\(notice\)/);
 assert.match(read('inbox-ui.js'),/copy\.noticeDisplayTitle\(a\)/);
 assert.match(read('admin-control.js'),/displayNoticeTitle\(\)/);
});
test('rich messages render semantic Markdown using safe DOM nodes',()=>{
 class Node{constructor(tag,content=''){this.tagName=tag;this.children=[];this.textContent=content}append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this.children=nodes}}
 const created=[];const document={createElement(tag){const node=new Node(tag);created.push(node);return node},createTextNode(text){return new Node('#text',text)}};
 class URLStub{constructor(value){this.href=value;this.protocol=value.startsWith('https://')?'https:':'http:';this.username='';this.password=''}}
 const context={document,URL:URLStub};
 vm.runInNewContext(read('message-format.js'),context);
 const root=new Node('root');
 context.SvitloMessageFormat.render(root,'## Назва\n**жирний** *курсив* `код`\n1. Перший\n2. Другий\n> Цитата\n---\n[сайт](https://example.com)\n<img src=x>');
 for(const tag of ['h3','strong','em','code','ol','li','blockquote','hr','a'])assert.ok(created.some(node=>node.tagName===tag),tag);
 assert.equal(created.some(node=>node.tagName==='img'),false);
 assert.ok(root.children.some(node=>node.children?.some(child=>child.textContent==='<img src=x>')));
 assert.match(read('scripts/build_pages.py'),/'message-format\.js'/);
});
test('all catalog addresses can be selected without overwriting source data',()=>{
 const code=read('admin-address.js');
 assert.match(code,/Object\.entries\(idx\.keys\|\|\{\}\)/);
 assert.match(code,/Object\.entries\(idx\.streets\|\|\{\}\)/);
 assert.match(code,/\.slice\(0,limit\)/);
 assert.match(code,/expectedRevision/);
 assert.match(code,/confirmSourceReviewed=true/);
 assert.match(read('admin.html'),/id="corrBrowseTown"/);
});
test('new required support fields have a visible red mandatory marker',()=>{
 assert.match(read('feedback.js'),/extra-ticket-required/);
 assert.match(read('feedback.css'),/\.extra-ticket-required\{color:#dc354f/);
 assert.match(read('inbox-ui.js'),/inboxSort/);
 assert.match(read('index.html'),/id="inboxSearch"/);
});
