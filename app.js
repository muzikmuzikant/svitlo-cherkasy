'use strict';
/* Svitlo Cherkasy v6. All displayed power states are published predictions, never sensor readings. */
const $=id=>document.getElementById(id);
const TZ='Europe/Kyiv';
const QUEUES=Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat();
const OFFICIAL='https://www.cherkasyoblenergo.com/off';
const STORE='svitlo-addresses-v6', PREF='svitlo-prefs-v6', SEEN='svitlo-notifications-v6', PUSH_CONSENT='svitlo-push-consent-v6';
const OFFLINE_SCHEDULE='svitlo-offline-schedule-v74',OFFLINE_ADDRESSES='svitlo-offline-address-v74';
const OFFLINE_CACHE='svitlo-cherkasy-offline-snapshots-v1',OFFLINE_CACHE_KEY='./offline-schedules-snapshot.json';
const SCREEN_RETURN='svitlo-return-screen-v751';
const ICON='<svg class="bolt" viewBox="0 0 20 24" aria-hidden="true"><path fill="currentColor" d="M11.8 1 2 13h7l-1.5 10L18 9.9h-7z"/></svg>';
const PIN='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2.4"/></svg>';
const safeJSON=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k)??'null')??fallback}catch{return fallback}};
const legacy=safeJSON('svitlo-addresses-v3',safeJSON('svitlo-addresses-v2',[]));
let addresses=safeJSON(STORE,Array.isArray(legacy)?legacy:[]), prefs=Object.assign({primaryId:null,off:true,on:true,changes:true,tomorrow:true,emergency:true},safeJSON(PREF,{}));
let previewQueue=null;
let pushHealthLast=0,pushHealthBusy=null;
let pushActive=('Notification' in window&&Notification.permission==='granted'&&localStorage.getItem(PUSH_CONSENT)==='yes'), emergency={events:[],lastChecked:null},overrides={schedules:{days:[]},addresses:{},emergency:{events:[]}},data={days:[],changes:[]},index={keys:{},streets:{},localities:{}},active='home',daySelected=null,editId=null,suggestion=null,toastTimeout=null,lastPub=null,pushConfig=null,swRegistration=null,notified=new Set(safeJSON(SEEN,[])),lastRefresh=0,hasCheckedOnce=false,lastDownloadAt=null,lastSyncFailed=false,refreshInFlight=null;
// Lightweight schedule checks can run every minute without redownloading address maps.
const AUTO_SCHEDULE_CHECK_MS=60_000, AUXILIARY_REFRESH_MS=5*60_000;
let lastAuxiliaryRefresh=0;
if(!Array.isArray(addresses))addresses=[];
const byId=id=>addresses.find(x=>x.id===id);
const primary=()=>byId(prefs.primaryId)||addresses[0]||null;
const saveAddresses=()=>localStorage.setItem(STORE,JSON.stringify(addresses));
const savePrefs=()=>localStorage.setItem(PREF,JSON.stringify(prefs));
window.addEventListener('svitlo:theme-change',()=>{if(active==='detail')renderDetail()});

// Hydrate the last confirmed snapshot before rendering, including after a cold offline launch.
try{const saved=safeJSON(OFFLINE_SCHEDULE,null);if(saved&&Array.isArray(saved.days))data=retainWeeklySchedules(saved)}catch{}
try{const saved=safeJSON(OFFLINE_ADDRESSES,null);if(saved?.keys&&saved?.streets)index=saved}catch{}
function isOfflineMode(){return navigator.onLine===false||lastSyncFailed}
async function readCachedSchedule(){
 const copies=[safeJSON(OFFLINE_SCHEDULE,null)];
 if('caches' in window){
  // The Service Worker seeds public data before the first application run;
  // iOS may kill the page before the separate app snapshot is written.
  for(const [name,key] of [[OFFLINE_CACHE,OFFLINE_CACHE_KEY],['svitlo-cherkasy-data-v6.7','./data/schedules.json']]){
   try{
    const cache=await caches.open(name),response=await cache.match(key);
    if(response?.ok)copies.push(await response.json());
   }catch(error){console.warn('Offline schedule cache read:',error)}
  }
 }
 let latest=null;
 for(const item of copies)try{
  const value=retainWeeklySchedules(item);
  if(value.lastChecked&&(!latest||Date.parse(value.lastChecked)>Date.parse(latest.lastChecked)))latest=value;
 }catch{}
 return latest;
}
function saveCachedSchedule(value){
 if(!value?.lastChecked||!Array.isArray(value.days))return;
 const json=JSON.stringify(retainWeeklySchedules(value));
 if(json.length>1200000)return;
 try{localStorage.setItem(OFFLINE_SCHEDULE,json)}catch(error){console.warn('Offline schedule storage:',error)}
 if('caches' in window)caches.open(OFFLINE_CACHE).then(cache=>cache.put(
  OFFLINE_CACHE_KEY,new Response(json,{headers:{'Content-Type':'application/json; charset=utf-8'}})
 )).catch(error=>console.warn('Offline schedule backup:',error));
}
// Purge old days from an installed offline snapshot on first launch.
if(data.lastChecked)saveCachedSchedule(data);
 // Drop obsolete 7.9.8 user preferences, including those already saved on Beta devices.
 const retired798Prefs=['favorites','offMinutes','onMinutes','quietEnabled','quietFrom','quietTo','addressRules'];
 if(retired798Prefs.some(name=>Object.prototype.hasOwnProperty.call(prefs,name))){
  for(const name of retired798Prefs)delete prefs[name];
  savePrefs();
 }
