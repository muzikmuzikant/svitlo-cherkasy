/* Svitlo Cherkasy appearance: persist the choice, follow iOS in auto mode. */
(()=>{'use strict';
 const KEY='svitlo-appearance-v1';
 const root=document.documentElement;
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 const allowed=new Set(['light','dark','system']);
 const read=()=>{try{const value=localStorage.getItem(KEY);return allowed.has(value)?value:'system'}catch{return 'system'}};
 let choice=read();
 function apply(){
  const previous=root.dataset.theme;
  const dark=choice==='dark'||(choice==='system'&&media.matches);
  root.dataset.theme=dark?'dark':'light';
  root.dataset.themePreference=choice;
  root.style.colorScheme=dark?'dark':'light';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',dark?'#090b0f':'#f6f8fc');
  const select=document.getElementById('appearanceThemeSelect');if(select)select.value=choice;
  document.querySelectorAll('input[name="appearanceTheme"]').forEach(input=>{input.checked=input.value===choice});
  const text=document.getElementById('appearanceSummary');
  if(text)text.textContent=choice==='system'?'Тема автоматично підлаштовується під ваш телефон.':choice==='dark'?'Темне оформлення ввімкнено.':'Світле оформлення ввімкнено.';
  if(previous&&previous!==root.dataset.theme)window.dispatchEvent(new CustomEvent('svitlo:theme-change',{detail:{theme:root.dataset.theme,preference:choice}}));
 }
 function set(next){
  if(!allowed.has(next))return;
  choice=next;
  try{localStorage.setItem(KEY,choice)}catch{}
  apply();
 }
 const syncSystem=()=>{if(choice==='system')apply()};
 if(media.addEventListener)media.addEventListener('change',syncSystem);
 else media.addListener?.(syncSystem);
 window.addEventListener?.('pageshow',syncSystem);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncSystem()});
 const DND_KEY='svitlo-do-not-disturb-v1';
 const dndEnabled=()=>{try{return localStorage.getItem(DND_KEY)!=='0'}catch{return true}};
 const quietNow=()=>{
  try{
   const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
   const hour=Number(parts.find(p=>p.type==='hour')?.value),minute=Number(parts.find(p=>p.type==='minute')?.value);
   const total=hour*60+minute;return total>=1320||total<420;
  }catch{return false}
 };
 async function syncQuietHoursCache(){
  try{
   if(!('caches' in window))return;
   const cache=await caches.open('svitlo-push-preferences-v1');
   const key=new URL('./push-preferences.json',location.href);
   await cache.put(key,new Response(JSON.stringify({doNotDisturb:dndEnabled()}),{headers:{'content-type':'application/json'}}));
  }catch(error){console.warn('Quiet-hours preference sync:',error?.message||error)}
 }
 function renderQuietHours(){
  const toggle=document.getElementById('doNotDisturbToggle');
  if(toggle)toggle.checked=dndEnabled();
  const banner=document.getElementById('homeDndNotice');
  if(banner)banner.hidden=!(dndEnabled()&&quietNow());
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const select=document.getElementById('appearanceThemeSelect');
  select?.addEventListener('change',()=>set(select.value));
  document.querySelectorAll('input[name="appearanceTheme"]').forEach(input=>input.addEventListener('change',()=>{if(input.checked)set(input.value)}));
  const dnd=document.getElementById('doNotDisturbToggle');
  dnd?.addEventListener('change',()=>{
   try{localStorage.setItem(DND_KEY,dnd.checked?'1':'0')}catch{}
   void syncQuietHoursCache();renderQuietHours();
  });
  apply();void syncQuietHoursCache();renderQuietHours();setInterval(renderQuietHours,60_000);
 });
 // Installed iOS PWA: prevent page scaling while preserving normal
 // single-finger scrolling, text inputs and rapid taps on controls.
 // iOS Safari may ignore the viewport maximum-scale for pinch gestures.
 const blockScale=event=>{if(event.cancelable)event.preventDefault()};
 for(const name of ['gesturestart','gesturechange','gestureend'])
  document.addEventListener(name,blockScale,{passive:false});
 document.addEventListener('touchmove',event=>{
  if(event?.touches?.length>1)blockScale(event);
 },{passive:false});
 document.addEventListener('touchstart',event=>{
  if(event?.touches?.length>1)blockScale(event);
 },{passive:false});
 window.SvitloTheme={get:()=>choice,set,apply};
 window.SvitloQuietHours={enabled:dndEnabled,isQuiet:quietNow,renderHome:renderQuietHours,sync:syncQuietHoursCache};
 apply();
})();
