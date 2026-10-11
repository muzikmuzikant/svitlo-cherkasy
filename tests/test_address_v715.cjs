const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resolve,knownHouses,houseKey}=require('../address-lookup.js');
const idx={
 streets:{'вулиця|грушевського':'Вулиця Грушевського','вулиця|соборна':'Вулиця Соборна'},
 keys:{'вулиця|грушевського|12а':['1.1'],'вулиця|грушевського|14':['6.1'],'вулиця|грушевського|14/1':['5.1']},
 streetQueues:{'вулиця|грушевського':['1.1','6.1'],'вулиця|соборна':['1.1','6.1']}
};
const lookup=(street,house='',ix=idx)=>resolve({idx:ix,settlement:'Слобода',street,house});
test('house number typed with Latin A resolves exact Cyrillic address',()=>{
 assert.equal(houseKey(' 12-А '),houseKey('12-A'));
 assert.deepEqual([lookup('Грушевського','12-A').status,lookup('Грушевського','12-A').queue],['exact','1.1']);
});
test('house /1 stays distinct from building without /1',()=>{
 assert.equal(lookup('Грушевського','14').queue,'6.1');
 assert.equal(lookup('Грушевського','14/1').queue,'5.1');
 assert.equal(lookup('Грушевського','14-1').status,'possible');
});
test('a missing house is never guessed from neighbors',()=>{
 const r=lookup('Грушевського','13');
 assert.equal(r.status,'possible');assert.equal(r.reason,'house-unlisted');
 assert.equal(r.knownHouses.length,3);
});
test('street with only multi-queue hints honestly says there is no house index',()=>{
 const r=lookup('Соборна','22');
 assert.equal(r.status,'possible');assert.equal(r.reason,'no-house-index');
 assert.equal(r.hasHouseData,false);assert.deepEqual(r.queues,['1.1','6.1']);
});
test('house options are sorted numerically and reflect source queue',()=>{
 const houses=knownHouses(idx,'вулиця|грушевського');
 assert.deepEqual(houses.map(h=>h.number),['12а','14','14/1']);
 assert.deepEqual(houses[2].queues,['5.1']);
});
test('real Sloboda street has no confirmed house number entries; do not claim exact',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/published_street_fallback.json')));
 const r=lookup('Вулиця Соборна','15',data.localities.слобода);
 assert.equal(r.status,'possible');assert.equal(r.reason,'no-house-index');
});
test('UI has visible house hints and does not clear chosen queue when typing a house',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 for(const tag of ['houseCoverage','houseChoices','manualExplanation'])assert.match(html,new RegExp('id="'+tag+'"'));
 assert.match(app,/\$\('house'\)\.oninput=/);
 assert.match(app,/номери будинків у джерелі не вказані/);
});
