import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const from=src.indexOf('function verifiedNoSchedule(date){');
const to=src.indexOf('function withinPublishedHorizon(date){',from);
const a=src.indexOf('function timeline(date,queue){');
const b=src.indexOf('function stateAt(a,m)',a);
assert.ok(from>=0&&to>from&&a>=0&&b>a,'Freshness and timeline helpers must exist');

function check({fresh=true,offline=false,days=['2026-10-23'],date='2026-10-23'}={}){
 const ctx={QUEUES:['1.1'],data:{confirmedNoScheduleDates:days},Date,
  sourceFresh:()=>fresh,isOfflineMode:()=>offline,
  currentDay:()=>undefined,minute:()=>0,
  today:()=> '2026-10-23',shiftDay:()=> '2026-10-24'};
 vm.createContext(ctx);
 vm.runInContext(src.slice(from,to)+src.slice(a,b),ctx);
 return {verified:ctx.verifiedNoSchedule(date),timeline:ctx.timeline(date,'1.1')};
}

test('confirmed no-published-schedule day retains 24h planned light',()=>{
 const r=check();assert.equal(r.verified,true);
 assert.equal(r.timeline.length,1440);
 assert.ok(Array.from(r.timeline).every(x=>x===0));
});
test('stale verification is not misrepresented as all-day light',()=>{
 const r=check({fresh:false});
 assert.equal(r.verified,false);
 assert.equal(r.timeline,null);
});
test('offline but unsaved day is unknown, not a false forecast',()=>{
 const r=check({offline:true});
 assert.equal(r.verified,false);
 assert.equal(r.timeline,null);
});
test('tomorrow is unknown unless absence was certified for that date',()=>{
 const r=check({date:'2026-10-24'});
 assert.equal(r.verified,false);
 assert.equal(r.timeline,null);
});
test('confirmed absence for tomorrow remains 24 hours without published outages',()=>{
 const r=check({date:'2026-10-24',days:['2026-10-23','2026-10-24']});
 assert.equal(r.verified,true);
 assert.equal(r.timeline.length,1440);
});
test('the home and day list distinguish uncertain from verified absence',()=>{
 assert.match(src,/Час перевірки невідомий або дані застаріли/);
 assert.match(src,/ГРАФІКА НЕМАЄ · СВІТЛО ВЕСЬ ДЕНЬ/);
 assert.match(src,/АКТУАЛЬНИЙ ГРАФІК НЕ ПІДТВЕРДЖЕНО/);
 assert.match(src,/verifiedNoSchedule\(day\)\?'Світло весь день':'Немає підтверджених даних'/);
});
