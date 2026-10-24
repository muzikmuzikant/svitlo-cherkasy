import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createAppConfig} from '../push-server/app-config.js';
import {cleanMessage} from '../push-server/manual-push.js';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('Inbox dropdown elevates active card and its auto-group above sibling notifications',()=>{
 const inbox=read('inbox-ui.js'),css=read('style.css');
 assert.match(inbox,/menu\.addEventListener\('toggle'/);
 assert.match(inbox,/card\.classList\.toggle\('has-open-context',open\)/);
 assert.match(inbox,/group\.classList\.toggle\('has-open-context'/);
 assert.match(inbox,/root\.querySelectorAll\('\.inbox-context\[open\]'\)/);
 assert.match(inbox,/menu\.classList\.toggle\('opens-up'/);
 assert.match(css,/#updates \.inbox-item\.has-open-context\{[^}]*z-index:110/);
 assert.match(css,/#updates \.inbox-auto-group\.has-open-context\{z-index:100/);
 assert.match(css,/\.inbox-context\.opens-up \.inbox-context-actions/);
});

test('long Inbox detail scroll cannot start swipe-to-dismiss, but dedicated handle can',()=>{
 const listeners=new Map();
 class Element{}
 const dialog=new Element(),content=new Element(),handle=new Element();
 const clazz=()=>({add(){},remove(){},contains(){return false}});
 dialog.open=true;
 dialog.scrollTop=850;dialog.scrollHeight=1800;dialog.clientHeight=720;
 dialog.clientHeight=720;dialog.contains=()=>true;
 dialog.matches=selector=>selector.includes('.inbox-detail');
 dialog.classList=clazz();dialog.style={setProperty(){},removeProperty(){},transform:''};
 dialog.addEventListener=(type,fn)=>listeners.set(type,fn);
 content.closest=selector=>selector.includes('.inbox-detail-content')?content:null;
 handle.closest=selector=>selector.includes('.inbox-drag-handle')?handle:null;
 const win={matchMedia:()=>({matches:false})},doc={readyState:'complete',querySelectorAll:()=>[],
  documentElement:{classList:clazz()}};
 vm.runInNewContext(read('bottom-sheet.js'),{window:win,document:doc,Element,WeakMap,Math,Array,
  setTimeout,clearTimeout,Event:class Event{constructor(type){this.type=type}}});
 let dismissed=0;
 win.SvitloSheetMotion.bind(dialog,()=>{dismissed++});
 const touch=(start,target,y,t)=>({
  touches:[{identifier:3,clientX:100,clientY:y}],
  changedTouches:[{identifier:3,clientX:100,clientY:y}],
  timeStamp:t,target,cancelable:true,preventDefault(){}
 });
 // The content has been scrolled to its bottom. Dragging down should scroll toward the top.
 listeners.get('touchstart')(touch(true,content,140,100));
 listeners.get('touchmove')(touch(false,content,285,180));
 listeners.get('touchend')(touch(false,content,285,200));
 assert.equal(dismissed,0,'message body scroll should not close detail');
 assert.equal(dialog.style.transform,'');
 // Header/grabber gesture remains deliberately available.
 dialog.scrollTop=0;
 listeners.get('touchstart')(touch(true,handle,105,300));
 listeners.get('touchmove')(touch(false,handle,260,360));
 listeners.get('touchend')(touch(false,handle,260,380));
 assert.equal(dismissed,1,'swipe on grabber should dismiss');
});

test('notice accepts 20k rich characters, 500 preview, rejecting excess; Push mirrors 500',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-notice-limits-'));
 try{
  const store=createAppConfig({directory:dir}),config=store.get();
  const notice={id:'n_ABC12345',title:'Детальне повідомлення',body:'б'.repeat(500),
   content:'п'.repeat(20000),active:true,delivery:'inbox'};
  config.announcements=[notice];
  const saved=store.update(config);
  assert.equal(saved.announcements[0].body.length,500);
  assert.equal(saved.announcements[0].content.length,20000);
  assert.equal(createAppConfig({directory:dir}).get().announcements[0].content.length,20000);
  assert.throws(()=>store.update({...config,announcements:[{...notice,body:'б'.repeat(501)}]}));
  assert.throws(()=>store.update({...config,announcements:[{...notice,content:'п'.repeat(20001)}]}));
  assert.equal(cleanMessage({title:'Тест',body:'а'.repeat(500)}).body.length,500);
  assert.throws(()=>cleanMessage({title:'Тест',body:'а'.repeat(501)}));
  assert.match(read('notification-center.js'),/content:String\(item.content\|\|''\)\.slice\(0,20000\)/);
  assert.match(read('admin.html'),/id="opsNoticeContent"[^>]*maxlength="20000"/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
