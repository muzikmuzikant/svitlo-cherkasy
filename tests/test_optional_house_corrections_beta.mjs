import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAddressCorrectionStore} from '../push-server/address-corrections.js';
import merge from '../data-merge.js';
import addressLookup from '../address-lookup.js';
const {mergeIndexes}=merge;
const source='https://www.cherkasyoblenergo.com/static/perelik-gpv';
const input={settlementKey:'черкаси',streetKey:'вулиця|лісова',house:'',queue:'2.1',source,comment:'Вулиця за офіційним джерелом'};
function withStore(callback){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-street-only-'));
 try{return callback(createAddressCorrectionStore({directory}))}
 finally{fs.rmSync(directory,{recursive:true,force:true})}
}

test('no house number can be saved, reviewed and published as streetQueues',()=>{
 withStore(store=>{
  const draft=store.create(input,'editor');
  assert.equal(draft.house,'');
  assert.deepEqual(store.published().corrections.keys,{});
  assert.deepEqual(store.published().corrections.streetQueues,undefined);
  assert.throws(()=>store.create(input,'editor'),/вже існує/);
  assert.throws(()=>store.edit(draft.id,{expectedRevision:1,status:'published'},'editor'),/власнику/);
  assert.throws(()=>store.edit(draft.id,{expectedRevision:1,status:'published'},'owner',true),/власноруч/);
  const live=store.edit(draft.id,{expectedRevision:1,status:'published',confirmSourceReviewed:true},'owner',true);
  assert.equal(live.status,'published');
  assert.deepEqual(store.published().corrections.streetQueues['вулиця|лісова'],['2.1']);
  assert.equal(store.published().corrections.keys['вулиця|лісова|'],undefined);
  store.edit(draft.id,{expectedRevision:live.revision,status:'draft'},'owner',true);
  assert.equal(store.published().corrections.streetQueues,undefined);
 });
});
test('street-only corrections do not collide with house records or other towns',()=>{
 withStore(store=>{
  const street=store.create(input,'owner');
  const house=store.create({...input,house:'12',queue:'4.1'},'owner');
  const village=store.create({...input,settlementKey:'слобода',queue:'3.1'},'owner');
  for(const row of [street,house,village])
   store.edit(row.id,{expectedRevision:1,status:'published',confirmSourceReviewed:true},'owner',true);
  const published=store.published().corrections;
  assert.deepEqual(published.streetQueues['вулиця|лісова'],['2.1']);
  assert.deepEqual(published.keys['вулиця|лісова|12'],['4.1']);
  assert.deepEqual(published.localities.слобода.streetQueues['вулиця|лісова'],['3.1']);
  assert.throws(()=>store.create({...input,house:'дім'},'editor'),/Вкажіть/);
 });
});
test('PWA applies a whole-street override only when there is no house-specific catalog data',()=>{
 const unsplit={streets:{'вулиця|лісова':'Вулиця Лісова'},streetQueues:{'вулиця|лісова':['1.1']},keys:{},localities:{}};
 const correction={streetQueues:{'вулиця|лісова':['2.1']},localities:{}};
 const merged=mergeIndexes(unsplit,correction,{manual:true,protectHouseStreets:true});
 assert.deepEqual(merged.streetQueues['вулиця|лісова'],['2.1']);
 const resolved=addressLookup.resolve({idx:merged,street:'Вулиця Лісова',house:'19',settlement:'Черкаси'});
 assert.equal(resolved.status,'street');
 assert.equal(resolved.queue,'2.1');
 const split={...unsplit,keys:{'вулиця|лісова|12':['4.1']},streetQueues:{'вулиця|лісова':['1.1']}};
 const guarded=mergeIndexes(split,correction,{manual:true,protectHouseStreets:true});
 assert.deepEqual(guarded.keys['вулиця|лісова|12'],['4.1']);
 assert.deepEqual(guarded.streetQueues['вулиця|лісова'],['1.1']);
 const precise=addressLookup.resolve({idx:guarded,street:'Вулиця Лісова',house:'12',settlement:'Черкаси'});
 assert.equal(precise.queue,'4.1');
 assert.equal(precise.status,'exact');
});
test('optional house is supported throughout Beta UI, PWA and validation',()=>{
 const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
 const admin=read('admin.html'),ui=read('admin-address.js'),app=read('app.js');
 assert.match(admin,/<label for="corrHouse">Номер будинку \(необов’язково\)<\/label><input id="corrHouse" maxlength/);
 assert.doesNotMatch(admin,/<input id="corrHouse" required/);
 assert.doesNotMatch(ui,/\$\('corrHouse'\)\.required=true/);
 assert.doesNotMatch(ui,/if\(!payload\.house\)/);
 assert.match(app,/protectHouseStreets:true/);
});
