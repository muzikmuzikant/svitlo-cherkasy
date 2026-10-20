import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {mergeIndexes}=require('../data-merge.js');
const lookup=require('../address-lookup.js');
const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const idx=mergeIndexes(read('data/addresses.json'),read('data/published_street_fallback.json'),
 {catalog:read('data/street_catalog.json'),aliasCatalog:read('data/street_aliases.json')});

test('every address suggestion is only a plain street button, no source/status captions',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const text=app.slice(app.indexOf('function suggestions(){'),app.indexOf('function populateSettlements(){'));
 assert.match(text,/fragment\.append\(button\)/);
 assert.ok(!text.includes('archive-street-tag'));
 assert.ok(!app.includes('додано за зверненням'));
 assert.ok(!app.includes('є в географічному довіднику'));
 assert.ok(!text.includes('matched.verifiedRename'));
 assert.ok(!text.includes('hasPublishedQueue'));
 assert.ok(!text.includes('SvitloAddressLookup.resolve('));
 assert.match(app, /setTimeout\(\(\)=>\{\s*if\(\$\('street'\)\.isComposing\)return;/);
 assert.match(app, /streetLookupTimer=setTimeout\(\(\)=>checkLookup\(\),110\)/);
});

test('fast typeahead still supports city, Sloboda and historical/abbreviated queries',()=>{
 const checks=[
  [idx,'Мономаха','вулиця|володимирамономаха'],
  [idx,'Короленка','вулиця|короленка'],
  [idx,'Сергія Амброса','вулиця|сергіяамброса'],
  [idx,"В'ячеслава Чорновола",'вулиця|вячеславачорновола'],
  [idx.localities.слобода,'Філатова','вулиця|філатова'],
 ];
 for(const [site,typed,expected] of checks){
  const candidates=lookup.suggest(site,typed);
  assert.ok(candidates.some(([key])=>key===expected),
    'Missing suggestion '+typed+': '+JSON.stringify(candidates));
 }
});

test('O(1)-cached house access is accurate for 9k+ records and retains queue conflicts',()=>{
 const k='вулиця|самброса';
 const houseEntries=lookup.knownHouses(idx,k);
 assert.ok(houseEntries.length>=30);
 for(const [street,house,expected] of [
  ['Сергія Амброса','1','4.1'],
  ['Сергія Амброса','10','3.1'],
  ['Володимира Мономаха','10','2.1'],
  ['провулок Мистецький','4','3.1'],
  ['провулок Анатолія Пашкевича','8','2.1']
 ]){
  const hit=lookup.resolve({idx,settlement:'Черкаси',street,house});
  assert.equal(hit.queue,expected,JSON.stringify(hit));
  assert.equal(hit.status,'exact');
 }
 assert.equal(lookup.knownHouses(idx,k),houseEntries,'Must reuse the same cached sorted houses');
 const uncertain=lookup.resolve({idx,settlement:'Черкаси',
  street:'Сергія Амброса',house:'9999'});
 assert.equal(uncertain.queue,undefined);
});

test('repeated iPhone-like input does not rescan thousands of houses on each keystroke',()=>{
 const typed=['К','Ко','Кор','Коро','Корол','Королен','Короленка',
   'С','Се','Сер','Серг','Сергі','Сергія','Сергія ','Сергія А',
   'Сергія Ам','Сергія Амб','Сергія Амбр','Сергія Амбро','Сергія Амброса',
   'В','Ву','Вул','Вули','Вулиц','Вулиця','Вулиця М'];
 // Warm-up includes building caches, then measure the repeated typing path.
 for(const q of typed){lookup.suggest(idx,q);lookup.streetMatches(idx,q);}
 const t0=performance.now();
 for(let n=0;n<14;n++){
  for(const q of typed){
   lookup.suggest(idx,q);
   lookup.streetMatches(idx,q);
   lookup.resolve({idx,street:q,settlement:'Черкаси',house:'10'});
  }
 }
 const duration=performance.now()-t0;
 // Intentionally generous across GitHub runners; slow old 9k-house rescans
 // used to be far above this, while caching keeps cost proportional to names.
 assert.ok(duration<2600,'Street search is too expensive: '+duration.toFixed(1)+'ms');
});

test('new name keys always resolve to official house records and never cross villages',()=>{
 const r=lookup.resolve({idx,settlement:'Черкаси',street:'Вулиця Сергія Амброса',
  house:'10',selectedKey:'вулиця|сергіяамброса'});
 assert.equal(r.streetKey,'вулиця|самброса'); assert.equal(r.queue,'3.1');
 const other=lookup.resolve({idx:idx.localities.слобода,
  settlement:'Слобода',street:'Вулиця Сергія Амброса',house:'10'});
 assert.equal(other.queue,undefined);
});
