import {adminRouter} from './admin.js';
/* Companion server for GitHub Pages. Persist DATA_FILE on non-ephemeral storage.
   No real home addresses are transmitted or stored: only queue and subscription. */
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import webpush from 'web-push';
const {VAPID_PUBLIC_KEY,PUSH_PRIVATE_KEY,PUSH_CONTACT,APP_ORIGIN,SCHEDULE_URL,DATA_FILE='./subscribers.json',PORT='8787'}=process.env;
if(!VAPID_PUBLIC_KEY||!PUSH_PRIVATE_KEY||!PUSH_CONTACT||!APP_ORIGIN||!SCHEDULE_URL){console.error('Missing: VAPID_PUBLIC_KEY PUSH_PRIVATE_KEY PUSH_CONTACT APP_ORIGIN SCHEDULE_URL');process.exit(1)}
webpush.setVapidDetails(PUSH_CONTACT,VAPID_PUBLIC_KEY,PUSH_PRIVATE_KEY);
const ALL=new Set(Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat());
const config={};try{Object.assign(config,JSON.parse(fs.readFileSync(DATA_FILE,'utf8')))}catch{}
const subscribers=config.subscribers||{};const sent=config.sent||{};
const save=()=>{fs.writeFileSync(DATA_FILE+'.tmp',JSON.stringify({subscribers,sent},null,2));fs.renameSync(DATA_FILE+'.tmp',DATA_FILE)};
const utcTime=()=>new Date();
const dayInKyiv=(d=new Date())=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));return {date:`${parts.year}-${parts.month}-${parts.day}`,m:+parts.hour*60 + +parts.minute}};
const shiftDay=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const minute=s=>s==='24:00'?1440:/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?+s.slice(0,2)*60 + +s.slice(3):-1;
function timeline(schedule,q){const item=schedule?.queues?.[q];if(!item)return null;const start=minute(item.knownFrom||'00:00');if(start<0)return null;const a=new Int8Array(1440);a.fill(-1);a.fill(0,start);let last=0;for(const [s,e]of item.off||[]){const st=minute(s),en=minute(e);if(st<last||st>=en||en>1440)return null;a.fill(1,Math.max(st,start),en);last=en}return a}
const hash=endpoint=>crypto.createHash('sha256').update(endpoint).digest('hex');
const send=async(record,title,body,key)=>{if(sent[key])return;const payload=JSON.stringify({title,body,url:APP_ORIGIN});try{await webpush.sendNotification(record.subscription,payload,{TTL:1200,urgency:'normal'});sent[key]=new Date().toISOString()}catch(e){if([404,410].includes(e.statusCode)){delete subscribers[hash(record.subscription.endpoint)]}else console.warn('Push failed',e.statusCode||e.message)}};
async function job(){let source;try{const r=await fetch(SCHEDULE_URL,{signal:AbortSignal.timeout(20000),headers:{'cache-control':'no-cache'}});if(!r.ok)throw Error(String(r.status));source=await r.json()}catch(e){console.warn('Schedule fetch failed',e.message);return}if(!Array.isArray(source.days))return;const now=dayInKyiv(),current=source.days.find(x=>x.date===now.date&&x.verified===true),nextDate=shiftDay(now.date,1),tomorrow=source.days.find(x=>x.date===nextDate&&x.verified===true);let emergencyEvents=[];
 try{
   const emergencyUrl=new URL(SCHEDULE_URL);emergencyUrl.pathname=emergencyUrl.pathname.replace(/schedules\.json$/,'emergency.json');
   const r=await fetch(emergencyUrl,{signal:AbortSignal.timeout(15000),cache:'no-store'});
   if(r.ok){const j=await r.json();if(Array.isArray(j.events))emergencyEvents=j.events}
 }catch(e){console.warn('Emergency bulletin fetch:',e.message)}
 try{
   const manualUrl=new URL(SCHEDULE_URL);manualUrl.pathname=manualUrl.pathname.replace(/schedules\.json$/,'manual_overrides.json');
   const r=await fetch(manualUrl,{signal:AbortSignal.timeout(15000),cache:'no-store'});
   if(r.ok){const j=await r.json();if(Array.isArray(j.emergency?.events))emergencyEvents.push(...j.emergency.events)}
 }catch(e){console.warn('Emergency overrides fetch:',e.message)}
 const subscriptions=Object.values(subscribers);for(const record of subscriptions){const q=record.queue;if(!ALL.has(q))continue;const a=timeline(current,q),m=now.m;
 if(a){for(const [type,offset,target,description] of [['off',30,1,'відключення'],['on',15,0,'повернення світла']]){if(!record.preferences?.[type])continue;const change=m+offset;if(change>=1440)continue;if(a[change]===target&&a[change-1]!==target){await send(record,`Світло: скоро ${description}`,`За ${offset} хвилин очікується ${description} за графіком для підчерги ${q}.`,`${hash(record.subscription.endpoint)}:${type}:${now.date}:${change}`)}}}
 if(tomorrow&&m>=19*60&&record.preferences?.tomorrow)await send(record,'Світло: графік на завтра',`Опубліковано графік для підчерги ${q} на ${nextDate}.`,`${hash(record.subscription.endpoint)}:tomorrow:${nextDate}:${tomorrow.publishedAt}`);
 if(record.preferences?.emergency){
   for(const event of emergencyEvents){
     if(event.status!=='active'||!event.publishedAt||!event.source?.startsWith('https://www.cherkasyoblenergo.com/'))continue;
     const delta=Date.now()-new Date(event.publishedAt).getTime();
     if(delta<0||delta>=65*60_000)continue;
     if(event.queues?.length&&!event.queues.includes(q))continue;
     await send(record,'Світло: аварійне повідомлення оператора',`Офіційне повідомлення: ${String(event.title).slice(0,135)}. Перевірте інформацію для своєї адреси.`,`${hash(record.subscription.endpoint)}:emergency:${hash(event.source)}`);
   }
 }
 if(record.preferences?.changes){for(const c of (source.changes||[]).slice(-16))if(c.queues?.includes(q)&&c.date>=now.date){const d=new Date(c.publishedAt);if(Date.now()-d.getTime()<65*60*1000){await send(record,'Світло: графік змінено',`Оновлено підчергу ${q} на ${c.date}.`,`${hash(record.subscription.endpoint)}:change:${c.date}:${c.publishedAt}`)}}}
 }
 const cutoff=Date.now()-14*86400*1000;for(const [key,stamp] of Object.entries(sent))if(new Date(stamp).getTime()<cutoff)delete sent[key];save()}
