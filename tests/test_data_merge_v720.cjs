const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mergeIndexes}=require('../data-merge.js');
test('outdated archived hints never come back after a live queue edit',()=>{
 const street='вулиця|соборна';
 const now={updatedAt:'2026-10-11',streetQueues:{[street]:['4.1']},streets:{[street]:'Вулиця Соборна'},keys:{}};
 const old={streetQueues:{[street]:['1.1','4.1','6.1']},streets:{[street]:'Вулиця Соборна'},keys:{}};
 assert.deepEqual(mergeIndexes(now,old).streetQueues[street],['4.1']);
});
test('missing locality may use archived street listings without inventing houses',()=>{
 const saved={localities:{слобода:{streets:{'вулиця|соборна':'Вулиця Соборна'},streetQueues:{'вулиця|соборна':['1.1']},keys:{}}}};
 const result=mergeIndexes({localities:{}},saved);
 assert.deepEqual(result.localities.слобода.streetQueues['вулиця|соборна'],['1.1']);
 assert.deepEqual(result.localities.слобода.keys,{});
});
test('new official locality supersedes entire old district snapshot',()=>{
 const live={localities:{слобода:{streets:{'вулиця|нова':'Вулиця Нова'},keys:{},streetQueues:{'вулиця|нова':['2.1']}}}};
 const archived={localities:{слобода:{streets:{'вулиця|стара':'Вулиця Стара'},streetQueues:{'вулиця|стара':['6.1']},keys:{}}}};
 assert.deepEqual(mergeIndexes(live,archived).localities.слобода.streetQueues,{'вулиця|нова':['2.1']});
});
test('admin correction deliberately overrides current per-street data',()=>{
 const live={streets:{'вулиця|соборна':'Соборна'},streetQueues:{'вулиця|соборна':['1.1']}};
 const admin={streetQueues:{'вулиця|соборна':['6.2']}};
 assert.deepEqual(mergeIndexes(live,admin,{manual:true}).streetQueues['вулиця|соборна'],['6.2']);
});

test('real Sloboda keeps every archived street name when the live district import is partial',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const base=path.join(__dirname,'../data');
 const live=JSON.parse(fs.readFileSync(path.join(base,'addresses.json'),'utf8'));
 const backup=JSON.parse(fs.readFileSync(path.join(base,'published_street_fallback.json'),'utf8'));
 const fresh=live.localities['слобода'],old=backup.localities['слобода'];
 assert.ok(Object.keys(fresh.streets).length>=Object.keys(old.streets).length,'Published catalogue must include the fallback streets');
 assert.ok(Array.isArray(fresh.archiveOnlyStreets||[]),'Archive metadata must be a list when provided');
 const merged=mergeIndexes(live,backup).localities['слобода'];
 for(const key of Object.keys(old.streets))assert.ok(merged.streets[key],'Missing historical street: '+key);
 assert.ok(Object.keys(merged.streets).length>=Object.keys(old.streets).length);
 if((fresh.archiveOnlyStreets||[]).includes('вулиця|різдвяна')){
  assert.ok(merged.archiveOnlyStreets.includes('вулиця|різдвяна'));
  assert.equal(merged.streetQueues['вулиця|різдвяна'],undefined,'Obsolete queues must not become confirmed');
  assert.deepEqual(merged.archivedStreetQueues['вулиця|різдвяна'],old.streetQueues['вулиця|різдвяна']);
 }else{
  assert.ok(!merged.archiveOnlyStreets.includes('вулиця|різдвяна'));
  assert.deepEqual(merged.streetQueues['вулиця|різдвяна'],fresh.streetQueues['вулиця|різдвяна']);
 }
 assert.deepEqual(merged.streetQueues['вулиця|соборна'],fresh.streetQueues['вулиця|соборна']);
});
test('manual verified addition upgrades an archived street into confirmed queue',()=>{
 const archived=mergeIndexes(
   {streets:{'вулиця|нова':'Вулиця Нова'},streetQueues:{'вулиця|нова':['1.1']}},
   {streets:{'вулиця|стара':'Вулиця Стара'},streetQueues:{'вулиця|стара':['3.2']}}
 );
 assert.deepEqual(archived.archiveOnlyStreets,['вулиця|стара']);
 const corrected=mergeIndexes(archived,{streets:{'вулиця|стара':'Вулиця Стара'},streetQueues:{'вулиця|стара':['5.1']}},{manual:true});
 assert.ok(!corrected.archiveOnlyStreets.includes('вулиця|стара'));
 assert.deepEqual(corrected.streetQueues['вулиця|стара'],['5.1']);
});

test('archived labels already included in fresh import remain archived after browser merge',()=>{
 const fresh={streets:{'вулиця|нова':'Вулиця Нова','вулиця|різдвяна':'Вулиця Різдвяна'},
  keys:{},streetQueues:{'вулиця|нова':['1.1']},
  archiveOnlyStreets:['вулиця|різдвяна'],archivedStreetQueues:{'вулиця|різдвяна':['4.1']}};
 const backup={streets:{'вулиця|різдвяна':'Вулиця Різдвяна'},
  streetQueues:{'вулиця|різдвяна':['6.2']}};
 const merged=mergeIndexes(fresh,backup);
 assert.deepEqual(merged.archiveOnlyStreets,['вулиця|різдвяна']);
 assert.deepEqual(merged.archivedStreetQueues['вулиця|різдвяна'],['4.1']);
 assert.equal(merged.streetQueues['вулиця|різдвяна'],undefined);
 assert.deepEqual(merged.streetQueues['вулиця|нова'],['1.1']);
});
