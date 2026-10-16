/* Voluntary, privacy-conscious custom-notice metrics.
 * No endpoint, address, raw installation identifier, IP or user-level report is saved.
 * Each installation is counted at most once for each event per notice.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TYPES=['seen','opened','read','pushClick'];
const NOTE=/^[A-Za-z0-9_-]{6,64}$/;
const INSTALL=/^[0-9a-f]{8}-[0-9a-f-]{27,56}$/i;
const KEEP_MS=60*86400_000;
const MAX_NOTICES=120;
const MAX_AUDIENCE=3500;
const validCount=v=>Number.isSafeInteger(v)&&v>=0?Math.min(v,100000):0;

export function createNoticeMetrics({directory,clock=Date.now}){
 const file=path.join(directory,'notice-metrics-v1.json');
 let records={};let writeTimer=null;
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved?.version===1&&saved.records&&typeof saved.records==='object'&&!Array.isArray(saved.records))records=saved.records}catch(e){if(e.code!=='ENOENT')console.warn('[notice-metrics] Unable to read stored report',e.message)}
 function flush(){
  if(writeTimer){clearTimeout(writeTimer);writeTimer=null}
  fs.mkdirSync(directory,{recursive:true});
  const temp=file+'.tmp';
  fs.writeFileSync(temp,JSON.stringify({version:1,records}),{mode:0o600});
  fs.renameSync(temp,file);
 }
 function save(){if(!writeTimer){writeTimer=setTimeout(flush,500);writeTimer.unref?.()}}
 const validId=id=>typeof id==='string'&&NOTE.test(id);
 function prune(){
  const cutoff=clock()-KEEP_MS;
  for(const [id,r] of Object.entries(records)){
   if(!r||!Number.isFinite(r.last)||r.last<cutoff){delete records[id];continue}
   for(const type of TYPES){
    if(!r[type]||typeof r[type]!=='object')r[type]={};
    for(const [key,at] of Object.entries(r[type]))if(!Number.isFinite(at)||at<cutoff)delete r[type][key];
   }
  }
  const sorted=Object.entries(records).sort((a,b)=>a[1].last-b[1].last);
  for(const [id] of sorted.slice(0,Math.max(0,sorted.length-MAX_NOTICES)))delete records[id];
 }
 function entry(id){
  if(!records[id])records[id]={last:clock(),push:{attempted:0,accepted:0,failed:0,expired:0},seen:{},opened:{},read:{},pushClick:{}};
  const r=records[id];r.last=clock();return r;
 }
 const identity=(notice,id)=>crypto.createHash('sha256').update('notice-metrics-v1:'+notice+':'+id).digest('hex');
 function event({noticeId,installId,type}){
  if(!validId(noticeId)||!INSTALL.test(String(installId||''))||!TYPES.includes(type))return false;
  prune();
  const r=entry(noticeId),bucket=r[type],key=identity(noticeId,installId);
  if(!Object.hasOwn(bucket,key)&&Object.keys(bucket).length>=MAX_AUDIENCE)return false;
  bucket[key]=clock();save();return true;
 }
 function push(id,result){
  if(!validId(id)||!result||typeof result!=='object')return false;
  prune();const r=entry(id);
  // A notice is sent only once after a successful accepted batch; if an
  // operator retries a failed batch, aggregate the actual provider responses.
  for(const key of ['attempted','accepted','failed','expired'])r.push[key]=validCount(r.push[key])+validCount(result[key]);
  save();return true;
 }
 function forget(installId){
  if(!INSTALL.test(String(installId||'')))return false;
  prune();for(const [id,r] of Object.entries(records)){
   const key=identity(id,installId);for(const type of TYPES)delete r[type]?.[key];
  }
  save();return true;
 }
 function report(ids){
  prune();
  const list=Array.isArray(ids)?ids.filter(validId):[];
  const items={};
  for(const id of list){
   const r=records[id];
   const push=r?.push||{};
   const counts=Object.fromEntries(TYPES.map(type=>[type,Object.keys(r?.[type]||{}).length]));
   const attempted=validCount(push.attempted),accepted=validCount(push.accepted);
   items[id]={...counts,pushAttempted:attempted,pushAccepted:accepted,pushFailed:validCount(push.failed),
    pushExpired:validCount(push.expired),consentedOnly:true,
    readOfOpened:counts.opened?Math.round(100*counts.read/counts.opened):null,
    openedOfSeen:counts.seen?Math.round(100*counts.opened/counts.seen):null};
  }
  return {items,note:'Одна подія на одну інсталяцію зі згодою. «Прочитано» = повідомлення відкрите на екрані принаймні 2 секунди. Push прийнято провайдером, а не підтверджено доставку. Показники не охоплюють користувачів без згоди.',retentionDays:60};
 }
 return {event,push,forget,report,flush,prune};
}
