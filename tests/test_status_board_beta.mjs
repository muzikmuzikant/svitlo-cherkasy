import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStatusStore} from '../push-server/status-store.js';

test('status board persists status and incident lifecycle while sanitizing public data',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-status-'));
 try{
  const store=createStatusStore({directory});
  let state=store.updateLevel({level:'yellow',summary:'Є часткові проблеми'});
  assert.equal(state.level,'yellow');
  state=store.create({title:'Графіки не завантажуються',description:'Частина користувачів не бачить дані.',level:'red',startedAt:'2026-11-17T18:00:00.000Z'},'owner');
  const id=state.incidents[0].id;
  assert.match(id,/^INC-[A-F0-9]{12}$/);
  assert.equal(state.incidents[0].endedAt,null);
  const publicState=store.publicSnapshot();
  assert.equal(publicState.incidents[0].createdBy,undefined);
  assert.equal(publicState.incidents[0].revision,undefined);
  state=store.edit(id,{expectedRevision:1,endedAt:'2026-11-17T19:00:00.000Z'},'owner');
  assert.ok(state.incidents[0].endedAt);
  assert.equal(state.incidents[0].revision,2);
  const restored=createStatusStore({directory});
  assert.equal(restored.snapshot().incidents[0].id,id);
  assert.equal(restored.snapshot().level,'yellow');
  assert.equal(restored.remove(id,2).incidents.length,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
