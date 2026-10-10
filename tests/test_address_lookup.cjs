const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolve,suggest,streetMatches}=require('../address-lookup.js');
const ix={
 streets:{'вулиця|соборна':'Вулиця Соборна','вулиця|героївмайдану':'Вулиця Героїв Майдану','вулиця|лісова':'Вулиця Лісова','провулок|лісова':'Провулок Лісова','вулиця|узбережна':'Вулиця Узбережна'},
 streetQueues:{'вулиця|соборна':['1.1'],'вулиця|героївмайдану':['5.1','6.1'],'вулиця|лісова':['2.1'],'провулок|лісова':['3.2']},
 keys:{'вулиця|соборна|42':['1.1'],'вулиця|героївмайдану|12':['5.1'],'вулиця|героївмайдану|22':['6.1'],'вулиця|лісова|5':['4.2'],'вулиця|узбережна|1':['1.2'],'вулиця|узбережна|3':['1.2']}
};
const find=(street,house='',selectedKey)=>resolve({idx:ix,street,house,settlement:'Слобода',selectedKey});
test('single street-wide queue saved without house, even with same-queue known houses',()=>{
 assert.deepEqual([find('Соборна').status,find('Соборна').queue],['street','1.1']);
 assert.deepEqual([find('Соборна','100').status,find('Соборна','100').queue],['street','1.1']);
});
test('an exact address overrides conflicting general street hints',()=>{
 assert.deepEqual([find('Вулиця Лісова','5').status,find('Вулиця Лісова','5').queue],['exact','4.2']);
});
test('a conflicting house blocks auto-mapping of other houses on the same street',()=>{
 assert.deepEqual(find('Вулиця Лісова').status,'possible');
 assert.deepEqual(find('Вулиця Лісова').queues,['2.1','4.2']);
});
test('multiple queues on a street are never chosen automatically',()=>{
 assert.deepEqual(find('Героїв Майдану').queues,['5.1','6.1']);
 assert.equal(find('Героїв Майдану').status,'possible');
 assert.deepEqual([find('Героїв Майдану','22').status,find('Героїв Майдану','22').queue],['exact','6.1']);
});
test('single known house queue without whole-street listing still needs house',()=>{
 assert.equal(find('Узбережна').status,'needhouse');
 assert.equal(find('Узбережна','99').status,'nohouse');
 assert.equal(find('Узбережна','3').queue,'1.2');
});
test('street and lane names are disambiguated using type or suggestion',()=>{
 assert.equal(find('Лісова').status,'ambiguous');
 assert.equal(find('Провулок Лісова').queue,'3.2');
 assert.deepEqual(streetMatches(ix,'Лісова','провулок|лісова').map(x=>x[0]),['провулок|лісова']);
});
test('search suggestions prioritize starts and respect the street type',()=>{
 assert.equal(suggest(ix,'пров. Ліс')[0][0],'провулок|лісова');
 assert.equal(suggest(ix,'Узбер')[0][0],'вулиця|узбережна');
});
test('no data and missing user input are clear unknowns rather than guessed queue',()=>{
 assert.equal(find('Невідома').status,'nostreet');
 assert.equal(resolve({idx:ix,street:'Лісова',settlement:''}).status,'incomplete');
 assert.equal(resolve({idx:{streets:{}},street:'Лісова',settlement:'Черкаси'}).status,'unavailable');
});
test('duplicate exact house rows do not auto-resolve',()=>{
 const broken={...ix,keys:{...ix.keys,'вулиця|соборна|42':['1.1','6.2']}};
 const r=resolve({idx:broken,settlement:'Слобода',street:'Соборна',house:'42'});
 assert.equal(r.status,'possible');assert.deepEqual(r.queues,['1.1','6.2']);
});
