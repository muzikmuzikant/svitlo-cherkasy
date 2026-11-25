import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAdsStore} from '../push-server/ads.js';
test('commercial formats and tariff discounts are normalized and exposed safely',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-commercial-'));let now=Date.parse('2026-11-25T10:00:00Z');
 try{const store=createAdsStore({directory:dir,clock:()=>now});
  const report=store.update({enabled:true,packages:[{id:'basic',title:'Базовий',price:1000,durationDays:30,visible:true}],
   campaigns:[{id:'special_1',title:'Велике промо',description:'Опис',link:'https://example.com',enabled:true,placement:'special'}],
   permanentPartner:{enabled:true,name:'Партнер',description:'Підтримує сервіс',url:'https://example.com'},
   partnerOffers:[{id:'offer_1',title:'Знижка',description:'Опис',discountLabel:'-10%',code:'LIGHT10',link:'https://example.com',enabled:true}],
   discounts:[{id:'discount_1',scope:'all',kind:'percent',amount:10,enabled:true,start:'2026-11-24T00:00:00Z',end:'2026-11-26T00:00:00Z'}]});
  const data=store.publicState();assert.equal(data.campaigns.length,0);assert.equal(data.specialPlacements.length,1);
  assert.equal(data.permanentPartner.name,'Партнер');assert.equal(data.partnerOffers[0].code,'LIGHT10');
  assert.equal(data.packages[0].originalPrice,1000);assert.equal(data.packages[0].price,900);assert.equal(data.packages[0].discount.label,'-10%');
  assert.equal(store.event('special_1','impression'),true);assert.equal(store.event('offer_1','click'),true);assert.equal(report.settings.discounts.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('discounts can target a single tariff and invalid partner links are rejected',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-commercial-validation-'));
 try{const store=createAdsStore({directory:dir});store.update({enabled:true,packages:[{id:'basic',title:'Базовий',price:1000},{id:'pro',title:'Преміум',price:2000}],discounts:[{id:'d1',scope:'specific',packageId:'pro',kind:'fixed',amount:500,enabled:true}]});
  const packs=store.publicState().packages;assert.equal(packs.find(x=>x.title==='Базовий').price,1000);assert.equal(packs.find(x=>x.title==='Преміум').price,1500);
  assert.throws(()=>store.update({partnerOffers:[{id:'bad',title:'X',link:'javascript:alert(1)'}]}));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
