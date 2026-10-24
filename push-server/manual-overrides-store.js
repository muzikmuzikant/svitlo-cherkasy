/* Owner-authored, verified schedule overrides stored on Railway /data.
 * Does not modify the official importer snapshot or GitHub source data.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const QUEUES=new Set(Array.from({length:6},(_,i)=>[String(i+1)+'.1',String(i+1)+'.2']).flat()));
const stamp=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const minute=x=>x==='24:00'?1440:typeof x==='string'&&/^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(x)?Number(x.slice(0,2))*60+Number(x.slice(3)):-1;
const official=x=>typeof x==='string'&&/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//i.test(x);
export function createManualOverridesStore({directory,onChanged=()=>{}}){
 const file=path.join(directory,'manual-overrides-live.json');let saved=null;
 try{const value=JSON.parse(fs.readFileSync(file,'utf8'));verify(value);saved=value}
 catch(e){if(e.code!=='ENOENT')console.error('[manual-overrides] Invalid stored document; preserving file:',e.message)}
 function verify(value){
  if(!value||value.schemaVersion!==1||!Array.isArray(value.schedules?.days)||
   !value.addresses||typeof value.addresses!=='object'||!Array.isArray(value.emergency?.events))
   throw Error('Невірний формат ручних уточнень');
  if(value.schedules.days.length>20)throw Error('Забагато дат в уточненнях');
  for(const d of value.schedules.days){
   if(!/^20\\d{2}-\\d{2}-\\d{2}$/.test(d.date||'')||!d.verified||!official(d.source))
    throw Error('Потрібні дата й офіційне джерело');
   if(!d.queues||typeof d.queues!=='object')throw Error('Немає підчерг');
   for(const [q,item] of Object.entries(d.queues)){
    if(!QUEUES.has(q)||!Array.isArray(item?.off)||item.off.length>24)throw Error('Невірна підчерга');
    const from=minute(item.knownFrom??'00:00');if(from<0)throw Error('Невірний час підтвердження');
    let last=0;
    for(const range of item.off){
     const a=minute(range?.[0]),b=minute(range?.[1]);
     if(!Array.isArray(range)||range.length!==2||a<from||a<last||b<=a||b>1440)
      throw Error('Неправильний або накладений інтервал');
     last=b;
    }
   }
  }
 }
 function snapshot(){return saved?structuredClone(saved):null}
 function revision(){return saved?stamp(saved):null}
 function update(value,expectedSha){
  verify(value);
  if(expectedSha!==revision()){const e=Error('Ручні уточнення змінилися. Перезавантажте редактор перед повторною публікацією.');e.statusCode=409;throw e}
  if(Buffer.byteLength(JSON.stringify(value))>1_800_000)throw Error('Файл завеликий');
  const next=structuredClone(value);next.updatedAt=new Date().toISOString();
  fs.mkdirSync(directory,{recursive:true});
  const temp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(next),{mode:0o600});fs.renameSync(temp,file);
  saved=next;onChanged();
  return {ok:true,revision:revision(),updatedAt:next.updatedAt};
 }
 function applySchedule(base){
  if(!base||!saved?.schedules?.days?.length)return base;
  const days=new Map((base.days||[]).map(d=>[d.date,d]));
  const confirmed=new Set(base.confirmedNoScheduleDates||[]);
  for(const manual of saved.schedules.days){
   const current=days.get(manual.date)||{date:manual.date,verified:true,queues:{},source:manual.source,publishedAt:manual.publishedAt};
   const queues={...current.queues,...manual.queues};
   const queueSources={...(current.queueSources||{})};
   for(const q of Object.keys(manual.queues))queueSources[q]=manual.source;
   days.set(manual.date,{...current,queues,queueSources,adminCorrection:true,verified:true});
   confirmed.delete(manual.date);
  }
  return {...base,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),
   confirmedNoScheduleDates:[...confirmed]};
 }
 return {snapshot,revision,update,applySchedule};
}
