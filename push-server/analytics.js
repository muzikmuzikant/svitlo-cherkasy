/* Anonymous campaign analytics. Aggregate hourly counts, never IPs, addresses, cookies or device IDs. */
import fs from 'node:fs';
import path from 'node:path';

const EVENTS=['landing','app_open','install_guide'];
const DIMENSIONS=['queue_sample','locality_sample','platform_sample','version_sample'];
const PLATFORM=['iPhone','iPad','Android','Windows','macOS','Linux','Інше'];
const isValidDimension=(event,value)=>event==='queue_sample'?/^[1-6]\.[12]$/.test(value):event==='locality_sample'?/^[\p{L}][\p{L} .'’\-]{1,55}$/u.test(value):event==='platform_sample'?PLATFORM.includes(value):event==='version_sample'?/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value):false;
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
 let buckets={},archive={},since=null,lastUpdated=null,timer=null;
 try{
  const previous=JSON.parse(fs.readFileSync(filePath,'utf8'));
  if([1,2].includes(previous?.schemaVersion)&&previous.buckets&&typeof previous.buckets==='object'&&!Array.isArray(previous.buckets)){
   if(previous.schemaVersion===2&&previous.archive&&typeof previous.archive==='object'&&!Array.isArray(previous.archive)){
    for(const [day,events] of Object.entries(previous.archive)){
     if(!/^20\d{2}-\d{2}-\d{2}$/.test(day)||!events||typeof events!=='object')continue;
     archive[day]={};
     for(const event of EVENTS){
      archive[day][event]={};
      for(const [source,n] of Object.entries(events[event]||{}))
       if(SOURCES.includes(source)&&int(n)>0)archive[day][event][source]=int(n);
     }
    }
   }
   since=typeof previous.since==='string'?previous.since:null;
   lastUpdated=typeof previous.lastUpdated==='string'?previous.lastUpdated:null;
   for(const [key,raw] of Object.entries(previous.buckets).slice(-1800)){
    if(!/^20\d{2}-\d{2}-\d{2}T(?:[01]\d|2[0-3])$/.test(key)||!raw||typeof raw!=='object')continue;
    buckets[key]={};
    for(const event of EVENTS){
     buckets[key][event]={};
     for(const [source,value] of Object.entries(raw[event]||{}))
      if(SOURCES.includes(source)&&int(value)>0)buckets[key][event][source]=value;
    }
    for(const event of DIMENSIONS){
     const values=raw[event];buckets[key][event]={};
     if(values&&typeof values==='object'&&!Array.isArray(values))for(const [value,num] of Object.entries(values).slice(0,110)){
      if(isValidDimension(event,value)&&int(num)>0)buckets[key][event][value]=num;
     }
    }
   }
  }
 }catch(e){if(e.code!=='ENOENT')console.warn('[analytics] Starting fresh aggregate counters:',e.message)}
 const prune=()=>{
  const today=stamp(clock()).slice(0,10);
  const cutoff=dayFrom(today,-44);
  const archiveCutoff=dayFrom(today,-1095);
  for(const [key,bucket] of Object.entries(buckets)){
   const day=key.slice(0,10);
   if(day>=cutoff)continue;
   if(day>=archiveCutoff){
    const target=archive[day]??={};
    for(const event of EVENTS){
     const into=target[event]??={};
     for(const [source,n] of Object.entries(bucket[event]||{}))
      if(SOURCES.includes(source))into[source]=int(into[source])+int(n);
    }
   }
   delete buckets[key];
  }
  for(const day of Object.keys(archive))if(day<archiveCutoff||day>today)delete archive[day];
 };
 const flush=()=>{
  timer=null;
  try{
   prune();fs.mkdirSync(path.dirname(filePath),{recursive:true});
   const temp=filePath+'.tmp';fs.writeFileSync(temp,JSON.stringify({schemaVersion:2,since,lastUpdated,buckets,archive}),{mode:0o600});
   fs.renameSync(temp,filePath);
  }catch(e){console.error('[analytics] Failed to persist aggregate counters:',e.message)}
 };
 function record(event,source='direct',value=''){
  if(!EVENTS.includes(event)&&!DIMENSIONS.includes(event))return false;
  const key=stamp(clock()),bucket=buckets[key]??={};
  if(DIMENSIONS.includes(event)){
   if(typeof value!=='string'||!isValidDimension(event,value))return false;
   const fields=bucket[event]??={};
   if(!Object.hasOwn(fields,value)&&Object.keys(fields).length>=100)return false;
   fields[value]=int(fields[value])+1;
  }else{
   const src=SOURCES.includes(source)?source:'other',fields=bucket[event]??={};
   fields[src]=int(fields[src])+1;
  }
  const at=new Date(clock()).toISOString();
  if(!since)since=at;lastUpdated=at;
  if(!timer){timer=setTimeout(flush,1800);timer.unref?.()}
  return true;
 }

 // Date-filtered anonymous events. Daily aggregates survive hourly bucket expiry.
 // The date is interpreted in Europe/Kyiv, consistent with the collection bucket.
 const validDay=v=>{
  if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v))return false;
  const parsed=new Date(v+'T12:00:00Z');
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===v;
 };
 function reportRange(from,to){
  prune();
  const today=stamp(clock()).slice(0,10);
  if(!validDay(from)||!validDay(to)||from>to||to>today)throw Error('Некоректний період статистики');
  const length=Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;
  if(length>1096)throw Error('Один звіт може охоплювати не більш ніж три роки');
  const available=[...Object.keys(archive),...Object.keys(buckets).map(k=>k.slice(0,10))].sort();
  const earliestAvailable=available[0]||null;
  const compile=(start,end)=>{
   const days=[],byDay=new Map(),sources=Object.fromEntries(SOURCES.map(s=>[s,counts()]));
   const total=counts();
   const duration=Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;
   for(let offset=0;offset<duration;offset++){
    const day=dayFrom(start,offset),entry={...emptyDay(day),sources:{}};
    days.push(entry);byDay.set(day,entry);
   }
   const ingest=(day,bucket)=>{
    const dest=byDay.get(day);if(!dest)return;
    for(const [event,metric] of [['landing','landing'],['app_open','appOpen'],['install_guide','installGuide']]){
     for(const [src,n] of Object.entries(bucket[event]||{})){
      if(!SOURCES.includes(src))continue;
      const count=int(n);if(!count)continue;
      dest[metric]+=count;total[metric]+=count;sources[src][metric]+=count;
      const perSource=dest.sources[src]??=counts();perSource[metric]+=count;
      if(metric==='landing'&&src.startsWith('telegram'))dest.telegram+=count;
      if(metric==='landing'&&src==='telegram-cherkasy-golovne')dest.cherkasyGolovne+=count;
     }
    }
   };
   for(const [day,bucket] of Object.entries(archive))if(day>=start&&day<=end)ingest(day,bucket);
   for(const [hour,bucket] of Object.entries(buckets)){
    const day=hour.slice(0,10);if(day>=start&&day<=end)ingest(day,bucket);
   }
   total.telegram=Object.entries(sources).filter(([s])=>s.startsWith('telegram'))
    .reduce((n,[,v])=>n+v.landing+v.appOpen+v.installGuide,0);
   return {days,totals:total,sources};
  };
  const current=compile(from,to);
  const before=dayFrom(from,-length),beforeEnd=dayFrom(from,-1);
  const canCompare=earliestAvailable&&before>=earliestAvailable;
  const previous=canCompare?compile(before,beforeEnd):null;
  let granularity='day',chartDays=current.days;
  if(length>120){
   granularity='month';const grouped=new Map();
   for(const day of current.days){
    const key=day.date.slice(0,7),entry=grouped.get(key)??{date:key,landing:0,appOpen:0,installGuide:0};
    entry.landing+=day.landing;entry.appOpen+=day.appOpen;entry.installGuide+=day.installGuide;
    grouped.set(key,entry);
   }
   chartDays=[...grouped.values()];
  }else if(length>45){
   granularity='week';chartDays=[];
   for(let i=0;i<current.days.length;i+=7){
    const window=current.days.slice(i,i+7);
    chartDays.push({date:window[0].date,landing:window.reduce((s,d)=>s+d.landing,0),
     appOpen:window.reduce((s,d)=>s+d.appOpen,0),installGuide:window.reduce((s,d)=>s+d.installGuide,0)});
   }
  }
  return {from,to,periodDays:length,earliestAvailable,partial:!!(earliestAvailable&&from<earliestAvailable),
   granularity,chartDays,days:current.days,totals:current.totals,sources:current.sources,
   previousTotals:previous?.totals||null,previousFrom:previous?before:null,previousTo:previous?beforeEnd:null,
   note:'Події, а не унікальні люди. Історія агрегованих подій зберігається до трьох років. Унікальна аудиторія PWA не реконструюється за минулі дати.'};
 }
 function report({from,to}={}){
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
  const dimensionTotals=Object.fromEntries(['48','7','30'].map(p=>[p,Object.fromEntries(DIMENSIONS.map(d=>[d,{}]))]));
  for(const [key,bucket] of Object.entries(buckets)){
   const day=dayLookup.get(key.slice(0,10));
   const is7=key.slice(0,10)>=dayFrom(today,-6);
   const is48=hourKeys.has(key);
   for(const [period,valid] of [['30',Boolean(day)],['7',is7],['48',is48]]){
    if(!valid)continue;
    for(const metric of DIMENSIONS){
     for(const [label,n] of Object.entries(bucket[metric]||{})){
      const target=dimensionTotals[period][metric];target[label]=int(target[label])+int(n);
     }
    }
   }
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
  const ranking=period=>Object.fromEntries(DIMENSIONS.map(metric=>{
   const total=dimensionTotals[period][metric];const entries=Object.entries(total).sort((a,b)=>b[1]-a[1]);
   // Small locality buckets are suppressed to reduce re-identification risk.
   const safe=metric==='locality_sample'?entries.filter(([,n])=>n>=5):entries;
   const visible=safe.slice(0,15).map(([label,count])=>({label,count}));
   return [metric,{items:visible,other:entries.reduce((n,[,count])=>n+count,0)-visible.reduce((n,row)=>n+row.count,0)}];
  }));
  const firstAvailable=[...Object.keys(archive),...Object.keys(buckets).map(k=>k.slice(0,10))].sort()[0]||null;
  return {schemaVersion:2,since,lastUpdated,earliestAvailable:firstAvailable,range:from&&to?reportRange(from,to):null,days,hours:hours48.slice(-24),hours48,
   popularity48:ranking('48'),popularity7:ranking('7'),popularity30:ranking('30'),
   totals7:total(all7,recent7),totals30:total(all30,channels),totals48:total(all48,recent48),
   sources7:recent7,sources30:channels,sources48:recent48,
   note:'Анонімні події. Це не унікальні відвідувачі або підтверджені встановлення. Канали визначаються лише за параметром src в рекламному посиланні.'};
 }
 return {record,report,reportRange,flush};
}
