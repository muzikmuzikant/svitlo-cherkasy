import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {mergeIndexes}=require('../data-merge.js');
const lookup=require('../address-lookup.js');
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const idx=mergeIndexes(read('data/addresses.json'),read('data/published_street_fallback.json'),
 {catalog:read('data/street_catalog.json'),aliasCatalog:read('data/street_aliases.json')});
function check(street,house,expected,status='exact'){
 const r=lookup.resolve({idx,street,house,settlement:'Черкаси'});
 assert.equal(r.status,status,JSON.stringify({street,house,result:r}));
 assert.equal(r.queue,expected,street+' '+house);
 return r;
}
test('municipal consolidated 2022 decisions broaden matches without inventing queue lists',()=>{
 assert.ok(idx.aliases.length>=119);
 assert.ok(idx.aliases.some(p=>p.oldName==='вулиця Добровольського'&&p.newName==='вулиця Сінна'));
 assert.equal(idx.aliases.filter(x=>x.newName.startsWith('сквер')).length,0);
});
test('city new name Volodymyra Monomakha retrieves exact OLD Korolenka operator house queue',()=>{
 const r=check('вулиця Володимира Мономаха','10','2.1');
 assert.equal(r.streetKey,'вулиця|короленка');
 assert.equal(r.verifiedRename,true);
 assert.equal(r.sourceStreet,'Вулиця Короленка');
 assert.match(r.renameSource,/chmr/);
 assert.equal(check('Володимира Мономаха','10/3','2.1').streetKey,'вулиця|короленка');
 assert.equal(check('Короленка','10','2.1').verifiedRename,undefined);
});
test('modern Mystetskyi lane resolves officially listed old Hastello lane at house 4',()=>{
 const r=check('провулок Мистецький','4','3.1');
 assert.equal(r.verifiedRename,true);
 assert.equal(r.streetKey,'провулок|гастелло');
 assert.equal(check('Гастелло','4','3.1').verifiedRename,undefined);
 assert.equal(lookup.resolve({idx,street:'вулиця Мистецька',house:'4',settlement:'Черкаси'}).status,'nostreet');
});
test('modern Monastyrskyi lane retrieves old Nekrasova houses with same queue',()=>{
 const r=check('провулок Монастирський','5','4.1');
 assert.equal(r.sourceStreet,'Провулок Некрасова');
 assert.equal(lookup.resolve({idx,street:'провулок Монастирський',house:'1222',settlement:'Черкаси'}).queue,'4.1');
});
test('retyped old lane now a modern STREET crosses types only on cited renaming',()=>{
 const r=check('вулиця Агатангела Кримського','10','1.1');
 assert.equal(r.streetKey,'провулок|атамановського');
 assert.equal(lookup.resolve({idx,street:'провулок Агатангела Кримського',house:'10',settlement:'Черкаси'}).status,'nostreet');
});
test('modern Ivan Kozhedub is listed but no official house queue, must not borrow fake queue',()=>{
 const r=lookup.resolve({idx,street:'вулиця Івана Кожедуба',house:'10',settlement:'Черкаси'});
 assert.equal(r.queue,undefined);
 assert.equal(r.status,'possible');
 assert.equal(r.reason,'reported-only');
});
test('old street that was split across 2 modern names never inherits arbitrary historic queue',()=>{
 const r=lookup.resolve({idx,street:'вулиця Гагаріна',house:'4',settlement:'Черкаси'});
 assert.equal(r.reason,'split-rename');
 assert.equal(r.queue,undefined);
});
test('geo-only names without official mapping remain visible but never fake queue',()=>{
 const r=lookup.resolve({idx,street:'вулиця Івана Кожедуба',settlement:'Черкаси'});
 assert.equal(r.queue,undefined);
 const rural=idx.localities.слобода;
 const r2=lookup.resolve({idx:rural,street:'Філатова',settlement:'Слобода'});
 assert.equal(r2.queue,undefined);
});
test('street with 2 electricity queues still needs exact house and preserves conflicts',()=>{
 const r=lookup.resolve({idx,street:'вулиця Петра Дорошенка',house:'1',settlement:'Черкаси'});
 assert.equal(r.status,'exact');assert.equal(r.queue,'1.1');
 const r2=lookup.resolve({idx,street:'вулиця Петра Дорошенка',house:'1/2',settlement:'Черкаси'});
 assert.equal(r2.queue,'4.1');
 const r3=lookup.resolve({idx,street:'вулиця Петра Дорошенка',house:'99999',settlement:'Черкаси'});
 assert.equal(r3.queue,undefined);
});
test('a city rename cannot leak to another village with the same old street name',()=>{
 const local=idx.localities.слобода;
 assert.equal(local.aliases,undefined);
 const a=lookup.resolve({idx:local,street:'вулиця Короленка',house:'10',settlement:'Слобода'});
 assert.equal(a.queue,undefined);
});
test('selected geo-only candidate must bridge to verified official house record',()=>{
 const r=lookup.resolve({idx,street:'Вулиця Володимира Мономаха',house:'11',
   settlement:'Черкаси',selectedKey:'вулиця|володимирамономаха'});
 assert.equal(r.queue,'2.1');
 assert.equal(r.streetKey,'вулиця|короленка');
});
test('when both renamed names contain officially confirmed but different houses, do not mix their keys',()=>{
 const fixture={streets:{'вулиця|стара':'Вулиця Стара','вулиця|нова':'Вулиця Нова'},
   keys:{'вулиця|стара|3':['1.1'],'вулиця|нова|3':['4.1']},
   streetQueues:{'вулиця|стара':['1.1'],'вулиця|нова':['4.1']},
   aliases:[{oldName:'вулиця Стара',newName:'вулиця Нова',source:'https://chmr.gov.ua/'}]};
 const a=lookup.resolve({idx:fixture,street:'вулиця Нова',house:'3',settlement:'Черкаси'});
 const b=lookup.resolve({idx:fixture,street:'вулиця Стара',house:'3',settlement:'Черкаси'});
 assert.equal(a.queue,'4.1');
 assert.equal(b.queue,'1.1');
});
test('merely similar street names cannot be used to match queues',()=>{
 const r=lookup.resolve({idx,street:'вулиця Володимира Мономахова',house:'10',settlement:'Черкаси'});
 assert.equal(r.queue,undefined);
});
