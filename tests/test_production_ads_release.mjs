import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAdsStore} from '../push-server/ads.js';

const PROD='https://svitlo-cherkasy.pp.ua';
const BETA='https://svitlo-cherkasy.pages.dev';
const makeDir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-production-ads-'));
const campaign={id:'local-one',title:'Тестова кампанія',description:'Тільки головна сторінка',
  enabled:true,link:'https://example.com',weight:1,seconds:8};

test('Production is available for the owner but advertising is OFF by default',()=>{
 const dir=makeDir();
 try{
  const store=createAdsStore({directory:dir,appOrigin:PROD});
  assert.equal(store.dashboard().commercialLocked,false);
  assert.equal(store.publicState().enabled,false);
  assert.deepEqual(store.publicState().campaigns,[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Owner can enable and disable campaigns on Production; choice persists across restart',()=>{
 const dir=makeDir();
 try{
  const store=createAdsStore({directory:dir,appOrigin:PROD});
  store.update({...store.dashboard().settings,enabled:true,campaigns:[campaign]});
  assert.equal(store.publicState().enabled,true);
  assert.deepEqual(store.publicState().campaigns.map(c=>c.id),['local-one']);
  assert.equal(store.event('local-one','impression'),true);
  const restarted=createAdsStore({directory:dir,appOrigin:PROD});
  assert.deepEqual(restarted.publicState().campaigns.map(c=>c.id),['local-one']);
  restarted.update({...restarted.dashboard().settings,enabled:false});
  assert.equal(restarted.publicState().enabled,false);
  assert.equal(restarted.publicState().campaigns.length,0);
  assert.equal(restarted.event('local-one','impression'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Historical Production drafts cannot turn themselves on during upgrade',()=>{
 const dir=makeDir();
 try{
  const existing=createAdsStore({directory:dir,appOrigin:BETA});
  existing.update({...existing.dashboard().settings,enabled:true,campaigns:[campaign]});
  existing.flush();
  const file=path.join(dir,'beta-ads.json');
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  saved.schemaVersion=2;
  fs.writeFileSync(file,JSON.stringify(saved));
  const prod=createAdsStore({directory:dir,appOrigin:PROD});
  assert.equal(prod.publicState().enabled,false);
  assert.equal(prod.dashboard().settings.campaigns.length,1,'Do not destroy existing drafts');
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).schemaVersion,3);
  const after=createAdsStore({directory:dir,appOrigin:PROD});
  assert.equal(after.publicState().enabled,false);
  after.update({...after.dashboard().settings,enabled:true});
  assert.equal(after.publicState().campaigns.length,1,'Explicit owner enable works after migration');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Unknown origins stay locked, even if advertising is enabled',()=>{
 const dir=makeDir();
 try{
  const store=createAdsStore({directory:dir,appOrigin:'https://untrusted.example'});
  store.update({...store.dashboard().settings,enabled:true,campaigns:[campaign]});
  assert.equal(store.dashboard().commercialLocked,true);
  assert.equal(store.publicState().enabled,false);
  assert.equal(store.publicState().campaigns.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Optional support remains independent of commercial master switch',()=>{
 const dir=makeDir();
 try{
  const store=createAdsStore({directory:dir,appOrigin:PROD});
  const config=store.dashboard().settings;
  store.update({...config,enabled:false,support:{...config.support,enabled:true,paymentUrl:'https://example.com/support'}});
  assert.equal(store.publicState().enabled,false);
  assert.equal(store.publicState().support.enabled,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Homepage-only advertising contract and authenticated owner write route remain intact',()=>{
 const root=new URL('../',import.meta.url);
 const html=fs.readFileSync(new URL('index.html',root),'utf8');
 const start=html.indexOf('<section id="home"'),ad=html.indexOf('id="betaAd"'),end=html.indexOf('<section id="graph"');
 assert.ok(start>=0&&ad>start,'Ad host lives inside Home');
 assert.ok(end<0||ad<end,'Ad host cannot be placed on graph');
 const admin=fs.readFileSync(new URL('push-server/admin.js',root),'utf8');
 assert.match(admin,/role!=='owner'.*permissions\.includes\('ads'\)/);
 const store=fs.readFileSync(new URL('push-server/ads.js',root),'utf8');
 assert.match(store,/enabled:s\.enabled===true/,'No accidental enabled legacy default');
});
