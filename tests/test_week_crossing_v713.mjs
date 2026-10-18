import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const code=readFileSync(join(root,'app.js'),'utf8');
const html=readFileSync(join(root,'index.html'),'utf8');
function shiftDay(d,n){const date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)}
let current='2026-10-18';
const ctx=vm.createContext({today:()=>current,shiftDay,formatDate:d=>d,clock:n=>String(n),renderDetail(){},normalizeData:x=>x});
const from=code.indexOf('function weekStart(date)'),end=code.indexOf('const currentDay=',from);
const stripFrom=code.indexOf('function nextChangeLabel('),stripTo=code.indexOf('function statusCopy(',stripFrom);
assert.ok(from>=0&&end>from&&stripFrom>=0&&stripTo>stripFrom);
vm.runInContext(code.slice(from,end)+'\n'+code.slice(stripFrom,stripTo)+'\nthis.helpers={stripDates,stripContains,weekdayShort,showDay,weekStart,retainWeeklySchedules,nextChangeLabel};',ctx);
const h=ctx.helpers;
test('Sunday shows exactly Mon-Sun, labels have weekdays and no numbers in pills',()=>{
 assert.deepEqual(Array.from(h.stripDates('2026-10-18')),[
  '2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
 assert.deepEqual(Array.from(h.stripDates().map(h.weekdayShort)),['Пн','Вт','Ср','Чт','Пт','Сб','Нд']);
 assert.match(html,/id="days"/);
 assert.doesNotMatch(html,/id="weekPrev"|id="weekNext"|id="weekRange"|id="dayToday"|id="dayTomorrow"/);
 assert.equal(code.includes("b.append(el('b'"),false);
});
test('Monday midnight changes the entire visible week, previous dates cannot be reselected',()=>{
 current='2026-10-19';
 assert.deepEqual(Array.from(h.stripDates()),['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
 assert.equal(h.stripContains('2026-10-19','2026-10-18'),false);
 h.showDay('2026-10-18');
 assert.equal(vm.runInContext('daySelected',ctx),'2026-10-19');
 h.showDay('2026-10-23');
 assert.equal(vm.runInContext('daySelected',ctx),'2026-10-23');
});
test('Officially published previous days survive within week and expire next Monday',()=>{
 current='2026-10-18';
 const old={lastChecked:'2026-10-17T10:00:00+03:00',days:[
  {date:'2026-10-12',verified:true,queues:{'1.1':{off:[['10:00','12:00']]}}},
  {date:'2026-10-16',verified:true,queues:{}}]};
 const fresh={lastChecked:'2026-10-18T11:00:00+03:00',days:[{date:'2026-10-18',verified:true,queues:{}}]};
 const kept=h.retainWeeklySchedules(fresh,old);
 assert.deepEqual(Array.from(kept.days.map(x=>x.date)),['2026-10-12','2026-10-16','2026-10-18']);
 current='2026-10-19';
 const next=h.retainWeeklySchedules({days:[],lastChecked:'2026-10-19T00:01:00+03:00'},kept);
 assert.deepEqual(Array.from(next.days),[]);
});
test('Next-day event labels can refer to Monday without displaying another week',()=>{
 assert.equal(h.nextChangeLabel({time:300,date:'2026-10-19',dayOffset:1}),'300 завтра');
});
