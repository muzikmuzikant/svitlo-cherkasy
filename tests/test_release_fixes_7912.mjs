import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolvePublicMessage} from '../push-server/public-message.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const q='6.1',day={date:'2026-10-19',verified:true,publishedAt:'2026-10-18T19:00:00+03:00',
 source:'https://www.cherkasyoblenergo.com/news',
 queues:{'6.1':{off:[['10:00','12:00']]},'2.1':{off:[['14:00','15:00']]}}};
const change={date:day.date,queues:['6.1'],revisionId:'revision_45',publishedAt:'2026-10-18T20:00:00+03:00'};
const ctx={schedule:{days:[day],changes:[change]},announcements:[{id:'welcome_2026',active:true,queue:'2.1',title:'Важливо',
 icon:'📢',body:'Тест',content:'Розгорнутий текст',publishedAt:'2026-10-18T19:00:00+03:00'}],emergencies:[]};
test('shared verified day message resolves regardless of receiver primary queue',()=>{
 const r=resolvePublicMessage('day:6.1:2026-10-19',ctx);
 assert.equal(r.id,'day:6.1:2026-10-19');
 assert.match(r.content,/10:00/);
 assert.equal(r.authoritative,true);
 assert.equal(resolvePublicMessage('day:6.1:2026-10-20',ctx),null);
 assert.equal(resolvePublicMessage('day:6.1:2026-10-19:fake',ctx),null);
});
test('shared schedule change restores the verified exact revision, not a fabricated alert',()=>{
 const r=resolvePublicMessage('change:6.1:2026-10-19:revision_45',ctx);
 assert.equal(r.kind,'schedule');assert.match(r.body,/6.1/);
 assert.equal(resolvePublicMessage('change:6.1:2026-10-19:fake',ctx),null);
 assert.equal(resolvePublicMessage('change:2.1:2026-10-19:revision_45',ctx),null);
});
test('direct notice link loads even when recipient belongs to a different queue',()=>{
 const r=resolvePublicMessage('notice:welcome_2026',ctx);
 assert.equal(r.title,'📢 Важливо');
 assert.equal(r.body,'Тест');
 assert.equal(resolvePublicMessage('notice:missing_2026',ctx),null);
 assert.equal(resolvePublicMessage('notice:welcome_2026',{...ctx,announcements:[]}),null);
});
test('transition link must match verified hours, not arbitrary claims',()=>{
 const off=resolvePublicMessage('transition:6.1:2026-10-19:600:off',ctx);
 assert.match(off.title,/Відключення/);
 assert.match(resolvePublicMessage('transition:6.1:2026-10-19:720:on',ctx).title,/Відновлення/);
 assert.equal(resolvePublicMessage('transition:6.1:2026-10-19:601:off',ctx),null);
});
test('reject unverified and unsafe fake message links',()=>{
 assert.equal(resolvePublicMessage('notice:../../index.html',ctx),null);
 assert.equal(resolvePublicMessage('push:unexpected',ctx),null);
 assert.equal(resolvePublicMessage('day:6.1:2026-10-19',{...ctx,schedule:{days:[],changes:[]}}),null);
});
test('Sunday tomorrow navigates to next Monday and offers a clear return',()=>{
 const app=read('app.js'),html=read('index.html');
 assert.match(app,/const requested=weekStart\(date\),canVisitNext=/);
 assert.match(app,/const canPreviewNext=tomorrowMonday!==currentMonday/);
 assert.match(app,/root\.disabled=!queue;/);
 assert.match(app,/tomorrowLink\.disabled=!queue/);
 assert.match(html,/id="weekBackControl"/);assert.match(html,/id="weekForwardControl"/);
 const begin=app.indexOf('function weekStart(date)'),end=app.indexOf('const currentDay=',begin);
 const from=app.indexOf('function nextChangeLabel('),to=app.indexOf('function statusCopy(',from);
 assert.ok(begin>=0&&end>begin&&from>=0&&to>from);
 let current='2026-10-18',view=null;
 const shiftDay=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const vmctx=vm.createContext({today:()=>current,shiftDay,formatDate:d=>d,clock:n=>String(n),renderDetail(){view=vmctx.daySelected},dayStripStart:null,daySelected:null});
 vm.runInContext(app.slice(begin,end)+'\n'+app.slice(from,to),vmctx);
 vmctx.showDay('2026-10-19');
 assert.equal(view,'2026-10-19');assert.equal(vmctx.dayStripStart,'2026-10-19');
 vmctx.showDay('2026-10-18');assert.equal(view,'2026-10-18');
 current='2026-10-19';vmctx.showDay('2026-10-18');
 assert.equal(view,'2026-10-19');assert.equal(vmctx.dayStripStart,'2026-10-19');
});
test('operator silence is still light-all-day, explicitly unchanged',()=>{
 const app=read('app.js');
 assert.match(app,/if\(!day\)\{[\s\S]*?return isOfflineMode\(\)\?null:new Int8Array\(1440\);/);
 assert.match(app,/unknownOffline\?'Немає збереженого графіка':'Світло весь день'/);
});
