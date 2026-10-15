/* Anonymous aggregate usage counters only. No cookie, IP, address or device identifier. */
import fs from 'node:fs';
import path from 'node:path';

const EVENTS=new Set(['landing','app_open','install_guide']);
const SOURCES=new Set(['direct','telegram','telegram-echerkasy','other']);
const int=x=>Number.isSafeInteger(x)&&x>=0?x:0;
const stamp=t=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
 timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'
}).formatToParts(new Date(t)).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour;
};
const dayFrom=(today,offset)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
const empty=()=>({landing:0,appOpen:0,installGuide:0,telegram:0});
export function createAnalyticsStore({filePath,clock=()=>Date.now()}={}){
 if(!filePath)throw Error('Analytics file required');
 let buckets={},since=null,lastUpdated=null,timer=null;
 try{
  const previous=JSON.parse(fs.readFileSync(filePath,'utf8'));
  if(previous?.schemaVersion===1&&previous.buckets&&typeof previous.buckets==='object'&&!Array.isArray(previous.buckets)){
   since=typeof previous.since==='string'?previous.since:null;
   lastUpdated=typeof previous.lastUpdated==='string'?previous.lastUpdated:null;
   for(const [k,v] of Object.entries(previous.buckets).slice(-1800)){
    if(!/^20\d{2}-\d{2}-\d{2}T(?:[01]\d|2[0-3])$/.test(k)||!v||typeof v!=='object')continue;
    buckets[k]={};for(const ev of EVENTS){
     buckets[k][ev]={};for(const [source,count] of Object.entries(v[ev]||{}))
      if(SOURCES.has(source)&&int(count)>0)buckets[k][ev][source]=count;
    }
   }
  }
 }catch(e){if(e.code!=='ENOENT')console.warn('[analytics] Starting fresh aggregate counters:',e.message)}
 const prune=()=>{const cutoff=dayFrom(stamp(clock()).slice(0,10),-44);for(const k of Object.keys(buckets))if(k.slice(0,10)<cutoff)delete buckets[k]};
 const flush=()=>{
  timer=null;
  try{
   prune();fs.mkdirSync(path.dirname(filePath),{recursive:true});
   const temp=filePath+'.tmp';fs.writeFileSync(temp,JSON.stringify({schemaVersion:1,since,lastUpdated,buckets}),{mode:0o600});
   fs.renameSync(temp,filePath);
  }catch(e){console.error('[analytics] Failed to persist aggregate counters:',e.message)}
 };
 function record(event,source='direct'){
  if(!EVENTS.has(event))return false;
  const type=SOURCES.has(source)?source:'other',key=stamp(clock());
  const box=buckets[key]??={};
  const values=box[event]??={};
  values[type]=int(values[type])+1;
  if(!since)since=new Date(clock()).toISOString();
  lastUpdated=new Date(clock()).toISOString();
  if(!timer){timer=setTimeout(flush,1800);timer.unref?.()}
  return true;
 }
 function report(){
  prune();const today=stamp(clock()).slice(0,10);
  const days=Array.from({length:30},(_,i)=>dayFrom(today,i-29)).map(date=>{
   const out={date,...empty()};
   for(const [k,b] of Object.entries(buckets))if(k.startsWith(date+'T')){
    for(const [ev,part] of Object.entries({landing:'landing',app_open:'appOpen',install_guide:'installGuide'})){
     out[part]+=Object.values(b[ev]||{}).reduce((s,n)=>s+int(n),0);
    }
    for(const ev of EVENTS)out.telegram+=int(b[ev]?.['telegram-echerkasy']);
   }
   return out;
  });
  const hours=Array.from({length:24},(_,i)=>{
   const key=(()=>{const d=new Date(clock()-(23-i)*3600000);return stamp(d)})();
   const box=buckets[key]||{};
   return {hour:key,landing:Object.values(box.landing||{}).reduce((s,n)=>s+int(n),0),
    appOpen:Object.values(box.app_open||{}).reduce((s,n)=>s+int(n),0),
    installGuide:Object.values(box.install_guide||{}).reduce((s,n)=>s+int(n),0)};
  });
  const sum=(rows,k)=>rows.reduce((s,r)=>s+r[k],0);
  const week=days.slice(-7);
  return {schemaVersion:1,since,lastUpdated,days,hours,
   totals7:{landing:sum(week,'landing'),appOpen:sum(week,'appOpen'),installGuide:sum(week,'installGuide'),telegram:sum(week,'telegram')},
   totals30:{landing:sum(days,'landing'),appOpen:sum(days,'appOpen'),installGuide:sum(days,'installGuide'),telegram:sum(days,'telegram')},
   note:'Анонімні події з моменту ввімкнення лічильника. Це не унікальні люди та не точні встановлення. Telegram: лише посилання з ?src=telegram-echerkasy.'};
 }
 return {record,report,flush};
}
