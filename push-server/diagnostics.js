/* Voluntary coarse runtime error counters. No messages, stacks, URLs, IPs or device IDs persisted. */
import fs from 'node:fs';
import path from 'node:path';
export function createDiagnosticsStore({directory,clock=()=>Date.now()}){
 const file=path.join(directory,'beta-error-counts.json');
 let daily={};const rate=new Map();
 try{const parsed=JSON.parse(fs.readFileSync(file,'utf8'));daily=parsed.daily&&typeof parsed.daily==='object'?parsed.daily:{}}catch(e){if(e.code!=='ENOENT')throw e}
 let timer=null;
 const save=()=>{if(timer){clearTimeout(timer);timer=null}fs.mkdirSync(directory,{recursive:true});const t=file+'.tmp';fs.writeFileSync(t,JSON.stringify({daily}),{mode:0o600});fs.renameSync(t,file)};
 const queue=()=>{if(!timer){timer=setTimeout(save,1500);timer.unref?.()}};
 const kinds=['uncaught','promise','resource','other'];
 const event=(payload,source='')=>{
  if(payload?.consent!==true||payload?.mode!=='standalone')return false;
  if(!kinds.includes(payload?.kind))return false;
  const version=/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(payload?.version||'')?payload.version:'unknown';
  const now=clock();
  const bucket=source.slice(0,90);
  const old=rate.get(bucket)||{at:now,count:0};
  if(now-old.at>60000){old.at=now;old.count=0}
  if(old.count++>15)return false;rate.set(bucket,old);
  const date=new Date(now).toISOString().slice(0,10);
  const key=date+'|'+payload.kind+'|'+version;
  daily[key]=Math.min(1000000,(Number(daily[key])||0)+1);
  for(const key of Object.keys(daily))if(key.slice(0,10)<new Date(now-45*86400000).toISOString().slice(0,10))delete daily[key];
  queue();return true
 };
 const report=()=>{
  const byDay={},byKind={},byVersion={};let total=0;
  for(const [key,value] of Object.entries(daily)){const [day,kind,version]=key.split('|'),count=Number(value)||0;
   total+=count;byDay[day]=(byDay[day]||0)+count;byKind[kind]=(byKind[kind]||0)+count;byVersion[version]=(byVersion[version]||0)+count}
  return {total,byDay,byKind,byVersion,note:'Агреговані типи помилок тільки від встановлених PWA зі згодою. Без повідомлень, stack trace, URL, IP чи адреси.'}
 };
 return {event,report,save}
}