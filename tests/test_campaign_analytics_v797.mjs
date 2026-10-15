import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAnalyticsStore} from '../push-server/analytics.js';

test('Cherkasy Holovne referral is separated from other channels across a restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-traffic-'));
 const file=path.join(dir,'events.json'),at=Date.parse('2026-10-15T15:35:00Z');
 try{
  const analytics=createAnalyticsStore({filePath:file,clock:()=>at});
  assert.equal(analytics.record('landing','telegram-cherkasy-golovne'),true);
  assert.equal(analytics.record('install_guide','telegram-cherkasy-golovne'),true);
  analytics.record('landing','telegram-echerkasy');
  assert.equal(analytics.record('unknown','direct'),false);
  let info=analytics.report();
  assert.equal(info.hours48.length,48);
  assert.equal(info.sources48['telegram-cherkasy-golovne'].landing,1);
  assert.equal(info.sources48['telegram-cherkasy-golovne'].installGuide,1);
  assert.equal(info.sources48['telegram-echerkasy'].landing,1);
  assert.equal(info.days.at(-1).cherkasyGolovne,2);
  analytics.flush();
  info=createAnalyticsStore({filePath:file,clock:()=>at}).report();
  assert.equal(info.sources30['telegram-cherkasy-golovne'].landing,1);
  assert.equal(info.hours48.at(-1).cherkasyGolovne,1);
 }finally{fs.rmSync(dir,{force:true,recursive:true})}
});
