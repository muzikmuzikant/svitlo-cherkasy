/* Public maintenance & announcements. Server configuration is authoritative.
 * Full/incident mode can hide the PWA; limited mode shows a non-blocking banner.
 */
(()=>{'use strict';
 const overlay=document.getElementById('maintenanceScreen');if(!overlay)return;
 const $=id=>document.getElementById(id),viewport=document.querySelector('.viewport');
 let apiBase='',busy=false,lastConfig=null;
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
 function applySite(site){
  const flags=site?.flags||{},links=site?.links||{},banner=site?.banner||{};
  const featureKeys=["inbox","inboxFilters","inboxHistory","sharing","sharePreview","copySchedule","help","feedback","addressSearch","pushPrompt","pushSettings","tomorrowPreview","quickAddresses","homePlaces","dailyStats","overviewTimeline","statusCountdown","weekNavigation","dayStats","scheduleLegend","offlineStatus","scheduleSource","manualRefresh","homeQuickActions","animations"];
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
  moduleBanner.hidden=!summary.length;
  moduleBanner.textContent=summary.length?'🛠️ Тимчасово призупинено: '+summary.join(', ')+'.':'';
 }

 function timed(m){
  const now=Date.now();return m?.enabled===true&&(!m.startsAt||Date.parse(m.startsAt)<=now)&&(!m.until||Date.parse(m.until)>now);
 }
 function updateEta(m){
  const el=$('maintenanceEta');if(!el)return;
  const remaining=Date.parse(m?.until||'')-Date.now();
  if(!(remaining>0)){el.textContent='';return}
  const seconds=Math.ceil(remaining/1000),hours=Math.floor(seconds/3600),
   minutes=Math.floor(seconds%3600/60),secs=seconds%60;
  el.textContent='До орієнтовного завершення '+String(hours).padStart(2,'0')+':'+
   String(minutes).padStart(2,'0')+':'+String(secs).padStart(2,'0');
 }
 function display(data,{offline=false}={}){
  const m=data?.maintenance||{},active=!offline&&timed(m),full=active&&m.mode!=='limited';
  overlay.hidden=!full;banner.hidden=!(active&&!full);
  for(const part of [document.getElementById('installLanding'),viewport])if(part)part.inert=full;
  $('maintenanceTitle').textContent=m.title||'Технічні роботи';
  $('maintenanceMessage').textContent=m.message||'Незабаром повернемося.';
  overlay.dataset.theme=['blue','midnight','light','violet','custom'].includes(m.theme)?m.theme:'blue';
  overlay.dataset.mode=m.mode==='incident'?'incident':m.mode==='limited'?'limited':'full';
  const eyebrow=overlay.querySelector('.maintenance-kicker');
  if(eyebrow)eyebrow.textContent=m.mode==='incident'?'ВАЖЛИВЕ ПОВІДОМЛЕННЯ':'СВІТЛО ЧЕРКАСИ';
  if(m.theme==='custom'&&m.colors){
   for(const [prop,key] of [['--maintenance-bg','background'],['--maintenance-fg','foreground'],['--maintenance-accent','accent']]){
    const value=m.colors[key];if(typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value))overlay.style.setProperty(prop,value);
   }
  }
  if(!offline){applySite(data.site);applyLimitedModules(m,active)}
  if(symbol){symbol.replaceChildren();
   if(typeof m.imageUrl==='string'&&/^https:\/\//.test(m.imageUrl)){
    const img=document.createElement('img');img.src=m.imageUrl;img.alt='Ілюстрація техробіт';symbol.append(img);
   }else symbol.textContent=String(m.icon||'✨').slice(0,18);
  }
  updateEta(m);
  const planned=m?.enabled===true&&m.noticeBefore!==false&&m.startsAt
   &&Number.isFinite(Date.parse(m.startsAt))&&Date.parse(m.startsAt)>Date.now();
  if((active&&!full)||planned){banner.hidden=false;
   banner.replaceChildren();
   const icon=document.createElement('strong');icon.textContent=String(m.icon||'🛠️').slice(0,18);
   const text=document.createElement('span');
   text.textContent=planned?('Планові роботи: '+(m.title||'Технічні роботи')+'. Початок: '+
    new Date(m.startsAt).toLocaleString('uk-UA',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Kyiv'})):
    ((m.title||'Технічні роботи')+'. '+(m.message||'Деякі функції можуть бути тимчасово недоступні.'));
   banner.append(icon,text);
  }
  if(!offline){
   // EVERY successful server snapshot must reach Inbox, including the empty list.
   // On iPhone the first event can fire before inbox-ui.js loads. It must also
   // be available as an immediately readable state on window.
   window.SvitloPublicConfig={announcements:Array.isArray(data.announcements)?data.announcements:[],
    maintenance:active,site:data.site||null,updatedAt:data.updatedAt||null,serverVerified:true};
   window.dispatchEvent(new CustomEvent('svitlo:public-config',{detail:window.SvitloPublicConfig}));
  }
 }
 async function refresh(){
  if(busy)return;busy=true;
  try{
   if(!apiBase){const res=await fetch('./push-config.json',{cache:'no-store'});if(!res.ok)throw Error('Config unavailable');
    const cfg=await res.json();if(!/^https:\/\//.test(cfg.apiBase||''))throw Error('Server unavailable');
    apiBase=cfg.apiBase.replace(/\/$/,'');
   }
   const response=await fetch(apiBase+'/api/app-config',{cache:'no-store',signal:AbortSignal.timeout(9000)});
   if(!response.ok)throw Error('Public config HTTP '+response.status);
   const data=await response.json();lastConfig=data;display(data);
  }catch(e){
   // A temporary network outage must never trap users behind stale maintenance.
   if(lastConfig)display(lastConfig,{offline:true});
   else{overlay.hidden=true;banner.hidden=true}
   console.warn('App controls:',e.message);
  }finally{busy=false}
 }
 refresh();setInterval(()=>{if(!document.hidden)refresh()},12000);
 setInterval(()=>{if(!document.hidden&&lastConfig?.maintenance)updateEta(lastConfig.maintenance)},1000);
 try{const channel=new BroadcastChannel('svitlo-content-v1');
  channel.addEventListener('message',event=>{if(event.data?.type==='REFRESH_APP_CONFIG')refresh()});
  window.addEventListener('pagehide',()=>channel.close(),{once:true});
 }catch{}
 window.SvitloControls={refresh};
 window.addEventListener('svitlo:refresh-content',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 window.addEventListener('online',refresh);
})();
