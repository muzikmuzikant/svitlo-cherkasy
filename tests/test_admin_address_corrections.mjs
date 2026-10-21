import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAddressCorrectionStore} from '../push-server/address-corrections.js';
const make=()=>({settlementKey:'черкаси',streetKey:'проспект|перемоги',
 house:'30',queue:'6.1',source:'https://www.cherkasyoblenergo.com/static/perelik-gpv',comment:'Звірити номер'});
test('draft cannot affect public addresses, published exact house can, withdrawal removes it',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-correction-'));
 try{
  const store=createAddressCorrectionStore({directory});
  const row=store.create(make(),'editor');
  assert.equal(store.published().corrections.keys['проспект|перемоги|30'],undefined);
  assert.throws(()=>store.edit(row.id,{expectedRevision:1,status:'published'},'editor'),/власнику/);
  assert.throws(()=>store.edit(row.id,{expectedRevision:1,status:'published'},'owner',true),/власноруч/);
  const saved=store.edit(row.id,{expectedRevision:1,status:'published',confirmSourceReviewed:true},'owner',true);
  assert.deepEqual(store.published().corrections.keys['проспект|перемоги|30'],['6.1']);
  assert.throws(()=>store.edit(row.id,{expectedRevision:1,status:'draft'},'owner',true),/змінив/);
  const withdrawn=store.edit(row.id,{expectedRevision:saved.revision,status:'draft'},'owner',true);
  assert.equal(withdrawn.status,'draft');
  assert.equal(createAddressCorrectionStore({directory}).published().corrections.keys['проспект|перемоги|30'],undefined);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('village scope isolated from city and unknown queue/source rejected',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-correction-'));
 try{
  const store=createAddressCorrectionStore({directory});
  assert.throws(()=>store.create({...make(),queue:'7.1'}),/точну адресу/);
  assert.throws(()=>store.create({...make(),source:'https://github.com/example'}),/офіційне/);
  store.create({...make(),settlementKey:'слобода'},'owner');
  assert.throws(()=>store.create({...make(),settlementKey:'слобода'},'owner'),/вже існує/);
  const published=store.published();
  assert.deepEqual(published.corrections.keys,{});
  assert.equal(published.corrections.localities.слобода,undefined);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
