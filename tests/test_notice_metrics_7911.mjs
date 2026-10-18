import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createNoticeMetrics} from '../push-server/notice-metrics.js';
import {createManualPush} from '../push-server/manual-push.js';

const file=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const create=()=>fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-notice-'));
const ids=Array.from({length:6},()=>crypto.randomUUID());
const note='n_notice7911';

test('custom notice analytics count installations, not repeated views; protect small cohorts',()=>{
 const directory=create();let now=Date.now();
 try{
  const store=createNoticeMetrics({directory,clock:()=>now});
  for(const id of ids){
   assert.equal(store.event({noticeId:note,installId:id,type:'seen'}),true);
   store.event({noticeId:note,installId:id,type:'seen'});
   store.event({noticeId:note,installId:id,type:'opened'});
   store.event({noticeId:note,installId:id,type:'read'});
  }
  store.event({noticeId:note,installId:ids[0],type:'pushClick'});
  let stats=store.report([note]).items[note];
  assert.equal(stats.seen,6);
  assert.equal(stats.opened,6);
  assert.equal(stats.read,6);
  assert.equal(stats.readOfOpened,100);
  assert.equal(stats.pushClick,'<5','small cohort is suppressed in API, not just UI');
  assert.equal(store.event({noticeId:'wrong',installId:ids[0],type:'read'}),false);
  assert.equal(store.event({noticeId:note,installId:ids[0],type:'arbitrary'}),false);
  store.push(note,{attempted:7,accepted:6,failed:1,expired:0});
  stats=store.report([note]).items[note];
  assert.equal(stats.pushAttempted,7);
  assert.equal(stats.pushAccepted,6);
  assert.equal(stats.pushFailed,'<5');
  store.flush();
  const raw=fs.readFileSync(path.join(directory,'notice-metrics-v1.json'),'utf8');
  assert.ok(!raw.includes(ids[0]),'raw device ID never persisted');
  assert.ok(!raw.includes('endpoint')&&!raw.includes('street')&&!raw.includes('house'));
  const reloaded=createNoticeMetrics({directory,clock:()=>now});
  assert.equal(reloaded.report([note]).items[note].opened,6,'survives restart');
  reloaded.forget(ids[0]);
  assert.equal(reloaded.report([note]).items[note].opened,5,'consent withdrawal erases contribution');
  now+=61*86400000;
  assert.equal(reloaded.report([note]).items[note].opened,0,'retention expires');
  reloaded.flush();
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});

test('manual custom Push accepted by provider, not falsely reported as delivered or read',async()=>{
 const subscribers={a:{subscription:{endpoint:'https://web.push.apple.com/a'}}};
 const callbacks=[],calls=[];
 const sender=createManualPush({subscribers,webpush:{
  async sendNotification(subscription,payload){calls.push({subscription,payload:JSON.parse(payload)})}
 },appUrl:'https://svitlo-cherkasy.pages.dev/',hash:()=>String('a'),save:()=>{},onBroadcast:(id,result)=>callbacks.push({id,result})});
 const result=await sender.broadcast({title:'Оголошення',body:'Тестовий текст',queue:'all',
  notificationId:'notice:'+note,confirmSend:true});
 assert.equal(result.attempted,1);
 assert.equal(result.accepted,1);
 assert.equal(callbacks.length,1);
 assert.equal(callbacks[0].id,'notice:'+note);
 assert.equal(calls[0].payload.notificationId,'notice:'+note);
 assert.equal(calls[0].payload.kind,'announcement');
});

test('PWA reports only after voluntary consent and actual actions, not passive loading',()=>{
 const inbox=file('inbox-ui.js'),sw=file('sw.js'),admin=file('admin.html'),server=file('push-server/server.js');
 assert.match(inbox,/svitlo-beta-analytics-consent-revision/);
 assert.match(inbox,/7\.9\.11-notices/);
 assert.match(inbox,/document\.hidden/);
 assert.match(inbox,/setTimeout\(\(\)=>\{/);
 assert.match(inbox,/trackNotice\(id,'read'\)/);
 assert.match(inbox,/IntersectionObserver/);
 assert.match(inbox,/data-notice-id/);
 assert.match(sw,/SVITLO_NOTICE_PUSH_CLICK/);
 assert.match(sw,/pushclick/);
 assert.match(server,/ads\.hasInstallation\(data\?\.installId\)/);
 assert.match(server,/noticeMetrics\.forget\(body\?\.id\)/);
 assert.match(admin,/opsNoticeMetrics/);
 assert.match(file('privacy.html'),/взаємодію з повідомленнями/);
 assert.match(file('beta-ads.js'),/7\.9\.11-notices/);
 assert.match(JSON.parse(file('release.json')).version,/^7\.9\.(?:11|12)$/);
});
