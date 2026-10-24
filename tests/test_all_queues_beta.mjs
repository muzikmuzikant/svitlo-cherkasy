import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const module={exports:{}};
vm.runInNewContext(read('all-queues-core.js'),{module,Date});
const M=module.exports;

test('all 12 subqueues are shown in ascending order',()=>{
 assert.deepEqual(Array.from(M.QUEUES),['1.1','1.2','2.1','2.2','3.1','3.2','4.1','4.2','5.1','5.2','6.1','6.2']);
});
test('half-hour outages preserve the exact edges in hourly matrix and PNG',()=>{
 const t=new Int8Array(1440);
 t.fill(1,11*60+30,12*60+30);
 assert.deepEqual(JSON.parse(JSON.stringify(M.hourSegments(t,11))),[
  {start:0,end:30,state:0},{start:30,end:60,state:1}]);
 assert.deepEqual(JSON.parse(JSON.stringify(M.hourSegments(t,12))),[
  {start:0,end:30,state:1},{start:30,end:60,state:0}]);
 assert.deepEqual(JSON.parse(JSON.stringify(M.allDaySegments(t))),[
  {start:0,end:690,state:0},{start:690,end:750,state:1},{start:750,end:1440,state:0}]);
 assert.match(M.describe(M.hourSegments(t,11),11),/11:30–12:00: Планове відключення/);
});
test('missing/invalid/unverified timeline stays unknown, never falsely green',()=>{
 for(const bad of [null,undefined,new Int8Array(24),[]]){
  assert.equal(M.hourSegments(bad,4)[0].state,-1);
  assert.equal(M.allDaySegments(bad)[0].state,-1);
 }
 const t=new Int8Array(1440);t.fill(-1);t.fill(0,90);t.fill(1,30,45);
 assert.deepEqual(Array.from(M.hourSegments(t,0),part=>part.state),[-1,1,-1]);
 assert.equal(M.hourSegments(new Int8Array(1440),4)[0].state,0);
 assert.equal(M.time(1440),'24:00');
});
test('ISO dates and app source integration are validated',()=>{
 assert.equal(M.safeDate('2026-10-24'),true);
 for(const d of ['2026-02-30','2026-13-01','2026-10-25<script>','2026-1-2'])assert.equal(M.safeDate(d),false,d);
 const app=read('app.js');
 for(const k of ['dates:stripDates','timeline,day:currentDay','noSchedule:verifiedNoSchedule','sharePreview:openSharePreview'])
  assert.ok(app.includes(k),'shared source '+k);
 assert.match(app,/window\.SvitloAllQueues\?\.refresh\?\.\(\)/);
 const js=read('all-queues.js');
 assert.match(js,/math\.allDaySegments\(src\(\)\.timeline\(selected,queue\)\)/);
 assert.match(js,/math\.allDaySegments\(line\)/);
 assert.match(js,/canvas\.toBlob/);
 assert.match(js,/src\(\)\.sharePreview\(blob,filename,selected,'Усі підчерги'\)/);
 assert.doesNotMatch(js,/fetch\(/,'matrix must not independently fetch schedules');
});
test('Beta ships accessible daily matrix, PNG action and offline assets',()=>{
 const html=read('index.html'),build=read('scripts/build_pages.py'),sw=read('sw.js');
 for(const id of ['allQueuesHomeOpen','allQueuesDetailOpen','allQueuesDialog','allQueuesMatrix',
   'allQueuesDays','allQueuesExport','allQueuesSource','allQueuesNotice','allQueuesInspect']){
  assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 for(const p of ['all-queues-core.js','all-queues.js','all-queues.css']){
  assert.ok(build.includes("'"+p+"'"),p+' missing from build');
  assert.ok(sw.includes('"./'+p+'"'),p+' missing from PWA offline cache');
  assert.ok(html.includes('"./'+p+'"'),p+' missing from HTML');
 }
 const css=read('all-queues.css');
 assert.match(css,/repeat\(24,minmax\(0,1fr\)\)/);
 assert.match(css,/max-width:370px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/:root\[data-theme="dark"\] \.all-queues-dialog/);
});
