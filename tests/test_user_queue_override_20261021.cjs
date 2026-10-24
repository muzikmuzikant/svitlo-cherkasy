'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resolve,chooseQueue,suggest}=require('../address-lookup.js');

const live=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/addresses.json'),'utf8'));
const override=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/manual_overrides.json'),'utf8'));
const {mergeIndexes}=require('../data-merge.js');
const catalog=mergeIndexes(live,override.addresses,{manual:true});
const city=(street,house)=>resolve({idx:catalog,settlement:'Черкаси',street,house});

test('reported prospect Peremohy 30 is not assigned 4.1 simply because nearby houses are',()=>{
  const lookup=city('Проспект Перемоги','30');
  assert.equal(lookup.status,'nohouse');
  assert.equal(lookup.reason,'house-unlisted');
  assert.equal(lookup.queue,undefined);
  assert.deepEqual(lookup.queues,['4.1']);
  assert.deepEqual(chooseQueue(lookup,'6.1'),{queue:'6.1',method:'manual'});
});

test('an exact catalog queue cannot override a verified personal selection',()=>{
  const reported=[
    ['Вулиця Нарбутівська','160/1','4.1'],
    ['Вулиця Петра Дорошенка','26','4.1']
  ];
  for(const [street,house,chosen] of reported){
    const lookup=city(street,house);
    assert.equal(lookup.status,'exact',street+' '+house);
    assert.equal(lookup.queue,'1.1',street+' '+house);
    assert.deepEqual(chooseQueue(lookup,chosen,true),{
      queue:'4.1',method:'manual-override'
    });
    assert.deepEqual(chooseQueue(lookup,''),{
      queue:'1.1',method:'automatic'
    });
  }
});

test('manual choices are available for all 12 official subqueues, including unchanged auto results',()=>{
  const lookup=city('Вулиця Нарбутівська','160/1');
  for(let number=1;number<=6;number++)for(const suffix of [1,2]){
    const queue=number+'.'+suffix;
    const chosen=chooseQueue(lookup,queue,true);
    assert.equal(chosen.queue,queue);
    assert.equal(chosen.method,'manual-override');
  }
  assert.equal(chooseQueue({status:'nostreet'},'').queue,null);
  assert.equal(chooseQueue({status:'incomplete'},'').queue,null);
});

test('Khomenka street and lane are discoverable in Heronymivka from other town searches',()=>{
  assert.equal(live.streets['вулиця|хоменка'],undefined, 'Import currently misses this official city street');
  assert.equal(catalog.streets['вулиця|хоменка'],'Вулиця Хоменка');
  assert.equal(city('Вулиця Хоменка','26').queue,'6.1');
  const result=suggest(catalog.localities['геронимівка'],'вулиця Хоменка');
  assert.ok(result.some(([key])=>key==='вулиця|хоменка'));
  assert.ok(result.every(([key])=>key.startsWith('вулиця|')));
  const inVillage=resolve({idx:catalog.localities['геронимівка'],settlement:'Геронимівка',street:'Вулиця Хоменка'});
  assert.ok(['possible','needhouse','nohouse'].includes(inVillage.status));
  assert.deepEqual(inVillage.queues,['4.1','5.1']);
});

test('manual queue selector is visible in the address sheet and its selection is saved',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  assert.match(html,/<div id="manualLookup" class="manual-lookup">/);
  assert.match(html,/<select id="manualQueue"/);
  assert.match(app,/manual\.hidden=r\.status==='incomplete'/);
  assert.match(app,/SvitloAddressLookup\.chooseQueue\(r,\$\('manualQueue'\)\.value/);
  assert.match(app,/method,?favorite/);
  assert.match(app,/!\['automatic','street-auto'\]\.includes\(item\.method\)/);
});
