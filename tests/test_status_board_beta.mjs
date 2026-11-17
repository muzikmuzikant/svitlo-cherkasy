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

test('status admin provides a searchable operational incident journal and modal editor',()=>{
 const html=fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../admin-status.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../status-board.css',import.meta.url),'utf8');
 for(const id of ['statusAdminMetrics','statusMetricActive','statusMetricRecent','statusMetricTotal','statusIncidentSearch','statusIncidentFilter','statusIncidentSort','statusIncidentCount','statusIncidentSeverity','statusIncidentCancelBottom'])assert.ok(html.includes(id),'missing status admin control '+id);
 for(const feature of ['toLocaleLowerCase','duration(','statusIncidentFilter','statusIncidentSort','status-action-resolve'])assert.ok(js.includes(feature),'missing incident journal behavior '+feature);
 for(const selector of ['.status-admin-metrics','.status-admin-toolbar','.status-incident-card','.status-admin-modal','.status-admin-severity'])assert.ok(css.includes(selector),'missing admin styling '+selector);
});
