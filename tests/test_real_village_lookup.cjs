const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resolve}=require('../address-lookup.js');
const sample=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/published_street_fallback.json'),'utf8')).localities['слобода'];
const find=(street,house='')=>resolve({idx:sample,street,house,settlement:'Слобода'});
test('real village address index: single-queue street does not ask for house',()=>{
 const r=find('Вулиця Героїв Майдану');
 assert.equal(r.status,'street');assert.equal(r.queue,'5.1');
});
test('real village address index: street in three queues does not guess a house',()=>{
 const r=find('Вулиця Соборна');
 assert.equal(r.status,'possible');assert.deepEqual(r.queues,['1.1','4.1','6.1']);
});
