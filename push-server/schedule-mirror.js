/* Isolated Beta schedule feed, read-only on Production.
 * Beta has no publisher cron: copy *public* verified snapshots into its own
 * volume. Never access subscriber records, admin endpoints or production writes.
 */
const LIVE_API='https://svitlo-cherkasy-production.up.railway.app';
const MAX_RESPONSE=1_400_000;

function calendarMonday(epoch){
 const date=new Date(epoch);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
 const local=new Date(parts.year+'-'+parts.month+'-'+parts.day+'T12:00:00Z');
 local.setUTCDate(local.getUTCDate()-((local.getUTCDay()+6)%7));
 return local;
}
function localDay(date){return date.toISOString().slice(0,10)}
function withWholeWeek(latest,previous,epoch){
 const monday=calendarMonday(epoch),end=new Date(monday);
 end.setUTCDate(end.getUTCDate()+8); // next Monday and Tuesday can be published in advance.
 // Cut off previous Mon-Sat at Sunday 00:00 Kyiv even if Production still
 // includes them in its read-only public schedule snapshot.
 const isSunday=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Kyiv',weekday:'short'}).format(new Date(epoch))==='Sun';
 const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6);
 const first=localDay(isSunday?sunday:monday),last=localDay(end);
 const days=new Map();
 for(const day of previous?.days||[])if(day.verified===true&&day.date>=first&&day.date<=last)days.set(day.date,day);
 for(const day of latest.days||[])if(day.verified===true&&day.date>=first&&day.date<=last)days.set(day.date,day);
 return {...latest,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),
  changes:(latest.changes||[]).filter(x=>typeof x?.date==='string'&&x.date>=first&&x.date<=last)};
}


export function createScheduleMirror({publisher,sourceOrigin='',fetcher=fetch,logger=console,clock=()=>Date.now()}={}){
 if(!publisher||typeof publisher.update!=='function'||typeof publisher.status!=='function')
  throw Error('Schedule mirror needs an isolated schedule publication store');
 if(!sourceOrigin)return {enabled:false,sync:async()=>false};
 if(sourceOrigin!==LIVE_API)
  throw Error('Beta schedule mirror accepts only the read-only public Production API');
 let running=false;
 const load=async path=>{
  const url=sourceOrigin+path;
  const response=await fetcher(url,{
   headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('Mirror HTTP '+response.status+' at '+path);
  const body=await response.text();
  if(Buffer.byteLength(body)>MAX_RESPONSE)throw Error('Mirror source response too large');
  return JSON.parse(body);
 };
 async function sync(){
  if(running)return false;
  running=true;
  try{
   const [schedule,review]=await Promise.all([
    load('/api/data/schedules.json'),
    load('/api/data/source_review.json')
   ]);
   const incoming=Date.parse(schedule?.lastChecked||'');
   if(!Number.isFinite(incoming)||incoming>clock()+5*60_000||clock()-incoming>60*60_000)
    throw Error('Mirror source is stale or has invalid timestamp');
   const current=Date.parse(publisher.status().lastChecked||'');
   if(Number.isFinite(current)&&incoming<=current)return false;
   // Accumulate verified weekday snapshots inside the isolated Beta volume.
   // Production's public API remains read-only and completely unchanged.
   const preserved=withWholeWeek(schedule,publisher.rawSchedule?.()||null,clock());
   const result=publisher.update(preserved,review);
   logger.info('[beta-schedule-mirror] Copied public verified schedule',result.lastChecked,'days='+result.verifiedDays.length);
   return true;
  }catch(e){
   logger.warn('[beta-schedule-mirror] Source unavailable:',e.message);
   return false;
  }finally{running=false}
 }
 return {enabled:true,sync};
}
