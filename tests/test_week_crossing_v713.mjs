import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const code=readFileSync(join(root,'app.js'),'utf8');
const html=readFileSync(join(root,'index.html'),'utf8');
const shiftDay=(d,n)=>{const date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)};
let current='2026-10-17';
const ctx=vm.createContext({today:()=>current,shiftDay,formatDate:d=>d,clock:n=>String(n),renderDetail(){},normalizeData:x=>x});
const from=code.indexOf('function weekStart(date)'),end=code.indexOf('const currentDay=',from);
const stripFrom=code.indexOf('function nextChangeLabel('),stripTo=code.indexOf('function statusCopy(',stripFrom);
assert.ok(from>=0&&end>from&&stripFrom>=0&&stripTo>stripFrom);
vm.runInContext(code.slice(from,end)+'\n'+code.slice(stripFrom,stripTo)+'\nthis.helpers={stripDates,stripContains,weekdayShort,showDay,weekStart,retainWeeklySchedules,weekAllowed,nextChangeLabel};',ctx);
const h=ctx.helpers;

test('Saturday retains the current Mon-Sun and seven weekday labels',()=>{
 assert.deepEqual(Array.from(h.stripDates()),[
  '2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
 assert.deepEqual(Array.from(h.stripDates().map(h.weekdayShort)),['Пн','Вт','Ср','Чт','Пт','Сб','Нд']);
});
test('Sunday 00:00: seven weekday labels show next Mon-Sat and current Sunday',()=>{
 current='2026-10-18';
 assert.deepEqual(Array.from(h.stripDates()),[
  '2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-18']);
 assert.deepEqual(Array.from(h.stripDates().map(h.weekdayShort)),['Пн','Вт','Ср','Чт','Пт','Сб','Нд']);
 assert.equal(h.weekAllowed('2026-10-17'),false,'previous Saturday schedule is purged');
 assert.equal(h.weekAllowed('2026-10-18'),true,'current Sunday schedule is preserved');
 assert.equal(h.weekAllowed('2026-10-19'),true,'next Monday schedule survives');
 assert.equal(h.weekAllowed('2026-10-24'),true,'next Saturday schedule survives');
 assert.equal(h.weekAllowed('2026-10-25'),true,'next Sunday publication can be retained');
 assert.doesNotMatch(html,/id="weekBackControl"|id="weekForwardControl"|id="weekPrev"|id="weekNext"/);
 const style=readFileSync(join(root,'style.css'),'utf8');
 assert.match(style,/\.days-row\.fixed-weekdays\{display:grid;grid-template-columns:repeat\(7,/);
 assert.doesNotMatch(style,/\.days-row\.fixed-weekdays\.sunday-cutover/);
 h.showDay('2026-10-12');assert.equal(vm.runInContext('daySelected',ctx),'2026-10-18','past Monday is not selectable');
 h.showDay('2026-10-18');assert.equal(vm.runInContext('daySelected',ctx),'2026-10-18');
 h.showDay('2026-10-19');assert.equal(vm.runInContext('daySelected',ctx),'2026-10-19');
 h.showDay('2026-10-24');assert.equal(vm.runInContext('daySelected',ctx),'2026-10-24');
});
test('Monday 00:00 restores usual Mon-Sun automatically without previous Sunday',()=>{
 current='2026-10-19';
 assert.deepEqual(Array.from(h.stripDates()),['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
 assert.equal(h.weekAllowed('2026-10-18'),false);
 h.showDay('2026-10-18');assert.equal(vm.runInContext('daySelected',ctx),'2026-10-19');
});
test('verified day snapshots and old revisions are pruned at Sunday then Monday',()=>{
 current='2026-10-17';
 const old={lastChecked:'2026-10-17T10:00:00+03:00',days:[
  {date:'2026-10-12',verified:true,queues:{'1.1':{off:[['10:00','12:00']]}}},
  {date:'2026-10-16',verified:true,queues:{}},
  {date:'2026-10-18',verified:true,queues:{'1.1':{off:[['11:00','13:00']]}}},
  {date:'2026-10-19',verified:true,queues:{'1.1':{off:[['15:00','16:00']]}}}],changes:[
  {date:'2026-10-12',revisionId:'old'},{date:'2026-10-18',revisionId:'sunday'}]};
 const saturday=h.retainWeeklySchedules({lastChecked:'2026-10-17T11:00:00+03:00',days:[],changes:old.changes},old);
 assert.deepEqual(Array.from(saturday.days.map(d=>d.date)),['2026-10-12','2026-10-16','2026-10-18','2026-10-19']);
 current='2026-10-18';
 const sunday=h.retainWeeklySchedules({...saturday,lastChecked:'2026-10-18T00:00:00+03:00'},saturday);
 assert.deepEqual(Array.from(sunday.days.map(d=>d.date)),['2026-10-18','2026-10-19']);
 assert.deepEqual(Array.from(sunday.changes.map(c=>c.date)),['2026-10-18']);
 current='2026-10-19';
 const monday=h.retainWeeklySchedules({...sunday,lastChecked:'2026-10-19T00:00:00+03:00'},sunday);
 assert.deepEqual(Array.from(monday.days.map(d=>d.date)),['2026-10-19']);
 assert.deepEqual(Array.from(monday.changes),[]);
});
test('Sunday cache retains published next-week Friday and Sunday without old weekdays',()=>{
 current='2026-10-18';
 const old={lastChecked:'2026-10-18T00:00:00+03:00',days:[
  {date:'2026-10-12',verified:true,queues:{}},
  {date:'2026-10-18',verified:true,queues:{}},
  {date:'2026-10-19',verified:true,queues:{}},
  {date:'2026-10-23',verified:true,queues:{}},
  {date:'2026-10-25',verified:true,queues:{}}]};
 const got=h.retainWeeklySchedules({...old},old);
 assert.deepEqual(Array.from(got.days.map(d=>d.date)),['2026-10-18','2026-10-19','2026-10-23','2026-10-25']);
});
test('next-day captions work without any week controls',()=>{
 current='2026-10-18';
 assert.equal(h.nextChangeLabel({time:300,date:'2026-10-19',dayOffset:1}),'300 завтра');
});
