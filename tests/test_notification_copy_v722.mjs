import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transitionCopy,tomorrowCopy,changeCopy,emergencyCopy,testCopy} from '../push-server/notification-copy.js';

test('outage reminder is short, helpful and forecast-only',()=>{
 const msg=transitionCopy('off','1.1',16*60,30);
 assert.equal(msg.title,'🔴 Відключення через 30 хв');
 assert.match(msg.body,/Підчерга 1\.1/);
 assert.match(msg.body,/16:00/);
 assert.match(msg.content,/плановий час, а не підтвердження стану мережі/);
 assert.ok(msg.body.length<100);
});
test('restoration reminder works across midnight and does not claim sensor reading',()=>{
 const msg=transitionCopy('on','6.2',24*60+15,15);
 assert.equal(msg.title,'🟢 Відновлення через 15 хв');
 assert.match(msg.body,/00:15/);
 assert.doesNotMatch(msg.body,/світло вже є/i);
});
test('new schedule and change announcements name day and queue clearly',()=>{
 const next=tomorrowCopy('2.1','2026-10-13');
 const changed=changeCopy('2.1','2026-10-12');
 assert.match(next.title,/🗓️/);
 assert.match(next.body,/13 жовтня/);
 assert.match(changed.title,/🔄/);
 assert.match(changed.body,/12 жовтня/);
 assert.throws(()=>tomorrowCopy('1.1','2026-02-30'));
});
test('emergency and test copy has distinct emoji and cautious wording',()=>{
 assert.match(emergencyCopy('active').title,/⚠️/);
 assert.match(emergencyCopy('active').body,/Оператор повідомив/);
 assert.match(emergencyCopy('ended').title,/✅/);
 assert.equal(emergencyCopy('notice'),null);
 assert.match(testCopy().title,/🧪/);
});
test('Railway delivery, iOS service worker and local fallback use the new style',()=>{
 const server=readFileSync(new URL('../push-server/server.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(server,/transitionCopy\(type,q,boundary,eta,boundary>=1440\?nextDate:now.date\)/);
 assert.match(server,/const changedDay=verifiedScheduleDay\(source,change\.date,timestamp\)/);
 assert.match(server,/changeCopy\(q,change\.date,changedDay\)/);
 assert.match(sw,/lang:'uk'/);
 assert.match(sw,/icon-192-v692.png/);
 assert.match(app,/🔴 Відключення/);
 assert.match(app,/🟢 Відновлення/);
 assert.match(app,/🗓️ Графік на завтра/);
 assert.doesNotMatch(app,/icon-192-v673.png/);
});
