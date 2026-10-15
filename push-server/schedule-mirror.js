/* Isolated Beta schedule feed, read-only on Production.
 * Beta has no publisher cron: copy *public* verified snapshots into its own
 * volume. Never access subscriber records, admin endpoints or production writes.
 */
const LIVE_API='https://svitlo-cherkasy-production.up.railway.app';
const MAX_RESPONSE=1_400_000;

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
   const result=publisher.update(schedule,review);
   logger.info('[beta-schedule-mirror] Copied public verified schedule',result.lastChecked,'days='+result.verifiedDays.length);
   return true;
  }catch(e){
   logger.warn('[beta-schedule-mirror] Source unavailable:',e.message);
   return false;
  }finally{running=false}
 }
 return {enabled:true,sync};
}
