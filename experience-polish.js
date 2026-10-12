/* Universal user experience enhancements; never changes the outage dataset. */
(()=>{'use strict';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const motion=()=>!reduced.matches&&document.documentElement.dataset.comfortMotion!=='calm'&&!document.documentElement.classList.contains('feature-off-animations');
function init(){
 const main=document.getElementById('main');
 if(!main)return;
 const skip=document.createElement('a');skip.className='ux-skip';skip.href='#main';skip.textContent='До основного вмісту';document.body.prepend(skip);main.tabIndex=-1;
 let current=null;
 const nav=document.querySelector('.bottom-nav');
 const tabs=[...document.querySelectorAll('.bottom-nav [data-go]')];
 const observer=new MutationObserver(()=>{
  const visible=[...document.querySelectorAll('.screen')].find(s=>!s.hidden);
  if(!visible||visible===current)return;
  current=visible;
  if(motion()){
   visible.classList.remove('ux-active-tab');void visible.offsetWidth;visible.classList.add('ux-active-tab');
  }
  tabs.forEach(button=>{
   const selected=button.dataset.go===visible.id;
   if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
 });
 document.querySelectorAll('.screen').forEach(screen=>observer.observe(screen,{attributes:true,attributeFilter:['hidden']}));
 const initial=[...document.querySelectorAll('.screen')].find(s=>!s.hidden);
 if(initial){current=initial;tabs.forEach(b=>{if(b.dataset.go===initial.id)b.setAttribute('aria-current','page')})}
 // Announce stale data clearly without asserting power availability.
 const note=document.createElement('p');note.className='ux-view-note';note.textContent='Години є прогнозом за опублікованим графіком, а не підтвердженням фактичного стану мережі.';
 const detail=document.getElementById('detail');
 if(detail){const sources=detail.querySelector('.sources-row');sources?.after(note)}
 // Escape closes transient dialogs where supported; browser keeps focus management native.
 document.querySelectorAll('dialog.sheet, dialog.share-preview-dialog').forEach(d=>d.addEventListener('close',()=>document.activeElement?.blur?.()));
 // Respect keyboard navigation without disabling page scrolling on touch devices.
 nav?.setAttribute('aria-label','Основні розділи');
 // Reflect refresh state only through appearance, never interfere with existing refresh logic.
 const sync=document.getElementById('syncStatus');
 if(sync)new MutationObserver(()=>{const pending=sync.dataset.state==='pending';sync.classList.toggle('ux-skeleton',pending&&motion())}).observe(sync,{attributes:true,attributeFilter:['data-state']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();