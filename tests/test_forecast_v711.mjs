import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const code=readFileSync(join(root,'app.js'),'utf8');
const start=code.indexOf('const currentDay='),end=code.indexOf('function stats(a){',start);
assert.ok(start!==-1&&end>start);
function sample({days=[],stale=false,error=false}={}){
 const input={days,lastChecked:new Date(Date.now()-(stale?3*3600_000:5*60000)).toISOString()};
 const ctx=vm.createContext({data:input,lastSyncFailed:error,QUEUES:['1.1','2.1','6.2'],today:()=> '2026-10-10',shiftDay:(date,num)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+num);return d.toISOString().slice(0,10)},clock:(n)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`});
 vm.runInContext(code.slice(start,end)+';this.api={timeline,sourceFresh,nextChange,statusCopy,stateAt};',ctx);
 return ctx.api;
}
const day=(date,queue,off=[])=>({date,verified:true,publishedAt:date+'T00:00:00+03:00',queues:{'2.1':{knownFrom:'00:00',off:queue==='2.1'?off:[]}}});
test('tomorrow with 05:00 outage: at 22:00 today display 05:00 tomorrow',()=>{
 const f=sample({days:[day('2026-10-10','2.1',[]),day('2026-10-11','2.1',[['05:00','07:00']])]});
 const change=f.nextChange('2026-10-10','2.1',22*60);
 assert.equal(change.dayOffset,1);assert.equal(change.time,300);assert.equal(change.to,1);
 assert.equal(f.statusCopy('on',change,'2.1','2026-10-10').title,'Є світло до 05:00 завтра');
});
test('no operator graph after successful check means no planned outages for all queues today/tomorrow',()=>{
 const f=sample();for(const d of ['2026-10-10','2026-10-11'])for(const q of ['1.1','2.1','6.2']){
  const arr=f.timeline(d,q);assert.equal(arr.length,1440);assert.equal(arr[0],0);assert.equal(arr[1439],0);
 }
 assert.equal(f.nextChange('2026-10-10','2.1',22*60),null);
 assert.match(f.statusCopy('on',null,'2.1','2026-10-10').title,/За графіком світло є/);
 assert.match(f.statusCopy('on',null,'2.1','2026-10-10').detail,/сьогодні та завтра/);
});
test('single verified schedule does not count omitted subqueue as outage',()=>{
 const f=sample({days:[day('2026-10-11','2.1',[['05:00','06:00']])]});
 const v=f.timeline('2026-10-11','6.2');assert.equal(v[300],0);
});
test('missing schedule must remain UNKNOWN when importer stale or failed',()=>{
 for(const opts of [{stale:true},{error:true}]){
  const f=sample(opts);assert.equal(f.timeline('2026-10-11','2.1'),null);
  assert.equal(f.stateAt(f.timeline('2026-10-11','2.1'),500),'unknown');
 }
});
test('we do not extrapolate absent schedules to day after tomorrow',()=>{
 const f=sample();assert.equal(f.timeline('2026-10-12','2.1'),null);
});
test('cross-midnight continuation of scheduled outage ends at midnight if tomorrow has no planned outages',()=>{
 const f=sample({days:[day('2026-10-10','2.1',[['22:00','24:00']])]});
 const change=f.nextChange('2026-10-10','2.1',23*60);
 assert.equal(change.time,0);assert.equal(change.dayOffset,1);assert.equal(change.to,0);
 assert.equal(f.statusCopy('off',change,'2.1','2026-10-10').title,'Немає світла до 00:00 завтра');
});
test('no placeholder date —:— survives HTML nor app rendering',()=>{
 assert.doesNotMatch(code,/—:—/);
 assert.doesNotMatch(readFileSync(join(root,'index.html'),'utf8'),/—:—/);
});
test('partly unknown tomorrow cannot claim there are no outages all day',()=>{
 const d=day('2026-10-11','2.1',[['18:00','20:00']]);d.queues['2.1'].knownFrom='16:00';
 const f=sample({days:[day('2026-10-10','2.1',[]),d]});
 assert.equal(f.nextChange('2026-10-10','2.1',1320),null);
 const copy=f.statusCopy('on',null,'2.1','2026-10-10');
 assert.doesNotMatch(copy.detail,/на сьогодні та завтра не оголошено/);
});
