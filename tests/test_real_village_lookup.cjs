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

test('archived Sloboda street can be found but must never auto-confirm a stale queue',()=>{
 const fs=require('node:fs'),path=require('node:path'),{mergeIndexes}=require('../data-merge.js');
 const data=path.join(__dirname,'../data');
 const live=JSON.parse(fs.readFileSync(path.join(data,'addresses.json'),'utf8'));
 const fallback=JSON.parse(fs.readFileSync(path.join(data,'published_street_fallback.json'),'utf8'));
 const idx=mergeIndexes(live,fallback).localities['слобода'];
 const r=resolve({idx,settlement:'Слобода',street:'Вулиця Різдвяна'});
 assert.equal(r.streetKey,'вулиця|різдвяна');
 if(live.localities['слобода'].archiveOnlyStreets?.includes(r.streetKey)){
  assert.equal(r.status,'possible');
  assert.equal(r.reason,'archived-only');
  assert.equal(r.queue,undefined);
 }else{
  assert.notEqual(r.reason,'archived-only');
  assert.ok(live.localities['слобода'].streetQueues[r.streetKey]?.length);
 }
});
test('currently confirmed Sloboda streets still resolve automatically from current source',()=>{
 const fs=require('node:fs'),path=require('node:path'),{mergeIndexes}=require('../data-merge.js');
 const dir=path.join(__dirname,'../data');
 const live=JSON.parse(fs.readFileSync(path.join(dir,'addresses.json'),'utf8'));
 const backup=JSON.parse(fs.readFileSync(path.join(dir,'published_street_fallback.json'),'utf8'));
 const idx=mergeIndexes(live,backup).localities['слобода'];
 const r=resolve({idx,settlement:'Слобода',street:'Вулиця Лісова'});
 assert.equal(r.status,'street');assert.equal(r.queue,'1.1');
});
