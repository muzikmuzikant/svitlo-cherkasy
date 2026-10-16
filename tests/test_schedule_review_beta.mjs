import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createScheduleReview} from '../push-server/schedule-review.js';
import {createSchedulePublication} from '../push-server/schedule-publication.js';
const Q=Array.from({length:6},(_,i)=>[1,2].map(j=>String(i+1)+'.'+j)).flat();
const date=new Date().toISOString().slice(0,10);
const article='https://www.cherkasyoblenergo.com/media/hrafik-test-na-sohodni?lang=uk';
const stamp=new Date().toISOString();
const queues=()=>Object.fromEntries(Q.map(q=>[q,{knownFrom:'00:00',off:[['09:00','10:00']]}]));
const approved=()=>Object.fromEntries(Q.map(q=>[q,[['17:00','19:00']]]));
const snap=()=>({schemaVersion:3,lastChecked:stamp,reviewPending:true,
 unresolvedDates:[date],confirmedNoScheduleDates:[],days:[{
  date,source:'https://www.cherkasyoblenergo.com/media/previous',verified:true,
  publishedAt:'2026-10-15T17:00:00Z',queues:queues()
 }],changes:[]});
const review=()=>({schemaVersion:1,lastChecked:stamp,rejectedCount:0,warningCount:1,items:[{
 code:'UNREADABLE_ARTICLE',targetDate:date,source:article,sourceHash:'article-revision-hash',
 reason:'Source requires review'
}]});
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-review-'));
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('owner approval persists, only applies to affected source while parser cannot read it',()=>{
 const directory=dir();
 try{
  const approvals=createScheduleReview({directory});
  const publisher=createSchedulePublication({directory,token:'x'.repeat(40),reviewApprovals:approvals});
  publisher.update(snap(),review());
  assert.equal(publisher.schedule().reviewPending,true);
  assert.equal(publisher.review().items.length,1);
  assert.equal(approvals.list(publisher.rawSchedule(),publisher.rawReview()).days.length,1);
  const out=approvals.approve({date,source:article,sourceHash:'article-revision-hash',queues:approved(),confirmed:true},
   publisher.rawSchedule(),publisher.rawReview());
  assert.equal(out.ok,true);
  let daily=publisher.schedule().days.find(d=>d.date===date);
  assert.equal(daily.manualReview,true);
  assert.deepEqual(daily.queues['6.2'].off,[['17:00','19:00']]);
  assert.deepEqual(publisher.rawSchedule().days[0].queues['6.2'].off,[['09:00','10:00']]);
  assert.equal(publisher.schedule().reviewPending,false);
  assert.equal(publisher.review().items.length,0);
  assert.equal(publisher.schedule().changes.length,1,'verified adjustment is a real schedule change');
  // Repeated official checks must not turn the existing approved date back into a warning.
  const another={...snap(),lastChecked:new Date(Date.now()+1000).toISOString()};
  publisher.update(another,review());
  assert.equal(publisher.schedule().reviewPending,false);
  const restored=createScheduleReview({directory});
  assert.equal(restored.list(publisher.rawSchedule(),publisher.rawReview()).approvals[0].active,true);
  // The approval is bound to the exact article revision. If the source changes, stop applying it.
  const next=review();next.items[0].sourceHash='new-updated-revision';
  publisher.update({...another,lastChecked:new Date(Date.now()+2000).toISOString()},next);
  assert.equal(publisher.schedule().reviewPending,true);
  assert.equal(publisher.schedule().days[0].manualReview,undefined);
  assert.equal(restored.list(publisher.rawSchedule(),publisher.rawReview()).approvals[0].active,false);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});

test('reject unverified or incomplete schedules, invalid dates, spoofed sources, overlapping hours',()=>{
 const directory=dir();
 try{
  const approvals=createScheduleReview({directory});
  const approve=input=>approvals.approve(input,snap(),review());
  const valid={date,source:article,sourceHash:'article-revision-hash',queues:approved(),confirmed:true};
  assert.throws(()=>approve({...valid,confirmed:false}),/Підтвердьте/);
  assert.throws(()=>approve({...valid,source:'https://example.com/media/false'}),/офіційн/);
  assert.throws(()=>approve({...valid,sourceHash:'stale-version'}),/змінено/);
  assert.throws(()=>approve({...valid,date:'2001-01-01'}),/актуальні/);
  assert.throws(()=>approve({...valid,queues:{'1.1':[]}}),/12 підчерг/);
  assert.throws(()=>approve({...valid,queues:{...approved(),'2.1':[['11:00','12:00'],['11:30','13:00']]} }),/перетинаються/);
  assert.throws(()=>approve({...valid,queues:{...approved(),'2.1':[['23:00','25:00']]} }),/час/);
  assert.throws(()=>approve({...valid,source:'https://www.cherkasyoblenergo.com/media/other'}),/немає/);
  approve(valid);
  const result=approvals.revoke(date);
  assert.equal(result.ok,true);
  assert.equal(approvals.list(snap(),review()).approvals.length,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});

test('legacy feed without content hash requires fresh approval after importer adds a hash',()=>{
 const directory=dir();
 try{
  const approvals=createScheduleReview({directory});
  const legacy=review();delete legacy.items[0].sourceHash;
  const input={date,source:article,queues:approved(),confirmed:true};
  approvals.approve(input,snap(),legacy);
  assert.equal(approvals.list(snap(),legacy).approvals[0].active,true);
  assert.equal(approvals.list(snap(),review()).approvals[0].active,false,
   'do not silently trust unversioned approval once a content fingerprint is available');
  assert.equal(approvals.effective(snap(),review()).schedule.reviewPending,true);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});

test('client publishes only after explicit owner review; parser records source hash',()=>{
 const client=source('admin-source-review.js'),html=source('admin.html');
 const importer=source('scripts/update_data.py'),server=source('push-server/server.js');
 const router=source('push-server/admin.js'),builder=source('scripts/build_pages.py');
 assert.match(client,/reviewApprovalConfirmed/);
 assert.match(client,/for\(const q of QUEUES\)/);
 assert.match(client,/schedule\/review\/approve/);
 assert.match(client,/schedule\/review\/approval/);
 assert.match(html,/id="reviewApprovalQueues"/);
 assert.match(html,/admin-source-review\.js/);
 assert.match(builder,/admin-source-review\.js/);
 assert.match(router,/role!=='owner'/);
 assert.match(router,/schedule\/review\/approve/);
 assert.match(server,/reviewApprovals:scheduleReview/);
 assert.match(importer,/publication_fingerprint/);
 assert.match(importer,/sourceHash/);
 assert.match(importer,/not prev\.get\('manualReview'\)/);
});