const id=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
function norm(s){return String(s||'').toLocaleLowerCase('uk-UA').replace(/[’ʼ`]/g,"'").replace(/^(вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|пр-т\.?|б-р\.?|бульвар|узвіз|алея|площа|майдан|шосе|набережна|тупик|проїзд)\s+/i,'').replace(/[^\p{L}\p{N}/]+/gu,'')}
function normTown(s){
  const key=norm(String(s||'').replace(/^(с\.|смт\.?|село|місто|м\.|селище)\s*/i,''));
  return ({'червонаслобода':'слобода','первомайське':'соснове','іванівка':'яничі','великіканівці':'вканівці','хрестителеве':'хрестителево'})[key]||key;
}
function houseKey(s){return norm(s).replace(/-/g,'')}
for(const a of addresses){if(normTown(a.settlement)==='слобода')a.settlement='Слобода';else if(normTown(a.settlement)==='соснове')a.settlement='Соснове';else if(normTown(a.settlement)==='яничі')a.settlement='Яничі';else if(normTown(a.settlement)==='вканівці')a.settlement='Великі Канівці';else if(normTown(a.settlement)==='хрестителево')a.settlement='Хрестителеве';}
saveAddresses();
const dateParts=(d=new Date(),tz=TZ)=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(p=>[p.type,p.value]));
const today=()=>{const p=dateParts();return `${p.year}-${p.month}-${p.day}`};
const nowMinutes=()=>{const x=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return +x.hour*60 + +x.minute};
function shiftDay(d,num){const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+num);return x.toISOString().slice(0,10)}
const formatDate=(v,options={day:'numeric',month:'long'})=>new Intl.DateTimeFormat('uk-UA',Object.assign({timeZone:'UTC'},options)).format(new Date(v+'T12:00:00Z'));
function fmtStamp(v){if(!v)return 'невідомо';const d=new Date(v);return isNaN(d)?'невідомо':new Intl.DateTimeFormat('uk-UA',{timeZone:TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)}
// Sunday 00:00 Kyiv removes previous Mon-Sat, preserving Sunday and next Monday.
function weekStart(date){const weekday=new Date(date+'T12:00:00Z').getUTCDay();return shiftDay(date,-((weekday+6)%7))}
function retentionStart(){const current=today();return new Date(current+'T12:00:00Z').getUTCDay()===0?current:weekStart(current)}
function weekAllowed(date){
 const sunday=new Date(today()+'T12:00:00Z').getUTCDay()===0;
 // On Sunday retain this Sunday plus the entire approaching Monday-Sunday.
 return date>=retentionStart()&&date<=shiftDay(weekStart(today()),sunday?13:7);
}
function retainWeeklySchedules(incoming,previous={days:[]}){
 const recent=normalizeData(incoming),days=new Map();
 for(const day of previous.days||[])if(weekAllowed(day.date)&&day.verified===true)days.set(day.date,day);
 for(const day of recent.days)if(weekAllowed(day.date))days.set(day.date,day);
 return {...recent,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),
  changes:(recent.changes||[]).filter(c=>typeof c?.date==='string'&&weekAllowed(c.date))};
}
const currentDay=date=>data.days.find(x=>x.date===date&&x.verified===true);
const minute=s=>s==='24:00'?1440:/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?Number(s.slice(0,2))*60+Number(s.slice(3)):-1;
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
// A successful recent check with no published plan means no *planned* outages.
// An unavailable/stale operator source is different: do not invent a forecast.
function reviewAffects(date){
 // Warnings about another publication date do not invalidate this date.
 if(Array.isArray(data.unresolvedDates))return data.unresolvedDates.includes(date);
 return data.reviewPending===true; // Legacy data until next importer run.
}
function sourceFresh(date=today()){
 const checked=Date.parse(data.lastChecked||'');
 return !lastSyncFailed && !reviewAffects(date) && Number.isFinite(checked) &&
   checked<=Date.now()+5*60_000 && Date.now()-checked<=55*60_000;
}
// A missing published timetable is NOT proof of an all-day supply if the
// operator's latest check failed, became stale or left this date under review.
function verifiedNoSchedule(date){
 if(isOfflineMode()||!sourceFresh(date))return false;
 if(Array.isArray(data.confirmedNoScheduleDates))
  return data.confirmedNoScheduleDates.includes(date);
 // Compatibility for schema versions before explicit absent-day certificates.
 // Never extend this guess beyond today or tomorrow.
 return date===today()||date===shiftDay(today(),1);
}
function withinPublishedHorizon(date){
 const current=today();
 const inHorizon=date===current||date===shiftDay(current,1);
 if(!inHorizon)return false;
 // Latest importer explicitly certifies days without any publication.
 // Old schema clients still work during the staged upgrade.
 return !Array.isArray(data.confirmedNoScheduleDates)||data.confirmedNoScheduleDates.includes(date);
}
function timeline(date,queue){
 if(!QUEUES.includes(queue))return null;
 const day=currentDay(date),q=day?.queues?.[queue];
 if(!day){
   // Only a fresh operator check can certify a day with no published plan.
   // An offline/stale/under-review or not-yet-checked day is UNKNOWN.
   return verifiedNoSchedule(date)?new Int8Array(1440):null;
 }
 if(!q){return new Int8Array(1440)} // Omitted subqueue in verified publication.
 const start=minute(q.knownFrom||'00:00');if(start<0)return null;
 // Historical importers used knownFrom=24:00 for omitted subqueues. A fresh
 // verified check confirms the omission means no declared planned outages.
 if(start===1440&&!(q.off||[]).length&&sourceFresh(date))return new Int8Array(1440);
 const a=new Int8Array(1440);a.fill(-1);a.fill(0,start,1440);
 let last=0;for(const [s,e] of q.off||[]){
  const f=minute(s),t=minute(e);if(f<last||f>=t||t>1440)return null;
  a.fill(1,Math.max(f,start),t);last=t;
 }return a;
}
function stateAt(a,m){return a?.[m]===1?'off':a?.[m]===0?'on':'unknown'}

const kyivCivilFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function kyivWallInstants(date,minute){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isInteger(minute)||minute<0||minute>=1440)return [];
 const [y,m,d]=date.split('-').map(Number),wallUtc=Date.UTC(y,m-1,d,Math.floor(minute/60),minute%60);
 if(new Date(wallUtc).toISOString().slice(0,10)!==date)return [];
 const parts=t=>{const p=Object.fromEntries(kyivCivilFormatter.formatToParts(new Date(t)).map(x=>[x.type,x.value]));
  return {date:p.year+'-'+p.month+'-'+p.day,minute:Number(p.hour)*60+Number(p.minute)}};
 const offsets=new Set();
 for(const h of [-12,0,12]){
  const t=wallUtc+h*3600_000,p=parts(t),[yy,mm,dd]=p.date.split('-').map(Number);
  offsets.add(Math.round((Date.UTC(yy,mm-1,dd,Math.floor(p.minute/60),p.minute%60)-Math.floor(t/60000)*60000)/60000));
 }
 const matches=[];
 for(const off of offsets){
  const t=wallUtc-off*60000,p=parts(t);
  if(p.date===date&&p.minute===minute)matches.push(t);
 }
 return matches.sort((a,b)=>a-b);
}

function transition(a,m){if(!a||a[m]<0)return null;for(let i=m+1;i<1440;i++)if(a[i]!==a[m])return {time:i,to:a[i]};return null}
// Look beyond midnight without assuming information about day after tomorrow.
function nextChange(date,queue,minuteNow){
 const initial=timeline(date,queue);if(!initial||initial[minuteNow]<0)return null;
 const liveClock=typeof nowMinutes==='function'&&date===today()&&minuteNow===nowMinutes();
 let state=initial[minuteNow];
 for(let offset=0;offset<=1;offset++){
  const d=shiftDay(date,offset),arr=offset?timeline(d,queue):initial;
  if(!arr)return null;
  for(let m=offset?0:minuteNow+1;m<1440;m++){
   if(arr[m]<0)return null;
   if(arr[m]!==state){
    let minutesUntil=offset*1440+m-minuteNow;
    if(liveClock){
     const matches=kyivWallInstants(d,m);
     if(matches.length!==1)return null;
     minutesUntil=Math.ceil((matches[0]-Date.now())/60000);
     if(minutesUntil<=0)return null;
    }
    return {time:m,date:d,dayOffset:offset,to:arr[m],minutesUntil};
   }
   state=arr[m];
  }
 }return null;
}
function nextChangeLabel(change){
 const day=change.date||shiftDay(today(),change.dayOffset||0);
 return clock(change.time)+(change.dayOffset===1?' завтра':change.dayOffset===2?' післязавтра':(change.dayOffset>2?' · '+formatDate(day):''));
}
// Seven fixed weekday labels. On Sunday, Mon-Sat refer to the coming week,
// while Sun refers to today. No week selector, no calendar dates on pills.
function stripDates(){
 const current=today(),monday=weekStart(current);
 if(new Date(current+'T12:00:00Z').getUTCDay()===0){
  return [...Array.from({length:6},(_,i)=>shiftDay(monday,7+i)),current];
 }
 return Array.from({length:7},(_,i)=>shiftDay(monday,i));
}
function stripContains(_start,date){return stripDates().includes(date)}
function weekdayShort(date){return ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'][new Date(date+'T12:00:00Z').getUTCDay()]}
function weekdayFull(date){return ['Неділя','Понеділок','Вівторок','Середа','Четвер','П’ятниця','Субота'][new Date(date+'T12:00:00Z').getUTCDay()]}
function showDay(date){
 daySelected=stripContains(today(),date)?date:today();
 renderDetail();
}
function statusCopy(state,change,queue,date){
 if(state==='unknown')return {title:'Немає підтверджених даних',detail:queue?'Перевірте актуальність графіка оператора':'Додайте адресу або оберіть підчергу'};
 if(change){const eta=change.minutesUntil;return {
  title:`${state==='on'?'Є світло':'Немає світла'} до ${nextChangeLabel(change)}`,
  detail:`До ${change.to===1?'планового відключення':'планового відновлення'} ${Math.floor(eta/60)} год ${String(eta%60).padStart(2,'0')} хв`
 }}
 if(state==='on'){
  const tomorrow=timeline(shiftDay(date,1),queue);
  const completeTomorrow=tomorrow&&tomorrow.every(v=>v===0);
  return {title:'За графіком світло є',detail:completeTomorrow
   ?'Планових відключень на сьогодні та завтра не оголошено.'
   :tomorrow?'Час наступного відключення поки не підтверджений.':'На наступний день немає підтверджених даних.'};
 }
 return {title:'За графіком немає світла',detail:'Час наступного відновлення поки не підтверджений.'};
}
function stats(a){if(!a)return null;let on=0,off=0,unknown=0,longest=0,run=0;for(const v of a){if(v===0)on++;if(v===1){off++;run++;longest=Math.max(longest,run)}else run=0;if(v<0)unknown++}return {on,off,unknown,longest}}
function minutesLabel(n){return (n/60).toLocaleString('uk-UA',{maximumFractionDigits:1})}
function flash(s){const el=$('toast');el.textContent=s;el.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.hidden=true,3400)}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function label(a){return a?.nickname?.trim()||[a?.street,a?.house].filter(Boolean).join(', ')||'Додайте адресу'}
function fullAddress(a){return a?[a.settlement||'Черкаси',[a.street,a.house].filter(Boolean).join(', ')].join(' · '):'Оберіть адресу'}
function setText(id,text){if($(id).textContent!==String(text))$(id).textContent=String(text)}
function render(){renderHome();if(active==='detail')renderDetail();if(active==='updates')renderUpdates();if(active==='settings')renderSettings();window.SvitloAllQueues?.refresh?.()}
function scheduleQueueChanged(before, after, queue) {
 // Ignore rollovers and re-publications which do not change actual queue intervals.
 if (!queue || !before?.days?.length || !after?.days?.length) return false;
 const earlier = new Map(before.days.filter(d => d.verified === true).map(d => [d.date,d.queues?.[queue]]));
 return after.days.some(day => earlier.has(day.date) &&
   JSON.stringify(earlier.get(day.date) ?? null) !== JSON.stringify(day.queues?.[queue] ?? null));
}
function renderSyncStatus(){
 const offlineChip=$('offlineChip'),noNetwork=isOfflineMode();
 if(offlineChip){
  offlineChip.hidden=!hasCheckedOnce||!noNetwork;
  if(!offlineChip.hidden){
   const connection=navigator.onLine===false?'Немає інтернету':'Немає зв’язку із сервером';
   const saved=data.lastChecked?'Остання перевірка графіка: '+fmtStamp(data.lastChecked)+'.':'Дата перевірки невідома.';
   offlineChip.textContent=connection+'. Показуємо збережені дані, вони могли змінитися. '+saved+' Без інтернету нагадування доступні лише у відкритому застосунку.';
  }
 }
 const box=$('syncStatus');if(!box)return;
 const checked=Date.parse(data.lastChecked||'');
 const checkKnown=Number.isFinite(checked)&&checked<=Date.now()+5*60_000;
 const sourceStale=!checkKnown||(Date.now()-checked>55*60_000);
 const offline=navigator.onLine===false,review=reviewAffects(today())&&!currentDay(today());
 box.dataset.state=!hasCheckedOnce?'pending':noNetwork?'error':sourceStale||review?'stale':'fresh';
 const title=!hasCheckedOnce?'Завантажуємо графіки…':offline?'Немає інтернету':lastSyncFailed?'Сервер недоступний':review?'Уточнюємо години графіка':sourceStale?'Перевірка оператора затримується':'Автооновлення графіків активне';
 const details=!hasCheckedOnce?'При відкритті й щохвилини, поки застосунок відкритий':
   checkKnown?`Перевірено ${fmtStamp(data.lastChecked)}`:'Оновлюємо інформацію';
 setText('syncStatusTitle',title);setText('syncStatusDetails',details);
}
function renderFreshness(){
 renderSyncStatus();const node=$('dataFreshness');if(!node)return;
 const checked=Date.parse(data.lastChecked||'');
 const age=Date.now()-checked;
 const hasTime=Number.isFinite(checked)&&age>=0;
 const stale=!hasTime||age>55*60_000;
 const offline=isOfflineMode(),review=reviewAffects(today())&&!currentDay(today());
 // The persistent offline banner covers server failures. Do not offer an unusable external link.
 node.hidden=!hasCheckedOnce||offline||(!stale&&!review);
 if(node.hidden)return;
 node.replaceChildren();
 const title=el('strong','',review?'Новий графік уточнюється':hasTime?'Можливо, графік застарів':'Актуальність графіка не підтверджена');
 const message=el('span','',review
   ?' Нова публікація ще не підтверджена, дані можуть змінитися.'
   :hasTime
     ?` Публікації востаннє перевіряли ${fmtStamp(data.lastChecked)}. Новіші зміни можуть бути відсутні.`
     :' Не вдалося визначити час останньої перевірки.');
 node.append(title,message);
}
function renderHome(){
 const intro=$('homeIntro');if(intro)intro.hidden=Boolean(primary());
 const dashboard=$('homeDashboardIntro');if(dashboard)dashboard.hidden=!primary();
 try{window.SvitloTelemetry?.sampleSelected(primary())}catch{}
 renderEmergency();renderFreshness();const a=primary(),date=today(),m=nowMinutes();
 setText('primaryName',label(a));setText('primarySub',a?`${a.settlement||'Черкаси'} · ${a.queue?'підчерга '+a.queue:'підчергу не визначено'}`:'Черкаси або села району');
 setText('homeDashboardDate',formatDate(date,{weekday:'long',day:'numeric',month:'long'}));
 const schedule=a?.queue?currentDay(date):null;
 const timelineToday=a?.queue?timeline(date,a.queue):null,st=stateAt(timelineToday,m);
 const nxt=a?.queue?nextChange(date,a.queue,m):null,copy=statusCopy(st,nxt,a?.queue,date);
 const offlineReady=$('homeOfflineReady');if(offlineReady){
  const snapshot=safeJSON(OFFLINE_SCHEDULE,null);
  const saved=Array.isArray(snapshot?.days)&&Boolean(snapshot?.lastChecked);
  offlineReady.hidden=!saved||isOfflineMode();
  if(saved)offlineReady.title='Остання перевірка: '+fmtStamp(snapshot.lastChecked);
 }
 const panel=$('heroStatus');panel.className='status-panel status-'+st;
 $('stateIcon').innerHTML=ICON;
 const unknownOffline=Boolean(a&&!schedule&&!verifiedNoSchedule(date));
 setText('stateCaption',!a?'ВАШ ГРАФІК':schedule?'ЗА ОПУБЛІКОВАНИМ ГРАФІКОМ':unknownOffline?'АКТУАЛЬНИЙ ГРАФІК НЕ ПІДТВЕРДЖЕНО':'ГРАФІКА НЕМАЄ · СВІТЛО ВЕСЬ ДЕНЬ');
 setText('heroTitle',a&&!schedule?(unknownOffline?'Немає підтверджених даних':'Світло весь день'):copy.title);setText('heroCountdown',a&&!schedule?(unknownOffline?'Не вдалося підтвердити актуальний графік. Перевірте інформацію оператора.':'Відключень за опублікованим графіком немає.'):copy.detail);
 setText('sourceStamp',schedule?`Опубліковано ${fmtStamp(schedule.publishedAt)}`:unknownOffline?'Час перевірки невідомий або дані застаріли':'Офіційний графік на сьогодні не опубліковано');
 setText('queueChip',a?.queue?`Черга ${a.queue}`:'—');
 setText('overviewDate',formatDate(date,{weekday:'long',day:'numeric',month:'long'}));
 setText('overviewLabel',schedule?'24 години':unknownOffline?'Графік не підтверджено':'Світло весь день');renderBar(timelineToday);
 const t=stats(timelineToday);
 setText('hoursOn',t&&t.unknown===0?minutesLabel(t.on):t&&t.on?`${minutesLabel(t.on)}+`:'—');
 setText('hoursOff',t&&t.unknown===0?minutesLabel(t.off):t&&t.off?`${minutesLabel(t.off)}+`:'—');
 // A genuine tomorrow preview, not a guessed network status.
 renderTomorrowPreview();
 renderQuickPlaces();
 setText('settingsPlacesCount',addresses.length?addresses.length+' '+(addresses.length===1?'адреса':addresses.length<5?'адреси':'адрес')+' · Натисніть, щоб змінити або впорядкувати':'Адрес ще немає. Додайте перше місце.');
 updatePushInvite();
 const list=$('placeList');
 const placeKey=JSON.stringify([date,prefs.primaryId,addresses.map(a=>[a.id,a.queue,a.nickname,a.settlement,a.street,a.house,stateAt(timeline(date,a.queue),m)])]);
 if(list.dataset.renderKey!==placeKey){list.dataset.renderKey=placeKey;list.replaceChildren();
 for(const item of addresses){
  const row=el('div','place-row'+(primary()?.id===item.id?' is-current':''));
  const b=el('button','place-card');b.type='button';
  const avatar=el('span','place-avatar');avatar.innerHTML=PIN;b.append(avatar);
  const copy=el('span','place-text');
  const title=el('span','place-card-title');
  title.append(el('strong','',label(item)));
  if(primary()?.id===item.id)title.append(el('span','place-primary-tag','Активна'));
  copy.append(title,el('small','',`${item.settlement||'Черкаси'} · ${item.queue?'підчерга '+item.queue:'підчерга невідома'}`));
  b.append(copy);
  const state=stateAt(timeline(date,item.queue),m);
  b.append(el('span','place-status '+state,state==='on'?'Є світло':state==='off'?'Без світла':'—'));
  b.setAttribute('aria-label','Відкрити графік: '+label(item));
  b.onclick=()=>{prefs.primaryId=item.id;savePrefs();navigate('detail')};
  const edit=el('button','place-edit-action','✎');edit.type='button';edit.title='Редагувати '+label(item);edit.setAttribute('aria-label',edit.title);
  edit.onclick=()=>openAddressSheet(item);
  row.append(b,edit);list.append(row);
 }
 if(!addresses.length){const e=el('div','empty-places');e.append(el('strong','','Ще немає збережених місць'),el('span','','Додайте адресу, щоб отримати персональний графік.'));list.append(e)}
 const add=el('button','add-place-card','+  Додати адресу');add.onclick=()=>openAddressSheet();list.append(add);
 }
}
function formatDuration(minutes){
 if(!Number.isFinite(minutes)||minutes<0)return '—';
 const h=Math.floor(minutes/60),m=minutes%60;
 return h?(h+' год'+(m?' '+m+' хв':'')):(m+' хв');
}
function renderTomorrowPreview(){
 const date=shiftDay(today(),1),queue=primary()?.queue;
 const root=$('tomorrowCard'),summary=$('tomorrowSummary'),details=$('tomorrowDetails');
 if(!root||!summary||!details)return;
 const t=queue?timeline(date,queue):null,day=queue?currentDay(date):null,st=stats(t);
 // Tomorrow always opens tomorrow's actual calendar date, including Sunday -> Monday.
 root.disabled=!queue;
 const tomorrowLink=$('tomorrowOpen');if(tomorrowLink){tomorrowLink.disabled=!queue;tomorrowLink.title='Переглянути графік на завтра'}
 root.classList.toggle('tomorrow-unknown',!t||st.unknown>0);
 if(!queue){summary.textContent='Спочатку додайте адресу';details.textContent='Після цього покажемо графік на завтра';return}
 if(!day||!t){
  const confirmed=verifiedNoSchedule(date);
  summary.textContent=confirmed?'Світло весь день':'Немає підтверджених даних';
  details.textContent=(confirmed?'Немає опублікованого графіка':'Не вдалося підтвердити графік на завтра')+' · Підчерга '+queue;
  return
 }
 if(!st||st.unknown>0){summary.textContent='Частина годин ще уточнюється';details.textContent='Підчерга '+queue+' · Перевірте офіційний графік';return}
 summary.textContent=st.off===0?'Без планових відключень':'Планується без світла: '+formatDuration(st.off);
 details.textContent='Підчерга '+queue+' · '+formatDate(date,{day:'numeric',month:'long'});
}
function renderQuickPlaces(){
 const host=$('homeQuickPlaces');if(!host)return;
 host.hidden=addresses.length<2;if(host.hidden)return;
 const key=JSON.stringify([prefs.primaryId,addresses.map(a=>[a.id,a.queue,a.nickname,a.street,a.house,a.favorite])]);
 if(host.dataset.renderKey===key)return;
 host.dataset.renderKey=key;host.replaceChildren();
 if(!addresses.length){host.append(el('span','quick-place-empty','Додайте адресу, щоб перемикатися одним дотиком'));return}
 [...addresses].sort((a,b)=>Number(!!b.favorite)-Number(!!a.favorite)).forEach(item=>{
  const button=el('button','quick-place'+(primary()?.id===item.id?' selected':''),(item.favorite?'⭐  ':'')+label(item));
  button.type='button';button.dataset.queue=item.queue||'';
  button.setAttribute('aria-pressed',String(primary()?.id===item.id));
  button.onclick=()=>{
   if(primary()?.id===item.id)return;
   prefs.primaryId=item.id;savePrefs();renderHome();
   if(pushActive)updatePushSubscription().catch(e=>console.warn('Update Push queue:',e));
   flash('Вибрано: '+label(item));
  };
  host.append(button);
 });
}
function outages(t){
 if(!t)return [];
 const parts=[];let start=null;
 for(let i=0;i<=1440;i++){
  const out=i<1440&&t[i]===1;
  if(out&&start===null)start=i;
  if(!out&&start!==null){parts.push({from:start,to:i});start=null}
 }
 return parts;
}
// Share the application itself, not a private address or a schedule image.
// Keep the canonical public URL independent of the Beta/installed PWA origin.
const APP_SHARE_URL='https://svitlo-cherkasy.pp.ua/';
async function shareApplication(){
 const message={
  title:'Світло Черкаси',
  text:'Перевіряйте графіки відключень і отримуйте сповіщення про зміни у Черкасах та районі.',
  url:APP_SHARE_URL
 };
 if(typeof navigator.share==='function'){
  try{await navigator.share(message);return}
  catch(error){
   if(error?.name==='AbortError')return; // User closed the native share sheet.
   console.warn('App sharing unavailable:',error);
  }
 }
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(APP_SHARE_URL);
  else{
   // Legacy browser fallback: copying must still work without Web Share API.
   const field=document.createElement('textarea');
   field.value=APP_SHARE_URL;
   field.setAttribute('readonly','');
   field.style.cssText='position:fixed;left:-9999px;opacity:0';
   document.body.append(field);
   let copied=false;
   try{field.focus();field.select();copied=document.execCommand?.('copy')===true}
   finally{field.remove()}
   if(!copied)throw Error('Clipboard API unavailable');
  }
  flash('Посилання на застосунок скопійовано');
 }catch(error){
  console.warn('App link copy failed:',error);
  window.prompt('Скопіюйте посилання на «Світло Черкаси»:',APP_SHARE_URL);
 }
}

function shareDescription(date){
 const queue=previewQueue||primary()?.queue,t=queue?timeline(date,queue):null,day=currentDay(date);
 if(!queue||!t)return null;
 const summary=stats(t),ranges=outages(t);
 const lines=['Світло Черкаси · Прогноз за графіком',formatDate(date,{weekday:'long',day:'numeric',month:'long'}),'Підчерга '+queue,''];
 lines.push(summary.unknown?'Частина годин не підтверджена':ranges.length?'Планові відключення:':'Планових відключень не передбачено');
 for(const range of ranges)lines.push(clock(range.from)+'–'+clock(range.to)+' · '+formatDuration(range.to-range.from));
 lines.push('',day?'За опублікованим графіком.':'Графік не опубліковано. За замовчуванням позначено світло весь день.','Лише плановий графік, не фактичний стан мережі.','svitlo-cherkasy.pp.ua');
 return {queue,day,summary,ranges,text:lines.join('\n')};
}
async function openSharePreview(blob,filename,date,queue){
 const dialog=$('sharePreviewDialog'),preview=$('sharePreviewImage');
 if(!dialog||!preview)throw Error('Попередній перегляд недоступний');
 const url=URL.createObjectURL(blob);
 const file=new File([blob],filename,{type:'image/png'});
 const heading=$('sharePreviewHeading'),share=$('sharePreviewShare'),close=$('sharePreviewClose');
 let closing=false,closeTimer=null;
 const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true||
   document.documentElement.classList.contains('feature-off-animations');
 const finish=()=>{
   clearTimeout(closeTimer);closeTimer=null;closing=false;
   dialog.classList.remove('is-closing');
   preview.removeAttribute('src');
   URL.revokeObjectURL(url);
   dialog.removeEventListener('close',finish);
   dialog.removeEventListener('cancel',onCancel);
   dialog.removeEventListener('click',onBackdrop);
 };
 const dismiss=()=>{
   if(!dialog.open||closing)return;
   if(reduceMotion()){dialog.close();return}
   closing=true;
   dialog.classList.add('is-closing');
   closeTimer=setTimeout(()=>{if(dialog.open)dialog.close()},280);
 };
 const onCancel=event=>{event.preventDefault();dismiss()};
 const onBackdrop=event=>{if(event.target===dialog)dismiss()};
 preview.src=url;
 heading.textContent='Графік · '+formatDate(date,{day:'numeric',month:'long'})+' · '+queue;
 const canNativeShare=!!(navigator.share&&navigator.canShare?.({files:[file]}));
 share.hidden=!canNativeShare;
 close.onclick=dismiss;
 $('sharePreviewSave').onclick=()=>{
   const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
   flash('Картинку графіка збережено');
 };
 share.onclick=async()=>{
   try{await navigator.share({files:[file],title:'Графік відключень · Світло Черкаси'});dismiss()}
   catch(e){if(e.name!=='AbortError'){console.warn('Share:',e);flash('Не вдалося поділитися. Спробуйте зберегти PNG.')}}
 };
 dialog.addEventListener('close',finish);
 window.SvitloSheetMotion?.bind(dialog,dismiss);
 dialog.addEventListener('cancel',onCancel);
 dialog.addEventListener('click',onBackdrop);
 try{dialog.showModal()}
 catch(error){finish();throw error}
}
async function shareSchedule(date,{copy=false}={}){
 const info=shareDescription(date);
 if(!info){flash('Спочатку оберіть адресу та підчергу');return}
 if(copy){
  try{await navigator.clipboard.writeText(info.text);flash('Години скопійовано')}
  catch{flash('Не вдалося скопіювати години')}
  return;
 }
 try{
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1880;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  const W=1080,H=1880,margin=64;
  const round=(x,y,w,h,r,color)=>{
   ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
  };
  const line=(text,x,y,font,color,align='left')=>{
   ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(text,x,y);ctx.textAlign='left';
  };
  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#eff5ff');bg.addColorStop(1,'#f9fbff');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  // Brand header, designed for legible photo sharing on a phone.
  const header=ctx.createLinearGradient(50,70,980,400);
  header.addColorStop(0,'#102e5c');header.addColorStop(.55,'#1b4d85');header.addColorStop(1,'#337bc6');
  round(margin,66,W-margin*2,348,38,header);
  round(101,100,70,70,21,'#ffffff24');
  line('⚡',136,153,'700 53px system-ui','#ffffff','center');
  line('СВІТЛО ЧЕРКАСИ',197,127,'700 28px system-ui','#b6d8ff');
  line('МІЙ ГРАФІК ВІДКЛЮЧЕНЬ',197,163,'650 17px system-ui','#c9e1ff');
  line(formatDate(date,{weekday:'long',day:'numeric',month:'long'}),104,252,'750 42px system-ui','#ffffff');
  round(105,282,249,60,19,'#ffffff28');
  line('ПІДЧЕРГА  '+info.queue,129,321,'750 27px system-ui','#ffffff');
  line(info.day?'За опублікованим графіком':'Графік на цей день не опубліковано',104,377,'23px system-ui','#d9e8ff');
  const subtitle=info.summary.unknown?'Частина годин ще уточнюється':
   info.summary.off?'Відключення · '+formatDuration(info.summary.off):
   'Світло весь день';
  line(subtitle,74,475,'750 39px system-ui','#193e72');
  line('Розклад за годинами',74,524,'24px system-ui','#7086a1');
  const schedule=timeline(date,info.queue),cols=4,gap=15,cellW=(W-2*margin-gap*(cols-1))/cols;
  const cellH=165,top=558,rowGap=15;
  for(let hour=0;hour<24;hour++){
   const values=schedule?.slice(hour*60,hour*60+60),off=values?.filter(x=>x===1).length||0;
   const unknown=values?.filter(x=>x<0).length||0;
   const status=unknown?'unknown':off===0?'on':off===60?'off':'mixed';
   const colors={
    on:{bg:'#e2f6ed',fg:'#146b4f',label:'Світло',icon:'●',small:'#4f9f80'},
    off:{bg:'#fde9e5',fg:'#ad4939',label:'Без світла',icon:'●',small:'#d87865'},
    mixed:{bg:'#fff0d6',fg:'#956323',label:'Частково',icon:'◐',small:'#bb8d42'},
    unknown:{bg:'#e6edf6',fg:'#687b98',label:'Немає даних',icon:'○',small:'#93a5bb'}
   }[status];
   const x=margin+(hour%cols)*(cellW+gap),y=top+Math.floor(hour/cols)*(cellH+rowGap);
   round(x,y+5,cellW,cellH,24,'#153d6c08');
   round(x,y,cellW,cellH,24,colors.bg);
   round(x+16,y+18,30,30,15,'#ffffff9e');
   line(colors.icon,x+31,y+40,'700 21px system-ui',colors.fg,'center');
   line(clock(hour*60),x+17,y+92,'750 38px system-ui',colors.fg);
   line(colors.label,x+17,y+133,'600 22px system-ui',colors.fg);
   if(status==='mixed')line(formatDuration(off),x+cellW-17,y+133,'500 18px system-ui',colors.fg,'right');
  }
  const footerY=top+6*(cellH+rowGap)+8;
  round(margin,footerY,W-2*margin,104,23,'#e5eefb');
  line(info.day?'Періоди за офіційним графіком':'Немає опублікованого графіка. Світло весь день за замовчуванням.',
   margin+26,footerY+42,'650 22px system-ui','#315a88');
  line('Це прогноз, а не підтвердження фактичної наявності світла.',margin+26,footerY+77,'19px system-ui','#6e85a4');
  line('svitlo-cherkasy.pp.ua',W/2,H-39,'700 24px system-ui','#7b94b3','center');
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('No image');
  const filename='svitlo-'+date+'-'+info.queue+'.png';
  if(document.documentElement.classList.contains('feature-off-sharePreview')){
   const file=new File([blob],filename,{type:'image/png'});
   if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Графік відключень'});
   else {const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.download=filename;a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),12000)}
  }else await openSharePreview(blob,filename,date,info.queue);
 }catch(error){if(error?.name==='AbortError')return;console.warn('Share schedule:',error);flash('Не вдалося поділитися графіком')}
}
function renderBar(a){const bar=$('overviewBar'),key=a?Array.from(a).join(''):'unknown';
 if(bar.dataset.paintKey===key){const line=bar.querySelector('.bar-now');if(line)line.style.left=(nowMinutes()/1440*100)+'%';return}
 bar.dataset.paintKey=key;bar.replaceChildren();if(!a){const b=el('span','bar-segment unknown');b.style.flex='1';bar.append(b);return}let start=0,v=a[0];for(let i=1;i<=1440;i++){if(i===1440||a[i]!==v){const seg=el('span','bar-segment '+(v===1?'off':v===0?'on':'unknown'));seg.style.flex=String(i-start);seg.title=`${clock(start)}–${clock(i)} · ${v===1?'відключення':v===0?'світло':'немає даних'}`;bar.append(seg);start=i;v=a[i]}}const line=el('span','bar-now');line.style.left=(nowMinutes()/1440*100)+'%';bar.append(line)}
// Latest tap wins. Previous WAAPI animations are interrupted at their actual
// visual position rather than rewinding, and clicks are never rate-limited.
let tabMotion=null;
const TAB_MOTION_MS=460; // Same agreed duration across all four tabs and device sizes.
function navigate(name,{fromHistory=false}={}){
 const names=['home','detail','updates','settings'];
 if(!names.includes(name))return;
 if(name==='detail'&&!primary()&&!previewQueue){if(fromHistory)return navigate('home',{fromHistory:true});openAddressSheet();return}
 if(name===active)return;
 if(!fromHistory){
  try{history.pushState({svitloTab:name},'',location.href)}catch(error){console.warn('Tab history:',error?.message)}
 }
 const previous=active;
 if(name!=='detail')previewQueue=null;
 try{sessionStorage.setItem(SCREEN_RETURN,name)}catch{}
 if(name==='detail'){daySelected=today();renderDetail()}
 else if(name==='updates')renderUpdates();
 else if(name==='settings')renderSettings();
 else renderHome();
 const direction=names.indexOf(name)>=names.indexOf(previous)?1:-1;
 document.documentElement.dataset.tabDirection=direction>0?'forward':'backward';
 const previousSection=$(previous),nextSection=$(name);
 const animate=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches!==true&&
  !document.documentElement.classList.contains('feature-off-animations');
 // Sample current pixels BEFORE cancelling an unfinished transition.
 const previousStyle=window.getComputedStyle?.(previousSection);
 const currentTransform=previousStyle?.transform&&previousStyle.transform!=='none'?previousStyle.transform:'translate3d(0,0,0)';
 const currentOpacity=Number(previousStyle?.opacity)||1;
 // When quickly returning to the tab we were just leaving, reuse its actual
 // outgoing visual position instead of teleporting it to a generic start.
 const returningToOutgoing=tabMotion?.from===nextSection;
 const returnStyle=returningToOutgoing?window.getComputedStyle?.(nextSection):null;
 const returnTransform=returnStyle?.transform&&returnStyle.transform!=='none'?returnStyle.transform:'translate3d(0,0,0)';
 const returnOpacity=Number(returnStyle?.opacity)||1;
 if(tabMotion){
  tabMotion.incoming?.cancel();tabMotion.outgoing?.cancel();
  if(tabMotion.from){tabMotion.from.hidden=true;tabMotion.from.style.cssText=''}
  if(tabMotion.to){tabMotion.to.style.cssText=''}
  tabMotion=null;
 }
 const root=document.documentElement,scrollBehavior=root.style.scrollBehavior;
 root.style.scrollBehavior='auto';
 try{window.scrollTo(0,0)}finally{root.style.scrollBehavior=scrollBehavior||''}
 active=name;
 for(const id of names){
  const node=$(id);node.classList.remove('tab-enter');
  node.hidden=id!==name&&id!==previous;
 }
 // Keep the old screen in a temporary, noninteractive layer until it fades out.
 // Only transform/opacity are animated (GPU-friendly on Android and iOS).
 const nav=document.querySelector('.bottom-nav');
 if(nav)nav.style.setProperty('--tab-offset','calc('+(names.indexOf(name)*100)+'% + '+(names.indexOf(name)*3)+'px)');
 document.querySelectorAll('[data-go]').forEach(item=>{
  if(item.classList.contains('nav-item')){
   const selected=item.dataset.go===name;
   item.classList.toggle('active',selected);
   item.setAttribute('aria-current',selected?'page':'false');
  }
 });
 if(!animate||!previousSection.animate||!nextSection.animate){
  previousSection.hidden=true;
  if(animate)nextSection.classList.add('tab-enter');
  return;
 }
 const token={from:previousSection,to:nextSection,incoming:null,outgoing:null};
 tabMotion=token;
 previousSection.style.position='absolute';
 previousSection.style.inset='0';
 previousSection.style.width='100%';
 previousSection.style.zIndex='2';
 previousSection.style.pointerEvents='none';
 nextSection.hidden=false;
 const easing='cubic-bezier(.2,.78,.22,1)';
 token.outgoing=previousSection.animate([
  {transform:currentTransform,opacity:currentOpacity},
  {transform:'translate3d('+(-direction*30)+'px,0,0)',opacity:0}
 ],{duration:TAB_MOTION_MS,easing,fill:'forwards'});
 token.incoming=nextSection.animate([
  {transform:returningToOutgoing?returnTransform:'translate3d('+(direction*34)+'px,0,0)',opacity:returningToOutgoing?returnOpacity:0.12},
  {transform:'translate3d(0,0,0)',opacity:1}
 ],{duration:TAB_MOTION_MS,easing,fill:'forwards'});
 token.incoming.finished.then(()=>{
  if(tabMotion!==token)return;
  token.outgoing.cancel();token.incoming.cancel();
  previousSection.hidden=true;previousSection.style.cssText='';
  nextSection.style.cssText='';
  tabMotion=null;
 },()=>{});
}
function renderDetail(){const a=previewQueue?{queue:previewQueue,nickname:'Підчерга '+previewQueue,settlement:'Черкаси та район'}:primary();
 if(!a)return;
 $('editActive').hidden=!!previewQueue;
 setText('detailAddress',previewQueue?'Підчерга '+previewQueue+' · тимчасовий перегляд':fullAddress(a));const tToday=timeline(today(),a.queue),st=stateAt(tToday,nowMinutes()),nxt=nextChange(today(),a.queue,nowMinutes());const status=$('detailStatus');status.className='detail-status '+st;status.textContent=statusCopy(st,nxt,a.queue,today()).title;
 const day=daySelected&&stripContains(today(),daySelected)?daySelected:today();daySelected=day;
 const root=$('days'),calendarDays=stripDates(),daysKey=calendarDays.join(',');
 if(root.dataset.renderKey!==daysKey){
  root.dataset.renderKey=daysKey;root.replaceChildren();
  for(const d of calendarDays){
   const b=el('button','day-choice',weekdayShort(d));b.type='button';
   b.setAttribute('aria-label',weekdayFull(d));b.onclick=()=>showDay(d);root.append(b);
  }
 }
 [...root.children].forEach((b,i)=>{
  const d=calendarDays[i];
  b.className='day-choice'+(d===day?' selected':'')+(d===today()?' is-today':'');
  b.setAttribute('aria-pressed',String(d===day));
 });
 const pub=currentDay(day),t=timeline(day,a.queue);
 const dayStats=stats(t);
 setText('detailDayStat',dayStats?(pub?(dayStats.unknown?'Частина годин уточнюється':'Без світла '+formatDuration(dayStats.off)+' · Зі світлом '+formatDuration(dayStats.on)):''):'Немає даних');
 setText('detailDayLabel',weekdayFull(day));setText('detailUpdated',pub?`Опубліковано ${fmtStamp(pub.publishedAt)}`:verifiedNoSchedule(day)?'Світло весь день':'Немає підтверджених даних');const grid=$('hourGrid');
 const paintKey=JSON.stringify([day,a.queue,document.documentElement.dataset.theme,pub?.verified,pub?.queues?.[a.queue]||null,day===today()?Math.floor(nowMinutes()/60):null,verifiedNoSchedule(day)]);
 if(grid.dataset.paintKey!==paintKey){
  grid.dataset.paintKey=paintKey;grid.replaceChildren();
 for(let h=0;h<24;h++){
   let on=0,off=0;
   for(let m=h*60;m<h*60+60;m++){if(t?.[m]===0)on++;if(t?.[m]===1)off++}
   const visual=window.SvitloHour.paintHour(t,h,document.documentElement.dataset.theme==='dark'?'dark':'light'),type=visual.kind;
   const c=el('div','hour-cell '+type+(day===today()&&h===Math.floor(nowMinutes()/60)?' current':''));
   c.style.background=visual.background;
   c.dataset.hour=clock(h*60);
   const iconBolt='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.6 1.3 3.7 13.7h7l-1.2 9.1 10.8-13.4h-7.2z"/></svg>';
   const iconOff='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.6 1.3 3.7 13.7h7l-1.2 9.1 10.8-13.4h-7.2z"/><path d="M2.5 21.5 21.5 2.5" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/></svg>';
   for(const [mode,mask,icon] of [['on',visual.onMask,iconBolt],['off',visual.offMask,iconOff],['unknown',visual.unknownMask,iconBolt]]){
     const layer=el('span','hour-ink hour-ink-'+mode);
     layer.innerHTML='<span class="hour-ink-content">'+icon+'<span>'+clock(h*60)+'</span></span>';
     layer.style.webkitMaskImage=mask;layer.style.maskImage=mask;
     layer.setAttribute('aria-hidden','true');c.append(layer);
   }
   c.setAttribute('role','img');
   c.setAttribute('aria-label',clock(h*60)+': '+(type==='unknown'?'немає підтверджених даних':type==='mixed'?`за графіком зі світлом ${on} хвилин, без світла ${off} хвилин`:type==='off'?'за графіком немає світла':'за графіком є світло'));
   c.title=c.getAttribute('aria-label');grid.append(c);
 }
 }
 const next=nxt;
 setText('nextTime',next?nextChangeLabel(next):st==='on'?'Не заплановано':'Невідомо');
 setText('nextDescription',next?`Планове ${next.to===1?'відключення':'відновлення електропостачання'}${next.dayOffset===1?' наступного дня':''}`:
  st==='on'?'На сьогодні та завтра у підтверджених даних змін не зазначено':'Точний час не підтверджено');$('articleLink').href=pub?.queueSources?.[a.queue]||pub?.source||'https://www.cherkasyoblenergo.com/news'}
function renderUpdates(){setText('lastCheck',data.lastChecked?fmtStamp(data.lastChecked):'Час перевірки невідомий');setText('updateNote',data.lastChecked?'Остання перевірка графіків.':'Перевірте графік безпосередньо на сайті оператора.');const root=$('updateList');root.replaceChildren();const all=[...(data.changes||[]).map(x=>({kind:'change',...x})),...(data.days||[]).map(x=>({kind:'publication',...x}))].sort((a,b)=>String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0,24);if(!all.length)root.append(el('div','empty-places','Поки немає підтверджених публікацій.'));for(const d of all){const c=el('div','update-card');c.append(el('time','',fmtStamp(d.publishedAt)),el('strong','',d.kind==='change'?`Графік скориговано · ${formatDate(d.date)}`:`Опубліковано графік · ${formatDate(d.date)}`));const meta=el('div','small-source',d.kind==='change'?`Змінені підчерги: ${(d.queues||[]).join(', ')||'не уточнено'}`:`Редакцій: ${d.revisions||1}`);c.append(meta);const link=el('a','', 'Офіційна публікація 🔗');link.href=d.source||'https://www.cherkasyoblenergo.com/news';link.target='_blank';link.rel='noopener';c.append(link);root.append(c)}}
function updatePushInvite(){
 const box=$('pushInvite');if(!box)return;
 const supported='Notification' in window;
 box.hidden=!supported||pushActive||(Notification.permission==='granted'&&localStorage.getItem(PUSH_CONSENT)==='yes');
 if(box.hidden)return;
 const denied=Notification.permission==='denied';
 setText('pushInviteTitle',denied?'Сповіщення вимкнені на пристрої':'Не пропустіть зміну графіка');
 setText('pushInviteText',denied?'Дозвольте сповіщення для «Світло Черкаси» в налаштуваннях пристрою.':
  'Отримуйте повідомлення про відключення, повернення світла та зміни графіка.');
 const action=$('pushInviteAction');
 action.firstChild.textContent=denied?'Відкрити налаштування сповіщень ':'Увімкнути сповіщення ';
 action.onclick=denied?()=>navigate('settings'):()=>enableNotifications();
}
let pushControlBusy=false,pushControlWanted=null;
function renderSettings(){
 const categories=[['off','notifyOff'],['on','notifyOn'],['changes','notifyChanges'],['tomorrow','notifyTomorrow'],['emergency','notifyEmergency']];
 const supported='Notification' in window&&'serviceWorker' in navigator;
 const configured=!!pushConfig?.apiBase&&!!pushConfig?.publicKey;
 const permission=supported?Notification.permission:'unsupported';
 const optedOut=localStorage.getItem(PUSH_CONSENT)==='no';
 const connected=supported&&configured&&permission==='granted'&&!optedOut&&pushActive;
 const hasAddress=!!primary()?.queue;
 const blocked=!supported||(!connected&&(!configured||permission==='denied'||!hasAddress));
 const master=$('pushMaster');
 if(master){
  master.checked=pushControlBusy&&pushControlWanted!==null?pushControlWanted:connected;
  master.disabled=pushControlBusy||blocked;
  master.setAttribute('aria-busy',pushControlBusy?'true':'false');
 }
 for(const [key,field] of categories){
  const input=$(field);if(!input)continue;
  input.checked=!!prefs[key];
  input.disabled=!connected||pushControlBusy;
 }
 const categoryBox=$('pushCategorySettings');
 if(categoryBox){
  categoryBox.classList.toggle('push-categories-disabled',!connected);
  categoryBox.setAttribute('aria-disabled',connected?'false':'true');
 }
 let title='Вимкнено',description='Увімкніть головний перемикач, щоб налаштувати категорії повідомлень.';
 if(!supported){title='Недоступно';description='Цей браузер не підтримує Push. Відкрийте встановлений PWA в сумісному браузері.'}
 else if(!configured){title='Немає з’єднання';description='Не вдалося отримати налаштування Push-сервера. Перевірте інтернет.'}
 else if(permission==='denied'){title='Заборонено';description='Дозвольте сповіщення для PWA у системних налаштуваннях пристрою.'}
 else if(!hasAddress){title='Потрібна адреса';description='Додайте адресу з підчергою, щоб налаштувати Push.'}
 else if(pushControlBusy){title='Застосовуємо…';description='Оновлюємо Push-підписку. Збережені категорії не скидаються.'}
 else if(connected){title='Підключено';description='Системні Push увімкнені. Оберіть категорії, які хочете отримувати.'}
 else if(!optedOut){title='Не підключено';description='Увімкніть Push головним перемикачем. Після підключення стануть доступними категорії.'}
 setText('pushHeadline',title);setText('pushDescription',description);
 const status=$('pushHeadline');if(status)status.dataset.status=connected?'connected':title==='Застосовуємо…'?'pending':'disconnected';
 const offline=$('offlineDataState');if(offline){
  const days=(data.days||[]).filter(d=>weekStart(d.date)===weekStart(today()));
  offline.textContent=(days.length?('Збережено графіків: '+days.length+' із 7 днів поточного тижня.'):'Графіки поточного тижня ще не збережені.')+
   (data.lastChecked?' Остання перевірка: '+fmtStamp(data.lastChecked)+'.':'')+
   ' За наявності інтернету дані завантажуються автоматично.';
 }
}
function fillQueueSelect(){const root=$('manualQueue');root.replaceChildren(new Option('Оберіть підчергу',''),...QUEUES.map(q=>new Option(q,q)))}
function town(){return $('settlement').value==='Інше'?$('customSettlement').value.trim():$('settlement').value}
function localIndex(){const k=normTown(town());return k===normTown('Черкаси')?index:index.localities?.[k]||{keys:{},streets:{},streetQueues:{}}}
function findQueue(){
 const idx=localIndex();
 const selectedKey=suggestion&&SvitloAddressLookup.normalize(suggestion.label)===SvitloAddressLookup.normalize($('street').value)?suggestion.key:null;
 return SvitloAddressLookup.resolve({idx,settlement:town(),street:$('street').value,house:$('house').value,selectedKey});
}
function checkLookup(){
 const r=findQueue(),hint=$('lookupFeedback'),manual=$('manualLookup'),possible=$('possibleQueues');
 const house=$('house').value.trim(),known=r.knownHouses||[];
 const isAutomatic=['exact','street'].includes(r.status);
 const manualOverride=isAutomatic&&$('queueOverride').checked;
 $('queueOverrideControl').hidden=!isAutomatic;
 hint.className='lookup-feedback'+(isAutomatic&&!manualOverride?' found':r.status==='incomplete'?'':' warn');
 const list=(r.queues||[]).join(', ');
 const messages={
  incomplete:'Виберіть населений пункт та вулицю — покажемо доступні варіанти.',
  unavailable:'У цьому населеному пункті поки немає адресного переліку. Підчергу можна додати вручну.',
  ambiguous:'Є кілька вулиць із такою назвою. Виберіть потрібну з підказок вище.',
  nostreet:'Цю вулицю ще не знайдено в довідниках. Ви можете зберегти її з підчергою, яку перевірили на сайті оператора.',
  needhouse:'Є підтверджені номери будинків. Введіть свій номер або виберіть його зі списку нижче.',
  nohouse:house&&known.length?'Будинок '+house+' відсутній у доступному списку точних адрес. Підчергу не визначено автоматично.':'Для цієї адреси немає однозначного запису. Виберіть підчергу вручну.',
  exact:`Будинок ${house}: підтверджена підчерга ${r.queue} за адресним переліком.`,
  street:`Для цієї вулиці вказано підчергу ${r.queue}; суперечливих будинкових записів не знайдено.`,
  possible:r.reason==='split-rename'?'Цю вулицю поділено на різні ділянки з новими назвами: '+(r.splitNewNames||[]).join(' та ')+'. Оберіть сучасну вулицю з підказок і звірте підчергу свого будинку.':r.reason==='external-only'?'Для цієї адреси підчергу не підтверджено. Перевірте її в обленерго.':r.reason==='reported-only'?'Для цієї адреси підчергу не підтверджено. Перевірте її в обленерго.':r.reason==='archived-only'?('Цю вулицю відновлено з попереднього офіційного довідника. У поточному імпорті її немає. '+(list?'Архівні підчерги: '+list+'. ':'')+'Звірте актуальну підчергу на сайті оператора й оберіть вручну.'):
    r.reason==='house-conflict'?`Будинок ${house} згадується в різних підчергах: ${list}. Звірте дані з оператором.`:
    r.reason==='no-house-index'?`${house?'Будинок '+house+': точного запису немає. ':''}Для вулиці можливі підчерги ${list}. У джерелі немає розподілу за номерами будинків. Виберіть підчергу нижче.`:
    r.reason==='house-unlisted'?`Будинку ${house} немає серед точних записів цієї вулиці. Можливі підчерги: ${list}. Виберіть підтверджену вами підчергу.`:
    `Для вулиці є підчерги ${list}. Уточніть номер будинку, щоб перевірити точний збіг, або виберіть відому підчергу.`
 };
 const rename=SvitloAddressLookup.renameHint(localIndex(),$('street').value);
 const renameNote=rename?(SvitloAddressLookup.normalize($('street').value)===SvitloAddressLookup.normalize(rename.oldName)
   ?' Цю вулицю перейменовано на «'+rename.newName+'».'
   :' У старих документах ця вулиця може називатися «'+rename.oldName+'».'):'';
 hint.textContent=(manualOverride?'За адресним довідником: підчерга '+r.queue+'. Виберіть вашу нижче.':(messages[r.status]||'Не вдалося визначити підчергу.'))+(r.verifiedRename?' Підчергу звірено за попередньою назвою «'+r.sourceStreet+'» в офіційному переліку обленерго.':r.verifiedNameVariant?' Підчергу звірено за скороченим записом «'+r.sourceStreet+'» в офіційному переліку обленерго.':'')+renameNote;
 const coverage=$('houseCoverage'),choices=$('houseChoices');
 choices.replaceChildren();choices.hidden=true;coverage.hidden=true;
 if(r.streetKey&&r.status!=='exact'){
  coverage.hidden=false;
  if(!known.length){
   coverage.hidden=['no-house-index','archived-only','reported-only','external-only'].includes(r.reason);
   coverage.className='house-coverage no-house-list';
   coverage.textContent=house?'Для будинку '+house+' автоматичне визначення недоступне: номери будинків у джерелі не вказані.':'Номерів будинків у джерелі немає. Не потрібно підбирати номер: оберіть підчергу або звірте адресу з оператором.';
  }else{
   coverage.className='house-coverage has-house-list';
   coverage.textContent=`У переліку є ${known.length} ${known.length===1?'адреса':'адрес із номерами'} на цій вулиці. ${house?'Перевіряємо введений номер.':'Почніть вводити номер або виберіть нижче.'}`;
   const needle=SvitloAddressLookup.houseKey(house);
   const found=known.filter(x=>!needle||SvitloAddressLookup.houseKey(x.number).startsWith(needle));
   if(found.length){
    choices.hidden=false;
    const label=el('div','house-choices-title',house?'Знайдені номери з переліку':'Номери з офіційного переліку');
    choices.append(label);
    for(const item of found.slice(0,12)){
     const b=el('button','house-choice',item.number);
     b.type='button';b.title='Підчерга: '+item.queues.join(', ');
     b.setAttribute('aria-label','Будинок '+item.number+', підчерга '+item.queues.join(', '));
     b.onclick=()=>{$('house').value=item.number;$('queueOverride').checked=false;$('manualQueue').value='';checkLookup()};
     choices.append(b);
    }
    if(found.length>12)choices.append(el('div','house-choices-more',`Ще ${found.length-12} номерів — введіть свій номер для пошуку`));
   }
  }
 }
 manual.hidden=r.status==='incomplete'||(isAutomatic&&!manualOverride);
 $('manualExplanation').textContent=manualOverride?'Обрана підчерга діятиме тільки для цієї адреси, графіків та сповіщень. Звірте її в оператора.':r.reason==='split-rename'?'Для колишньої вулиці є декілька сучасних назв. Виберіть точну ділянку та перевірте свою підчергу в оператора.':['external-only','reported-only','archived-only'].includes(r.reason)
  ?'Підчергу для цієї адреси не підтверджено. Перевірте її на сайті обленерго.'
  :r.reason==='no-house-index'
  ?'Номери будинків у джерелі відсутні. Виберіть свою підчергу зі списку можливих або перевірте її на сайті оператора.'
  :r.reason==='house-unlisted'?'Самого будинку немає в точному переліку. Не обирайте підчергу навмання — звірте її з оператором.'
  :'Оберіть підчергу, яку ви перевірили. Якщо не знаєте, скористайтеся офіційним пошуком.';
 possible.replaceChildren();
 if(r.status==='possible'&&r.queues?.length){
   possible.hidden=false;
   possible.append(el('div','possible-title',['archived-only','external-only','reported-only'].includes(r.reason)?'Непідтверджені підчерги. Перевірте в оператора:':'Можливі підчерги — натисніть свою:'));
   for(const q of r.queues){
     const b=el('button','possible-queue'+($('manualQueue').value===q?' selected':''),`Підчерга ${q}`);
     b.type='button';b.setAttribute('aria-pressed',String($('manualQueue').value===q));
     b.onclick=()=>{$('manualQueue').value=q;checkLookup()};possible.append(b);
   }
 }else possible.hidden=true;
 const chosen=SvitloAddressLookup.chooseQueue(r,$('manualQueue').value,manualOverride).queue;
 const allowed=r.status!=='incomplete'&&town().trim()&&$('street').value.trim();
 $('saveAddress').disabled=!(allowed&&QUEUES.includes(chosen));
 $('saveAddress').textContent=QUEUES.includes(chosen)?'Зберегти адресу · '+chosen:'Оберіть підчергу для збереження';
 return r;
}

// Typeahead only draws place names. No queue lookup per row and no
// internal source/status badges (the official queue is checked on selection).
function suggestions(){
 const root=$('streetSuggestions');
 const query=$('street').value;
 const matches=SvitloAddressLookup.suggest(localIndex(),query);
 const split=SvitloAddressLookup.splitHint(localIndex(),query);
 root.replaceChildren();
 root.hidden=!matches.length||(!split&&SvitloAddressLookup.streetMatches(localIndex(),query).length===1);
 if(root.hidden)return;
 const fragment=document.createDocumentFragment();
 for(const [key,name] of matches){
  const button=el('button','',name);
  button.type='button';
  button.onclick=()=>{
   clearTimeout(streetLookupTimer);
   $('street').value=name;
   suggestion={key,label:name};
   $('queueOverride').checked=false;
   $('manualQueue').value='';
   root.hidden=true;
   checkLookup();
  };
  fragment.append(button);
 }
 root.append(fragment);
}
function populateSettlements(){
 const select=$('settlement');
 const previous=select.value;
 const other=Array.from(select.options).find(o=>o.value==='Інше');
 const present=new Set(Array.from(select.options).map(o=>normTown(o.value)));
 const names=Object.entries(index.localities||{})
   .filter(([key,entry])=>entry && typeof entry==='object' && (entry.streets || entry.keys))
   .map(([key,entry])=>({key,label:({'вканівці':'Великі Канівці','хрестителево':'Хрестителеве'})[key]||entry.label||''}))
   .filter(item=>item.label && !present.has(item.key))
   .sort((a,b)=>a.label.localeCompare(b.label,'uk-UA'));
 for(const item of names){
   const option=new Option(item.label,item.label);
   select.add(option,other||null);
 }
 if([...select.options].some(o=>o.value===previous))select.value=previous;
}
function openAddressSheet(item=null){editId=item?.id||null;suggestion=null;setText('sheetTitle',item?'Редагувати адресу':'Нова адреса');$('nickname').value=item?.nickname||'';$('street').value=item?.street||'';$('house').value=item?.house||'';const opt=Array.from($('settlement').options).find(x=>normTown(x.value)===normTown(item?.settlement));$('settlement').value=opt?opt.value:item?.settlement?'Інше':'Черкаси';$('customSettlement').hidden=$('settlement').value!=='Інше';$('customSettlement').value=opt?'':item?.settlement||'';$('manualQueue').value=item?.queue||'';$('queueOverride').checked=!!item&&['manual-override','manual','street-choice'].includes(item.method);$('deleteAddress').hidden=!item;$('streetSuggestions').hidden=true;checkLookup();showSheet($('addressSheet'))}
let sheetScroll=0;
function showSheet(dialog){
 if(dialog.open)return;
 if(!document.body.classList.contains('sheet-open'))sheetScroll=window.scrollY;
 dialog.showModal();
 document.body.classList.add('sheet-open');
 document.body.style.position='fixed';
 document.body.style.top=`-${sheetScroll}px`;
 document.body.style.width='100%';
}
function unlockSheet(){if($('addressSheet').open||$('placesSheet').open)return;document.body.classList.remove('sheet-open');document.body.style.position='';document.body.style.top='';document.body.style.width='';window.scrollTo({top:sheetScroll,behavior:'instant'})}
function closeSheet(dialog){
 if(!dialog.open)return;
 // Close only after exit animation; the native close event unlocks the page.
 if(!window.SvitloSheetMotion?.dismiss(dialog))dialog.close();
}
function saveAddress(event){
 event.preventDefault();
 const r=checkLookup();
 const {queue,method}=SvitloAddressLookup.chooseQueue(r,$('manualQueue').value,$('queueOverride').checked);
 if(!QUEUES.includes(queue)){flash('Укажіть підчергу для адреси');return}
 const a={id:editId||id(),nickname:$('nickname').value.trim(),street:$('street').value.trim(),
  house:$('house').value.trim(),settlement:normTown(town())==='слобода'?'Слобода':town(),
  queue,method,favorite:editId?addresses.find(x=>x.id===editId)?.favorite===true:false};
 if(editId){const i=addresses.findIndex(x=>x.id===editId);if(i>=0)addresses[i]=a}
 else addresses.push(a);
 if(!primary()||!editId)prefs.primaryId=a.id;
 saveAddresses();savePrefs();closeSheet($('addressSheet'));render();
 flash(['automatic','street-auto'].includes(method)?'Підчергу '+queue+' знайдено':'Адресу збережено');
 if(!editId)navigate('detail');
 updatePushSubscription().catch(()=>{});
}
function deleteAddress(){if(!editId||!confirm('Видалити цю адресу?'))return;addresses=addresses.filter(x=>x.id!==editId);if(prefs.primaryId===editId)prefs.primaryId=addresses[0]?.id||null;saveAddresses();savePrefs();closeSheet($('addressSheet'));navigate('home');flash('Адресу видалено');if(!primary())disableNotifications().catch(console.warn);else updatePushSubscription().catch(console.warn)}
function movePlace(id,direction){const i=addresses.findIndex(x=>x.id===id);const j=i+direction;if(i<0||j<0||j>=addresses.length)return;[addresses[i],addresses[j]]=[addresses[j],addresses[i]];saveAddresses();openPickerContent();renderHome()}
function openPickerContent(){const root=$('placesOptions');root.replaceChildren();for(const [i,a] of addresses.entries()){
 const row=el('div','place-option'+(a.id===primary()?.id?' is-current':''));row.draggable=true;row.dataset.id=a.id;
 const choose=el('button','place-choose');const txt=el('span');txt.append(el('strong','',label(a)),el('small','',fullAddress(a)));choose.append(txt,el('span','place-option-indicator',a.id===primary()?.id?'Поточна':'Обрати'));choose.onclick=()=>{prefs.primaryId=a.id;savePrefs();closeSheet($('placesSheet'));render();updatePushSubscription().catch(()=>{})};row.append(choose);
 const moves=el('span','place-moves');
 const favorite=el('button','move-btn favorite-btn'+(a.favorite?' selected':''),a.favorite?'★':'☆');
 favorite.type='button';favorite.title=a.favorite?'Прибрати з улюблених':'Додати до улюблених';
 favorite.setAttribute('aria-label',favorite.title);
 favorite.onclick=()=>{a.favorite=!a.favorite;saveAddresses();openPickerContent();renderHome()};
 moves.append(favorite);
 const edit=el('button','move-btn place-edit-option','✎');
 edit.type='button';edit.title='Редагувати адресу';edit.setAttribute('aria-label','Редагувати '+label(a));
 edit.onclick=()=>{const sheet=$('placesSheet');sheet.addEventListener('close',()=>openAddressSheet(a),{once:true});closeSheet(sheet)};
 moves.append(edit);
 for(const [n,txtval] of [[-1,'↑'],[1,'↓']]){const b=el('button','move-btn',txtval);b.type='button';b.disabled=n===-1?i===0:i===addresses.length-1;b.setAttribute('aria-label',n<0?'Перемістити вище':'Перемістити нижче');b.onclick=()=>movePlace(a.id,n);moves.append(b)}row.append(moves);
 row.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',a.id);e.dataTransfer.effectAllowed='move'});row.addEventListener('dragover',e=>e.preventDefault());row.addEventListener('drop',e=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain');const at=addresses.findIndex(x=>x.id===from),to=addresses.findIndex(x=>x.id===a.id);if(at<0||to<0||at===to)return;const [m]=addresses.splice(at,1);addresses.splice(to,0,m);saveAddresses();openPickerContent();renderHome()});root.append(row)}}
function openPicker(){openPickerContent();showSheet($('placesSheet'))}

function officialOpen(){const address=[town(),$('street').value.trim(),$('house').value.trim()].filter(Boolean).join(', ');const link=window.open(OFFICIAL,'_blank','noopener');if(navigator.clipboard?.writeText){navigator.clipboard.writeText(address).then(()=>flash('Адресу скопійовано — вставте її на офіційному сайті')).catch(()=>flash('Офіційний пошук відкрито'))}else flash('Офіційний пошук відкрито');if(!link){/* popups may be blocked; retain plain official URL below */}}
function emergencyEvents(){
 const all=[...(emergency.events||[]),...(overrides.emergency?.events||[])];
 return all.filter(e=>e&&typeof e.source==='string'&&/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(e.source)&&Number.isFinite(new Date(e.publishedAt).getTime())).sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
}
function latestEmergency(){
 // Do not infer a currently active interruption from old or ambiguous reports.
 return emergencyEvents().find(e=>{const age=Date.now()-new Date(e.publishedAt).getTime();return age>=0&&age<24*60*60*1000})||null;
}
function renderEmergency(){
 const e=latestEmergency(),banner=$('emergencyBanner');
 if(!e){banner.hidden=true;return}
 banner.hidden=false;
 const recent=Date.now()-new Date(e.publishedAt).getTime()<3*60*60*1000;
 banner.className='emergency-banner '+(e.status==='active'&&recent?'is-warning':'is-note');
 setText('emergencyTitle',e.status==='active'&&recent?'Офіційне повідомлення про аварійні відключення':e.status==='ended'?'Оновлення: завершення обмежень':'Повідомлення про аварійні відключення');
 setText('emergencyText',`${e.title||'Інформація про відключення'} · ${fmtStamp(e.publishedAt)}. Перевіряйте поточний стан в оператора.`);
 $('emergencySource').href=e.source;
}
function notifyEmergencyEvent(){
 const e=latestEmergency();if(!e||e.status!=='active')return;
 const age=Date.now()-new Date(e.publishedAt).getTime();if(age<0||age>60*60*1000)return;
 notify('⚠️ Екстрені відключення','Оператор повідомив про позапланові обмеження. Звичайний графік може не діяти.',`emergency:${e.id||e.source}`);
}
let railwayAddressCorrections={keys:{},localities:{}},addressSourceIndex=null;
const RAILWAY_ADDRESS_CACHE='svitlo-railway-address-corrections-v1';
function applyOverrides(){
 const days=overrides.schedules?.days;
 if(Array.isArray(days)&&days.length){
   const map=new Map(data.days.map(d=>[d.date,d]));
   for(const correction of days){
     if(!/^20\d{2}-\d{2}-\d{2}$/.test(correction.date)||!correction.source?.startsWith('https://www.cherkasyoblenergo.com/')||correction.verified!==true)continue;
     const base=map.get(correction.date)||{date:correction.date,queues:{},verified:true,publishedAt:correction.publishedAt,source:correction.source};
     const queueSources={...(base.queueSources||{})};
     for(const q of Object.keys(correction.queues||{}))queueSources[q]=correction.source;
     map.set(correction.date,{...base,queues:{...base.queues,...correction.queues},queueSources,adminCorrection:true});
   }
   data.days=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
 }
 index=mergeIndexes(addressSourceIndex||index,overrides.addresses||{},{manual:true});
 index=mergeIndexes(index,railwayAddressCorrections,{manual:true,protectHouseStreets:true});
}
function normalizeData(obj){if(!obj||!Array.isArray(obj.days))throw Error('Bad JSON');return {days:obj.days.filter(x=>/^20\d\d-\d\d-\d\d$/.test(x.date)&&x.verified===true),changes:Array.isArray(obj.changes)?obj.changes:[],lastChecked:obj.lastChecked||null,confirmedNoScheduleDates:Array.isArray(obj.confirmedNoScheduleDates)?obj.confirmedNoScheduleDates:undefined,reviewPending:obj.reviewPending===true,unresolvedDates:Array.isArray(obj.unresolvedDates)?obj.unresolvedDates.filter(x=>/^20\d\d-\d\d-\d\d$/.test(x)):undefined}}
function mergeIndexes(live,backup,options={}){
 return SvitloDataMerge.mergeIndexes(live,backup,options);
}

// Railway is primary, Pages is a backup, device storage is the final offline fallback.
async function loadLatestSchedules(){
 const stored=await readCachedSchedule();
 if(navigator.onLine===false){
  if(stored)return {value:stored,source:'device'};
  throw Error('No saved offline schedule');
 }
 let liveError=null;
 try{
  const cfg=pushConfig||await fetch('./push-config.json?live='+Date.now(),{cache:'no-store'}).then(r=>{
   if(!r.ok)throw Error('Cannot read backend config');return r.json();
  });
  const base=new URL(cfg.apiBase);
  if(base.protocol!=='https:')throw Error('Railway API requires HTTPS');
  const url=new URL('/api/data/schedules.json',base);
  url.searchParams.set('t',String(Date.now()));
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8500);
  try{
   const response=await fetch(url,{cache:'no-store',signal:ctrl.signal});
   if(!response.ok)throw Error('Railway HTTP '+response.status);
   const value=normalizeData(await response.json());
   if(!value.lastChecked)throw Error('Railway snapshot missing check timestamp');
   return {value,source:'railway'};
  }finally{clearTimeout(timeout)}
 }catch(error){liveError=error;console.warn('Railway unavailable; using stored or Pages schedule:',error.message)}
 // Read-only, continually refreshed public source prevents the Beta static
 // fallback from getting stuck on the date of the last staging commit.
 // CORS failure never blocks the PWA's own static or device backup.
 try{
  const response=await fetch('https://svitlo-cherkasy.pp.ua/data/schedules.json?fallback='+Date.now(),
   {cache:'no-store',mode:'cors',signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw Error('Public snapshot HTTP '+response.status);
  const value=normalizeData(await response.json());
  if(!value.lastChecked)throw Error('Missing public check time');
  if(stored?.lastChecked&&Date.parse(stored.lastChecked)>Date.parse(value.lastChecked))return {value:stored,source:'device'};
  return {value,source:'pages-fallback'};
 }catch(error){console.warn('Public fallback unavailable; trying Beta static snapshot:',error.message)}
 try{
  const response=await fetch('./data/schedules.json?refresh='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('Pages schedule HTTP '+response.status);
  const value=normalizeData(await response.json());
  if(stored?.lastChecked&&Date.parse(stored.lastChecked)>Date.parse(value.lastChecked||'')){
   return {value:stored,source:'device'};
  }
  if(response.headers.get('X-Svitlo-Cache')==='offline')return {value,source:'device'};
  return {value,source:'pages-fallback'};
 }catch(error){console.warn('Pages schedule unavailable:',error.message)}
 if(stored)return {value:stored,source:'device'};
 throw liveError||Error('No verified schedule snapshot');
}

async function refreshData(manual=false){
 if(refreshInFlight)return refreshInFlight;
 if(Date.now()-lastRefresh<7000&&!manual)return;
 lastRefresh=Date.now();
 const before=data,hadChecked=hasCheckedOnce;
 const refreshButton=$('syncNow');if(refreshButton)refreshButton.disabled=true;
 refreshInFlight=(async()=>{
   let schedulesOk=false;
   try{
     const {value:loaded,source}=await loadLatestSchedules();
     const currentStamp=Date.parse(data.lastChecked||'')||0;
     const nextStamp=Date.parse(loaded.lastChecked||'')||0;
     // Never downgrade an already checked schedule after an outage.
     if(nextStamp>=currentStamp||!data.days.length)data=retainWeeklySchedules(loaded,data);
     schedulesOk=source!=='device';lastSyncFailed=source==='device';
     if(source!=='device')lastDownloadAt=new Date().toISOString();
     // Never replace a newer confirmed snapshot with an older stale fallback.
     if(source!=='device'&&nextStamp>=currentStamp)saveCachedSchedule(data);
   }catch(error){
     lastSyncFailed=true;console.warn('Schedule fetch:',error);
     // Never replace an in-memory confirmed schedule with a failed response.
     if(!data.days.length)try{
       const saved=await readCachedSchedule();
       if(saved)data=saved;
     }catch(e){console.warn('Offline schedule recovery:',e)}
   }
   const refreshAuxiliary=manual||!lastAuxiliaryRefresh||Date.now()-lastAuxiliaryRefresh>=AUXILIARY_REFRESH_MS;
   if(refreshAuxiliary){
   lastAuxiliaryRefresh=Date.now();
   try{
     const [remote,seed,geo,renames]=await Promise.allSettled([
       fetch(`./data/addresses.json?refresh=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}),
       fetch(`./data/published_street_fallback.json?refresh=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}),
       fetch(`./data/street_catalog.json?refresh=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}),
       fetch(`./data/street_aliases.json?refresh=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()})
     ]);
     if(remote.status==='fulfilled'||seed.status==='fulfilled'||geo.status==='fulfilled'||renames.status==='fulfilled'){
       const live=remote.status==='fulfilled'?remote.value:{};
       const backup=seed.status==='fulfilled'?seed.value:{};
       const catalog=geo.status==='fulfilled'?geo.value:{};
       const aliasCatalog=renames.status==='fulfilled'?renames.value:{};
       index=mergeIndexes(live,backup,{catalog,aliasCatalog});
       addressSourceIndex=index;
       try{const snapshot=JSON.stringify(index);if(snapshot.length<1700000)localStorage.setItem(OFFLINE_ADDRESSES,snapshot)}catch{}
       populateSettlements();
       if($('addressSheet').open){suggestions();checkLookup()}
     }else{
       const stored=safeJSON(OFFLINE_ADDRESSES,null);
       if(stored?.keys&&stored?.streets){index=stored;addressSourceIndex=index;populateSettlements()}
     }
   }catch(error){console.warn('Address fetch:',error)}
   try{
     const [alertRes,overrideRes]=await Promise.allSettled([
       fetch('./data/emergency.json?v='+Date.now(),{cache:'no-store'}),
       fetch('./data/manual_overrides.json?v='+Date.now(),{cache:'no-store'})
     ]);
     if(alertRes.status==='fulfilled'&&alertRes.value.ok){const parsed=await alertRes.value.json();if(Array.isArray(parsed.events))emergency=parsed}
     if(overrideRes.status==='fulfilled'&&overrideRes.value.ok){const parsed=await overrideRes.value.json();if(parsed.schemaVersion===1)overrides=parsed}
     try{
      const apiBase=pushConfig?.apiBase;
      if(apiBase&&/^https:\/\//.test(apiBase)){
       const response=await fetch(apiBase.replace(/\/$/,'')+'/api/address-corrections',
        {cache:'no-store',signal:AbortSignal.timeout(2100)});
       if(!response.ok)throw Error('Address corrections HTTP '+response.status);
       const update=await response.json();
       if(update.schemaVersion!==1||!update.corrections||typeof update.corrections!=='object')
        throw Error('Address correction format');
       railwayAddressCorrections=update.corrections;
       try{localStorage.setItem(RAILWAY_ADDRESS_CACHE,JSON.stringify(railwayAddressCorrections))}catch{}
      }else railwayAddressCorrections=safeJSON(RAILWAY_ADDRESS_CACHE,railwayAddressCorrections);
     }catch(error){
      console.warn('Address correction source unavailable:',error.message);
      railwayAddressCorrections=safeJSON(RAILWAY_ADDRESS_CACHE,railwayAddressCorrections);
     }
     applyOverrides();
   }catch(error){console.warn('Bulletin or admin overrides:',error)}
   }
   hasCheckedOnce=true;render();checkNotifications();
   if(manual&&!schedulesOk)flash('Сервер недоступний. Показуємо збережені дані.');
   if(schedulesOk){
     if(hadChecked&&scheduleQueueChanged(before,data,primary()?.queue))flash('Графік для вашої підчерги оновлено');
     announceChanges(before,data);
   }
 })();
 try{return await refreshInFlight}finally{refreshInFlight=null;if(refreshButton)refreshButton.disabled=false}
}
function notify(title,body,key,{offlineLocal=false}={}){
 // Never let the foreground PWA duplicate the server's Push delivery.
 // A transient failed status check does NOT mean an existing server
 // subscription has disappeared. Also respect an explicit Push opt-out.
 const consent=localStorage.getItem(PUSH_CONSENT);
 // A subscribed device must never create a delayed foreground OS alert on launch,
 // even while temporarily offline. Background Web Push owns OS notifications.
 if(consent==='yes'||consent==='no')return;
 const localMode=offlineLocal&&navigator.onLine===false&&!document.hidden;
 if((pushActive&&!localMode)||notified.has(key)||!('Notification' in window)||Notification.permission!=='granted')return;notified.add(key);localStorage.setItem(SEEN,JSON.stringify([...notified].slice(-400)));navigator.serviceWorker?.ready.then(r=>r.showNotification(title,{body,icon:'./assets/icon-192-v692.png',badge:'./assets/icon-192-v692.png',lang:'uk',tag:key})).catch(()=>{try{new Notification(title,{body})}catch{}})}
function announceChanges(previous,current){if(!prefs.changes||!previous?.lastChecked)return;const a=primary();if(!a?.queue)return;for(const c of current.changes||[])if(c.queues?.includes(a.queue)&&!previous.changes?.some(x=>x.date===c.date&&(x.revisionId||x.publishedAt)===(c.revisionId||c.publishedAt))){notify('🔄 Графік оновлено',`Підчерга ${a.queue} · Змінено години на ${formatDate(c.date)}. Перевірте розклад.`, `change:${c.date}:${c.revisionId||c.publishedAt}:${a.queue}`)}}
function checkNotifications(){
 // In-app reminders must work even when Web Push is denied, disabled or delayed.
 // A verified stored schedule can also produce reminders while this PWA stays open offline.
 const nativeAllowed='Notification' in window&&Notification.permission==='granted';
 if(nativeAllowed&&prefs.emergency)notifyEmergencyEvent();
 const a=primary();
 if(!a?.queue)return;
 const date=today(),m=nowMinutes(),verifiedAt=Date.parse(data.lastChecked||'');
 const unresolved=Array.isArray(data.unresolvedDates)?data.unresolvedDates:null;
 // A review for tomorrow must not mute today's independently confirmed plan.
 // Fail closed if a global review flag has no date-scoped explanation.
 const safelyVerified=day=>Boolean(currentDay(day)?.verified===true)&&
   !unresolved?.includes(day)&&
   (data.reviewPending!==true||Boolean(unresolved?.length));
 const fresh=safelyVerified(date)&&Number.isFinite(verifiedAt)&&verifiedAt<=Date.now()+5*60_000&&
   (isOfflineMode()||Date.now()-verifiedAt<=55*60_000);
 if(fresh){
  const current=timeline(date,a.queue),nextDate=shiftDay(date,1);
  const tomorrow=safelyVerified(nextDate)?timeline(nextDate,a.queue):null;
  for(const [type,offset,desired] of [['off',30,1],['on',15,0]]){
   if(!prefs[type])continue;
   // Opened PWAs can recover a delayed reminder before the actual event.
   // Never show a reminder after the published transition has happened.
   for(let eta=offset;eta>=1;eta--){
    const boundary=m+eta,following=boundary>=1440?tomorrow?.[boundary-1440]:current?.[boundary];
    const previous=boundary-1>=1440?tomorrow?.[boundary-1441]:current?.[boundary-1];
    if(following!==desired||previous===undefined||previous<0||previous===desired)continue;
    const key='transition:'+a.queue+':'+date+':'+boundary+':'+type;
    if(notified.has('inbox:'+key))break;
    const eventDate=boundary>=1440?nextDate:date,stamp=new Date().toISOString();
    const title=(type==='off'?'🔴 Відключення':'🟢 Відновлення')+' через '+eta+' хв';
    const body='Підчерга '+a.queue+' · За плановим графіком о '+clock(boundary%1440)+'.';
    const content='**Нагадування за графіком**\n\nДля підчерги '+a.queue+
      ' '+(type==='off'?'заплановано відключення':'заплановано повернення світла')+
      ' о '+clock(boundary%1440)+' ('+formatDate(eventDate)+'). До цієї події приблизно '+
      eta+' хв.\n\nЧас орієнтовний, можливі зміни офіційного розкладу.';
    const inbox=window.SvitloInbox;
    if(inbox?.add){
     notified.add('inbox:'+key);
     inbox.add({id:key,kind:'schedule',title,body,content,at:stamp})
      .then(()=>{
       try{localStorage.setItem(SEEN,JSON.stringify([...notified].slice(-400)))}catch{}
       window.SvitloInboxUI?.refresh?.();
      })
      .catch(error=>{notified.delete('inbox:'+key);console.warn('In-app reminder:',error)});
    }
    // The server owns Push for registered subscribers; no duplicate local Push.
    if(nativeAllowed&&(!pushActive||navigator.onLine===false))notify(title,body,'local:'+key,{offlineLocal:true});
    break;
   }
  }
 }
 if(nativeAllowed&&prefs.tomorrow){
  const nextDate=shiftDay(date,1),published=currentDay(nextDate);
  if(safelyVerified(nextDate)&&published?.queues?.[a.queue]&&m>=19*60)
   notify('🗓️ Графік на завтра',`Підчерга ${a.queue} · На ${formatDate(nextDate)}. Перегляньте години відключень.`,`tomorrow:${nextDate}`);
 }
}

function pushHealthMessage(message){
 // Health checks still repair subscriptions, but never expose developer telemetry
 // or the time of the last Push to end users.
}
async function checkPushDelivery(force=false){
 if(pushHealthBusy)return pushHealthBusy;
 if(!force&&Date.now()-pushHealthLast<2*60_000)return;
 pushHealthLast=Date.now();
 pushHealthBusy=(async()=>{
  if(!pushConfig?.apiBase){pushHealthMessage('Сервер Push недоступний.');return}
  if(!('Notification' in window)||Notification.permission!=='granted'){
   pushActive=false;
   pushHealthMessage('Системні Push не дозволені. Увімкніть їх у налаштуваннях пристрою.');
   return;
  }
  if(localStorage.getItem(PUSH_CONSENT)==='no'){
   pushActive=false;
   pushHealthMessage('Push вимкнено для цього застосунку.');
   return;
  }
  if(!primary()?.queue){pushHealthMessage('Оберіть адресу та підчергу для Push.');return}
  try{
   const registration=await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription){
    pushActive=false;
    if(localStorage.getItem(PUSH_CONSENT)!=='yes'){
     pushHealthMessage('Push ще не підключено. Скористайтеся головним перемикачем у «Опціях».');return
    }
    await updatePushSubscription();
    subscription=await registration.pushManager.getSubscription();
   }
   if(!subscription){pushHealthMessage('Push-підписка пристрою відсутня.');return}
   const response=await fetch(pushConfig.apiBase.replace(/\/$/,'')+'/api/push/subscription-status',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({subscription:{endpoint:subscription.endpoint}}),cache:'no-store'
   });
   if(!response.ok)throw Error('Push diagnostic HTTP '+response.status);
   const remote=await response.json();
   const sameQueue=remote.queue===primary().queue;
   const samePrefs=['off','on','changes','tomorrow','emergency'].every(name=>remote.preferences?.[name]===!!prefs[name]);
   if(!remote.registered||!sameQueue||!samePrefs){
    await updatePushSubscription();
    pushHealthMessage('Push-підписку оновлено для підчерги '+primary().queue+'. Перевіряємо майбутні нагадування автоматично.');
   }else{
    pushActive=true;
    if(remote.checkError){
     pushHealthMessage('Push-підписка підтверджена, але сервер має проблему з перевіркою графіка. Нагадування можуть запізнюватися.');
    }else if(!remote.lastPushCheck){
     pushHealthMessage('Push-підписка підтверджена. Очікуємо першої перевірки нагадувань сервером.');
    }else{
     const recent=remote.latestAutomatic||{},upcoming=remote.upcoming||{};
     const eventText=(e,label)=>e?label+' '+formatDate(e.date)+' о '+e.time+'. ':'';
     const upcomingText=upcoming.off||upcoming.on?
      ' Найближчі події: '+eventText(upcoming.off,'відключення')+
       eventText(upcoming.on,'відновлення'):
      ' Найближчих підтверджених змін немає.';
     const lastDelivery='';
     const error=recent.lastError?' Остання спроба мала помилку доставки.':'';
     pushHealthMessage('Push підключено · підчерга '+remote.queue+
      ' · нагадування за 30 хв до відключення: '+(remote.preferences.off?'увімкнено':'вимкнено')+
      ' · за 15 хв до повернення: '+(remote.preferences.on?'увімкнено':'вимкнено')+
      '.'+upcomingText+lastDelivery+error);
    }
   }
  }catch(error){
   console.warn('Push delivery check:',error);
   pushHealthMessage('Не вдалося перевірити Push на сервері. Перевірте інтернет і спробуйте ще раз.');
  }
 })();
 try{return await pushHealthBusy}finally{pushHealthBusy=null;renderSettings()}
}
async function getPushConfig(){
 try{
  const r=await fetch('./push-config.json',{cache:'no-store'});
  if(r.ok){const c=await r.json();if(/^https:\/\/[^\s]+$/.test(c?.apiBase||'')&&typeof c.publicKey==='string'&&/^[A-Za-z0-9_-]{87}$/.test(c.publicKey))pushConfig=c}
  if(pushConfig&&'Notification' in window&&Notification.permission==='granted'&&localStorage.getItem(PUSH_CONSENT)!=='no'){
   // Existing subscribers are migrated; new users must tap the consent button.
   const existing=await (await navigator.serviceWorker.ready).pushManager.getSubscription();
   if(existing||localStorage.getItem(PUSH_CONSENT)==='yes')await updatePushSubscription();
  }
 }catch(e){console.warn('Push config:',e.message)}renderSettings();updatePushInvite();checkPushDelivery(true).catch(console.warn);
}
function urlsafe(value){const str=(value+'='.repeat((4-value.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(str),x=>x.charCodeAt(0))}
async function updatePushSubscription(){
 if(!('Notification' in window)||!pushConfig||Notification.permission!=='granted'||!primary()?.queue)return;
 const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
 const key=urlsafe(pushConfig.publicKey);
 // VAPID rotation requires a new subscription. Never silently reuse an old key.
 if(sub&&sub.options?.applicationServerKey){
  const old=Array.from(new Uint8Array(sub.options.applicationServerKey));
  if(old.length!==key.length||old.some((v,i)=>v!==key[i])){await sub.unsubscribe();sub=null}
 }
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 const payload={subscription:sub.toJSON(),queue:primary().queue,settlement:primary().settlement||'',preferences:{off:prefs.off,on:prefs.on,changes:prefs.changes,tomorrow:prefs.tomorrow,emergency:prefs.emergency}};
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(pushConfig.apiBase.replace(/\/$/,'')+'/api/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
  if(!response.ok)throw Error('Push server response '+response.status);
  pushActive=true;localStorage.setItem(PUSH_CONSENT,'yes');updatePushInvite();
 }finally{clearTimeout(timeout)}
}
async function disableNotifications(){
 try{
  const registration=await navigator.serviceWorker.ready;
  const sub=await registration.pushManager.getSubscription();
  if(sub){
   if(pushConfig?.apiBase){
    const result=await fetch(pushConfig.apiBase.replace(/\/$/,'')+'/api/unsubscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subscription:{endpoint:sub.endpoint}})});
    if(!result.ok)throw Error('Сервер не підтвердив відписку');
   }else throw Error('Підписка тимчасово недоступна');
   await sub.unsubscribe();
  }
  pushActive=false;localStorage.setItem(PUSH_CONSENT,'no');flash('Сповіщення вимкнено. Підписку скасовано');renderSettings();updatePushInvite();
 }catch(e){console.warn(e);flash('Не вдалося відписатися — повторіть, коли є інтернет')}
}
async function enableNotifications(){if(!('Notification' in window)){flash('Цей браузер не підтримує сповіщення');return}if(Notification.permission==='denied'){flash('Дозвольте сповіщення у налаштуваннях пристрою');return}const granted=await Notification.requestPermission();if(granted!=='granted'){flash('Дозвіл на сповіщення не надано');return}if(pushConfig){try{await updatePushSubscription();flash('Сповіщення увімкнено')}catch(e){console.warn(e);flash('Не вдалося ввімкнути сповіщення. Спробуйте пізніше')}}else flash('Нагадування увімкнено для відкритого застосунку');renderSettings();updatePushInvite()}
// An iOS permission change can happen in system Settings while the PWA is suspended.
window.addEventListener('focus',()=>{updatePushInvite();checkPushDelivery().catch(console.warn);if(!document.hidden)refreshData().catch(console.warn)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){updatePushInvite();checkNotifications();checkPushDelivery().catch(console.warn)}});
// All subqueue charts use the same verified minute timelines as normal schedules.
window.SvitloAllQueuesSource={
 dates:stripDates,today,
 selectedDate:()=>daySelected||today(),
 timeline,day:currentDay,noSchedule:verifiedNoSchedule,
 offline:isOfflineMode,lastChecked:()=>data.lastChecked,
 sharePreview:openSharePreview
};
// Event wiring
// Inbox uses the existing screen and date picker; no external navigation.
window.addEventListener('svitlo:open-schedule',event=>{
 const wanted=event.detail?.date;
 navigate('detail');
 if(active==='detail'&&typeof wanted==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(wanted)){
  const parsed=new Date(wanted+'T12:00:00Z');
  if(!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===wanted)showDay(wanted);
 }
});
for(const b of document.querySelectorAll('[data-go]'))b.addEventListener('click',()=>navigate(b.dataset.go));
 for(const key of ['tomorrowOpen','tomorrowCard'])$(key)?.addEventListener('click',()=>{if(!primary())return openAddressSheet();navigate('detail');showDay(shiftDay(today(),1))});
 $('shareToday')?.addEventListener('click',()=>shareSchedule(today()));
 $('copyToday')?.addEventListener('click',()=>shareSchedule(today(),{copy:true}));
 $('shareDetail')?.addEventListener('click',()=>shareSchedule(daySelected||today()));
 $('shareApp')?.addEventListener('click',shareApplication);
 const quickSelect=$('quickQueueSelect');
 if(quickSelect){
  for(const queue of QUEUES){const option=document.createElement('option');option.value=queue;option.textContent='Підчерга '+queue;quickSelect.append(option)}
  $('quickQueueOpen').onclick=()=>{
   if(!QUEUES.includes(quickSelect.value)){flash('Оберіть підчергу');return}
   previewQueue=quickSelect.value;
   if(active==='detail')renderDetail();else navigate('detail');
  };
 }
$('syncNow').onclick=()=>refreshData(true);$('refreshTop').onclick=()=>refreshData(true);$('refreshDetail').onclick=()=>refreshData(true);$('manualRefresh').onclick=()=>refreshData(true);$('primaryPicker').onclick=()=>addresses.length?openPicker():openAddressSheet();$('manageFromHome').onclick=()=>addresses.length?openPicker():openAddressSheet();$('settingsManagePlaces').onclick=()=>addresses.length?openPicker():openAddressSheet();$('addFromHome').onclick=()=>openAddressSheet();$('addFromSettings').onclick=()=>openAddressSheet();$('editActive').onclick=()=>openAddressSheet(primary());$('openDetail').onclick=()=>navigate('detail');
$('closeSheet').onclick=()=>closeSheet($('addressSheet'));$('closePlaces').onclick=()=>closeSheet($('placesSheet'));$('sheetAddPlace').onclick=()=>{
 const picker=$('placesSheet');
 if(!picker.open){openAddressSheet();return}
 picker.addEventListener('close',()=>openAddressSheet(),{once:true});
 closeSheet(picker);
};
for(const dialog of [$('addressSheet'),$('placesSheet')])dialog.addEventListener('close',()=>queueMicrotask(unlockSheet));
$('settlement').onchange=()=>{$('queueOverride').checked=false;$('manualQueue').value='';$('customSettlement').hidden=$('settlement').value!=='Інше';suggestion=null;suggestions();checkLookup()};$('customSettlement').oninput=()=>{$('queueOverride').checked=false;$('manualQueue').value='';checkLookup()};// Keep the iPhone keyboard responsive: do no full address/house lookup in
// input handlers. A short trailing debounce gives the browser time to paint.
let streetLookupTimer=null;
function scheduleStreetLookup(){
 clearTimeout(streetLookupTimer);
 streetLookupTimer=setTimeout(()=>{
  if($('street').isComposing)return;
  suggestions();
  checkLookup();
 },110);
}
$('street').oninput=()=>{$('queueOverride').checked=false;$('manualQueue').value='';suggestion=null;scheduleStreetLookup()};
$('street').oncompositionend=scheduleStreetLookup;
$('house').onfocus=()=>{$('streetSuggestions').hidden=true};
$('house').oninput=()=>{
 $('streetSuggestions').hidden=true;
 $('queueOverride').checked=false;
 $('manualQueue').value='';
 clearTimeout(streetLookupTimer);
 streetLookupTimer=setTimeout(()=>checkLookup(),110);
};$('queueOverride').onchange=checkLookup;$('manualQueue').onchange=checkLookup;$('addressForm').onsubmit=saveAddress;$('deleteAddress').onclick=deleteAddress;$('goOfficial').onclick=officialOpen;
for(const [key,field] of [['off','notifyOff'],['on','notifyOn'],['changes','notifyChanges'],['tomorrow','notifyTomorrow'],['emergency','notifyEmergency']])$(field).onchange=e=>{prefs[key]=e.target.checked;savePrefs();updatePushSubscription().catch(console.warn)};
$('pushMaster').onchange=async event=>{
 if(pushControlBusy)return;
 const want=event.target.checked;
 pushControlWanted=want;pushControlBusy=true;renderSettings();
 try{
  if(want)await enableNotifications();
  else await disableNotifications();
 }finally{
  pushControlBusy=false;
  pushControlWanted=null;
  renderSettings();
 }
};
fillQueueSelect();
 const requestedScreen=new URL(location.href).searchParams.get('screen');
 let restore=null;
 try{restore=sessionStorage.getItem(SCREEN_RETURN)}catch{}
 const preferred=requestedScreen==='settings'?'settings':(restore==='settings'?'settings':null);
 if(preferred)active=preferred;
 for(const name of ['home','detail','updates','settings'])$(name).hidden=name!==active;
 document.querySelectorAll('[data-go]').forEach(x=>{if(x.classList.contains('nav-item'))x.classList.toggle('active',x.dataset.go===active)});
 if(requestedScreen==='settings')try{const u=new URL(location.href);u.searchParams.delete('screen');history.replaceState({svitloTab:active},'',u.pathname+u.search+u.hash)}catch{}
 // On Android the system Back gesture restores a previous tab rather than
 // exiting the installed PWA. Internal pages keep their own history entries.
 try{if(!history.state?.svitloInternal)history.replaceState({svitloTab:active},'',location.href)}catch{}
 window.addEventListener('popstate',event=>{
  if(event.state?.svitloInternal)return;
  const screen=event.state?.svitloTab;
  const valid=['home','detail','updates','settings'].includes(screen)?screen:'home';
  navigate(valid,{fromHistory:true});
 });
 // Keep first-render placeholders completely behind the launch screen.
 render();
 async function finishInitialLoad(){
   // A cold offline iPhone launch must never wait for network or auxiliary
   // requests to settle. Refresh continues behind the cached interface.
   let bootTimer=null;
   try{
     const refresh=refreshData();
     const deadline=new Promise(resolve=>{
       bootTimer=setTimeout(()=>resolve('boot-timeout'),navigator.onLine===false?350:1800);
     });
     if(await Promise.race([refresh.then(()=> 'loaded'),deadline])==='boot-timeout'){
       hasCheckedOnce=true;
       if(navigator.onLine===false)lastSyncFailed=true;
       render();
     }
   }catch(error){
     console.warn('First launch schedule sync:',error);
     hasCheckedOnce=true;
     try{render()}catch(renderError){console.warn('Initial fallback render:',renderError)}
   }finally{
     if(bootTimer!==null)clearTimeout(bootTimer);
     const splash=$('appBootScreen');
     if(splash){
       splash.classList.add('is-complete');
       // iOS can skip transitionend while waking up a previously closed PWA.
       setTimeout(()=>{splash.hidden=true},350);
     }
   }
 }
 finishInitialLoad();
 getPushConfig();
function applyCalendarCutover(){
 const filtered=data.days.filter(day=>weekAllowed(day.date));
 const changes=(data.changes||[]).filter(change=>typeof change?.date==='string'&&weekAllowed(change.date));
 if(filtered.length!==data.days.length||changes.length!==(data.changes||[]).length){
  data={...data,days:filtered,changes};saveCachedSchedule(data);
 }
 if(daySelected&&!stripContains(today(),daySelected))daySelected=today();
}
function paintCalendarClock(){
 applyCalendarCutover();
 renderHome();if(active==='detail')renderDetail();checkNotifications();
}
// Align a check to 00 seconds of every real clock minute. In particular,
// Sunday and Monday cut over at 00:00 Kyiv, rather than 30 seconds late.
function calendarMinuteTick(){
 setTimeout(()=>{paintCalendarClock();calendarMinuteTick()},Math.max(50,60000-Date.now()%60000+30));
}
calendarMinuteTick();
setInterval(paintCalendarClock,30_000);
setInterval(()=>{if(!document.hidden)refreshData()},AUTO_SCHEDULE_CHECK_MS);
window.addEventListener('svitlo:live-schedules',()=>{lastRefresh=0;refreshData().catch(console.warn)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){applyCalendarCutover();render();refreshData();checkNotifications()}});
window.addEventListener('online',()=>{
  renderFreshness();
  refreshData(true);
  window.dispatchEvent(new Event('svitlo:refresh-content'));
 });window.addEventListener('offline',renderFreshness);
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{swRegistration=reg}).catch(console.warn);
