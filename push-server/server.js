/* Svitlo Cherkasy Web Push companion. No address/name is stored, only queue and Web Push endpoint.
 * Keep DATA_FILE on Railway's persistent volume; keep VAPID private key in Railway Variables.
 */
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {createFeedbackStore,readFeedbackBody} from './feedback-store.js';
import {createAdminExtras} from './admin-extras.js';
import {createAppConfig} from './app-config.js';
import {createMediaStore} from './media-store.js';
import {createSchedulePublication} from './schedule-publication.js';
import {originPolicy} from './origins.js';
import webpush from 'web-push';
import {adminRouter} from './admin.js';
import {createManualPush} from './manual-push.js';
import {transitionCopy,tomorrowCopy,changeCopy,emergencyCopy,firstPublishedAt,dayId,changeId,isLatestRevision,emergencyId} from './notification-copy.js';
import {QUEUES,timeline,dueTransition,latestOfficialEvent,freshEvent,freshSchedule,dueTransitionAcrossDays} from './schedule-engine.js';

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
const feedback=createFeedbackStore({filePath:process.env.FEEDBACK_FILE||path.join(path.dirname(DATA_FILE),'feedback.json')});
const extras=createAdminExtras({directory:path.dirname(DATA_FILE)});
const siteControls=createAppConfig({directory:path.dirname(DATA_FILE),record:extras.record});
const mediaStore=createMediaStore(path.dirname(DATA_FILE));
const officialSchedules=createSchedulePublication({directory:path.dirname(DATA_FILE),token:process.env.SCHEDULE_INGEST_SECRET||''});
const appUrl=new URL('/',APP_ORIGIN).href; // Push opens PWA, never the GitHub raw JSON host.
const manualPush=createManualPush({subscribers,webpush,appUrl,hash,save});
const fmtKyiv=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function dayInKyiv(d=new Date()){const p=Object.fromEntries(fmtKyiv.formatToParts(d).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,m:Number(p.hour)*60+Number(p.minute)}}
function shiftDay(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function response(res,status,json,origin=''){
 const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff'};
 if(res._allowedAppOrigin)headers['access-control-allow-origin']=res._allowedAppOrigin;
 res.writeHead(status,headers);res.end(JSON.stringify(json));
}
async function loadJson(url){
 const fresh=new URL(url);fresh.searchParams.set('_fresh',String(Math.floor(Date.now()/60000)));
 const r=await fetch(fresh,{signal:AbortSignal.timeout(16000),cache:'no-store',headers:{'cache-control':'no-cache'}});
 if(!r.ok)throw Error(`HTTP ${r.status}`);
 return r.json();
}
const deliveryStats={
 lastAttempt:null,lastAccepted:null,lastFailure:null,
 lastCycle:null,totalAcceptedSinceBoot:0,totalFailedSinceBoot:0
};
async function send(rec,message,key,options={}){
 if(sent[key])return 'already-sent';
 const category=String(options.notificationId||'').split(':')[0]||'automatic';
 const payload=JSON.stringify({title:message.title,body:message.body,content:message.content||'',
  url:appUrl,notificationId:options.notificationId,kind:options.kind||'schedule',
  at:options.at||new Date().toISOString(),tag:options.notificationId||key.slice(-90)});
 deliveryStats.lastAttempt=new Date().toISOString();
 try{
  await webpush.sendNotification(rec.subscription,payload,{TTL:options.ttl||1200,urgency:options.urgency||'normal'});
  sent[key]=new Date().toISOString();
  deliveryStats.totalAcceptedSinceBoot++;
  deliveryStats.lastAccepted={at:sent[key],category};
  if(category==='transition')console.info('[auto-push] transition accepted by Web Push provider');
  return 'accepted';
 }catch(e){
  deliveryStats.totalFailedSinceBoot++;
  deliveryStats.lastFailure={at:new Date().toISOString(),category,status:e?.statusCode||'network'};
  if([404,410].includes(e?.statusCode))delete subscribers[hash(rec.subscription.endpoint)];
  else console.warn('Auto Push failed:',e?.statusCode||e?.message);
  return 'failed';
 }
}
async function forEachLimited(items,limit,fn){
 let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(next<items.length){const i=next++;try{await fn(items[i])}catch(e){console.warn('Delivery worker:',e.message)}}
 }));
}
let lastSuccess=null,lastError=null,running=false,lastLoadedSchedule=null,transitionRunning=false;
// Dedicated short ticker: external bulletin requests must never delay a planned
// outage/restoration reminder. No browser or opened PWA is required.
async function transitionJob(){
 if(transitionRunning)return;
 transitionRunning=true;
 try{
  const source=officialSchedules.schedule()||lastLoadedSchedule;
  const now=dayInKyiv(),timestamp=Date.now(),schedulesSafe=freshSchedule(source,timestamp);
  const current=schedulesSafe?source.days.find(d=>d.date===now.date&&d.verified===true):null;
  const nextDate=shiftDay(now.date,1);
  const tomorrow=schedulesSafe?source.days.find(d=>d.date===nextDate&&d.verified===true):null;
  const all=Object.values(subscribers);
  const cycle={at:new Date().toISOString(),subscribers:all.length,
   offEnabled:all.filter(x=>x?.preferences?.off).length,
   onEnabled:all.filter(x=>x?.preferences?.on).length,
   scheduleFresh:schedulesSafe,todayVerified:!!current,tomorrowVerified:!!tomorrow,
   transitionDue:0,transitionAccepted:0,transitionFailed:0,transitionAlreadySent:0};
  if(schedulesSafe)await forEachLimited(all,12,async record=>{
   const q=record?.queue,endpoint=record?.subscription?.endpoint;
   if(!QUEUES.has(q)||!endpoint)return;
   const pref=record.preferences||{},prefix=hash(endpoint),minutes=now.m;
   const values=schedulesSafe?timeline(current,q):null;
   const valuesTomorrow=schedulesSafe?timeline(tomorrow,q):null;
   for(const [type,offset,target] of [['off',30,1],['on',15,0]]){
    if(!pref[type])continue;
    // Recover reminders delayed by Railway restarts or temporarily slow schedule imports.
    // The helper never returns transitions that have already started.
    const boundary=dueTransitionAcrossDays(values,valuesTomorrow,minutes,offset,target,offset-2);
    if(boundary!==null){const eta=boundary-minutes;
     const msg=transitionCopy(type,q,boundary,eta,boundary>=1440?nextDate:now.date);
     const key=`${prefix}:${type}:${now.date}:${boundary}`;
     if(sent[key]){cycle.transitionAlreadySent++;continue}
     cycle.transitionDue++;
     const outcome=await send(record,msg,key,{
      notificationId:'transition:'+q+':'+now.date+':'+boundary+':'+type,ttl:900,urgency:'high'});
     record.automatic=record.automatic||{};
     record.automatic.lastAttempt=new Date().toISOString();
     record.automatic.lastEvent={type,time:(boundary>=1440?nextDate:now.date)+'T'+
       String(Math.floor((boundary%1440)/60)).padStart(2,'0')+':'+String(boundary%60).padStart(2,'0'),
       minutesRemaining:eta};
     if(outcome==='accepted'){
      cycle.transitionAccepted++;record.automatic.lastAccepted=record.automatic.lastAttempt;
      record.automatic.lastError=null;
      console.info('[auto-push] accepted '+type+' queue='+q+' eta='+eta);
     }else if(outcome==='failed'){
      cycle.transitionFailed++;record.automatic.lastError=deliveryStats.lastFailure?.status||'failed';
      console.warn('[auto-push] rejected '+type+' queue='+q);
     }
    }
   }
  });
  deliveryStats.lastCycle=cycle;
  if(cycle.transitionDue||(!schedulesSafe&&now.m%5===0&&new Date().getSeconds()<25))
   console.info('[auto-push] cycle fresh='+schedulesSafe+' day='+now.date+
    ' subscribers='+cycle.subscribers+' off='+cycle.offEnabled+' on='+cycle.onEnabled+
    ' due='+cycle.transitionDue+' accepted='+cycle.transitionAccepted+
    ' failed='+cycle.transitionFailed);
  if(cycle.transitionDue)save();
 }catch(e){
  console.error('[auto-push] transition dispatcher failed:',e.message);
  deliveryStats.lastFailure={at:new Date().toISOString(),category:'transition',status:'cycle-error'};
 }finally{transitionRunning=false}
}

