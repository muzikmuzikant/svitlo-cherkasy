import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tomorrowKey,alreadySentTomorrow} from '../push-server/tomorrow-dedupe.js';
import {dayId,firstPublishedAt,tomorrowCopy} from '../push-server/notification-copy.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('same subscriber receives exactly one tomorrow preview across repeated imports and edits',()=>{
 const subscriber='8294c8e3a706',targetDate='2026-10-17';
 const sent={},revisions=[
  {date:targetDate,publishedAt:'2026-10-16T17:05:00+03:00',publications:[{publishedAt:'2026-10-16T17:05:00+03:00'}]},
  {date:targetDate,publishedAt:'2026-10-16T18:02:00+03:00',publications:[{publishedAt:'2026-10-16T18:02:00+03:00'}]},
  {date:targetDate,publishedAt:'2026-10-16T21:41:00+03:00',publications:[{publishedAt:'2026-10-16T21:41:00+03:00'}]}
 ];
 let deliveries=0;
 for(const day of revisions){
  const key=tomorrowKey(subscriber,targetDate);
  if(!alreadySentTomorrow(sent,subscriber,targetDate)){
   deliveries++;
   sent[key]=firstPublishedAt(day);
  }
  assert.equal(dayId('6.1',day),'day:6.1:2026-10-17');
 }
 assert.equal(deliveries,1,'a new revision must not schedule a new daily Push');
 assert.equal(Object.keys(sent).length,1);
 assert.equal(tomorrowKey('other',targetDate),'other:tomorrow:2026-10-17');
 assert.equal(alreadySentTomorrow(sent,'other',targetDate),false,'other subscription is independent');
 assert.equal(alreadySentTomorrow(sent,subscriber,'2026-10-18'),false,'next calendar date can notify once');
});

test('legacy timestamp-qualified delivery keys avoid one more duplicate on upgrade',()=>{
 const prefix='aaabbb',date='2026-10-17';
 const oldKey=prefix+':tomorrow:'+date+':2026-10-16T18:00:00+03:00';
 assert.equal(alreadySentTomorrow({[oldKey]:'2026-10-16T18:05:00Z'},prefix,date),true);
 assert.equal(alreadySentTomorrow({[oldKey]:null},prefix,date),true,'do not resend on known prior record');
 assert.equal(alreadySentTomorrow({[prefix+':tomorrow:2026-10-18']:'ok'},prefix,date),false);
 assert.equal(alreadySentTomorrow({},prefix,date),false);
 assert.throws(()=>tomorrowKey(prefix,'bad-day'));
});

test('client and server use stable canonical day notification IDs while change alerts stay independent',()=>{
 const client=read('notification-text.js');
 const pushServer=read('push-server/server.js');
 assert.match(client,/const dayId=\(q,d\)=>'day:'\+q\+':'\+d\.date;/);
 assert.match(pushServer,/alreadySentTomorrow\(sent,prefix,nextDate\)/);
 assert.match(pushServer,/tomorrowKey\(prefix,nextDate\)/);
 assert.match(pushServer,/notificationId:dayId\(q,tomorrow\)/);
 assert.match(pushServer,/notificationId:changeId\(q,change\)/,'genuine schedule revisions can still generate distinct alerts');
 assert.doesNotMatch(pushServer,/\$\{prefix\}:tomorrow:\$\{nextDate\}:\$\{revision\}/);
 const day={date:'2026-10-17',verified:true,queues:{'6.1':{off:[['19:00','20:00']]}}};
 const msg=tomorrowCopy('6.1',day.date,day);
 assert.equal(msg.title,'🗓️ Графік на завтра');
});
