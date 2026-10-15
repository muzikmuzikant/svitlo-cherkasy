import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createDailyReports} from '../push-server/daily-reports.js';
test('automatic reports are persisted with only aggregate values',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-reports-'));const date=new Date('2026-10-15T12:00:00Z');
 try{
  const repo=createDailyReports({directory,clock:()=>date});
  const sources={
   feedback:{list:()=>({items:[{status:'new',message:'private text'},{status:'resolved',message:'another private text'}]})},
   ads:{dashboard:()=>({stats:{ad1:{impressions:100,clicks:4}},pwa:{active24h:12,active7d:45}})},
   push:{stats:()=>({subscribers:67})},diagnostics:{report:()=>({total:1})},audit:()=>({days:2,issues:[{level:'warning'},{level:'error'}]})
  };
  const current=repo.capture(sources);assert.equal(current.feedback.total,2);
  assert.equal(current.subscriptions,67);assert.equal(current.schedules.structuralErrors,1);
  assert.equal(repo.list().items.length,1);
  const raw=fs.readFileSync(path.join(directory,'beta-daily-reports.json'),'utf8');
  assert.ok(!raw.includes('private text'));assert.ok(!raw.includes('ad1'));
  assert.equal(createDailyReports({directory,clock:()=>date}).list().items.length,1);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
