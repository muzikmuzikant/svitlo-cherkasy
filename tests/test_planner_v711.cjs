const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const planner=require('../schedule-planner.js');
test('visual planner combines consecutive 30-minute cells correctly',()=>{
 const arr=Array(48).fill(false);[10,11,12,46,47].forEach(i=>arr[i]=true);
 assert.deepEqual(planner.toIntervals(arr),[['05:00','06:30'],['23:00','24:00']]);
 assert.deepEqual(planner.fromIntervals([['05:00','06:30'],['23:00','24:00']]),arr);
});
test('empty day produces no planned outages and 24:00 is supported',()=>{
 assert.deepEqual(planner.toIntervals(Array(48).fill(false)),[]);
 assert.deepEqual(planner.toIntervals(Array(48).fill(true)),[['00:00','24:00']]);
});
test('rejects invalid and overlapping grid intervals',()=>{
 for(const xs of [[['23:30','23:00']],[['12:15','13:00']],[['22:00','25:00']],[['10:00','11:00'],['10:30','12:00']]]){
  assert.throws(()=>planner.fromIntervals(xs));
 }
 assert.throws(()=>planner.toIntervals([true]));
});
test('admin planner and scripts ship with GitHub Pages and do not expose server tokens',()=>{
 const root=path.resolve(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
 assert.match(html,/id="plannerGrid"/);assert.match(html,/id="plannerPublish"/);
 assert.match(html,/\.\/admin-planner\.js/);assert.match(html,/\.\/schedule-planner\.js/);
 for(const file of ['admin-planner.js','schedule-planner.js'])assert.ok(fs.existsSync(path.join(root,'_site',file)));
 const p=fs.readFileSync(path.join(root,'admin-planner.js'),'utf8');
 assert.match(p,/if\(!remote\|\|!canPublish\)/);
 assert.match(p,/cherkasyoblenergo/);
});
