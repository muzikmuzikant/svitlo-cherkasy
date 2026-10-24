/* Touch-scale micro reactions without re-animating live schedule data every minute. */
(()=>{'use strict';
 const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true||
  document.documentElement.classList.contains('feature-off-animations');
 const INTERACTIVE='button:not(:disabled),[role="button"],[role="tab"],summary,.place-card,.quick-place,.setting-line';
 const timetables=new WeakMap();
 function removePressed(target){
  if(!target)return;
  target.classList.remove('micro-pressed');
  const t=timetables.get(target);if(t){clearTimeout(t);timetables.delete(target)}
 }
 document.addEventListener('pointerdown',event=>{
  if(reduce()||event.button!==0)return;
  const node=event.target.closest?.(INTERACTIVE);
  if(!node||node.closest('[hidden],[inert]')||node.matches(':disabled'))return;
  node.classList.add('micro-pressed');
  const old=timetables.get(node);if(old)clearTimeout(old);
  timetables.set(node,setTimeout(()=>removePressed(node),360));
 },{passive:true});
 for(const type of ['pointerup','pointercancel','dragstart']){
  document.addEventListener(type,event=>{
   const target=event.target.closest?.('.micro-pressed');
   if(target)setTimeout(()=>removePressed(target),type==='pointerup'?75:0);
  },{passive:true});
 }
 document.addEventListener('change',event=>{
  if(reduce()||!event.target.matches?.('input,select,textarea'))return;
  event.target.classList.remove('micro-changed');
  void event.target.offsetWidth; // One user interaction, never per-frame layout.
  event.target.classList.add('micro-changed');
  setTimeout(()=>event.target.classList.remove('micro-changed'),340);
 });
 // Admin navigation uses hidden panels. Animate only explicit panel activation,
 // never content polling/mutation, so no flashing while typing or data updates.
 if(document.body?.querySelector('[data-admin-panel]')){
  const panels=[...document.querySelectorAll('[data-admin-panel]')];
  const observer=new MutationObserver(entries=>{
   if(reduce())return;
   for(const record of entries){
    const target=record.target;
    if(target.hidden||!target.isConnected)continue;
    target.classList.remove('micro-enter');
    void target.offsetWidth;
    target.classList.add('micro-enter');
   }
  });
  for(const panel of panels)observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('animationend',event=>{
   if(event.animationName==='microPanelEnter')event.target.classList.remove('micro-enter');
  });
 }
})();
