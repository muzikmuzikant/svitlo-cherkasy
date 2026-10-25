import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateAppConfig} from '../push-server/app-config.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

const layout=['allQueuesCompact','allQueuesTotals','allQueuesGroupLabels','allQueuesAxis'];
const motion=['motionIcons','motionInputs','motionFeedback','motionLists','allQueuesSheetMotion'];

test('every added public feature is editable and persisted by Features in Railway',()=>{
 const admin=read('admin-features.js'),publicClient=read('site-mode.js');
 const backend=read('push-server/app-config.js');
 for(const key of [...layout,...motion]){
  assert.ok(admin.includes("['"+key+"'"),key+' missing in admin Features');
  assert.ok(publicClient.includes('"'+key+'"'),key+' missing on public client');
  assert.ok(backend.includes(key+':true'),key+' missing in default storage schema');
 }
 const stored=validateAppConfig({schemaVersion:1,announcements:[],
  site:{flags:{allQueuesCompact:false,motionIcons:false,motionLists:false}}});
 assert.equal(stored.site.flags.allQueuesCompact,false);
 assert.equal(stored.site.flags.motionIcons,false);
 assert.equal(stored.site.flags.motionLists,false);
 assert.equal(stored.site.flags.allQueuesAxis,true);
});

test('all-queues controls are stable on network polling and animate only on deliberate input',()=>{
 const graph=read('all-queues.js');
 assert.match(graph,/currentDaysSignature!==daysSignature/);
 assert.match(graph,/currentModesSignature!==modeSignature/);
 assert.match(graph,/signature===currentSignature&&root\.childElementCount/);
 assert.match(graph,/shouldAnimate=animateSwitch&&!reduced\(\)&&enabled\('motionLists'\)/);
 assert.match(graph,/if\(enabled\('allQueuesTotals'\)\)row\.append\(meta\)/);
 assert.match(graph,/if\(enabled\('allQueuesAxis'\)\)root\.append\(axis\(\)\)/);
 assert.match(graph,/all-queues-group-label/);
 assert.match(graph,/all-queues-group-range/);
});

test('compact graph uses a single aligned time ruler and old design remains optional',()=>{
 const css=read('all-queues.css');
 assert.match(css,/feature-off-allQueuesCompact/);
 assert.match(css,/--aq-label:32px;--aq-meta:52px/);
 assert.match(css,/\.all-queues-time-scale/);
 assert.match(css,/feature-off-allQueuesGroupLabels/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 const html=read('index.html');
 for(const id of ['allQueuesDialog','allQueuesMatrix','allQueuesDays','allQueuesExport'])
  assert.ok(html.includes('id="'+id+'"'));
});

test('motion stays accessible and not tied to remote schedule polling',()=>{
 const js=read('micro-motion.js'),css=read('micro-motion.css');
 assert.match(js,/svitlo-pointer-input/);
 assert.match(js,/feature-off-motionFeedback/);
 assert.match(js,/feature-off-motionInputs/);
 assert.match(js,/lastInteraction>1200/);
 const graphCss=read('all-queues.css');
 for(const key of motion)assert.ok((css+graphCss).includes('feature-off-'+key),key+' missing opt-out CSS');
 assert.match(css,/prefers-reduced-motion:reduce/);
 const sw=read('sw.js');
 assert.match(sw,/graph-motion-3/);
 for(const asset of ['./all-queues-core.js','./all-queues.js','./all-queues.css','./micro-motion.js','./micro-motion.css'])
  assert.ok(sw.includes("'"+asset+"'"),asset+' offline shell');
});
