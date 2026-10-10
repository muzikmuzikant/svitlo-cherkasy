/* Svitlo Cherkasy Web Push companion. No address/name is stored, only queue and Web Push endpoint.
 * Keep DATA_FILE on Railway's persistent volume; keep VAPID private key in Railway Variables.
 */
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import webpush from 'web-push';
import {adminRouter} from './admin.js';
import {createManualPush} from './manual-push.js';
import {QUEUES,timeline,dueTransition,latestOfficialEvent,freshEvent} from './schedule-engine.js';

const {VAPID_PUBLIC_KEY,PUSH_PRIVATE_KEY,PUSH_CONTACT,APP_ORIGIN,SCHEDULE_URL,DATA_FILE='./subscribers.json',PORT='8080'}=process.env;
if(!VAPID_PUBLIC_KEY||!PUSH_PRIVATE_KEY||!PUSH_CONTACT||!APP_ORIGIN||!SCHEDULE_URL){
 console.error('Missing: VAPID_PUBLIC_KEY PUSH_PRIVATE_KEY PUSH_CONTACT APP_ORIGIN SCHEDULE_URL');process.exit(1);
}
for(const [key,value] of [['APP_ORIGIN',APP_ORIGIN],['SCHEDULE_URL',SCHEDULE_URL]]){
 try{if(new URL(value).protocol!=='https:')throw Error('HTTPS required')}catch{console.error(key+' must be a valid HTTPS URL');process.exit(1)}
}
webpush.setVapidDetails(PUSH_CONTACT,VAPID_PUBLIC_KEY,PUSH_PRIVATE_KEY);
const hash=endpoint=>crypto.createHash('sha256').update(endpoint).digest('hex');
let config={};try{config=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))}catch(e){if(e.code!=='ENOENT')console.warn('Unable to load subscriber store:',e.message)}
const subscribers=config.subscribers&&typeof config.subscribers==='object'?config.subscribers:{};
const sent=config.sent&&typeof config.sent==='object'?config.sent:{};
function save(){
 try{fs.writeFileSync(DATA_FILE+'.tmp',JSON.stringify({subscribers,sent}));fs.renameSync(DATA_FILE+'.tmp',DATA_FILE)}
 catch(e){console.error('Persistent subscriber save failed:',e.message);throw e}
}
const appUrl=new URL('../',SCHEDULE_URL).href;
const manualPush=createManualPush({subscribers,webpush,appUrl,hash,save});
const fmtKyiv=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function dayInKyiv(d=new Date()){const p=Object.fromEntries(fmtKyiv.formatToParts(d).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,m:Number(p.hour)*60+Number(p.minute)}}
function shiftDay(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function response(res,status,json,origin=''){
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':APP_ORIGIN,'vary':'Origin','x-content-type-options':'nosniff'});res.end(JSON.stringify(json));
}
async function loadJson(url){
 const r=await fetch(url,{signal:AbortSignal.timeout(16000),cache:'no-store',headers:{'cache-control':'no-cache'}});
 if(!r.ok)throw Error(`HTTP ${r.status}`);
 return r.json();
}
async function send(rec,title,body,key,options={}){
 if(sent[key])return;
 const payload=JSON.stringify({title,body,url:appUrl,tag:key.slice(-90)});
 try{await webpush.sendNotification(rec.subscription,payload,{TTL:options.ttl||1200,urgency:options.urgency||'normal'});sent[key]=new Date().toISOString()}
 catch(e){if([404,410].includes(e?.statusCode))delete subscribers[hash(rec.subscription.endpoint)];else console.warn('Auto Push failed:',e?.statusCode||e?.message)}
}
async function forEachLimited(items,limit,fn){
 let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(next<items.length){const i=next++;try{await fn(items[i])}catch(e){console.warn('Delivery worker:',e.message)}}
 }));
}
let lastSuccess=null,lastError=null,running=false;
async function job(){
 if(running)return;
 running=true;
 try{
  let source,scheduleIssue=null;
  try{source=await loadJson(SCHEDULE_URL);if(!Array.isArray(source.days))throw Error('Invalid schedule structure')}
  catch(e){scheduleIssue='Schedule fetch: '+e.message;console.warn(scheduleIssue);source={days:[],changes:[]}}
  const now=dayInKyiv(),timestamp=Date.now();
  const current=source.days.find(d=>d.date===now.date&&d.verified===true);
  const nextDate=shiftDay(now.date,1);
  const tomorrow=source.days.find(d=>d.date===nextDate&&d.verified===true);
  let bulletin=[];
  for(const [filename,path] of [['emergency.json','events'],['manual_overrides.json','override']]){
   try{const u=new URL(SCHEDULE_URL);u.pathname=u.pathname.replace(/schedules\.json$/,filename);
       const value=await loadJson(u);const events=path==='events'?value.events:value.emergency?.events;
       if(Array.isArray(events))bulletin.push(...events)}
   catch(e){console.warn('Bulletin refresh:',e.message)}
  }
  // The freshest verified bulletin determines whether an emergency is active or ended.
  const event=latestOfficialEvent(bulletin,timestamp);
  const all=Object.values(subscribers);
  await forEachLimited(all,12,async record=>{
   const q=record?.queue,endpoint=record?.subscription?.endpoint;
   if(!QUEUES.has(q)||!endpoint)return;
   const pref=record.preferences||{},prefix=hash(endpoint),minutes=now.m;
   const values=timeline(current,q);
   for(const [type,offset,target,description] of [['off',30,1,'відключення'],['on',15,0,'відновлення']]){
    if(!pref[type])continue;
    const boundary=dueTransition(values,minutes,offset,target,4);
    if(boundary!==null){const eta=boundary-minutes;
     await send(record,`Світло: скоро ${description}`,`Орієнтовно через ${eta} хв за графіком: ${description} для підчерги ${q}.`,`${prefix}:${type}:${now.date}:${boundary}`)}
   }
   if(pref.tomorrow&&tomorrow?.queues?.[q]&&minutes>=19*60){
    const revision=tomorrow.publishedAt||'';
    await send(record,'Світло: графік на завтра',`Опубліковано графік для підчерги ${q} на ${nextDate}.`,`${prefix}:tomorrow:${nextDate}:${revision}`);
   }
   if(pref.emergency&&freshEvent(event,timestamp)&&(!Array.isArray(event.queues)||!event.queues.length||event.queues.includes(q))){
    const title=event.status==='active'?'🪫Графік не діє':event.status==='ended'?'✅ Екстрені обмеження завершено':null;
    const body=event.status==='active'?'Розпочинаються екстрені відключення світла поза графіком.':event.status==='ended'?'Оператор повідомив про завершення екстрених обмежень. Перевірте актуальний графік.':null;
    if(title)await send(record,title,body,`${prefix}:emergency:${event.status}:${hash(event.id||event.source)}:${event.publishedAt}`,{ttl:3600,urgency:'high'});
   }
   if(pref.changes)for(const change of (source.changes||[]).slice(-30)){
    const date=Date.parse(change.publishedAt||''),age=timestamp-date;
    if(!Array.isArray(change.queues)||!change.queues.includes(q)||change.date<now.date||!Number.isFinite(date)||age<0||age>=65*60000)continue;
    await send(record,'Світло: графік змінено',`Оновлено графік для підчерги ${q} на ${change.date}.`,`${prefix}:change:${change.date}:${change.publishedAt}`);
   }
  });
  const cutoff=timestamp-14*86400_000;
  for(const [key,stamp] of Object.entries(sent))if(!Number.isFinite(Date.parse(stamp))||Date.parse(stamp)<cutoff)delete sent[key];
  save();lastSuccess=new Date().toISOString();lastError=scheduleIssue;
 }catch(e){lastError=e.message;console.error('Push cycle failed:',e.message)}
 finally{running=false}
}
const validEndpoint=raw=>{
 if(typeof raw!=='string'||raw.length>2048)return false;
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
  const h=u.hostname.toLowerCase();return h.endsWith('.push.apple.com')||h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h.endsWith('.push.services.mozilla.com')||h.endsWith('.googleapis.com');}
 catch{return false}
};
async function readPayload(req,limit=12000){
 let bytes=0,chunks=[];
 for await(const c of req){bytes+=c.length;if(bytes>limit)throw Error('Request too large');chunks.push(c)}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin||'';
 if(req.method==='OPTIONS'){
  if(origin!==APP_ORIGIN){response(res,403,{error:'Origin not allowed'});return}
  res.writeHead(204,{'access-control-allow-origin':APP_ORIGIN,'access-control-allow-methods':'POST, OPTIONS, GET, PUT','access-control-allow-headers':'content-type, authorization','vary':'Origin'});res.end();return;
 }
 if(req.url?.startsWith('/api/admin/')){await adminRouter(req,res,manualPush);return}
 if(req.url==='/health'&&req.method==='GET'){
  response(res,200,{ok:true,subscriberCount:Object.keys(subscribers).length,lastPushCheck:lastSuccess,pushCheckError:lastError});return;
 }
 if(!['/api/subscribe','/api/unsubscribe'].includes(req.url)||req.method!=='POST'){response(res,404,{error:'Not found'});return}
 if(origin!==APP_ORIGIN){response(res,403,{error:'Origin not allowed'});return}
 try{
  const data=await readPayload(req),endpoint=data?.subscription?.endpoint;
  if(!validEndpoint(endpoint))throw Error('Invalid endpoint');
  const key=hash(endpoint);
  if(req.url==='/api/unsubscribe'){
   delete subscribers[key];save();response(res,200,{ok:true});return;
  }
  if(!data.subscription.keys?.p256dh||!data.subscription.keys?.auth||!QUEUES.has(data.queue))throw Error('Invalid subscription or queue');
  const prefs=data.preferences||{};
  const preferences={off:!!prefs.off,on:!!prefs.on,changes:!!prefs.changes,tomorrow:!!prefs.tomorrow,emergency:!!prefs.emergency};
  subscribers[key]={subscription:data.subscription,queue:data.queue,preferences};
  save();response(res,200,{ok:true});
 }catch(e){response(res,e.message?.includes('save failed')?500:400,{error:'Invalid subscription request'})}
});
server.listen(Number(PORT),()=>console.log('Push companion listening on port '+PORT));
job().catch(console.error);setInterval(()=>job().catch(console.error),60_000);
