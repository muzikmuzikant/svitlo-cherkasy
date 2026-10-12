import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import copy from '../notification-text.js';
import {dayId,changeId} from '../push-server/notification-copy.js';
const day={date:'2026-10-13',publishedAt:'2026-10-12T20:24+03:00',verified:true,queues:{'6.1':{knownFrom:'00:00',off:[['12:00','14:00'],['18:00','20:00']]}}};
test('Push and Inbox use a stable canonical publication ID',()=>{
 assert.equal(copy.dayId('6.1',day),dayId('6.1',day));
 assert.equal(copy.dayId('6.1',{...day,publishedAt:'2026-10-13T09:00+03:00',publications:[{publishedAt:day.publishedAt}]}),copy.dayId('6.1',day));
 const change={date:day.date,publishedAt:'2026-10-13T09:00+03:00',revisionId:'abcd',queues:['6.1']};
 assert.notEqual(copy.dayId('6.1',day),changeId('6.1',change));
 assert.ok(copy.isLatestRevision(change,{...day,planFingerprint:'abcd'},'6.1'));
 assert.equal(copy.isLatestRevision(change,day,'5.2'),false);
});
test('automatic messages have real, schedule-specific expanded descriptions',()=>{
 const m=copy.tomorrowCopy('6.1',day.date,day);
 assert.match(m.content,/12:00–14:00/);
 assert.match(m.content,/18:00–20:00/);
 assert.ok(m.content.length>m.body.length);
 assert.ok(copy.changeCopy('6.1',day.date,day).content.length>100);
 assert.ok(copy.transitionCopy('off','6.1',720,30,day.date).content.length>100);
 assert.ok(copy.emergencyCopy('active').content.length>100);
});
test('both unwanted blocks are absent from schedule UI',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="detailVerified"/);
 assert.doesNotMatch(html,/Години з частковим відключенням поділено/);
});
