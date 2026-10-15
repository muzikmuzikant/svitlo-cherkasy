/* Verified outage schedules published directly to Railway.
 * One atomic snapshot file; GitHub Pages stays a read-only fallback.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const QUEUES=Array.from({length:6},(_,i)=>[String(i+1)+'.1',String(i+1)+'.2']).flat();
const MAX_BYTES=1_300_000;
const validDate=x=>typeof x==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const minute=x=>x==='24:00'?1440:typeof x==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x)?Number(x.slice(0,2))*60+Number(x.slice(3)):-1;
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;

function validate(schedule,review){
 if(!schedule||typeof schedule!=='object'||schedule.schemaVersion!==3||!Array.isArray(schedule.days))throw Error('Invalid official schedule format');
 if(!stamp(schedule.lastChecked))throw Error('Missing schedule check timestamp');
 if(schedule.days.length>15)throw Error('Too many days in schedule snapshot');
 if(!review||typeof review!=='object'||!stamp(review.lastChecked)||!Array.isArray(review.items))throw Error('Invalid source review');
 const seenDays=new Set();
 for(const day of schedule.days){
  if(!validDate(day?.date)||day.verified!==true||!day.queues||typeof day.queues!=='object')
   throw Error('Invalid verified day');
  if(seenDays.has(day.date))throw Error('Duplicate official date');
  seenDays.add(day.date);
  for(const q of QUEUES){
   const item=day.queues[q],periods=item?.off;
   if(!Array.isArray(periods)||periods.length>24)throw Error('Missing or invalid queue: '+q);
   const knownFrom=minute(item.knownFrom??'00:00');
   if(knownFrom<0)throw Error('Invalid confirmed starting time');
   let end=0;
   for(const span of periods){
    if(!Array.isArray(span)||span.length!==2)throw Error('Invalid outage interval');
    const from=minute(span[0]),to=minute(span[1]);
    if(from<0||to<0||from>=to||from<end||from<knownFrom)
     throw Error('Overlapping, backwards or invalid outage interval');
    end=to;
   }
  }
 }
 const bytes=Buffer.byteLength(JSON.stringify({schedule,review}),'utf8');
 if(bytes>MAX_BYTES)throw Error('Schedule snapshot too large');
 return bytes;
}
export function createSchedulePublication({directory,token}){
 const file=path.join(directory,'railway-official-schedules.json');
 let current=null;
 try{
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  validate(raw.schedule,raw.review);
  current=raw;
 }catch(e){if(e.code!=='ENOENT')console.error('[railway-schedules] Stored data invalid; keeping public fallback:',e.message)}
 const authorized=header=>{
  if(!token||typeof header!=='string'||!header.startsWith('Bearer '))return false;
  const expected=Buffer.from(token),actual=Buffer.from(header.slice(7));
  return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
 };
 const update=(schedule,review)=>{
  validate(schedule,review);
  if(current){
   const old=stamp(current.schedule.lastChecked),next=stamp(schedule.lastChecked);
   if(next<old)throw Error('Outdated schedule update refused');
  }
  const publishedAt=new Date().toISOString();
  const snapshot={schedule,review,publishedAt};
  fs.mkdirSync(directory,{recursive:true});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(snapshot));
  fs.renameSync(tmp,file);
  current=snapshot;
  return status();
 };
 const schedule=()=>current?.schedule||null;
 const review=()=>current?.review||null;
 const status=()=>({
  ready:!!current,
  lastChecked:current?.schedule.lastChecked||null,
  publishedAt:current?.publishedAt||null,
  verifiedDays:current?.schedule.days?.map(x=>x.date)||[],
  reviewPending:current?.schedule.reviewPending===true,
  source:'railway-cron'
 });
 return {schedule,review,status,update,authorized,file};
}
