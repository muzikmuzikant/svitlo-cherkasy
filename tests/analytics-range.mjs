import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAnalyticsStore} from '../push-server/analytics.js';

function storeAt(date) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-insights-'));
 let now=Date.parse(date);
 const store=createAnalyticsStore({filePath:path.join(directory,'analytics.json'),clock:()=>now});
 return {store,directory,move:day=>{now=Date.parse(day)}};
}
test('date selection is inclusive and respects Kyiv days',()=>{
 const s=storeAt('2026-10-20T22:30:00Z'); // October 21, 01:30 Kyiv
 try{
  assert.equal(s.store.record('landing','telegram'),true);
  s.move('2026-10-21T22:30:00Z'); // October 22 Kyiv
  s.store.record('app_open','direct');
  const report=s.store.reportRange('2026-10-21','2026-10-21');
  assert.equal(report.periodDays,1);
  assert.equal(report.totals.landing,1);
  assert.equal(report.totals.appOpen,0);
  assert.equal(report.sources.telegram.landing,1);
  assert.equal(report.days[0].date,'2026-10-21');
  assert.equal(report.earliestAvailable,'2026-10-21');
 }finally{fs.rmSync(s.directory,{recursive:true,force:true})}
});
test('hourly bucket pruning archives the daily anonymous counts',()=>{
 const s=storeAt('2026-01-12T10:00:00Z');
 try{
  s.store.record('landing','telegram-cherkasy-golovne');
  s.store.record('landing','direct');
  s.store.record('install_guide','direct');
  s.store.flush();
  s.move('2026-10-21T10:00:00Z');
  const report=s.store.reportRange('2026-01-12','2026-10-21');
  assert.equal(report.totals.landing,2);
  assert.equal(report.totals.installGuide,1);
  assert.equal(report.sources['telegram-cherkasy-golovne'].landing,1);
  assert.equal(report.days[0].landing,2);
  assert.equal(report.chartDays[0].date,'2026-01');
  s.store.flush();
  const persisted=JSON.parse(fs.readFileSync(path.join(s.directory,'analytics.json'),'utf8'));
  assert.equal(persisted.schemaVersion,2);
  assert.equal(persisted.archive['2026-01-12'].landing.direct,1);
  assert.equal(Object.keys(persisted.buckets).length,0);
  const reopened=createAnalyticsStore({filePath:path.join(s.directory,'analytics.json'),clock:()=>Date.parse('2026-10-21T10:00:00Z')});
  assert.equal(reopened.reportRange('2026-01-12','2026-10-21').totals.landing,2);
 }finally{fs.rmSync(s.directory,{recursive:true,force:true})}
});
test('date bounds and comparisons are validated',()=>{
 const s=storeAt('2026-10-21T10:00:00Z');
 try{
  s.store.record('landing','direct');
  assert.throws(()=>s.store.reportRange('2026-10-22','2026-10-22'),/Некоректний/);
  assert.throws(()=>s.store.reportRange('2026-02-30','2026-10-21'),/Некоректний/);
  assert.throws(()=>s.store.reportRange('2021-01-01','2026-10-21'),/трьох років/);
  const r=s.store.reportRange('2026-10-21','2026-10-21');
  assert.equal(r.previousTotals,null);
  assert.equal(r.partial,false);
 }finally{fs.rmSync(s.directory,{recursive:true,force:true})}
});