async function job(){
 if(running)return;
 running=true;
 try{
  let source,scheduleIssue=null;
  try{source=officialSchedules.schedule()||await loadJson(SCHEDULE_URL);if(!Array.isArray(source.days))throw Error('Invalid schedule structure')}
  catch(e){scheduleIssue='Schedule fetch: '+e.message;console.warn(scheduleIssue);source={days:[],changes:[]}}
  lastLoadedSchedule=source;
  const now=dayInKyiv(),timestamp=Date.now();
  const schedulesSafe=freshSchedule(source,timestamp);
  if(!schedulesSafe)scheduleIssue=scheduleIssue||'Schedule data stale, unconfirmed or awaiting review';
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
   const freshChanges=(source.changes||[]).slice(-30).filter(change=>{
    const when=Date.parse(change.detectedAt||change.publishedAt||''),age=timestamp-when;
    return Array.isArray(change.queues)&&change.queues.includes(q)&&change.date>=now.date&&
     Number.isFinite(when)&&age>=0&&age<65*60000;
   });
   const tomorrowRevised=freshChanges.some(change=>isLatestRevision(change,tomorrow,q));
   if(schedulesSafe&&pref.tomorrow&&tomorrow?.verified===true&&minutes>=19*60&&!(pref.changes&&tomorrowRevised)){
    const revision=firstPublishedAt(tomorrow),msg=tomorrowCopy(q,nextDate,tomorrow);
    await send(record,msg,`${prefix}:tomorrow:${nextDate}:${revision}`,{
     notificationId:dayId(q,tomorrow),at:revision,source:tomorrow.source});
   }
   if(pref.emergency&&freshEvent(event,timestamp)&&(!Array.isArray(event.queues)||!event.queues.length||event.queues.includes(q))){
    const msg=emergencyCopy(event.status);
    if(msg)await send(record,msg,`${prefix}:emergency:${event.status}:${hash(event.id||event.source)}:${event.publishedAt}`,{
     notificationId:emergencyId(event),at:event.publishedAt,source:event.source,kind:'emergency',ttl:3600,urgency:'high'});
   }
   if(schedulesSafe&&pref.changes)for(const change of freshChanges){
    const msg=changeCopy(q,change.date,source.days.find(d=>d.date===change.date&&d.verified===true));
    await send(record,msg,`${prefix}:change:${change.date}:${change.revisionId||change.publishedAt}`,{
     notificationId:changeId(q,change),at:change.detectedAt||change.publishedAt,source:change.source});
   }
  });
  // Scheduled admin messages share a stable ID between Push and the public inbox.
  for(const notice of siteControls.duePush().slice(0,6)){
   try{
    const result=await manualPush.broadcast({title:notice.title,body:notice.body,queue:notice.queue,
      notificationId:'notice:'+notice.id,inbox:notice.delivery!=='push',settlement:notice.settlement||'',confirmSend:true});
    if(result.accepted>0)siteControls.markPushed(notice.id);
   }catch(e){console.warn('Scheduled notice Push:',e.message)}
  }
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
const statusAttempts=new Map();
const deviceTests=new Map();
const server=http.createServer(async(req,res)=>{
 // Routing must ignore cache-busting query strings, e.g. ?t=timestamp from the PWA.
 const requestPath=new URL(req.url,'http://localhost').pathname;
 const origin=req.headers.origin||'';
 res._allowedAppOrigin=originPolicy.isAllowed(origin)?origin:'';
 if(req.method==='OPTIONS'){
  if(!originPolicy.isAllowed(origin)){response(res,403,{error:'Origin not allowed'});return}
  res.writeHead(204,{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS, GET, PUT, PATCH, DELETE','access-control-allow-headers':'content-type, authorization','vary':'Origin'});res.end();return;
 }
 if(requestPath==='/api/data/status'&&req.method==='GET'){
  response(res,200,officialSchedules.status());return;
 }
 if((requestPath==='/api/data/schedules.json'||requestPath==='/api/data/source_review.json')&&req.method==='GET'){
  const doc=requestPath==='/api/data/source_review.json'?officialSchedules.review():officialSchedules.schedule();
  if(!doc){response(res,503,{error:'Railway schedule snapshot is not yet ready'});return}
  response(res,200,doc);return;
 }
 if(req.url==='/api/internal/schedules'&&req.method==='POST'){
  if(!officialSchedules.authorized(req.headers.authorization)){response(res,401,{error:'Unauthorized'});return}
  try{
   const body=await readPayload(req,1_400_000);
   const state=officialSchedules.update(body.schedules,body.review);
   console.log('[railway-schedules] Verified publication',state.lastChecked,'days='+state.verifiedDays.length);
   response(res,200,{ok:true,...state});
  }catch(e){console.error('[railway-schedules] Publish rejected:',e.message);
   response(res,400,{error:e.message});}
  return;
 }
 if(req.url?.startsWith('/api/admin/')){
  await adminRouter(req,res,manualPush,feedback,extras,async()=>{
    const result={server:{lastPushCheck:lastSuccess,pushCheckError:lastError,pushSubscribers:Object.keys(subscribers).length},sources:{}};
    await Promise.all([['schedules',SCHEDULE_URL],['emergency',new URL('emergency.json',SCHEDULE_URL).href],['review',new URL('source_review.json',SCHEDULE_URL).href]].map(async([name,url])=>{
      try{
        const data=(name==='schedules'?officialSchedules.schedule():name==='review'?officialSchedules.review():null)||await loadJson(url);
        result.sources[name]=name==='schedules'?{lastChecked:data.lastChecked,days:(data.days||[]).map(d=>({date:d.date,verified:d.verified,source:d.source,publishedAt:d.publishedAt})),changes:(data.changes||[]).length}:
          name==='emergency'?{lastChecked:data.lastChecked,count:(data.events||[]).length,latest:data.events?.[0]?.status||null}:
          {lastChecked:data.lastChecked,rejectedCount:data.rejectedCount||0,items:(data.items||[]).slice(0,30)};
      }catch(e){result.sources[name]={error:e.message}}
    }));
    const tickets=feedback.list().items;
    result.feedback={total:tickets.length,new:tickets.filter(t=>t.status==='new').length,inProgress:tickets.filter(t=>t.status==='in_progress').length};
    return result;
  },siteControls,mediaStore);return}
 if(req.url?.startsWith('/api/media/')&&req.method==='GET'){
   const id=req.url.slice('/api/media/'.length).split('?')[0],file=mediaStore.read(id);
   if(!file){response(res,404,{error:'Фото не знайдене'});return}
   res.writeHead(200,{'content-type':file.mime,'content-length':file.data.length,'x-content-type-options':'nosniff',
     'cache-control':'public, max-age=2592000, immutable','access-control-allow-origin':originPolicy.list[0]||APP_ORIGIN});
   res.end(file.data);return;
 }
 if(req.url==='/api/app-config'&&req.method==='GET'){
  if(!originPolicy.isAllowed(origin)){response(res,403,{error:'Origin not allowed'});return}
  response(res,200,siteControls.publicState());return;
 }
 if(req.url==='/api/help'&&req.method==='GET'){
  if(!originPolicy.isAllowed(origin)){response(res,403,{error:'Origin not allowed'});return}
  response(res,200,extras.getHelp());return;
 }
 if(req.url==='/api/ticket/status'&&req.method==='POST'){
  if(!originPolicy.isAllowed(origin)){response(res,403,{error:'Origin not allowed'});return}
  const ip=String(req.socket.remoteAddress||'unknown').slice(0,100),t=Date.now();
  for(const [key,item] of statusAttempts)if(item.until<t)statusAttempts.delete(key);
  const item=statusAttempts.get(ip)||{count:0,until:t+60000};
  if(item.count>=30){response(res,429,{error:'Забагато перевірок. Спробуйте за хвилину.'});return}
  item.count++;statusAttempts.set(ip,item);
  try{const data=await readPayload(req,800);const id=String(data.id||'').trim().toUpperCase();
    if(!/^SC-[0-9A-F]{10}$/.test(id)){response(res,400,{error:'Перевірте номер звернення.'});return}
    response(res,200,feedback.getStatus(id));
  }catch(e){response(res,e.statusCode||400,{error:e.statusCode?e.message:'Не вдалося перевірити номер.'})}
  return;
 }
 if(req.url==='/api/feedback'){
  if(req.method!=='POST'){response(res,405,{error:'Method not allowed'});return}
  if(!originPolicy.isAllowed(origin)){response(res,403,{error:'Origin not allowed'});return}
  try{
   const data=await readFeedbackBody(req);
   const ip=(String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress||'unknown').slice(0,80);
   const saved=feedback.submit(data,ip);
   response(res,201,saved);
  }catch(e){response(res,e.statusCode||500,{error:e.statusCode?e.message:'Не вдалося зберегти звернення.'})}
  return;
 }
 if(req.url==='/health'&&req.method==='GET'){
  response(res,200,{ok:true,subscriberCount:Object.keys(subscribers).length,lastPushCheck:lastSuccess,
   pushCheckError:lastError,schedulePublisher:officialSchedules.status(),delivery:deliveryStats});return;
 }
 if(requestPath==='/api/push/subscription-status'&&req.method==='POST'){
  if(!originPolicy.isAllowed(origin)){response(res,403,{error:'Origin not allowed'});return}
  try{
   const data=await readPayload(req,4096),endpoint=data?.subscription?.endpoint;
   if(!validEndpoint(endpoint))throw Error('Invalid endpoint');
   const rec=subscribers[hash(endpoint)];
   response(res,200,{ok:true,registered:!!rec,queue:rec?.queue||null,
    preferences:rec?{off:!!rec.preferences?.off,on:!!rec.preferences?.on}:null,
    lastPushCheck:lastSuccess,checkError:lastError});
  }catch{response(res,400,{error:'Invalid Push subscription'})}
  return;
 }
 if(requestPath==='/api/push/test-device'&&req.method==='POST'){
  if(!originPolicy.isAllowed(origin)){response(res,403,{error:'Origin not allowed'});return}
  try{
   const data=await readPayload(req,4096),endpoint=data?.subscription?.endpoint;
   if(!validEndpoint(endpoint))throw Error('Invalid endpoint');
   const endpointId=hash(endpoint),now=Date.now();
   for(const [key,until] of deviceTests)if(until<now)deviceTests.delete(key);
   if(deviceTests.has(endpointId)){response(res,429,{error:'Повторна перевірка доступна трохи пізніше.'});return}
   const rec=subscribers[endpointId];
   if(!rec){response(res,409,{error:'Push-підписку не знайдено на сервері.'});return}
   deviceTests.set(endpointId,now+10*60_000);
   const result=await send(rec,{title:'🔔 Перевірка Push',body:'Це тестове системне сповіщення «Світло Черкаси». Якщо воно з’явилося на iPhone, доставка Push працює.'},
      endpointId+':device-test:'+now,{notificationId:'test:'+now,kind:'push',urgency:'high',ttl:600});
   save();
   response(res,result==='accepted'?200:502,{ok:result==='accepted',accepted:result==='accepted',
      message:result==='accepted'?'Push прийнято сервісом доставки. Перевірте системні сповіщення iPhone.':'Сервіс Push відхилив відправлення. Перевірте підписку.'});
  }catch(e){response(res,400,{error:'Не вдалося виконати тест Push.'})}
  return;
 }
 if(!['/api/subscribe','/api/unsubscribe'].includes(req.url)||req.method!=='POST'){response(res,404,{error:'Not found'});return}
 if(!originPolicy.isAllowed(origin)){response(res,403,{error:'Origin not allowed'});return}
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
  // Store only the locality for opt-in Push targeting. Never store street/house.
  const settlement=typeof data.settlement==='string'?data.settlement.normalize('NFKC').trim().slice(0,70):'';
  subscribers[key]={subscription:data.subscription,queue:data.queue,preferences,settlement};
  save();response(res,200,{ok:true});
 }catch(e){response(res,e.message?.includes('save failed')?500:400,{error:'Invalid subscription request'})}
});
server.listen(Number(PORT),()=>console.log('Push companion listening on port '+PORT));
job().catch(console.error);
transitionJob().catch(console.error);
setInterval(()=>job().catch(console.error),60_000);
setInterval(()=>transitionJob().catch(console.error),20_000);
