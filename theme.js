/* Svitlo Cherkasy appearance: persist the choice, follow iOS in auto mode. */
(()=>{'use strict';
 const KEY='svitlo-appearance-v1';
 const root=document.documentElement;
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 const allowed=new Set(['light','dark','system']);
 const read=()=>{try{const value=localStorage.getItem(KEY);return allowed.has(value)?value:'system'}catch{return 'system'}};
 let choice=read();
 function apply(){
  const dark=choice==='dark'||(choice==='system'&&media.matches);
  root.dataset.theme=dark?'dark':'light';
  root.dataset.themePreference=choice;
  root.style.colorScheme=dark?'dark':'light';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',dark?'#101823':'#f6f8fc');
  document.querySelectorAll('input[name="appearanceTheme"]').forEach(input=>{input.checked=input.value===choice});
  const text=document.getElementById('appearanceSummary');
  if(text)text.textContent=choice==='system'?'Тема автоматично підлаштовується під ваш телефон.':choice==='dark'?'Темне оформлення ввімкнено.':'Світле оформлення ввімкнено.';
 }
 function set(next){
  if(!allowed.has(next))return;
  choice=next;
  try{localStorage.setItem(KEY,choice)}catch{}
  apply();
  window.dispatchEvent(new CustomEvent('svitlo:theme-change',{detail:{theme:root.dataset.theme,preference:choice}}));
 }
 media.addEventListener?.('change',()=>{if(choice==='system')apply()});
 document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('input[name="appearanceTheme"]').forEach(input=>input.addEventListener('change',()=>{if(input.checked)set(input.value)}));
  apply();
 });
 window.SvitloTheme={get:()=>choice,set,apply};
 apply();
})();
