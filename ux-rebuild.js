/* Structural PWA refresh: preserve live controls while changing page navigation.
 * Never create alternative schedule, consent or Push state. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const node=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('feature-off-animations');
 const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
 const back='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
 const icons={
  places:'<path d="M12 21s7-5.3 7-12a7 7 0 1 0-14 0c0 6.7 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  push:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  appearance:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z"/>',
  app:'<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10 17h4"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01"/>',
  privacy:'<path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-4"/>'
 };
 function icon(key){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[key]+'</svg>'}
 function appendIf(target,...ids){for(const id of ids){const n=typeof id==='string'?$(id):id;if(n)target.append(n)}}
 function rebuildSettings(){
  const root=$('settings');if(!root||root.classList.contains('settings-ios'))return;
  const support=$('settingsSupportBlock')?.nextElementSibling;
  const appearance=$('settingsAppearance')?.nextElementSibling;
  const offline=$('settingsOfflineBlock')?.nextElementSibling;
  const foot=root.querySelector('.settings-foot');
  const social=$('svitloSocialSettings');
  const oldHeader=root.querySelector('.screen-header');
  // Capture existing live DOM nodes, not their HTML strings. All listeners and IDs survive.
  const zones={
   places:[$('settingsPlacesPanel'),$('addFromSettings')],
   push:[$('settingsPushBlock')],
   appearance:[appearance],
   app:[$('manualRefresh'),$('checkAppUpdate'),offline],
   help:[support,social],
   privacy:[$('analyticsSettings')]
  };
  const titles={
   places:['Мої місця','Адреси та основне місце'],
   push:['Сповіщення','Push та типи повідомлень'],
   appearance:['Оформлення','Тема застосунку'],
   app:['Застосунок','Оновлення та офлайн'],
   help:['Допомога','Підтримка та поширення'],
   privacy:['Приватність','Згода та використання даних']
  };
  // The original settings section remains a regular tab for app.js.
  const hub=node('div','ios-settings-hub');hub.id='settingsNavHub';
  hub.append(node('h1','ios-settings-title','Налаштування'));
  const caption=node('p','ios-settings-caption','Особисті параметри застосунку');hub.append(caption);
  const pages=new Map();
  for(const [i,keys] of [['addresses',['places','push','appearance']],['other',['app','help','privacy']]]){
   const group=node('div','ios-settings-group');group.dataset.group=i;
   for(const key of keys){
    const button=node('button','ios-settings-row');button.type='button';button.dataset.settingsPage=key;
    button.innerHTML='<span class="ios-settings-icon ios-settings-icon-'+key+'">'+icon(key)+'</span><span class="ios-settings-copy"><strong>'+titles[key][0]+'</strong><small>'+titles[key][1]+'</small></span><span class="ios-settings-chevron">'+arrow+'</span>';
    group.append(button);
   }
   hub.append(group);
  }
  const subview=node('div','ios-settings-subview');subview.id='settingsSubView';subview.hidden=true;
  for(const key of Object.keys(titles)){
   const page=node('section','ios-settings-page');page.dataset.settingsPanel=key;page.hidden=true;
   const header=node('header','ios-settings-page-head');
   const backButton=node('button','ios-settings-back');backButton.type='button';backButton.setAttribute('aria-label','Назад до налаштувань');backButton.innerHTML=back+'<span>Налаштування</span>';
   backButton.onclick=()=>goBack();
   header.append(backButton,node('h2','',titles[key][0]));page.append(header);
   const content=node('div','ios-settings-page-content');
   for(const item of zones[key])if(item)content.append(item);
   if(key==='places'){
    const info=node('p','ios-settings-footnote','Тут можна змінювати адреси, обирати основну та додавати нові.');
    content.append(info);
   }
   if(key==='privacy'){
    const links=node('div','ios-settings-group ios-settings-links');
    for(const [href,txt] of [['./privacy.html','Політика конфіденційності'],['./terms.html','Умови користування'],['./about.html','Джерела інформації']]){
     const a=node('a','ios-settings-row',txt);a.href=href;a.innerHTML='<span class="ios-settings-copy"><strong>'+txt+'</strong></span><span class="ios-settings-chevron">'+arrow+'</span>';links.append(a);
    }
    content.append(links);
   }
   page.append(content);subview.append(page);pages.set(key,page);
  }
  root.replaceChildren(hub,subview);
  if(foot){foot.classList.add('ios-settings-foot');hub.append(foot)}
  root.classList.add('settings-ios');
  let current=null,previousScroll=0;
  function show(key,writeHistory){
   if(key!==null&&!pages.has(key))return;
   if(key===current)return;
   const opening=key!==null;
   if(opening&&!current)previousScroll=window.scrollY;
   current=key;
   hub.hidden=opening;subview.hidden=!opening;
   for(const [name,page] of pages)page.hidden=name!==key;
   if(opening){
    subview.classList.remove('ios-reverse');
    if(!reduced()){subview.classList.remove('ios-animate');void subview.offsetWidth;subview.classList.add('ios-animate')}
    window.scrollTo({top:0,behavior:'instant'});
    if(writeHistory)try{history.pushState({...history.state,svitloTab:'settings',svitloSettingsPage:key},'',location.href)}catch{}
   }else{
    subview.classList.remove('ios-animate');
    hub.classList.remove('ios-return');if(!reduced()){void hub.offsetWidth;hub.classList.add('ios-return')}
    if(!root.hidden)window.scrollTo({top:previousScroll,behavior:'instant'});
   }
  }
  function goBack(){
   if(!current)return;
   if(history.state?.svitloSettingsPage===current&&history.state?.svitloTab==='settings')history.back();
   else show(null,false);
  }
  hub.addEventListener('click',e=>{const b=e.target.closest('[data-settings-page]');if(b)show(b.dataset.settingsPage,true)});
  window.addEventListener('popstate',e=>{
   const target=e.state?.svitloTab==='settings'?e.state?.svitloSettingsPage:null;
   show(pages.has(target)?target:null,false);
  });
  document.querySelectorAll('.bottom-nav [data-go]').forEach(b=>b.addEventListener('click',()=>{
   if(b.dataset.go!=='settings'||current)show(null,false);
  }));
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&current){e.preventDefault();goBack()}});
  let x=0,y=0,swiping=false;
  subview.addEventListener('touchstart',e=>{if(!current||!e.touches.length)return;const t=e.touches[0];swiping=t.clientX<32;x=t.clientX;y=t.clientY},{passive:true});
  subview.addEventListener('touchend',e=>{if(!swiping||!e.changedTouches.length)return;const t=e.changedTouches[0];swiping=false;if(t.clientX-x>78&&Math.abs(t.clientY-y)<65)goBack()},{passive:true});
  const count=$('settingsPlacesCount');
  if(count){const summary=hub.querySelector('[data-settings-page="places"] small');const refresh=()=>{if(summary)summary.textContent=count.textContent?.split(' · ')[0]||titles.places[1]};new MutationObserver(refresh).observe(count,{subtree:true,childList:true,characterData:true});refresh()}
  const push=$('pushHeadline');
  if(push){const summary=hub.querySelector('[data-settings-page="push"] small');const refresh=()=>{if(summary)summary.textContent='Push: '+push.textContent};new MutationObserver(refresh).observe(push,{subtree:true,childList:true,characterData:true});refresh()}
 }
 function rebuildHome(){
  const home=$('home'),panel=$('heroStatus'),overview=home?.querySelector('.overview-card');
  if(!home||!panel||!overview||home.classList.contains('home-rebuilt'))return;
  const focus=node('div','home-focus');
  home.insertBefore(focus,home.querySelector('.primary-picker'));
  appendIf(focus,home.querySelector('.primary-picker'),'homeQuickPlaces','dataFreshness',panel);
  panel.append(overview);
  appendIf(focus,'homeOfflineReady','emergencyBanner');
  const next=node('section','home-whats-next');next.append(node('span','home-next-eyebrow','НАСТУПНА ПОДІЯ'),node('h2','','Що далі?'));
  appendIf(next,'heroCountdown');focus.append(next);
  appendIf(focus,'pushInvite');
  const week=node('section','home-week');
  const head=node('div','home-week-head');head.append(node('div','home-week-titles'));
  head.firstChild.append(node('span','home-week-label','ПЕРЕГЛЯД'),node('h2','','Цей тиждень'));
  const detail=$('openDetail');if(detail){detail.textContent='Повний графік';head.append(detail)}
  week.append(head);
  const days=node('div','home-week-days');days.id='homeWeekDays';days.setAttribute('aria-label','Графік за днями тижня');week.append(days);
  const all=$('allQueuesHomeOpen');if(all)week.append(all);
  const tomorrow=home.querySelector('.tomorrow-preview');
  if(tomorrow){const more=node('details','home-tomorrow-more');more.append(node('summary','','Прогноз на завтра'),tomorrow);week.append(more)}
  focus.after(week);
  const saved=home.querySelector('.home-places-head'),list=$('placeList');
  if(saved&&list){
   const places=node('details','home-saved-places');places.append(node('summary','','Мої місця'),saved,list);
   week.after(places);
  }
  const ad=$('betaAd');
  if(ad){const slot=node('section','home-ad-zone');slot.append(node('h2','','Реклама'),ad);(home.querySelector('.home-saved-places')||week).after(slot)}
  const stats=home.querySelector('.stats-row');if(stats){stats.hidden=true;stats.setAttribute('inert','')}
  home.classList.add('home-rebuilt');
  const names=['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
  let rendered='';
  function paintWeek(){
   const api=window.SvitloAllQueuesSource,math=window.SvitloAllQueuesMath;if(!api||!math)return;
   const dates=api.dates(),today=api.today(),queue=($('queueChip')?.textContent||'').match(/[1-6]\.[12]/)?.[0];
   const key=JSON.stringify([dates,queue,dates.map(d=>queue?math.allDaySegments(api.timeline(d,queue)):[])]);
   if(key===rendered)return;rendered=key;days.replaceChildren();
   for(const date of dates){
    const weekday=names[new Date(date+'T12:00:00Z').getUTCDay()];
    const parts=queue?math.allDaySegments(api.timeline(date,queue)):[{state:-1,start:0,end:1440}];
    const off=parts.reduce((v,p)=>v+(p.state===1?p.end-p.start:0),0),unknown=parts.some(p=>p.state===-1);
    const btn=node('button','home-week-day'+(date===today?' is-today':''));btn.type='button';
    btn.setAttribute('aria-label',weekday+', '+date+'. '+(unknown?'Графік не підтверджено':off?'Без світла '+Math.round(off/60*10)/10+' год':'Світло весь день'));
    btn.innerHTML='<strong>'+weekday+'</strong><span class="home-week-indicator '+(unknown?'is-unknown':off?'has-outage':'has-light')+'"></span><small>'+(unknown?'?':off?(off/60).toLocaleString('uk-UA',{maximumFractionDigits:1})+'г':'0г')+'</small>';
    btn.onclick=()=>window.dispatchEvent(new CustomEvent('svitlo:open-schedule',{detail:{date}}));
    days.append(btn);
   }
  }
  const observer=new MutationObserver(()=>requestAnimationFrame(paintWeek));
  for(const id of ['queueChip','overviewBar']){const el=$(id);if(el)observer.observe(el,{childList:true,subtree:true,characterData:true,attributes:id==='overviewBar',attributeFilter:id==='overviewBar'?['data-paint-key']:undefined})}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)paintWeek()});
  window.addEventListener('svitlo:live-schedules',()=>requestAnimationFrame(paintWeek));
  setInterval(()=>{if(!document.hidden)paintWeek()},60000);
  paintWeek();
 }
 function init(){rebuildSettings();rebuildHome()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();