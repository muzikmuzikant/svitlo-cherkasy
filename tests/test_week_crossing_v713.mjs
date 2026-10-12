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
const first=code.indexOf('function nextChangeLabel('),last=code.indexOf('function statusCopy(',first);
const ctx=vm.createContext({today:()=> '2026-10-11', shiftDay, formatDate:d=>d, clock:n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`,renderDetail(){}});
vm.runInContext(code.slice(first,last)+';this.helpers={stripDates,stripContains,weekdayShort,nextChangeLabel,showDay,shiftDayStrip};',ctx);
const h=ctx.helpers;
test('Sunday 11 Oct displays Monday 12 Oct in same rolling seven-day strip',()=>{
 const dates=Array.from(h.stripDates('2026-10-11'));
 assert.deepEqual(dates,['2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17']);
 assert.equal(h.weekdayShort('2026-10-11'),'Нд');assert.equal(h.weekdayShort('2026-10-12'),'Пн');
 assert.equal(h.stripContains('2026-10-11','2026-10-12'),true);
});
test('Tomorrow quick-access changes the selected date, even over Sunday',()=>{
 vm.runInContext("dayStripStart='2026-10-11';daySelected='2026-10-11';",ctx);
 h.showDay('2026-10-12');
 assert.equal(vm.runInContext('daySelected',ctx),'2026-10-12');
 assert.equal(vm.runInContext('dayStripStart',ctx),'2026-10-11');
 h.shiftDayStrip(1);
 assert.equal(vm.runInContext('dayStripStart',ctx),'2026-10-18');
 assert.equal(vm.runInContext('daySelected',ctx),'2026-10-18');
});
test('Nearest change labels next-week Monday as tomorrow, not hidden by week boundary',()=>{
 assert.equal(h.nextChangeLabel({time:300,date:'2026-10-12',dayOffset:1}), '05:00 завтра');
 assert.match(code,/const next=nxt;/);
 assert.match(html,/id="weekPrev"/);assert.match(html,/id="dayTomorrow"/);
 assert.match(code,/nextChange\(today\(\),a.queue,nowMinutes\(\)\)/);
});
test('Railway Cron polls every five minutes without waiting for GitHub Pages',()=>{
 const wf=readFileSync(join(root,'.github/workflows/update.yml'),'utf8');
 const cron=readFileSync(join(root,'scripts/railway_schedule_cron.py'),'utf8');
 const docs=readFileSync(join(root,'RAILWAY_SCHEDULES.md'),'utf8');
 assert.doesNotMatch(wf,/^  schedule:/m);
 assert.match(wf,/workflow_dispatch:/);
 assert.match(cron,/--schedules-only/);
 assert.match(cron,//api/internal/schedules/);
 assert.match(docs,/\*\/5 \* \* \* \*/);
});
