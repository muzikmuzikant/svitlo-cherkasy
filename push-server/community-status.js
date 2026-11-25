/* Anonymous queue-level power reports and conservative observed-time statistics.
 * Only keyed, short-lived pseudonymous observations are stored on the existing Railway volume.
 * Never store addresses, names, raw IPs, push endpoints or browser fingerprints.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const TZ='Europe/Kyiv';
const QUEUES=new Set(Array.from({length:6},(_,i)=>[String(i+1)+'.1',String(i+1)+'.2']).flat());
const BUCKET_MS=600000,RETENTION_MS=35*86400000,MAX_REPORTS=200000;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const localParts=ts=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ts)).map(p=>[p.type,p.value]));
const dateKey=ts=>{const p=localParts(ts);return p.year+'-'+p.month+'-'+p.day};
const offsetMinutes=ts=>{const value=new Intl.DateTimeFormat('en-US',{timeZone:TZ,timeZoneName:'shortOffset'}).formatToParts(new Date(ts)).find(p=>p.type==='timeZoneName')?.value||'GMT+0';const m=value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);return m?(m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]||0)):0};
const midnight=date=>{const [y,m,d]=date.split('-').map(Number),utc=Date.UTC(y,m-1,d);return utc-offsetMinutes(utc-7200000)*60000};
const shiftDate=(date,days)=>{const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10)};
const periodRange=(period,now)=>{const today=dateKey(now);let start=today;if(period==='week'){const weekday=new Date(today+'T12:00:00Z').getUTCDay();start=shiftDate(today,-((weekday+6)%7))}else if(period==='month')start=today.slice(0,8)+'01';else if(period!=='day')throw Error('Невідомий період статистики');const startAt=midnight(start);return {period,startDate:start,startAt,endAt:now,totalMinutes:Math.max(0,Math.floor((now-startAt)/60000))}};
const minute=value=>value==='24:00'?1440:/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value||''))?Number(value.slice(0,2))*60+Number(value.slice(3)):-1;
const eventTime=(event,keys)=>{for(const key of keys){const value=event?.[key];if(typeof value==='string'&&Number.isFinite(Date.parse(value)))return Date.parse(value)}return null};

export function calculatePlannedStats(schedule,emergency,queue,period='day',now=Date.now()){
 if(!QUEUES.has(queue))throw Error('Неправильна підчерга');
 const range=periodRange(period,now),days=[],confirmed=new Set(Array.isArray(schedule?.confirmedNoScheduleDates)?schedule.confirmedNoScheduleDates:[]);
 const byDate=new Map((Array.isArray(schedule?.days)?schedule.days:[]).filter(d=>d?.verified===true).map(d=>[d.date,d]));
 let onMinutes=0,offMinutes=0,unknownMinutes=0,verifiedDays=0;
 for(let date=range.startDate;midnight(date)<range.endAt;date=shiftDate(date,1)){
  const start=Math.max(range.startAt,midnight(date)),end=Math.min(range.endAt,midnight(shiftDate(date,1)));
  if(end<=start)continue;
  const duration=Math.floor((end-start)/60000),day=byDate.get(date),item=day?.queues?.[queue];
  if(day&&item){
   const knownFrom=minute(item.knownFrom??'00:00');
   if(knownFrom<0){unknownMinutes+=duration;continue}
   const knownStart=Math.max(start,midnight(date)+knownFrom*60000),known=Math.max(0,Math.floor((end-knownStart)/60000));
   let outage=0;
   for(const span of Array.isArray(item.off)?item.off:[]){
    if(!Array.isArray(span)||span.length!==2)continue;
    const from=minute(span[0]),to=minute(span[1]);if(from<0||to<=from)continue;
    const a=Math.max(knownStart,midnight(date)+from*60000),b=Math.min(end,midnight(date)+to*60000);
    if(b>a)outage+=Math.floor((b-a)/60000);
   }
   offMinutes+=Math.min(known,outage);onMinutes+=Math.max(0,known-outage);unknownMinutes+=duration-known;verifiedDays++;
  }else if(confirmed.has(date)){onMinutes+=duration;verifiedDays++}
  else unknownMinutes+=duration;
  days.push(date);
 }
 const events=Array.isArray(emergency?.events)?emergency.events:[];
 const emergencyEvents=events.filter(event=>['active','ended'].includes(event?.status)&&Array.isArray(event.queues)&&(event.queues.includes(queue)||event.queues.includes('all'))&&eventTime(event,['publishedAt'])!==null&&eventTime(event,['publishedAt'])<=range.endAt&&eventTime(event,['publishedAt'])>=range.startAt).length;
 const intervals=[];
 for(const event of events){
  if(!['active','ended'].includes(event?.status)||!Array.isArray(event.queues)||!(event.queues.includes(queue)||event.queues.includes('all')))continue;
  const from=eventTime(event,['startedAt','startAt']),to=eventTime(event,['endedAt','endAt'])??(event.status==='active'?now:null);
  if(from===null||to===null||to<=from)continue;
  const a=Math.max(from,range.startAt),b=Math.min(to,range.endAt);if(b>a)intervals.push([a,b]);
 }
 intervals.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const item of intervals){const last=merged.at(-1);if(last&&item[0]<=last[1])last[1]=Math.max(last[1],item[1]);else merged.push([...item])}
 const emergencyOffMinutes=intervals.length?merged.reduce((sum,[a,b])=>sum+Math.floor((b-a)/60000),0):null;
 return {period,startDate:range.startDate,asOf:new Date(now).toISOString(),onMinutes,offMinutes,unknownMinutes,emergencyOffMinutes,emergencyEvents,verifiedDays,totalDays:days.length,totalMinutes:range.totalMinutes,source:'official-schedule',note:'Розрахунок за підтвердженими офіційними графіками. Невідомий час не зараховується до годин зі світлом.'};
}

export function createCommunityStatusStore({directory,clock=()=>Date.now(),regionId='cherkasy-district'}){
 if(typeof regionId!=='string'||!/^[a-z0-9-]{2,40}$/.test(regionId))throw Error('Invalid community region id');
 const file=path.join(directory,'community-status.json'),secretFile=path.join(directory,'community-status-secret');
 let secret,records=[];
 try{secret=fs.readFileSync(secretFile)}catch(error){if(error.code!=='ENOENT')throw error;secret=crypto.randomBytes(32);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(secretFile,secret,{mode:0o600,flag:'wx'})}
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved?.schemaVersion===1&&Array.isArray(saved.reports))records=saved.reports.filter(r=>QUEUES.has(r.queue)&&['on','off'].includes(r.status)&&Number.isFinite(r.at)&&/^[a-f0-9]{64}$/.test(r.actor)&&(r.region===undefined||r.region===regionId)).map(r=>({...r,region:regionId}))}
 catch(error){if(error.code!=='ENOENT')console.warn('[community-status] Stored data invalid:',error.message)}
 const actorFor=id=>crypto.createHmac('sha256',secret).update('client:'+id).digest('hex');
 const persist=()=>{fs.mkdirSync(directory,{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify({schemaVersion:1,updatedAt:new Date(clock()).toISOString(),reports:records})+'\n',{mode:0o600});fs.renameSync(tmp,file)};
 const prune=()=>{const cutoff=clock()-RETENTION_MS,old=records.length;records=records.filter(r=>r.at>=cutoff);if(records.length>MAX_REPORTS)records=records.slice(-MAX_REPORTS);const changed=records.length!==old;if(changed)persist();return changed};
 prune();
 function report(input){
  if(!isObject(input)||!QUEUES.has(input.queue)||!['on','off'].includes(input.status)||typeof input.clientId!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(input.clientId))throw Error('Перевірте підчергу та повідомлення');
  const now=clock(),actor=actorFor(input.clientId),queue=input.queue;prune();
  const previous=records.filter(r=>r.region===regionId&&r.actor===actor&&r.queue===queue).sort((a,b)=>b.at-a.at)[0];
  if(previous&&now-previous.at<120000){const error=Error('Повідомлення можна оновити трохи пізніше');error.statusCode=429;error.retryAfter=Math.ceil((120000-(now-previous.at))/1000);throw error}
  const bucket=Math.floor(now/BUCKET_MS),existing=records.find(r=>r.region===regionId&&r.actor===actor&&r.queue===queue&&Math.floor(r.at/BUCKET_MS)===bucket);
  if(existing){existing.status=input.status;existing.at=now}else records.push({region:regionId,queue,status:input.status,at:now,actor});
  persist();return {ok:true,region:regionId,acceptedAt:new Date(now).toISOString()};
 }
 function status(queue,clientId=''){
  prune();if(!QUEUES.has(queue))throw Error('Неправильна підчерга');
  const now=clock(),cutoff=now-1800000,latest=new Map();
  for(const r of records)if(r.region===regionId&&r.queue===queue&&r.at>=cutoff&&r.at<=now){const old=latest.get(r.actor);if(!old||r.at>old.at)latest.set(r.actor,r)}
  let on=0,off=0,updatedAt=null;
  for(const r of latest.values()){if(r.status==='on')on++;else off++;if(!updatedAt||r.at>Date.parse(updatedAt))updatedAt=new Date(r.at).toISOString()}
  const total=on+off,majority=Math.max(on,off),agreementPercent=total?Math.round(majority/total*100):0,confirmed=total>=3&&agreementPercent>=60;
  const actor=typeof clientId==='string'&&/^[a-zA-Z0-9-]{16,64}$/.test(clientId)?actorFor(clientId):'';
  const own=actor?latest.get(actor):null;
  const ageMinutes=updatedAt?Math.max(0,Math.floor((now-Date.parse(updatedAt))/60000)):null;
  const freshness=ageMinutes===null?'none':ageMinutes<=10?'fresh':ageMinutes<=20?'recent':'aging';
  return {region:regionId,queue,state:confirmed?(on>off?'on':'off'):'unknown',confirmed,agreementPercent,
   counts:{on,off,total},updatedAt,ageMinutes,freshness,windowMinutes:30,myReport:own?.status||null,minimumReports:3};
 }
 function stats(queue,period='day'){
  if(!QUEUES.has(queue))throw Error('Неправильна підчерга');
  const now=clock(),range=periodRange(period,now),groups=new Map();prune();
  // Keep only each actor's latest observation inside a bucket. If someone
  // corrects their report, they must never count on both sides of the same interval.
  for(const r of records){
   if(r.region!==regionId||r.queue!==queue||r.at<range.startAt||r.at>range.endAt)continue;
   const bucket=Math.floor(r.at/BUCKET_MS)*BUCKET_MS;
   let group=groups.get(bucket);if(!group){group=new Map();groups.set(bucket,group)}
   const previous=group.get(r.actor);if(!previous||r.at>previous.at)group.set(r.actor,r);
  }
  let onMinutes=0,offMinutes=0,confirmedBuckets=0;
  for(const [bucket,group] of groups){
   let on=0,off=0;for(const report of group.values()){if(report.status==='on')on++;else off++}
   const total=on+off;if(total<3||Math.max(on,off)/total<0.6||bucket+BUCKET_MS>range.endAt)continue;
   const minutes=10;if(on>off)onMinutes+=minutes;else offMinutes+=minutes;confirmedBuckets++;
  }
  const coverageMinutes=onMinutes+offMinutes;
  return {region:regionId,period,startDate:range.startDate,asOf:new Date(now).toISOString(),onMinutes,offMinutes,coverageMinutes,unknownMinutes:Math.max(0,range.totalMinutes-coverageMinutes),totalMinutes:range.totalMinutes,confirmedBuckets,minimumReportsPerInterval:3,intervalMinutes:10,source:'community-observations',note:'Фактичні години рахуються лише за 10-хвилинними інтервалами з щонайменше трьома різними підтвердженнями. Пропуски не домальовуються.'};
 }
 function snapshot(){prune();return {region:regionId,reports:records.length,queues:[...QUEUES].map(queue=>status(queue)),retentionDays:35}}
 return {report,status,stats,snapshot,flush:persist,file};
}
