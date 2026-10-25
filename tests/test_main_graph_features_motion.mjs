import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const flags=['allQueues','allQueuesGroups','allQueuesCompare','allQueuesDetails','allQueuesRowIntervals','allQueuesNowMarker','allQueuesExport','microMotion','panelMotion','selectionMotion'];
test('Main features have an actual Railway-backed switch and public config consumer',()=>{
 const admin=read('admin-features.js'),server=read('push-server/app-config.js'),mode=read('site-mode.js');
 for(const key of flags){
  assert.match(admin,new RegExp("['\\\"]"+key+"['\\\"]"),'Admin checkbox missing: '+key);
  assert.match(server,new RegExp(key+':(?:true|false)'),'Railway whitelist missing: '+key);
  assert.match(mode,new RegExp('\\\"'+key+'\\\"'),'PWA flag consumer missing: '+key);
 }
 assert.match(admin,/key==='allQueuesRowIntervals'\?flags\[key\]===true/);
 assert.match(server,/allQueuesRowIntervals:false/);
 assert.match(mode,/key==='allQueuesRowIntervals'\?flags\[key\]!==true/);
});
test('Graph uses one common axis and 12 accurate queue timelines',()=>{
 const app=read('all-queues.js'),css=read('all-queues.css');
 assert.match(app,/root\.append\(axis\(\)\)/);
 assert.match(app,/lane\(n\+'\.1'\),lane\(n\+'\.2'\)/);
 assert.doesNotMatch(app,/card\.append\(h,axis\(\)/);
 assert.match(app,/allDaySegments\(src\(\)\.timeline\(selected,queue\)\)/);
 assert.match(app,/allQueuesRowIntervals/);
 assert.match(app,/root\.querySelector\('\.all-queues-lane\[data-queue=/);
 assert.match(css,/#allQueuesDialog \.all-queues-modes/);
 assert.match(css,/\.all-queues-lane-track\.has-now-marker/);
 assert.match(app,/svitlo:public-config/);
});
test('Motion is accessible, opt-out capable, and shell cache is renewed',()=>{
 const js=read('micro-motion.js'),css=read('micro-motion.css'),sw=read('sw.js'),graph=read('all-queues.css');
 for(const f of ['microMotion','panelMotion'])assert.match(js,new RegExp("feature-off-"+f));
 for(const f of ['microMotion','panelMotion','selectionMotion'])assert.match(css,new RegExp("feature-off-"+f));
 assert.match(js,/prefers-reduced-motion: reduce/);
 assert.match(graph,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(sw,/production-graph-motion/);
});
