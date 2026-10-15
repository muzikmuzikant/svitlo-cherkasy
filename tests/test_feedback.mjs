import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createFeedbackStore,validateFeedback} from '../push-server/feedback-store.js';

const makeStore=(clock=()=>Date.now())=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-feedback-'));
 return {filePath:path.join(temp,'feedback.json'),store:createFeedbackStore({filePath:path.join(temp,'feedback.json'),clock}),cleanup:()=>fs.rmSync(temp,{recursive:true,force:true})};
};
const sample={topic:'bug',message:'У застосунку не відкривається пошук адреси.'};

test('validates input, email and prevents large/empty/spam messages',()=>{
 assert.deepEqual(validateFeedback({...sample,email:'test@example.com'}),{...sample,email:'test@example.com'});
 for(const invalid of [{...sample,topic:'hack'},{...sample,message:'short'},{...sample,message:'q'.repeat(2001)},{...sample,email:'a @ b'},{...sample,website:'bot'}])assert.throws(()=>validateFeedback(invalid));
});
test('anonymous submission persisted on disk, with ticket and no sender IP stored',()=>{
 const {filePath,store,cleanup}=makeStore();try{
  const receipt=store.submit(sample,'203.0.113.12');assert.match(receipt.id,/^SC-[A-F0-9]{10}$/);
  const saved=JSON.parse(fs.readFileSync(filePath,'utf8'));
  assert.equal(saved.items.length,1);assert.ok(!JSON.stringify(saved).includes('203.0.113.12'));
  assert.equal(createFeedbackStore({filePath}).list().items[0].id,receipt.id);
 }finally{cleanup()}
});
test('three submissions per 15 minutes then 429, different IP allowed',()=>{
 let now=Date.now();const {store,cleanup}=makeStore(()=>now);try{
  for(let i=0;i<3;i++)store.submit(sample,'203.0.113.8');
  assert.throws(()=>store.submit(sample,'203.0.113.8'),e=>e.statusCode===429);
  assert.equal(store.submit(sample,'198.51.100.11').ok,true);
  now+=15*60*1000;assert.equal(store.submit(sample,'203.0.113.8').ok,true);
 }finally{cleanup()}
});
test('admin status and delete, unknown statuses rejected',()=>{
 const {store,cleanup}=makeStore();try{
  const {id}=store.submit(sample,'1');assert.deepEqual(store.change(id,'in_progress'),{ok:true});
  assert.equal(store.list().items[0].status,'in_progress');assert.throws(()=>store.change(id,'spam'));
  assert.deepEqual(store.remove(id),{ok:true});assert.equal(store.list().count,0);assert.throws(()=>store.remove(id),e=>e.statusCode===404);
 }finally{cleanup()}
});
test('ninety-day expiry removes records when reopened',()=>{
 let now=Date.now();const {filePath,store,cleanup}=makeStore(()=>now);try{
  store.submit(sample,'1');now+=91*86400_000;
  assert.equal(createFeedbackStore({filePath,clock:()=>now}).list().count,0);
  assert.equal(JSON.parse(fs.readFileSync(filePath)).items.length,0);
 }finally{cleanup()}
});
test('public build includes feedback files, private store stays out of GitHub Pages',()=>{
 const root=new URL('../',import.meta.url).pathname;
 const builder=fs.readFileSync(path.join(root,'scripts/build_pages.py'),'utf8');
 assert.match(builder,/feedback\.html/);assert.match(builder,/feedback\.js/);
 assert.doesNotMatch(builder,/feedback-store\.js/);
});

test('new support ticket includes a private access code and keeps internal notes secret',()=>{
 const {store,cleanup}=makeStore();try{
  const receipt=store.submit({...sample,subject:'Не знаходить вулицю',queue:'2.1'},'10');
  assert.match(receipt.token,/^[A-Za-z0-9_-]{32}$/);
  const status=store.getStatus(receipt.id);
  assert.equal(status.message,undefined);
  assert.throws(()=>store.getStatus(receipt.id,'wrong'),e=>e.statusCode===403);
  const visible=store.getStatus(receipt.id,receipt.token);
  assert.equal(visible.subject,'Не знаходить вулицю');
  assert.equal(visible.queue,'2.1');
  store.change(receipt.id,{priority:'high',internalNote:'Внутрішнє уточнення для адміністратора',reply:'Ми перевіримо довідник адрес.'});
  const updated=store.getStatus(receipt.id,receipt.token);
  assert.equal(updated.messages.length,1);
  assert.equal(updated.messages[0].from,'admin');
  assert.equal(JSON.stringify(updated).includes('Внутрішнє'),false);
  assert.equal(JSON.stringify(updated).includes('accessHash'),false);
  assert.equal(JSON.stringify(store.list()).includes(receipt.token),false);
 }finally{cleanup()}
});
test('secure two-way messages persist and cannot be forged without token',()=>{
 const {store,filePath,cleanup}=makeStore();try{
  const {id,token}=store.submit(sample,'127');
  assert.throws(()=>store.reply(id,'wrong','Додаткова інформація','127'),e=>e.statusCode===403);
  store.reply(id,token,'Проблема на iPhone','127');
  const reopened=createFeedbackStore({filePath});
  assert.equal(reopened.getStatus(id,token).messages[0].text,'Проблема на iPhone');
  assert.equal(reopened.getStatus(id,token).status,'in_progress');
  assert.throws(()=>store.change(id,{priority:'urgent'}));
  assert.throws(()=>store.change(id,{reply:'x'.repeat(1601)}));
  for(let i=0;i<3;i++)store.reply(id,token,'Ще деталі номер '+i,'127');
  assert.throws(()=>store.reply(id,token,'Ще одне повідомлення','127'),e=>e.statusCode===429);
 }finally{cleanup()}
});
