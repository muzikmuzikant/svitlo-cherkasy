import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const planner=require('../schedule-planner.js');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const kyiv=()=>{const d=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return d.year+'-'+d.month+'-'+d.day};

test('new emergency screen scripts compile and offer address, weekly days and hourly time cells',()=>{
 for(const file of ['maintenance-backup.js','site-mode.js','admin-planner.js']){
  execFileSync(process.execPath,['--check',new URL('../'+file,import.meta.url).pathname]);
 }
 const page=read('index.html');
 for(const id of ['maintenanceViewSchedule','maintenanceViewNotice','maintenanceBackupPlace','maintenanceBackupDays',
  'maintenanceBackupHours','maintenanceBackupIntervals','maintenanceBackupRefresh']){
  assert.ok(page.includes('id="'+id+'"'),id);
 }
 assert.ok(page.includes('./maintenance-backup.js'));
 assert.match(read('maintenance-backup.js'),/snapshot\|\|cached\(\)/);
 assert.match(read('maintenance-backup.js'),/confirmedNoScheduleDates/);
 assert.match(read('maintenance-backup.js'),/Підчерга/);
});

test('manual editor copies a VERIFIED live Railway queue to another queue without publishing',async()=>{
 const date=kyiv(),callbacks={};const els=new Map();
 class Fake {
  constructor(tag='div'){this.tag=tag;this.value='';this.textContent='';this.children=[];this.disabled=false;}
  add(v){this.children.push(v);if(!this.value)this.value=v.value}
  append(...elements){this.children.push(...elements)}
  replaceChildren(...nodes){this.children=nodes}
  setAttribute(key,value){this[key]=value}
  addEventListener(name,handler){this['on'+name]=handler}
 }
 const get=id=>{if(!els.has(id))els.set(id,new Fake());return els.get(id)};
 const body={schemaVersion:1,schedules:{days:[]},addresses:{keys:{},streets:{}},emergency:{events:[]}};
 get('editor').value=JSON.stringify(body);get('kind').value='overrides';
 get('server').value='https://example.railway.app';
 const document={getElementById:get,createElement:tag=>new Fake(tag),
  addEventListener:(name,callback)=>{callbacks[name]=callback}};
 const offA=[['05:00','06:00']],offB=[['17:30','20:00']];
 const url='https://www.cherkasyoblenergo.com/off';
 const response={lastChecked:new Date().toISOString(),days:[{date,verified:true,source:url,queues:{
  '1.1':{knownFrom:'00:00',off:offA},'2.2':{knownFrom:'00:00',off:offB}
 }}]};
 let calls=0,confirms=0;
 const sandbox={
  window:{SvitloSchedulePlanner:planner},document,Option:class{constructor(label,value){this.label=label;this.value=value}},
  Intl,Date,Array,Object,console,setTimeout,clearTimeout,
  fetch:async url=>{calls++;assert.match(url,/api\/data\/schedules\.json/);return {ok:true,json:async()=>response}},
  AbortSignal,
  confirm:()=>{confirms++;return true},
  validate:(kind,data)=>{assert.equal(kind,'overrides');assert.ok(data.schedules.days)},
  remote:true,canPublish:true
 };
 vm.runInNewContext(read('admin-planner.js'),sandbox,{filename:'admin-planner.js'});
 callbacks['svitlo:admin-ready']();
 await new Promise(resolve=>setTimeout(resolve,15));
 assert.ok(get('plannerSummary').textContent.includes('1 год'),'summary='+get('plannerSummary').textContent+'; status='+get('plannerStatus').textContent+'; day='+get('plannerDate').value+'; q='+get('plannerQueue').value);
 assert.equal(get('plannerSource').value,url);
 get('plannerCopyFrom').value='2.2';
 await get('plannerCopy').onclick();
 assert.ok(get('plannerSummary').textContent.includes('2,5'));
 get('plannerStage').onclick();
 const next=JSON.parse(get('editor').value);
 assert.deepEqual(next.schedules.days[0].queues['1.1'].off,offB);
 assert.equal(next.schedules.days[0].source,url);
 assert.ok(calls>=2);assert.ok(confirms>=2);
 // A missing published subqueue must never silently copy an all-on day.
 get('plannerCopyFrom').value='6.2';
 await get('plannerCopy').onclick();
 assert.match(get('plannerStatus').textContent,/Немає опублікованого графіка/);
});
