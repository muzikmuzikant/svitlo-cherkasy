import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {mergeIndexes}=require('../data-merge.js');
const {resolve,suggest}=require('../address-lookup.js');
const root=path.resolve(import.meta.dirname,'..');
const load=pathName=>JSON.parse(fs.readFileSync(path.join(root,pathName),'utf8'));
const live=load('data/addresses.json');
const seed=load('data/published_street_fallback.json');
const catalog=load('data/street_catalog.json');

test('two requested streets are present in the actual beta merged catalogue',()=>{
 const merged=mergeIndexes(live,seed,{catalog});
 const fixtures=[
  ['Черкаси',merged,'Івана Кожедуба','вулиця|іванакожедуба'],
  ['Слобода',merged.localities.слобода,'Філатова','вулиця|філатова']
 ];
 for(const [settlement,idx,query,key] of fixtures){
  assert.ok(idx.streets[key],settlement+' missing '+query);
  assert.ok(suggest(idx,query).some(([k])=>k===key));
  const result=resolve({idx,settlement,street:query});
  assert.equal(result.streetKey,key);
  assert.equal(result.status,'possible');
  assert.equal(result.reason,'reported-only');
  assert.equal(result.queue,undefined,'A name must not invent a blackout queue');
  assert.ok(!idx.streetQueues?.[key]);
 }
});

test('geography-only streets never obtain a fake queue or another village mapping',()=>{
 const extra={
  streets:{'вулиця|новаєдність':'Вулиця Нова Єдність'},
  localities:{слобода:{streets:{'вулиця|навчальна':'Вулиця Навчальна'}}}
 };
 const merged=mergeIndexes(live,seed,{catalog:extra});
 const city=resolve({idx:merged,settlement:'Черкаси',street:'Нова Єдність'});
 const rural=resolve({idx:merged.localities.слобода,settlement:'Слобода',street:'Навчальна'});
 assert.equal(city.reason,'external-only');
 assert.equal(rural.reason,'external-only');
 assert.equal(city.queue,undefined);
 assert.equal(rural.queue,undefined);
 assert.equal(merged.streets['вулиця|навчальна'],undefined);
 assert.equal(merged.localities.хацьки.streets['вулиця|навчальна'],undefined);
});

test('new names remain visible with manual overrides and without exact house listings',()=>{
 const merged=mergeIndexes(live,seed,{catalog});
 const manually=mergeIndexes(merged,{localities:{слобода:{keys:{},streets:{}}}},{manual:true});
 assert.ok(manually.localities.слобода.streets['вулиця|філатова']);
 assert.ok(manually.streets['вулиця|іванакожедуба']);
 const noHouse=resolve({idx:manually,settlement:'Черкаси',street:'Івана Кожедуба',house:'15'});
 assert.equal(noHouse.queue,undefined);
 assert.notEqual(noHouse.status,'exact');
});

test('staging PWA actively loads the public catalogue and caches it',()=>{
 const code=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const release=load('release.json');
 assert.equal(release.channel,'beta');
 assert.match(code,/street_catalog\.json/);
 assert.match(code,/index=mergeIndexes\(live,backup,\{catalog\}\)/);
 assert.match(code,/return k===normTown\('Черкаси'\)\?index/);
 assert.ok(sw.includes('./data/street_catalog.json'));
 assert.ok(sw.includes('svitlo-cherkasy-shell-v'+release.version));
});
