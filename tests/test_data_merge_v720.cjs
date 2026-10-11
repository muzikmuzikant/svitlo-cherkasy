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
