import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const lookup=require('../address-lookup.js');
const {mergeIndexes}=require('../data-merge.js');
const aliases=JSON.parse(fs.readFileSync(new URL('../data/street_aliases.json',import.meta.url),'utf8'));
const keys=aliases.localities.черкаси;
const renames={schemaVersion:1,localities:{черкаси:keys}};

test('only adopted city council decisions (not proposals) feed approved old/new name matching',()=>{
 assert.equal(keys.length,18);
 assert.ok(keys.every(x=>x.source.startsWith('https://chmr.golos.net.ua/')));
 assert.ok(keys.every(x=>x.oldName&&x.newName&&x.oldName!==x.newName));
 const tmp=mergeIndexes({streets:{'вулиця|володимирамономаха':'Вулиця Володимира Мономаха'},
  keys:{},streetQueues:{},localities:{слобода:{streets:{'вулиця|короленка':'Вулиця Короленка'},keys:{},streetQueues:{}}}},
 {streets:{},localities:{}},{aliasCatalog:renames});
 assert.equal(tmp.aliases.length,18);
 assert.equal(tmp.localities.слобода.aliases,undefined,'City renaming MUST NOT leak to Sloboda');
 assert.equal(lookup.resolve({idx:tmp.localities.слобода,settlement:'Слобода',street:'Володимира Мономаха'}).status,'nostreet');
});

test('renamed streets suggest modern names for full old name and partial old name',()=>{
 const idx=mergeIndexes({streets:{'вулиця|володимирамономаха':'Вулиця Володимира Мономаха'},
  keys:{},streetQueues:{},localities:{}},{},{aliasCatalog:renames});
 assert.equal(lookup.resolve({idx,settlement:'Черкаси',street:'вулиця Короленка'}).streetKey,'вулиця|володимирамономаха');
 assert.ok(lookup.suggest(idx,'Королен').some(([key])=>key==='вулиця|володимирамономаха'));
 assert.equal(lookup.renameHint(idx,'Короленка').newName,'вулиця Володимира Мономаха');
 assert.equal(lookup.resolve({idx,settlement:'Черкаси',street:'проспект Короленка'}).status,'nostreet');
 assert.equal(lookup.resolve({idx,settlement:'Черкаси',street:'Ціолковського'}).status,'nostreet',
  'Never invent a street when neither historical nor current name appears in index');
});

test('when only old name is in the operator index, current name uses exactly that documented street data',()=>{
 const current={streets:{'вулиця|ціолковського':'Вулиця Ціолковського'},
   keys:{'вулиця|ціолковського|5':['3.1']},streetQueues:{},localities:{}};
 const idx=mergeIndexes(current,{}, {aliasCatalog:renames});
 assert.equal(lookup.resolve({idx,settlement:'Черкаси',street:'Петра Прокоповича',house:'5'}).queue,'3.1');
 assert.equal(lookup.resolve({idx,settlement:'Черкаси',street:'Петра Прокоповича',house:'7'}).queue,undefined);
 assert.ok(lookup.suggest(idx,'Прокоповича').some(([key])=>key==='вулиця|ціолковського'));
});

test('the live operator key remains preferred over alias when both street names exist',()=>{
 const current={streets:{'провулок|гастелло':'Провулок Гастелло',
  'провулок|мистецький':'Провулок Мистецький'},
  keys:{'провулок|гастелло|12':['1.2'],'провулок|мистецький|12':['2.1']},
  streetQueues:{},localities:{}};
 const idx=mergeIndexes(current,{}, {aliasCatalog:renames});
 assert.equal(lookup.resolve({idx,settlement:'Черкаси',street:'Провулок Гастелло',house:'12'}).queue,'1.2');
 assert.equal(lookup.resolve({idx,settlement:'Черкаси',street:'Провулок Мистецький',house:'12'}).queue,'2.1');
});

test('renames cannot mix a lane with a street or a village of the same name',()=>{
 const idx=mergeIndexes({streets:{'вулиця|петраболбочана':'Вулиця Петра Болбочана',
   'провулок|петраболбочана':'Провулок Петра Болбочана',
   'вулиця|марусічурай':'Вулиця Марусі Чурай','провулок|марусічурай':'Провулок Марусі Чурай'},
  keys:{},streetQueues:{},localities:{}},{},{aliasCatalog:renames});
 const res=lookup.resolve({idx,settlement:'Черкаси',street:'провулок Ушакова'});
 assert.equal(res.streetKey,'провулок|петраболбочана');
 assert.equal(lookup.resolve({idx,settlement:'Черкаси',street:'провулок 8-го Березня'}).streetKey,'провулок|марусічурай');
 assert.equal(lookup.resolve({idx,settlement:'Черкаси',street:'вулиця 8-го Березня'}).status,'nostreet');
});

test('beta loads and caches aliases offline, without manufacturing queue metadata',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(app,/street_aliases\.json/);
 assert.match(app,/index=mergeIndexes\(live,backup,\{catalog,aliasCatalog\}\)/);
 assert.match(sw,/street_aliases\.json/);
 const city=mergeIndexes({streets:{'вулиця|володимирамономаха':'Вулиця Володимира Мономаха'},localities:{}},{},{aliasCatalog:renames});
 assert.deepEqual(city.streetQueues,{});
 assert.deepEqual(city.keys,{});
});
