/* Read-only, server-verified messages for cross-device links.
 * Never trust text supplied through a URL and never reveal subscriber data.
 */
import {firstPublishedAt,dayId,changeId,emergencyId,tomorrowCopy,changeCopy,emergencyCopy,transitionCopy} from './notification-copy.js';

const QUEUE=/^[1-6]\.[12]$/;
const VALID_ID=/^(?:notice|day|change|transition|emergency):[A-Za-z0-9_.:+-]{1,145}$/;
const dayLabel=date=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const shiftDay=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const validDate=d=>/^20\d\d-\d\d-\d\d$/.test(d||'')&&!Number.isNaN(Date.parse(d+'T12:00:00Z'));
const cleanAt=at=>Number.isFinite(Date.parse(at||''))?new Date(at).toISOString():new Date().toISOString();
const safeUrl=s=>typeof s==='string'&&/^https:\/\//.test(s)?s:'';

export function resolvePublicMessage(id,{schedule,announcements=[],emergencies=[]}={}){
 if(typeof id!=='string'||id.length>160||!VALID_ID.test(id))return null;
 if(id.startsWith('notice:')){
  const notice=announcements.find(a=>a.active!==false&&a.id===id.slice(7));
  if(!notice)return null;
  return {id,kind:'announcement',title:(notice.icon||({important:'📣',update:'✨',emergency:'⚠️',schedule:'🗓️'})[notice.kind]||'💬')+' '+notice.title,
   body:notice.body||'',content:notice.content||'',images:notice.images||[],priority:notice.priority||'normal',
   pinned:notice.pinned===true,at:cleanAt(notice.publishedAt),updatedAt:notice.updatedAt||null,authoritative:true};
 }
 const day=/^day:([1-6]\.[12]):(20\d\d-\d\d-\d\d)(?::(.+))?$/.exec(id);
 if(day&&validDate(day[2])){
  const d=schedule?.days?.find(x=>x.verified===true&&x.date===day[2]);
  if(!d||day[3]&&day[3]!==firstPublishedAt(d))return null;
  return {id,kind:'schedule',title:'🗓️ Графік на '+dayLabel(d.date),
   body:'Для підчерги '+day[1]+' опубліковано розклад.',content:tomorrowCopy(day[1],d.date,d).content,
   at:cleanAt(firstPublishedAt(d)),url:safeUrl(d.source),authoritative:true};
 }
 const change=/^change:([1-6]\.[12]):(20\d\d-\d\d-\d\d):(.+)$/.exec(id);
 if(change&&validDate(change[2])){
  const c=(schedule?.changes||[]).find(x=>x.date===change[2]&&x.queues?.includes(change[1])&&changeId(change[1],x)===id);
  if(!c)return null;
  const d=schedule?.days?.find(x=>x.verified===true&&x.date===change[2]);
  const msg=changeCopy(change[1],change[2],d);
  return {id,kind:'schedule',...msg,at:cleanAt(c.detectedAt||c.publishedAt),url:safeUrl(c.source),authoritative:true};
 }
 const transition=/^transition:([1-6]\.[12]):(20\d\d-\d\d-\d\d):(\d{1,4}):(off|on)$/.exec(id);
 if(transition&&validDate(transition[2])){
  const minute=Number(transition[3]);if(minute<0||minute>=2880)return null;
  const target=minute>=1440?shiftDay(transition[2],1):transition[2];
  const d=schedule?.days?.find(x=>x.verified===true&&x.date===target);
  if(!d)return null;
  const ranges=d.queues?.[transition[1]]?.off||[],boundary=minute%1440;
  const real=ranges.some(a=>Array.isArray(a)&&a.length===2&&a[transition[4]==='off'?0:1]===
   String(Math.floor(boundary/60)).padStart(2,'0')+':'+String(boundary%60).padStart(2,'0'));
  if(!real)return null;
  const eta=transition[4]==='off'?30:15,copy=transitionCopy(transition[4],transition[1],minute,eta,target);
  return {id,kind:'schedule',...copy,at:cleanAt(firstPublishedAt(d)),url:safeUrl(d.source),authoritative:true};
 }
 if(id.startsWith('emergency:')){
  const event=emergencies.find(x=>x&&emergencyId(x)===id&&safeUrl(x.source));
  const copy=event&&emergencyCopy(event.status);
  if(!copy)return null;
  return {id,kind:'emergency',...copy,at:cleanAt(event.publishedAt),url:event.source,priority:'important',authoritative:true};
 }
 return null;
}
