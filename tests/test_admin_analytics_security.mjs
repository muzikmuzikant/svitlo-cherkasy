import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAnalyticsStore} from '../push-server/analytics.js';
import {verifyTotp} from '../push-server/auth-security.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('anonymous traffic is persisted only as aggregate source/event counts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-insights-'));
 const filename=path.join(dir,'stats.json');let time=Date.parse('2026-10-15T13:15:00Z');
 try{
  const store=createAnalyticsStore({filePath:filename,clock:()=>time});
  assert.equal(store.record('landing','telegram-echerkasy'),true);
  assert.equal(store.record('landing','direct'),true);
  assert.equal(store.record('app_open','direct'),true);
  assert.equal(store.record('install_guide','telegram-echerkasy'),true);
  assert.equal(store.record('password','direct'),false);
  const result=store.report();
  assert.equal(result.totals7.landing,2);
  assert.equal(result.totals7.appOpen,1);
  assert.equal(result.totals7.installGuide,1);
  assert.equal(result.totals7.telegram,2);
  assert.equal(result.days.length,30);
  assert.equal(result.hours.length,24);
  store.flush();
  const raw=fs.readFileSync(filename,'utf8');
  for(const forbidden of ['endpoint','street','userId','ipAddress','userAgent'])assert.equal(raw.includes(forbidden),false);
  assert.equal(JSON.parse(raw).schemaVersion,1);
  const restart=createAnalyticsStore({filePath:filename,clock:()=>time});
  assert.equal(restart.report().totals7.telegram,2);
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
});
test('TOTP accepts RFC-based six-digit token, rejects wrong or expired values',()=>{
 const key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 assert.equal(verifyTotp(key,'287082',59000),1);
 assert.equal(verifyTotp(key,'000000',59000),false);
 assert.equal(verifyTotp(key,'287082',10*60*1000),false);
 assert.equal(verifyTotp('', '287082',59000),false);
 assert.equal(verifyTotp(key,'12AB34',59000),false);
});
test('new analytics and security endpoints are separate from public metrics',()=>{
 const server=read('push-server/server.js'),auth=read('push-server/admin.js');
 assert.match(server,/\/api\/telemetry/);
 assert.match(server,/originPolicy\.isAllowed\(origin\)/);
 assert.match(auth,/\/api\/admin\/analytics/);
 assert.match(auth,/\/api\/admin\/security/);
 assert.match(auth,/verifyTotp/);
 assert.match(auth,/IDLE_TTL=30\*60\*1000/);
 assert.match(auth,/revoke-others/);
 assert.match(read('admin.html'),/id="analyticsTrendChart"/);
 assert.match(read('admin.html'),/id="securityRevoke"/);
 assert.match(read('admin.html'),/id="otp"/);
 assert.match(read('install.js'),/telegram-echerkasy/);
 assert.match(read('scripts/build_pages.py'),/admin-analytics\.js/);
 assert.match(read('sw.js'),/admin-security-ui\.js/);
});
