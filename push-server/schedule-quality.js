/* Read-only validation of published power schedules; does not invent corrections. */
import {parseMinute,QUEUES} from './schedule-engine.js';
export function auditSchedule(doc,now=Date.now()){
 const issues=[],add=(level,message,date='',queue='')=>issues.push({level,message,date,queue});
 if(!doc||!Array.isArray(doc.days)){add('error','Підтверджений графік ще не завантажено');return {ok:false,issues,days:0,queues:0,checkedAt:null}}
 const checked=Date.parse(doc.lastChecked||'');
 if(!Number.isFinite(checked))add('warning','Немає коректного часу останньої перевірки');
 else if(now-checked>120*60000)add('warning','Джерело не перевірялося понад 2 години');
 const dates=new Set();let queueCount=0;
 for(const day of doc.days){
  const date=String(day?.date||'');
  if(!/^20\d\d-\d\d-\d\d$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))add('error','Некоректна дата',date);
  if(dates.has(date))add('error','Дублікат дати',date);dates.add(date);
  if(day?.verified!==true){add('warning','Дата не підтверджена',date);continue}
  if(!/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//i.test(day.source||''))add('error','Не підтверджене офіційне джерело',date);
  for(const [queue,entry] of Object.entries(day.queues||{})){
   queueCount++;
   if(!QUEUES.has(queue)){add('error','Невідома підчерга',date,queue);continue}
   if(!Array.isArray(entry?.off)){add('error','Відсутній масив відключень',date,queue);continue}
   let previous=0;
   for(const pair of entry.off){
    if(!Array.isArray(pair)||pair.length!==2){add('error','Некоректний інтервал',date,queue);continue}
    const from=parseMinute(pair[0]),to=parseMinute(pair[1]);
    if(from<0||to<0||from>=to||to>1440){add('error','Неправильний час інтервалу',date,queue);continue}
    if(from<previous)add('error','Перетин або неправильний порядок інтервалів',date,queue);
    if(from%30||to%30)add('warning','Інтервал не збігається з 30-хвилинною сіткою',date,queue);
    previous=Math.max(previous,to)
   }
  }
 }
 return {ok:!issues.some(x=>x.level==='error'),issues:issues.slice(0,100),days:dates.size,queues:queueCount,checkedAt:doc.lastChecked||null}
}