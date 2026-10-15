/* Anonymous campaign analytics. Aggregate hourly counts, never IPs, addresses, cookies or device IDs. */
import fs from 'node:fs';
import path from 'node:path';

const EVENTS=['landing','app_open','install_guide'];
const SOURCES=['direct','telegram','telegram-echerkasy','telegram-cherkasy-golovne','other'];
const int=x=>Number.isSafeInteger(x)&&x>=0?x:0;
const stamp=t=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour;
};
const dayFrom=(today,offset)=>{
 const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);
};
const counts=()=>({landing:0,appOpen:0,installGuide:0});
const add=(to,source)=>{to.landing+=source.landing;to.appOpen+=source.appOpen;to.installGuide+=source.installGuide};
const sumEvent=(bucket,event)=>Object.values(bucket[event]||{}).reduce((s,n)=>s+int(n),0);
const emptyDay=date=>({date,...counts(),telegram:0,cherkasyGolovne:0});
export function createAnalyticsStore({filePath,clock=()=>Date.now()}={}){
 if(!filePath)throw Error('Analytics file required');
 let buckets={},since=null,lastUpdated=null,timer=null;
 try{
  const previous=JSON.parse(fs.readFileSync(filePath,'utf8'));
  if(previous?.schemaVersion===1&&previous.buckets&&typeof previous.buckets==='object'&&!Array.isArray(previous.buckets)){
   since=typeof previous.since==='string'?previous.since:null;
   lastUpdated=typeof previous.lastUpdated==='string'?previous.lastUpdated:null;
   for(const [key,raw] of Object.entries(previous.buckets).slice(-1800)){
    if(!/^20\\d{2}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3])$/.test(key)||!raw||typeof raw!=='object')continue;
    buckets[key]={};
    for(const event of EVENTS){
     buckets[key][event]={};
     for(const [source,value] of Object.entries(raw[event]||{}))
      if(SOURCES.includes(source)&&int(value)>0)buckets[key][event][source]=value;
    }
   }
  }
 }catch(e){if(e.code!=='ENOENT')console.warn('[analytics] Starting fresh aggregate counters:',e.message)}
 const prune=()=>{
  const cutoff=dayFrom(stamp(clock()).slice(0,10),-44);
  for(const key of Object.keys(buckets))if(key.slice(0,10)<cutoff)delete buckets[key];
 };
 const flush=()=>{
  timer=null;
  try{
   prune();fs.mkdirSync(path.dirname(filePath),{recursive:true});
   const temp=filePath+'.tmp';fs.writeFileSync(temp,JSON.stringify({schemaVersion:1,since,lastUpdated,buckets}),{mode:0o600});
   fs.renameSync(temp,filePath);
  }catch(e){console.error('[analytics] Failed to persist aggregate counters:',e.message)}
 };
 function record(event,source='direct'){
  if(!EVENTS.includes(event))return false;
  const src=SOURCES.includes(source)?source:'other',key=stamp(clock());
  const bucket=buckets[key]??={};const fields=bucket[event]??={};
  fields[src]=int(fields[src])+1;
  const at=new Date(clock()).toISOString();
  if(!since)since=at;lastUpdated=at;
  if(!timer){timer=setTimeout(flush,1800);timer.unref?.()}
  return true;
 }
 function report(){
  prune();
  const today=stamp(clock()).slice(0,10);
  const days=Array.from({length:30},(_,i)=>emptyDay(dayFrom(today,i-29)));
  const dayLookup=new Map(days.map(d=>[d.date,d]));
  const hours48=Array.from({length:48},(_,i)=>{
   const hour=stamp(clock()-(47-i)*3600000);
   const bucket=buckets[hour]||{};
   return {hour,landing:sumEvent(bucket,'landing'),appOpen:sumEvent(bucket,'app_open'),
    installGuide:sumEvent(bucket,'install_guide'),
    cherkasyGolovne:int(bucket.landing?.['telegram-cherkasy-golovne']),
    telegram:int(bucket.landing?.['telegram-echerkasy'])};
  });
  const hourKeys=new Set(hours48.map(h=>h.hour));
  const channels=Object.fromEntries(SOURCES.map(x=>[x,counts()]));
  const recent7=Object.fromEntries(SOURCES.map(x=>[x,counts()]));
  const recent48=Object.fromEntries(SOURCES.map(x=>[x,counts()]));
  const all30=counts(),all7=counts(),all48=counts();
  for(const [key,bucket] of Object.entries(buckets)){
   const day=dayLookup.get(key.slice(0,10));
   const is7=key.slice(0,10)>=dayFrom(today,-6);
   const is48=hourKeys.has(key);
   for(const [event,dest] of [['landing','landing'],['app_open','appOpen'],['install_guide','installGuide']]){
    for(const [src,count] of Object.entries(bucket[event]||{})){
     const value=int(count);
     if(day){day[dest]+=value;channels[src]??=counts();channels[src][dest]+=value;all30[dest]+=value;}
     if(is7){recent7[src]??=counts();recent7[src][dest]+=value;all7[dest]+=value;}
     if(is48){recent48[src]??=counts();recent48[src][dest]+=value;all48[dest]+=value;}
     if(day&&(src==='telegram-echerkasy'||src==='telegram-cherkasy-golovne'))day.telegram+=value;
     if(day&&src==='telegram-cherkasy-golovne')day.cherkasyGolovne+=value;
    }
   }
  }
  const total=(vals,channels)=>({
   ...vals,telegram:Object.entries(channels).filter(([s])=>s.startsWith('telegram'))
    .reduce((n,[,v])=>n+v.landing+v.appOpen+v.installGuide,0)
  });
  return {schemaVersion:1,since,lastUpdated,days,hours:hours48.slice(-24),hours48,
   totals7:total(all7,recent7),totals30:total(all30,channels),totals48:total(all48,recent48),
   sources7:recent7,sources30:channels,sources48:recent48,
   note:'Анонімні події. Це не унікальні відвідувачі або підтверджені встановлення. Канали визначаються лише за параметром src в рекламному посиланні.'};
 }
 return {record,report,flush};
}