const respond=(res,code,obj,origin)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':origin===APP_ORIGIN?origin:APP_ORIGIN,'vary':'Origin'});res.end(JSON.stringify(obj))};
const server=http.createServer(async(req,res)=>{const origin=req.headers.origin||'';if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':APP_ORIGIN,'access-control-allow-methods':'POST, OPTIONS, GET','access-control-allow-headers':'content-type, authorization','vary':'Origin'});res.end();return}
 if(req.url?.startsWith('/api/admin/')){await adminRouter(req,res);return}
 if(req.url==='/health'){respond(res,200,{ok:true,subscriberCount:Object.keys(subscribers).length},origin);return}
 if(req.url!=='/api/subscribe'||req.method!=='POST'){respond(res,404,{error:'Not found'},origin);return}
 if(origin!==APP_ORIGIN){respond(res,403,{error:'Origin not allowed'},origin);return}
 try{let size=0;let body='';for await(const c of req){size+=c.length;if(size>12_000)throw Error('Too large');body+=c.toString()}const data=JSON.parse(body);const endpoint=data.subscription?.endpoint;const host=new URL(endpoint).hostname;if(!endpoint?.startsWith('https://')||!(host.endsWith('.push.apple.com')||host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.mozilla.com')||host.endsWith('.googleapis.com')))throw Error('Invalid push service');if(!data.subscription.keys?.p256dh||!data.subscription.keys?.auth||!ALL.has(data.queue))throw Error('Invalid subscription or queue');const preferences={off:!!data.preferences?.off,on:!!data.preferences?.on,changes:!!data.preferences?.changes,tomorrow:!!data.preferences?.tomorrow,emergency:!!data.preferences?.emergency};const key=hash(endpoint);subscribers[key]={subscription:data.subscription,queue:data.queue,preferences};save();respond(res,200,{ok:true},origin)}catch(e){respond(res,400,{error:'Bad subscription payload'},origin)}});
server.listen(+PORT,()=>console.log('Push companion listening on port '+PORT));
job().catch(console.error);setInterval(()=>job().catch(console.error),60_000);
