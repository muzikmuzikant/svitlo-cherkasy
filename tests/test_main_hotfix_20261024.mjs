import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createManualOverridesStore} from '../push-server/manual-overrides-store.js';

const source='https://www.cherkasyoblenergo.com/off';
const draft=(off=[['09:00','10:30']])=>({
 schemaVersion:1,updatedAt:'2026-10-24',
 schedules:{days:[{date:'2026-10-25',verified:true,source,queues:{'1.1':{knownFrom:'00:00',off}}}]},
 addresses:{keys:{},streets:{},streetQueues:{},localities:{}},emergency:{events:[]}
});
const temp=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-manual-hotfix-'));try{return fn(dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}};

test('owner overrides persist without GitHub and do not alter official day',()=>temp(dir=>{
 const original={schemaVersion:3,lastChecked:'2026-10-24T18:00:00Z',
  confirmedNoScheduleDates:['2026-10-25'],
  days:[{date:'2026-10-25',verified:true,source,queues:{'1.1':{knownFrom:'00:00',off:[]},'1.2':{knownFrom:'00:00',off:[['12:00','14:00']]}}}]};
 let changed=0;
 const store=createManualOverridesStore({directory:dir,onChanged:()=>changed++});
 assert.equal(store.revision(),null);
 const saved=store.update(draft(),null);
 assert.ok(saved.revision);assert.equal(changed,1);
 const result=store.applySchedule(original);
 assert.deepEqual(result.days[0].queues['1.1'].off,[['09:00','10:30']]);
 assert.deepEqual(result.days[0].queues['1.2'].off,[['12:00','14:00']]);
 assert.deepEqual(original.days[0].queues['1.1'].off,[]);
 assert.equal(result.days[0].adminCorrection,true);
 assert.deepEqual(result.confirmedNoScheduleDates,[]);
 const restarted=createManualOverridesStore({directory:dir});
 assert.equal(restarted.revision(),saved.revision);
 assert.deepEqual(restarted.snapshot().schedules.days[0].queues['1.1'].off,[['09:00','10:30']]);
 assert.throws(()=>store.update(draft(),null),e=>e.statusCode===409);
}));

test('invalid official source, queue and overlapping intervals never mutate saved override',()=>temp(dir=>{
 const store=createManualOverridesStore({directory:dir});
 const revision=store.update(draft(),null).revision;
 for(const bad of [
  {...draft(),schedules:{days:[{...draft().schedules.days[0],source:'https://example.org/off'}]}},
  {...draft(),schedules:{days:[{...draft().schedules.days[0],queues:{'7.2':{knownFrom:'00:00',off:[]}}}]}},
  draft([['09:00','10:30'],['10:00','11:00']]),
  draft([['25:00','26:00']])
 ])assert.throws(()=>store.update(bad,revision));
 assert.equal(store.revision(),revision);
 assert.deepEqual(store.snapshot().schedules.days[0].queues['1.1'].off,[['09:00','10:30']]);
}));

test('advertising visibility is independent of actual campaign display',async()=>{ const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-ads-hotfix-'));try{
 // Reader still sees the settings independent of current carousel activation.
 const {createAdsStore}=await import('../push-server/ads.js');
 const ads=createAdsStore({directory:dir,appOrigin:'https://svitlo-cherkasy.pp.ua'});
 const settings={...ads.dashboard().settings,enabled:false,pageVisible:false};
 ads.update(settings);
 assert.equal(ads.publicState().enabled,false);
 assert.equal(ads.publicState().pageVisible,false);
 assert.equal(createAdsStore({directory:dir,appOrigin:'https://svitlo-cherkasy.pp.ua'}).publicState().pageVisible,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
