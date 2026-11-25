import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAppConfig,validateAppConfig} from '../push-server/app-config.js';

const localNotice=(overrides={})=>({
 id:'local_notice_1',title:'Планові роботи',body:'Перевірена інформація про роботи.',
 content:'Деталі робіт.',source:'https://www.cherkasyoblenergo.com/news',
 scope:'settlement',verified:true,kind:'important',priority:'important',
 queue:'all',delivery:'both',settlement:'Черкаси',images:[],pinned:false,
 active:true,publishedAt:new Date().toISOString(),updatedAt:null,
 scheduledAt:null,expiresAt:null,pushSentAt:null,...overrides
});
const temp=fn=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-local-notices-'));try{return fn(directory)}finally{fs.rmSync(directory,{recursive:true,force:true})}};

test('local notices require an explicit verification and an HTTPS source before publication',()=>{
 temp(directory=>{
  const store=createAppConfig({directory}),base=store.get();
  assert.throws(()=>validateAppConfig({...base,announcements:[localNotice({verified:false})]}),/перевірки та з HTTPS/);
  assert.throws(()=>validateAppConfig({...base,announcements:[localNotice({source:'http://example.com'})]}),/HTTPS/);
  assert.throws(()=>validateAppConfig({...base,announcements:[localNotice({settlement:''})]}),/Вкажіть населений пункт/);
  assert.throws(()=>validateAppConfig({...base,announcements:[localNotice({scope:'district',settlement:'Черкаси',verified:false})]}),/перевірки та з HTTPS/);
  const district=validateAppConfig({...base,announcements:[localNotice({scope:'district',settlement:''})]});
  assert.equal(district.announcements[0].scope,'district');
  assert.equal(district.announcements[0].settlement,'');
 });
});

test('local notices are delivered only when the feature is enabled and the notice is verified',()=>{
 temp(directory=>{
  const store=createAppConfig({directory});
  const state=store.get();
  state.announcements=[localNotice()];
  store.update(state);
  assert.equal(store.publicState().announcements.some(x=>x.id==='local_notice_1'),true);
  assert.equal(store.duePush().some(x=>x.id==='local_notice_1'),true);
  const disabled=store.get();
  disabled.site.flags.localAnnouncements=false;
  store.update(disabled);
  assert.equal(store.publicState().announcements.some(x=>x.id==='local_notice_1'),false);
  assert.equal(store.duePush().some(x=>x.id==='local_notice_1'),false);
 });
});

test('legacy settlement-targeted notices remain hidden until verified, then can be approved in place',()=>{
 temp(directory=>{
  const store=createAppConfig({directory});
  const old=store.get();
  old.announcements=[localNotice({scope:undefined,verified:undefined,source:'',settlement:'Слобода'})];
  store.update(old);
  const normalized=store.get().announcements[0];
  assert.equal(normalized.scope,'legacy');
  assert.equal(normalized.verified,false);
  assert.equal(store.publicState().announcements.some(x=>x.id==='local_notice_1'),false);
  const verified=store.get();
  verified.announcements[0].verified=true;
  verified.announcements[0].source='https://www.cherkasyoblenergo.com/news';
  store.update(verified);
  assert.equal(store.publicState().announcements.some(x=>x.id==='local_notice_1'),true);
 });
});
