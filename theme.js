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
 document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('input[name="appearanceTheme"]').forEach(input=>input.addEventListener('change',()=>{if(input.checked)set(input.value)}));
  apply();
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
 apply();
})();
