/* Public maintenance & announcements. Server configuration is authoritative.
 * Full/incident mode can hide the PWA; limited mode shows a non-blocking banner.
 */
(()=>{'use strict';
 const overlay=document.getElementById('maintenanceScreen');if(!overlay)return;
 const $=id=>document.getElementById(id),viewport=document.querySelector('.viewport');
 let apiBase='',busy=false,pendingRefresh=false,lastConfig=null,maintenanceExitTimer=null,maintenanceFocus=null,live=null,lastPhase='';
 const banner=document.createElement('aside');banner.className='maintenance-inline';banner.hidden=true;
 banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 if(viewport)viewport.prepend(banner);
 const symbol=overlay.querySelector('.maintenance-symbol');

 const systemBanner=document.createElement('aside');systemBanner.className='svitlo-managed-banner';systemBanner.hidden=true;
 systemBanner.setAttribute('role','status');
 if(viewport)viewport.prepend(systemBanner);
 const moduleBanner=document.createElement('aside');moduleBanner.className='svitlo-modules-banner';moduleBanner.hidden=true;
 if(viewport)viewport.prepend(moduleBanner);
 function setVisible(node,yes){if(node)node.hidden=!yes}
 function safePublicLink(value,fallback=''){
  if(typeof value!=='string')return fallback;
  if(/^\.\/[a-zA-Z0-9/_?&=.-]{1,250}$/.test(value))return value;
  try{const url=new URL(value);if(url.protocol==='https:'&&url.username===''&&url.password==='')return url.href}catch{}
  return fallback;
 }
 // A public administrator's custom colors are for light appearance only.
 // Inline --bg and --surface override dark CSS variables otherwise.
 let latestAppearance={};
 const paletteFields=[['--blue','accent','#377dff'],['--bg','background','#f6f8fc'],['--surface','surface','#ffffff']];
 const validPaletteColor=value=>typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value);
 function applyPalette(){
  const root=document.documentElement,night=root.dataset.theme==='dark';
  for(const [css,key,fallback] of paletteFields){
   if(night)root.style.removeProperty(css);
   else root.style.setProperty(css,validPaletteColor(latestAppearance[key])?latestAppearance[key]:fallback);
  }
 }
 window.addEventListener('svitlo:theme-change',applyPalette);
 function applySite(site){
  const flags=site?.flags||{},links=site?.links||{},banner=site?.banner||{};
  const appearance=site?.appearance||{};
  latestAppearance=appearance;
  applyPalette();
  document.documentElement.dataset.siteDensity=appearance.density==='compact'?'compact':'comfortable';
  document.documentElement.dataset.siteRounded=appearance.rounded===false?'false':'true';
  const featureKeys=["inbox","inboxFilters","inboxHistory","sharing","sharePreview","copySchedule","help","feedback","addressSearch","pushPrompt","pushSettings","tomorrowPreview","quickAddresses","homePlaces","dailyStats","overviewTimeline","statusCountdown","weekNavigation","dayStats","scheduleLegend","offlineStatus","scheduleSource","manualRefresh","homeQuickActions","animations","quickQueueLookup","nextChangeCard","dayShortcuts","detailSourceLink","hourlyLabels","inboxMarkAll","inboxClearRead","appUpdateCheck","editAddressFromGraph","syncStatus","settingsFooter","tomorrowOpenShortcut","scheduleOpenShortcut"];
  for(const key of featureKeys)document.documentElement.classList.toggle('feature-off-'+key,flags[key]===false);
  document.documentElement.dataset.featureConfigLoaded='true';
  const hideInbox=flags.inbox===false,hideShare=flags.sharing===false,hideHelp=flags.help===false;
  document.querySelectorAll('[data-go="updates"]').forEach(button=>{button.hidden=hideInbox});
  // Disabling Inbox while it is open must return the user to an enabled tab.
  if(hideInbox&&document.getElementById('updates')?.hidden===false){
   document.querySelector('[data-go="home"]')?.click();
  }
  ['shareToday','shareDetail'].forEach(id=>setVisible($(id),!hideShare));
  for(const anchor of document.querySelectorAll('a[href*="help.html"],a[data-managed-link="help"]')){
   anchor.dataset.managedLink='help';
   anchor.href=safePublicLink(links.help,'./help.html?from=settings');anchor.hidden=hideHelp;
  }
  for(const anchor of document.querySelectorAll('a[href*="feedback.html"],a[data-managed-link="feedback"]')){
   anchor.dataset.managedLink='feedback';
   anchor.href=safePublicLink(links.feedback,'./feedback.html?from=settings');
  }
  for(const anchor of document.querySelectorAll('a[href*="cherkasyoblenergo.com/news"]')){
   if(anchor.id==='articleLink')continue;
   anchor.href=safePublicLink(links.official,'https://www.cherkasyoblenergo.com/news');
  }
  systemBanner.replaceChildren();
  systemBanner.hidden=banner.enabled!==true;
  if(banner.enabled===true){
   const info=document.createElement('span');info.className='managed-banner-text';
   const title=document.createElement('strong');title.textContent=banner.title||'Повідомлення';
   const desc=document.createElement('small');desc.textContent=banner.body||'';
   info.append(title,desc);systemBanner.append(info);
   const target=safePublicLink(banner.url);
   if(target){const a=document.createElement('a');a.href=target;a.textContent=banner.button||'Детальніше';systemBanner.append(a)}
  }
 }
 function applyLimitedModules(m,active){
  const disabled=active&&m?.mode==='limited'?(m.disabledModules||[]):[];
  const summary=[];
  if(disabled.includes('inbox')){
   document.querySelectorAll('[data-go="updates"]').forEach(button=>button.disabled=true);
   summary.push('«Вхідні»');
  }else document.querySelectorAll('[data-go="updates"]').forEach(button=>button.disabled=false);
  if(disabled.includes('address-search')){
   for(const id of ['addFromHome','addFromSettings','sheetAddPlace'])if($(id))$(id).disabled=true;
   summary.push('пошук адрес');
  }else for(const id of ['addFromHome','addFromSettings','sheetAddPlace'])if($(id))$(id).disabled=false;
  if(disabled.includes('help')){
   document.querySelectorAll('a[data-managed-link="help"]').forEach(a=>a.hidden=true);
   summary.push('допомогу');
  }
  const limited=[
   ['sharing',['shareToday','shareDetail'],'поширення графіка'],
   ['push-settings',['enableNotifications','disableNotifications'],'налаштування Push'],
   ['manual-refresh',['syncNow','refreshDetail','manualRefresh'],'ручне оновлення'],
   ['copy-schedule',['copyToday'],'копіювання годин']
  ];
  for(const [module,ids,label] of limited){
   const paused=disabled.includes(module);
   for(const id of ids)if($(id))$(id).disabled=paused;
   if(paused)summary.push(label);
  }
  const quick=$('homeQuickPlaces');
  if(quick){
   quick.hidden=disabled.includes('quick-addresses')||quick.children.length===0;
   if(disabled.includes('quick-addresses'))summary.push('швидкі адреси');
  }
  for(const anchor of document.querySelectorAll('a[data-managed-link="feedback"]'))
   anchor.hidden=disabled.includes('feedback')||lastConfig?.site?.flags?.feedback===false;
  if(disabled.includes('feedback'))summary.push('звернення');
  moduleBanner.hidden=!summary.length;
  moduleBanner.textContent=summary.length?'🛠️ Тимчасово призупинено: '+summary.join(', ')+'.':'';
 }

 function timed(m){
  const now=Date.now();return m?.enabled===true&&(!m.startsAt||Date.parse(m.startsAt)<=now)&&(!m.until||Date.parse(m.until)>now);
 }
 function updateEta(m){
  const label=$('maintenanceTimeLabel'),value=$('maintenanceEta');
  if(!label||!value)return;
  const when=Date.parse(m?.until||'');
  if(!Number.isFinite(when)||when<=Date.now()){
   label.textContent='Час завершення';
   value.textContent='Поки невідомий';
   return;
  }
  label.textContent='Орієнтовне завершення';
  value.textContent=new Intl.DateTimeFormat('uk-UA',{
   day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'
  }).format(new Date(when));
 }
 function finishMaintenanceClose(){
  clearTimeout(maintenanceExitTimer);maintenanceExitTimer=null;
  overlay.hidden=true;overlay.classList.remove('maintenance-leaving');
  document.body.classList.remove('svitlo-maintenance-active');
  if(maintenanceFocus?.isConnected){
   try{maintenanceFocus.focus({preventScroll:true})}catch{}
  }
  maintenanceFocus=null;
 }
 // Read-only mini schedule. Remains usable while the main PWA is inert.
 let backupSnapshot=null,backupFetchedAt=0,backupPromise=null;
 const backupSelect=$('maintenanceBackupPlace');
 const backupLocal=()=>{
  try{const v=JSON.parse(localStorage.getItem('svitlo-offline-schedule-v74')||'null');return Array.isArray(v?.days)?v:null}catch{return null}
 };
 const backupPlaces=()=>{
  try{const list=JSON.parse(localStorage.getItem('svitlo-addresses-v6')||'[]');
   return Array.isArray(list)?list.filter(a=>a&&/^([1-6])\\.[12]$/.test(a.queue||'')).slice(0,30):[]}
  catch{return []}
 };
 function drawBackup(){
  const host=$('maintenanceBackup');if(!host||overlay.hidden)return;
  const places=backupPlaces(),previous=backupSelect.value;
  backupSelect.replaceChildren();
  for(const [i,a] of places.entries())backupSelect.add(new Option(
   (a.nickname||[a.street,a.house].filter(Boolean).join(', ')||a.settlement||'Місце')+' · '+a.queue,String(i)));
  backupSelect.value=places[Number(previous)]?previous:'0';
  backupSelect.hidden=!places.length;
  $('maintenanceBackupPlaceLabel').hidden=!places.length;
  const bars=$('maintenanceBackupBars'),note=$('maintenanceBackupText'),date=$('maintenanceBackupDate');
  bars.replaceChildren();
  if(!places.length){date.textContent='';note.textContent='Після завершення техробіт додайте адресу, щоб переглядати тут її графік.';return}
  const a=places[Number(backupSelect.value)||0],snapshot=backupSnapshot||backupLocal();
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const today=parts.year+'-'+parts.month+'-'+parts.day;
  date.textContent='Сьогодні · '+today+' · Підчерга '+a.queue;
  const day=snapshot?.days?.find(d=>d.date===today&&d.verified===true),item=day?.queues?.[a.queue];
  const checked=Date.parse(snapshot?.lastChecked||''),fresh=Number.isFinite(checked)&&Date.now()-checked<55*60_000;
  const absent=!day&&fresh&&snapshot?.confirmedNoScheduleDates?.includes(today);
  if(!Array.isArray(item?.off)&&!absent){
   note.textContent='Для цієї підчерги немає підтвердженого розкладу. Спробуйте перевірити офіційний графік.';
   return;
  }
  const toMinute=t=>t==='24:00'?1440:/^\\d{2}:\\d{2}$/.test(t||'')?Number(t.slice(0,2))*60+Number(t.slice(3)):-1;
  const off=Array.isArray(item?.off)?item.off.map(v=>[toMinute(v[0]),toMinute(v[1])]).filter(v=>v[0]>=0&&v[1]>v[0]&&v[1]<=1440):[];
  const known=toMinute(item?.knownFrom||'00:00');
  for(let i=0;i<48;i++){
   const start=i*30;
   const unknown=known>=0&&start<known,cut=off.some(([a,b])=>start<b&&start+30>a);
   const el=document.createElement('span');el.className=unknown?'unknown':cut?'off':'on';
   el.title=(String(Math.floor(start/60)).padStart(2,'0')+':'+String(start%60).padStart(2,'0'))+
    (unknown?' · без даних':cut?' · планове відключення':' · світло є');
   bars.append(el);
  }
  const fmt=n=>n===1440?'24:00':String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  note.textContent=absent?'За останньою перевіркою графік планових відключень не опубліковано.':
   off.length?'За графіком без світла: '+off.map(([a,b])=>fmt(a)+'–'+fmt(b)).join(', '):
   'За опублікованим графіком планових відключень немає.';
  if(!fresh)note.textContent+=' Дані можуть бути застарілими.';
 }
 async function refreshBackup(){
  if(overlay.hidden)return;
  drawBackup();
  if(!apiBase||backupPromise||Date.now()-backupFetchedAt<60_000)return;
  backupFetchedAt=Date.now();
  backupPromise=fetch(apiBase+'/api/data/schedules.json',{cache:'no-store',signal:AbortSignal.timeout(7000)})
   .then(r=>{if(!r.ok)throw Error('Schedule HTTP '+r.status);return r.json()})
   .then(data=>{if(Array.isArray(data?.days)){backupSnapshot=data;drawBackup()}})
   .catch(error=>console.warn('Backup schedule:',error.message))
   .finally(()=>{backupPromise=null});
  await backupPromise;
 }
 backupSelect?.addEventListener('change',drawBackup);
 function setMaintenanceVisible(visible){
  if(visible){
   if(maintenanceExitTimer){clearTimeout(maintenanceExitTimer);maintenanceExitTimer=null}
   overlay.classList.remove('maintenance-leaving');
   if(overlay.hidden){
    maintenanceFocus=document.activeElement;
    overlay.hidden=false;
    backupFetchedAt=0;backupSnapshot=null;void refreshBackup();
    document.body.classList.add('svitlo-maintenance-active');
    // Announce the screen without scrolling the page behind it.
    $('maintenanceRefresh')?.focus({preventScroll:true});
   }
  }else if(!overlay.hidden){
   const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches||
    document.documentElement.classList.contains('feature-off-animations');
   if(reduce){finishMaintenanceClose();return}
   if(!maintenanceExitTimer){
    overlay.classList.add('maintenance-leaving');
    maintenanceExitTimer=setTimeout(finishMaintenanceClose,380);
   }
  }
 }
 const defaultSymbol=()=> {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');
  svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-3-3 3-3Z');
  svg.append(path);return svg;
 };
 function paintMaintenanceSymbol(m){
  if(!symbol)return;
  const image=typeof m.imageUrl==='string'&&/^https:\/\//.test(m.imageUrl)?m.imageUrl:'';
  const icon=String(m.icon||'').slice(0,18);
  const key=image?'url:'+image:icon&&icon!=='✨'?'icon:'+icon:'default-svg';
  if(symbol.dataset.graphic===key)return;
  symbol.dataset.graphic=key;symbol.replaceChildren();
  if(image){
   const img=document.createElement('img');img.src=image;img.alt='';img.decoding='async';
   img.onerror=()=>{if(symbol.dataset.graphic===key){symbol.dataset.graphic='fallback';symbol.replaceChildren(defaultSymbol())}};
   symbol.append(img);
  }else if(icon&&icon!=='✨')symbol.textContent=icon;
  else symbol.append(defaultSymbol());
 }
 function display(data,{offline=false}={}){
  const m=data?.maintenance||{},active=!offline&&timed(m),full=active&&m.mode!=='limited';
  lastPhase=offline?'offline':active?'active':m?.enabled&&m.startsAt&&Date.parse(m.startsAt)>Date.now()?'planned':'idle';
  if(offline)finishMaintenanceClose();else setMaintenanceVisible(full);
  banner.hidden=!(active&&!full);
  for(const part of [document.getElementById('installLanding'),viewport,document.querySelector('.bottom-nav')])if(part)part.inert=full;
  const modeLabel=$('maintenanceModeLabel');
  if(modeLabel)modeLabel.textContent=m.mode==='incident'?'Термінове повідомлення':'Тимчасово недоступно';
  const activity=$('maintenanceActivityText');
  if(activity)activity.textContent=m.mode==='incident'?'Працюємо над вирішенням ситуації':'Працюємо над відновленням доступу';
  const official=overlay.querySelector('.maintenance-official');
  if(official)official.href=safePublicLink(data?.site?.links?.official,'https://www.cherkasyoblenergo.com/off');
  $('maintenanceTitle').textContent=m.title||'Технічні роботи';
  $('maintenanceMessage').textContent=m.message||'Незабаром повернемося.';
  overlay.dataset.theme=['blue','midnight','light','violet','custom'].includes(m.theme)?m.theme:'blue';
  overlay.dataset.mode=m.mode==='incident'?'incident':m.mode==='limited'?'limited':'full';
  overlay.dataset.layout=['centered','compact','split'].includes(m.layout)?m.layout:'centered';
  const eyebrow=overlay.querySelector('.maintenance-kicker');
  if(eyebrow)eyebrow.textContent=m.mode==='incident'?'ВАЖЛИВЕ ПОВІДОМЛЕННЯ':'СВІТЛО ЧЕРКАСИ';
  if(m.theme==='custom'&&m.colors){
   for(const [prop,key] of [['--maintenance-bg','background'],['--maintenance-fg','foreground'],['--maintenance-accent','accent']]){
    const value=m.colors[key];if(typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value))overlay.style.setProperty(prop,value);
   }
  }
  if(!offline){applySite(data.site);applyLimitedModules(m,active)}
  paintMaintenanceSymbol(m);
  updateEta(m);
  const planned=m?.enabled===true&&m.noticeBefore!==false&&m.startsAt
   &&Number.isFinite(Date.parse(m.startsAt))&&Date.parse(m.startsAt)>Date.now();
  if((active&&!full)||planned){
   const config=m.plannedBanner||{};
   for(const [prop,key] of [['--planned-bg','background'],['--planned-ink','foreground'],['--planned-accent','accent']]){
    const value=config[key];if(planned&&typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value))banner.style.setProperty(prop,value);
    else banner.style.removeProperty(prop);
   }
   banner.hidden=false;
   banner.className='maintenance-inline'+(planned?' is-planned planned-'+(['expanded','compact','highlight'].includes(config.style)?config.style:'expanded'):' is-active');
   banner.replaceChildren();
   const artwork=document.createElement('span');artwork.className='maintenance-inline-icon';artwork.textContent=String(m.icon||'🛠️').slice(0,18);
   const content=document.createElement('div');content.className='maintenance-inline-content';
   const eyebrow=document.createElement('small');eyebrow.className='maintenance-inline-eyebrow';eyebrow.textContent=planned?'ЗАПЛАНОВАНІ РОБОТИ':'ТИМЧАСОВЕ ОБМЕЖЕННЯ';
   const heading=document.createElement('strong');heading.className='maintenance-inline-title';
   heading.textContent=planned?(config.title||'Заплановані технічні роботи'):(m.title||'Технічні роботи');
   const summary=document.createElement('p');summary.className='maintenance-inline-summary';
   summary.textContent=planned?(config.body||m.message||'У цей час застосунок може тимчасово не працювати.'):(m.message||'Деякі функції тимчасово недоступні.');
   content.append(eyebrow,heading,summary);
   if(planned){
    const format=d=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).format(new Date(d));
    const dates=document.createElement('div');dates.className='maintenance-inline-dates';
    const starts=document.createElement('span');starts.textContent='Початок: '+format(m.startsAt);dates.append(starts);
    if(config.showEnd!==false&&m.until&&Date.parse(m.until)>Date.now()){
     const ends=document.createElement('span');ends.textContent='Орієнтовне завершення: '+format(m.until);dates.append(ends);
    }
    content.append(dates);
    if(config.showCountdown!==false){
     const countdown=document.createElement('span');countdown.className='maintenance-inline-countdown';
     countdown.dataset.maintenanceStart=m.startsAt;content.append(countdown);
    }
   }
   const url=safePublicLink(planned?config.url:'',data?.site?.links?.official||'https://www.cherkasyoblenergo.com/news');
   if(url&&(!planned||config.showButton!==false)){
    const action=document.createElement('a');action.className='maintenance-inline-action';action.href=url;
    action.textContent=planned?(config.button||'Офіційні графіки'):'Офіційні графіки';
    if(!url.startsWith('./')){action.target='_blank';action.rel='noopener noreferrer'}
    content.append(action);
   }
   banner.append(artwork,content);
  }else banner.className='maintenance-inline';

  if(!offline){
   // EVERY successful server snapshot must reach Inbox, including the empty list.
   // On iPhone the first event can fire before inbox-ui.js loads. It must also
   // be available as an immediately readable state on window.
   window.SvitloPublicConfig={announcements:Array.isArray(data.announcements)?data.announcements:[],
    maintenance:active,site:data.site||null,updatedAt:data.updatedAt||null,serverVerified:true};
   window.dispatchEvent(new CustomEvent('svitlo:public-config',{detail:window.SvitloPublicConfig}));
  }
 }
 function connectLive(){
  if(live||!apiBase||!('EventSource' in window))return;
  try {
   live=new EventSource(apiBase+'/api/events');
   live.addEventListener('config',()=>refresh());
   live.addEventListener('schedules',()=>window.dispatchEvent(new Event('svitlo:live-schedules')));
   live.addEventListener('open',()=>{if(!document.hidden)refresh()});
  }catch(error){console.warn('Live updates unavailable:',error.message);live=null}
 }
 function updatePlannedCountdown(){
  const el=banner.querySelector('[data-maintenance-start]');
  if(!el)return;
  const distance=Date.parse(el.dataset.maintenanceStart)-Date.now();
  if(distance<=0){el.textContent='Роботи розпочинаються';return}
  const mins=Math.ceil(distance/60000),days=Math.floor(mins/1440),hrs=Math.floor(mins%1440/60),left=mins%60;
  el.textContent=days>0?'До початку: '+days+' дн. '+hrs+' год.':hrs>0?'До початку: '+hrs+' год. '+left+' хв.':'До початку: '+mins+' хв.';
 }
 async function refresh({manual=false}={}){
  if(busy){pendingRefresh=true;return false}busy=true;
  const button=$('maintenanceRefresh'),status=$('maintenanceCheckStatus');
  if(manual){
   button.disabled=true;button.classList.add('is-checking');
   status.textContent='Перевіряємо доступність сервісу…';
  }
  let success=false;
  try{
   if(!apiBase){const res=await fetch('./push-config.json',{cache:'no-store'});if(!res.ok)throw Error('Config unavailable');
    const cfg=await res.json();if(!/^https:\/\//.test(cfg.apiBase||''))throw Error('Server unavailable');
    apiBase=cfg.apiBase.replace(/\/$/,'');
   }
   const response=await fetch(apiBase+'/api/app-config',{cache:'no-store',signal:AbortSignal.timeout(9000)});
   if(!response.ok)throw Error('Public config HTTP '+response.status);
   const data=await response.json();lastConfig=data;display(data);connectLive();updatePlannedCountdown();if(!overlay.hidden)void refreshBackup();
   success=true;
   if(manual&&status)status.textContent=!timed(data.maintenance)||data.maintenance?.mode==='limited'?'Доступ до застосунку відновлюється.':'Роботи ще тривають. Перевірка успішна.';
  }catch(e){
   // A temporary network outage must never trap users behind stale maintenance.
   if(lastConfig)display(lastConfig,{offline:true});
   else{finishMaintenanceClose();banner.hidden=true}
   if(manual&&status)status.textContent='Не вдалося отримати статус. Перевірте з’єднання та спробуйте ще раз.';
   console.warn('App controls:',e.message);
  }finally{
   busy=false;
   if(manual){button.disabled=false;button.classList.remove('is-checking')}
   if(pendingRefresh){pendingRefresh=false;queueMicrotask(()=>refresh())}
  }
  return success;
 }
 $('maintenanceRefresh').addEventListener('click',()=>refresh({manual:true}));
 refresh();setInterval(()=>{if(!document.hidden)refresh()},12000);
 setInterval(()=>{if(!document.hidden&&lastConfig?.maintenance){
  const m=lastConfig.maintenance,phase=timed(m)?'active':m?.enabled&&m.startsAt&&Date.parse(m.startsAt)>Date.now()?'planned':'idle';
  if(phase!==lastPhase)display(lastConfig);
  updateEta(m);updatePlannedCountdown();
 }},1000);
 try{const channel=new BroadcastChannel('svitlo-content-v1');
  channel.addEventListener('message',event=>{if(event.data?.type==='REFRESH_APP_CONFIG')refresh()});
  window.addEventListener('pagehide',()=>channel.close(),{once:true});
 }catch{}
 window.SvitloControls={refresh};
 window.addEventListener('svitlo:refresh-content',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 window.addEventListener('online',refresh);
  window.addEventListener('pagehide',()=>live?.close(),{once:true});
})();
