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
function weekStart(date){const wd=new Date(date+'T12:00:00Z').getUTCDay();return shiftDay(date,-((wd+6)%7))}
function harness(date){
 let selected=null;
 const ctx=vm.createContext({today:()=>date,weekStart,shiftDay,formatDate:d=>d,
  clock:n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`,
  renderDetail(){selected=ctx.daySelected},daySelected:null});
 const first=code.indexOf('function nextChangeLabel('),last=code.indexOf('function statusCopy(',first);
 assert.ok(first>=0&&last>first);
 vm.runInContext(code.slice(first,last)+';this.helpers={stripDates,stripContains,weekdayShort,nextChangeLabel,showDay};',ctx);
 return {helpers:ctx.helpers,ctx,get selected(){return selected}};
}
test('Sunday keeps six next-week pills and current Sunday; no obsolete week scroller',()=>{
 const h=harness('2026-10-11').helpers;
 assert.deepEqual(Array.from(h.stripDates()),[
  '2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-11']);
 assert.deepEqual(Array.from(h.stripDates().map(h.weekdayShort)),['Пн','Вт','Ср','Чт','Пт','Сб','Нд']);
 assert.doesNotMatch(html,/id="weekPrev"|id="weekNext"/);
});
test('Sunday tomorrow shortcut selects actual next Monday, never an obsolete day',()=>{
 const result=harness('2026-10-11');
 result.helpers.showDay('2026-10-12');
 assert.equal(result.selected,'2026-10-12');
 result.helpers.showDay('2026-10-04');
 assert.equal(result.selected,'2026-10-11');
});
test('Monday starts a new seven-day strip with only weekday pills',()=>{
 const h=harness('2026-10-12').helpers;
 assert.deepEqual(Array.from(h.stripDates()),[
  '2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
 assert.equal(h.nextChangeLabel({time:300,date:'2026-10-13',dayOffset:1}),'05:00 завтра');
});
test('Operator polling still has the guarded publish gate',()=>{
 const wf=readFileSync(join(root,'.github/workflows/update.yml'),'utf8');
 assert.match(wf,/2-57\/5 \* \* \* \*/);
 assert.match(wf,/publish_gate\.py/);
 assert.match(wf,/steps\.gate\.outputs\.publish == 'true'/);
});
