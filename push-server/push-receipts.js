/* Beta Web Push visibility telemetry.
 * Provider acceptance != device display. A receipt only means the service
 * worker successfully requested a notification from the browser/OS.
 * No endpoint, street, house, IP or personal identifier is stored here.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_RECORDS=4000,RETENTION_MS=48*60*60*1000;
export function createPushReceipts({directory,clock=()=>Date.now()}){
 const file=path.join(directory,'push-receipts.json');
 let records={};
 try{
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  if(saved&&typeof saved==='object'&&!Array.isArray(saved))records=saved;
 }catch(error){if(error.code!=='ENOENT')console.warn('[push-receipts] Load failed:',error.message)}
 let failedSinceBoot=0,lastFailure=null;
 function prune(){
  const cutoff=clock()-RETENTION_MS;
  for(const [id,r] of Object.entries(records))
   if(!r||!Number.isFinite(Date.parse(r.at))||Date.parse(r.at)<cutoff)delete records[id];
  const entries=Object.entries(records);
  if(entries.length>MAX_RECORDS)
   for(const [id] of entries.sort((a,b)=>String(a[1].at).localeCompare(String(b[1].at))).slice(0,entries.length-MAX_RECORDS))
    delete records[id];
 }
 function persist(){
  prune();
  const tmp=file+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(records),{mode:0o600});fs.renameSync(tmp,file)}
  catch(error){console.warn('[push-receipts] Save failed:',error.message)}
 }
 function begin({category='automatic',queue='' }={}){
  const id=crypto.randomBytes(18).toString('base64url');
  records[id]={at:new Date(clock()).toISOString(),category:String(category).slice(0,32),
   queue:String(queue).slice(0,8),state:'sending'};
  return id;
 }
 function accepted(id){
  const rec=records[id];if(!rec)return;
  // A fast service worker can acknowledge before the push provider replies.
  if(rec.state!=='display-requested')rec.state='accepted';
  rec.acceptedAt=new Date(clock()).toISOString();
  persist();
 }
 function rejected(id,error){
  delete records[id];failedSinceBoot++;
  lastFailure={at:new Date(clock()).toISOString(),status:String(error||'network').slice(0,30)};
  persist();
 }
 function acknowledge(id){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{24}$/.test(id))return false;
  const rec=records[id];if(!rec)return false;
  if(clock()-Date.parse(rec.at)>RETENTION_MS)return false;
  if(rec.state==='display-requested')return true;
  rec.state='display-requested';
  rec.displayRequestedAt=new Date(clock()).toISOString();
  persist();return true;
 }
 function snapshot(){
  prune();
  const stats={accepted:0,displayRequested:0,pending:0,failedSinceBoot,lastFailure,lastDisplayRequested:null};
  for(const r of Object.values(records)){
   if(r.state==='display-requested'){
    stats.displayRequested++;
    if(!stats.lastDisplayRequested||r.displayRequestedAt>stats.lastDisplayRequested)stats.lastDisplayRequested=r.displayRequestedAt;
   }else if(r.state==='accepted')stats.accepted++;
   else stats.pending++;
  }
  return stats;
 }
 return {begin,accepted,rejected,acknowledge,snapshot};
}
