/* Beta 7.9.13 UI-only behavior for the redesigned settings hub.
 * Existing address controls, Push state and schedule readers own their data. */
(()=>{'use strict';
 const root=document.documentElement;
 const nav=document.querySelector('#settings .settings-quick-nav');
 if(!nav)return;
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||
  root.classList.contains('feature-off-animations');
 function updateNavigation(){
  const push=document.getElementById('settingsPushBlock');
  const pushButton=nav.querySelector('[data-settings-jump="settingsPushBlock"]');
  if(pushButton)pushButton.hidden=!!push&&getComputedStyle(push).display==='none';
 }
 nav.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-settings-jump]');
  if(!button||!nav.contains(button))return;
  const section=document.getElementById(button.dataset.settingsJump);
  if(!section||getComputedStyle(section).display==='none')return;
  for(const other of nav.querySelectorAll('[data-settings-jump]'))
   other.classList.toggle('is-current',other===button);
  section.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'start',inline:'nearest'});
 });
 const section=document.getElementById('settings');
 // Native tab navigation stays in app.js. Recompute only when operator feature flags change.
 new MutationObserver(updateNavigation).observe(root,{attributes:true,attributeFilter:['class']});
 updateNavigation();
 if(section){
  section.addEventListener('focusin',event=>{
   if(!event.target.closest('.settings-quick-nav'))return;
   nav.scrollIntoView({block:'nearest'});
  });
 }
})();
