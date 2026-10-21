import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createFeedbackStore} from '../push-server/feedback-store.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const setup=()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-office-'));
 const filePath=path.join(dir,'feedback.json');
 const store=createFeedbackStore({filePath});
 const receipt=store.submit({topic:'address',subject:'Невірна підчерга',message:'Не збігається підчерга в застосунку із графіком оператора.'},'127.0.0.31');
 return {store,receipt,filePath,done(){fs.rmSync(dir,{recursive:true,force:true})}};
};
test('office route persists private owner, due date, result and an audit with staff actor',()=>{
 const {store,receipt,filePath,done}=setup();
 try{
  const dueAt=new Date(Date.now()+2*86400000).toISOString();
  assert.deepEqual(store.change(receipt.id,{
   assignedTo:'moderator',dueAt,resolution:'Потрібна офіційна перевірка',
   priority:'high',status:'in_progress',expectedRevision:1
  },'owner'),{ok:true});
  const item=store.list().items[0];
  assert.equal(item.assignedTo,'moderator');
  assert.equal(item.dueAt,dueAt);
  assert.equal(item.resolution,'Потрібна офіційна перевірка');
  assert.equal(item.revision,2);
  assert.equal(item.activity.at(-1).by,'owner');
  assert.match(item.activity.at(-1).label,/Призначення виконавця/);
  const updated=createFeedbackStore({filePath}).list().items[0];
  assert.equal(updated.revision,2);
  const publicStatus=store.getStatus(receipt.id,receipt.token);
  assert.equal(publicStatus.assignedTo,undefined);
  assert.equal(publicStatus.resolution,undefined);
  assert.equal(publicStatus.activity,undefined);
  assert.equal(publicStatus.dueAt,undefined);
 }finally{done()}
});
test('concurrent editors cannot overwrite a newer ticket revision',()=>{
 const {store,receipt,done}=setup();
 try{
  store.change(receipt.id,{status:'in_progress',expectedRevision:1},'editor');
  assert.throws(()=>store.change(receipt.id,{resolution:'Стара версія',expectedRevision:1},'owner'),
    e=>e.statusCode===409);
  const after=store.list().items[0];
  assert.equal(after.revision,2);
  assert.equal(after.resolution,'');
  assert.equal(after.status,'in_progress');
 }finally{done()}
});
test('route rejects unexpected fields and invalid deadlines',()=>{
 const {store,receipt,done}=setup();
 try{
  assert.throws(()=>store.change(receipt.id,{assignedTo:'x'.repeat(61)}));
  assert.throws(()=>store.change(receipt.id,{dueAt:'not-a-date'}));
  assert.throws(()=>store.change(receipt.id,{resolution:'x'.repeat(801)}));
  assert.throws(()=>store.change(receipt.id,{admin:true}));
  assert.equal(store.list().items[0].revision,1);
 }finally{done()}
});
test('resolved tickets can reopen and keep the private activity history',()=>{
 const {store,receipt,done}=setup();
 try{
  store.change(receipt.id,{status:'resolved',resolution:'Перевірено'},'reviewer');
  assert.ok(store.list().items[0].resolvedAt);
  store.change(receipt.id,{status:'in_progress'},'reviewer');
  const item=store.list().items[0];
  assert.equal(item.resolvedAt,'');
  assert.equal(item.activity.length,3);
  assert.equal(item.revision,3);
 }finally{done()}
});
test('new office assets ship in beta output, not a static snapshot of user data',()=>{
 const builder=read('scripts/build_pages.py'),sw=read('sw.js'),page=read('admin.html');
 for(const asset of ['admin-ticket-workflow.js','admin-office-plus.js','admin-office-plus.css']){
  assert.ok(builder.includes("'"+asset+"'"),asset+' in site build');
  assert.ok(sw.includes('"./'+asset+'"'),asset+' in PWA cache inventory');
  assert.ok(page.includes('./'+asset),asset+' loaded by admin page');
 }
 assert.ok(page.includes('id="ticketViews"'));
 assert.ok(page.includes('id="ticketAssigneeFilter"'));
 assert.ok(page.includes('id="ticketSort"'));
 const frontend=read('admin-ticket-workflow.js');
 assert.doesNotMatch(frontend,/(?:localStorage|sessionStorage)\.setItem\([^,]+,\s*(?:tickets?|items?|messages?)/);
 assert.ok(frontend.includes('guard spreadsheet formula injection'));
});
