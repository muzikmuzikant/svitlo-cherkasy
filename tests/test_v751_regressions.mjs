import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {validateAppConfig,createAppConfig} from '../push-server/app-config.js';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const base=()=>({maintenance:{enabled:false,title:'Технічні роботи застосунку',
 message:'Оновлюємо функції та скоро повернемося.'},announcements:[]});
const notice=(overrides={})=>({id:'notice001',title:'Зміни',body:'Розклад оновлено.',
 kind:'info',active:true,pinned:true,content:'**Докладніше**',images:[],...overrides});

test('plain titles and emoji-free messages can publish, edit, unpin and unpublish',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-751-'));
 try{
  const store=createAppConfig({directory:dir});
  store.update({...base(),announcements:[notice({title:'Текст без емодзі'})]});
  assert.equal(store.publicState().announcements[0].title,'Текст без емодзі');
  store.update({...base(),announcements:[notice({title:'Редаговано',pinned:false})]});
  assert.equal(store.publicState().announcements[0].pinned,false);
  store.update({...base(),announcements:[notice({title:'Редаговано',pinned:false,active:false})]});
  assert.equal(store.publicState().announcements.length,0);
  store.update({...base(),announcements:[]});
  assert.equal(store.get().announcements.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('blank unsent drafts persist; published items require a title and body',()=>{
 const draft=validateAppConfig({...base(),announcements:[notice({title:'',body:'',active:false})]});
 assert.equal(draft.announcements[0].title,'');
 assert.throws(()=>validateAppConfig({...base(),announcements:[notice({title:'',active:true})]}));
 assert.throws(()=>validateAppConfig({...base(),announcements:[notice({body:'',active:true})]}));
});

test('notification cache follows server authority: updates, unpins, hides and deletes',async()=>{
 const memory=new Map(),window={
  localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,val)=>memory.set(key,val)}
 };
 const context={window,self:window,URL,Date,console};
 vm.runInNewContext(read('notification-center.js'),context);
 const inbox=window.SvitloInbox;
 await inbox.add({id:'notice:notice001',title:'Нове',body:'Початковий текст',
  content:'Повний текст',kind:'announcement',pinned:true,authoritative:true,at:new Date().toISOString()});
 await inbox.mark(['notice:notice001']);
 await inbox.add({id:'notice:notice001',title:'Нова редакція',body:'Тепер інакше',
  content:'Змінено',kind:'announcement',pinned:false,images:[],authoritative:true,at:new Date().toISOString()});
 let rows=await inbox.all();
 assert.equal(rows.length,1);
 assert.equal(rows[0].title,'Нова редакція');
 assert.equal(rows[0].pinned,false);
 assert.equal(rows[0].content,'Змінено');
 assert.equal(rows[0].read,true);
 await inbox.reconcileAnnouncements(['notice:notice001']);
 assert.equal((await inbox.all()).length,1);
 await inbox.reconcileAnnouncements([]);
 assert.equal((await inbox.all()).length,0);
});

test('system Push must not replace a richer version of the same notice',async()=>{
 const memory=new Map(),window={localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,val)=>memory.set(key,val)}};
 vm.runInNewContext(read('notification-center.js'),{window,self:window,URL,Date,console});
 const inbox=window.SvitloInbox;
 await inbox.add({id:'notice:abc001',title:'Повне',body:'Докладний текст',content:'Текст з деталями',
  images:['https://example.org/photo.png'],kind:'announcement',pinned:true,authoritative:true});
 await inbox.add({id:'notice:abc001',title:'Короткий Push',body:'Коротко',kind:'announcement'});
 const [x]=await inbox.all();
 assert.equal(x.content,'Текст з деталями');
 assert.equal(x.images.length,1);
 assert.equal(x.pinned,true);
});

test('admin CSS never shows panels with hidden attribute or stacks overview siblings into one cell',()=>{
 const css=read('admin-control.css');
 assert.match(css,/#adminDashboard \[data-admin-panel\]\[hidden\]/);
 assert.match(css,/display:none!important/);
 assert.match(css,/#adminDashboard>\[data-admin-panel\]:not\(\[hidden\]\)\{grid-column:2!important;grid-row:auto!important/);
 assert.match(css,/grid-template-columns:minmax\(185px,220px\) minmax\(0,1fr\)/);
});

test('active PWA gets admin updates without exit/reenter; restored options links work',()=>{
 const mode=read('site-mode.js'),admin=read('admin-control.js'),app=read('app.js');
 assert.match(mode,/setInterval\(\(\)=>\{if\(!document.hidden\)refresh\(\)\},12000\)/);
 assert.match(mode,/svitlo-content-v1/);
 assert.match(admin,/new BroadcastChannel\('svitlo-content-v1'\)/);
 assert.match(app,/SCREEN_RETURN/);
 assert.match(app,/requestedScreen==='settings'/);
 assert.match(read('help.html'),/index\.html\?screen=settings/);
 assert.match(read('feedback.html'),/index\.html\?screen=settings/);
});

test('all empty published dates render as green days without modifying official data files',()=>{
 const app=read('app.js');
 assert.match(app,/if\(!day\)\{[\s\S]*?return new Int8Array\(1440\)/);
 assert.match(app,/Графік не опубліковано · світло весь день за замовчуванням/);
 assert.match(app,/Графік не опубліковано\. За замовчуванням позначено світло весь день/);
 assert.match(app,/currentDay\(date\)/);
});

test('shared schedule is a 24-pill graphic with readable hour cells',()=>{
 const app=read('app.js');
 assert.match(app,/canvas\.width=1080;canvas\.height=1880/);
 assert.match(app,/for\(let hour=0;hour<24;hour\+\+\)/);
 assert.match(app,/const colors=\{/);
 assert.match(app,/round\(x,y,cellW,cellH,24,colors\.bg\)/);
 assert.match(app,/canvas\.toBlob\(resolve,'image\/png'\)/);
});

test('all changed client scripts parse and app version is consistent',()=>{
 for(const file of ['app.js','admin-control.js','inbox-ui.js','site-mode.js','notification-center.js','admin-dashboard.js','install.js','sw.js'])
  assert.doesNotThrow(()=>new Function(read(file)),file);
 const version=JSON.parse(read('release.json')).version;
 assert.equal(version,'7.5.1');
 assert.match(read('sw.js'),new RegExp('svitlo-cherkasy-shell-v'+version.replaceAll('.','\\.') ));
 assert.match(read('index.html'),/name="svitlo-version" content="7\.5\.1"/);
});
