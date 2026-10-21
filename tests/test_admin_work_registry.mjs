import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWorkRegistry} from '../push-server/work-registry.js';
test('create, persist, review, complete and safely reject stale edits',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-work-'));
 try{
  const record=createWorkRegistry({directory:dir});
  const created=record.create({title:'Уточнити підчергу',kind:'addresses',priority:'urgent',
    details:'Перевірити офіційний перелік',dueDate:'2026-10-30'},'owner');
  assert.match(created.id,/^WR-[A-F0-9]{12}$/);
  assert.equal(created.status,'new');
  assert.equal(created.revision,1);
  const opened=createWorkRegistry({directory:dir});
  const updated=opened.patch(created.id,{expectedRevision:1,status:'review',assignee:'editor'},'owner');
  assert.equal(updated.status,'review');assert.equal(updated.revision,2);
  assert.throws(()=>record.patch(created.id,{expectedRevision:1,status:'done'},'owner'),/Картку вже змінено/);
  const closed=opened.patch(created.id,{expectedRevision:2,status:'done'},'owner');
  assert.ok(closed.closedAt);
  assert.equal(createWorkRegistry({directory:dir}).list().items[0].status,'done');
  assert.equal(closed.events.length,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('disallows unsafe categories, huge content and invalid status',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-work-'));
 try{
  const registry=createWorkRegistry({directory:dir});
  assert.throws(()=>registry.create({title:'Test',status:'published'}),/Перевірте/);
  assert.throws(()=>registry.create({title:'Картка звернення',details:'x'.repeat(2000)}),/Перевірте/);
  const item=registry.create({title:'Коректна картка',reference:'SC-ABCD123456'});
  assert.throws(()=>registry.patch(item.id,{expectedRevision:1,dueDate:'2026-99-99'}),/Перевірте/);
  assert.equal(registry.list().items[0].revision,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('review notes capture actor and optimistic revision checks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-notes-'));
 try{
  const w=createWorkRegistry({directory:dir});
  const item=w.create({title:'Перевірити звернення'},'owner');
  assert.throws(()=>w.addNote(item.id,{expectedRevision:1,message:'  '},'editor'),/резолюції/);
  const updated=w.addNote(item.id,{expectedRevision:1,message:'Дані передані на перевірку'},'editor');
  assert.equal(updated.revision,2);
  assert.equal(updated.events[0].actor,'editor');
  assert.equal(updated.events[0].message,'Дані передані на перевірку');
  assert.throws(()=>w.addNote(item.id,{expectedRevision:1,message:'Повтор'},'editor'),/Оновіть/);
  assert.equal(createWorkRegistry({directory:dir}).list().items[0].events[0].message,updated.events[0].message);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
