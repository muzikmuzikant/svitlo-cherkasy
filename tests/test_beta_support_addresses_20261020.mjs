import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createFeedbackStore} from '../push-server/feedback-store.js';

const require=createRequire(import.meta.url);
const {mergeIndexes}=require('../data-merge.js');
const {resolve}=require('../address-lookup.js');
const root=path.resolve(import.meta.dirname,'..');
const readJson=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));

test('reported Filatova and Ivana Kozheduba remain searchable without invented queues',()=>{
 const live=readJson('data/addresses.json'),supplement=readJson('data/published_street_fallback.json');
 const index=mergeIndexes(live,supplement);
 const places=[
  ['Слобода',index.localities.слобода,'Філатова','вулиця|філатова'],
  ['Черкаси',index,'Івана Кожедуба','вулиця|іванакожедуба']
 ];
 for(const [settlement,source,street,key] of places){
  assert.ok(source.streets[key],settlement+' must contain '+street);
  assert.equal(source.streetQueues?.[key],undefined,'No unverified subqueue allowed');
  const found=resolve({idx:source,street,settlement});
  assert.equal(found.reason,'reported-only');
  assert.equal(found.queue,undefined);
 }
});

test('feedback lifecycle emits nonprivate revision events only after persisted changes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-live-support-'));
 const events=[];
 try{
  const store=createFeedbackStore({filePath:path.join(dir,'feedback.json'),onChange:kind=>events.push(kind)});
  const ticket=store.submit({topic:'bug',message:'Пошук адреси не відкривається на телефоні.'},'203.0.113.60');
  store.change(ticket.id,{status:'in_progress'});
  store.reply(ticket.id,ticket.token,'Проблема помітна на iPhone.','203.0.113.60');
  store.change(ticket.id,{status:'resolved'});
  store.rate(ticket.id,ticket.token,4);
  store.remove(ticket.id);
  assert.deepEqual(events,['created','updated','replied','updated','rated','deleted']);
  assert.throws(()=>store.getStatus(ticket.id,ticket.token),error=>error.statusCode===404);
  assert.throws(()=>store.remove(ticket.id),error=>error.statusCode===404);
  assert.equal(events.length,6,'Failed deletion must not publish a second event');
  assert.ok(fs.readFileSync(path.join(dir,'feedback.json'),'utf8').includes('"items": []'));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('live sync uses one private batch endpoint and never sends ticket content by WebSocket',()=>{
 const frontend=fs.readFileSync(path.join(root,'feedback.js'),'utf8');
 const server=fs.readFileSync(path.join(root,'push-server/server.js'),'utf8');
 assert.ok(server.includes("'/api/ticket/sync'"));
 assert.ok(frontend.includes("post('/api/ticket/sync'"));
 assert.match(frontend,/item\.deleted/);
 assert.match(server,/\{type:'feedback',revision\}/);
 assert.match(server,/originPolicy\.isAllowed\(req\.headers\.origin/);
 assert.match(frontend,/new WebSocket/);
 assert.match(frontend,/new EventSource/);
});
