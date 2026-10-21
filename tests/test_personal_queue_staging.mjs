import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chooseQueue,resolve}=require('../address-lookup.js');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('exact automatic address can be manually corrected without changing default',()=>{
 const r={status:'exact',queue:'1.1',queues:['1.1']};
 assert.deepEqual(chooseQueue(r,'6.1'),{queue:'1.1',method:'automatic'});
 assert.deepEqual(chooseQueue(r,'6.1',true),{queue:'6.1',method:'manual-override'});
 assert.deepEqual(chooseQueue(r,'',true),{queue:null,method:null});
});
test('street-wide mapping is editable and can be restored',()=>{
 const r={status:'street',queue:'4.1'};
 assert.deepEqual(chooseQueue(r,'6.1',true),{queue:'6.1',method:'manual-override'});
 assert.deepEqual(chooseQueue(r,'6.1',false),{queue:'4.1',method:'street-auto'});
});
test('unlisted buildings accept any valid subqueue',()=>{
 const idx={streets:{'проспект|перемоги':'Проспект Перемоги'},streetQueues:{'проспект|перемоги':['4.1']},keys:{'проспект|перемоги|2':['4.1']}};
 const r=resolve({idx,settlement:'Черкаси',street:'Проспект Перемоги',house:'30'});
 assert.equal(r.queue,undefined);
 assert.deepEqual(chooseQueue(r,'6.1'),{queue:'6.1',method:'manual'});
 assert.deepEqual(chooseQueue(r,'6.3'),{queue:null,method:null});
});
test('personal correction does not edit official queue database',()=>{
 const idx={streets:{'вулиця|нарбутівська':'Вулиця Нарбутівська'},keys:{'вулиця|нарбутівська|160/1':['1.1']},streetQueues:{}};
 const before=JSON.stringify(idx);
 const r=resolve({idx,settlement:'Черкаси',street:'Нарбутівська',house:'160/1'});
 assert.equal(r.queue,'1.1');
 assert.deepEqual(chooseQueue(r,'4.1',true),{queue:'4.1',method:'manual-override'});
 assert.equal(JSON.stringify(idx),before);
});
test('editor persists selected queue and refreshes push',()=>{
 assert.match(html,/id="queueOverride"/);
 assert.match(app,/\$\('queueOverride'\)\.checked=!!item/);
 assert.match(app,/chooseQueue\(r,\$\('manualQueue'\)\.value,\$\('queueOverride'\)\.checked\)/);
 assert.match(app,/queue,method,favorite/);
 assert.match(app,/updatePushSubscription\(\)\.catch/);
});
