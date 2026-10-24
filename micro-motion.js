/* Fine-grained micro-interactions. Beta 7.9.13, no animation on telemetry refresh.
 * All handlers delegated once, including controls inserted after load. */
(()=>{'use strict';
 const root=document.documentElement,doc=document;
 const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true||
  root.classList.contains('feature-off-animations');
 const PRESS='button:not(:disabled),a[href],[role="button"],[role="tab"],summary,.place-card,.quick-place,.setting-line,.all-queues-lane';
 const control='input,select,textarea,[role="switch"],[role="checkbox"],[role="radio"]';
 const live='[role="status"],[role="alert"],.toast,.snackbar,.push-state';
 let lastInteraction=-100000;
 const timers=new WeakMap();
 const pressed=new Set();
 function release(el){
  if(!el)return;
  el.classList.remove('micro-pressed');
  pressed.delete(el);
  const old=timers.get(el);if(old){clearTimeout(old);timers.delete(el)}
 }
 function press(el){
  if(reduce()||!el?.isConnected||el.closest('[hidden],[inert]')||el.matches(':disabled'))return;
  lastInteraction=performance.now();
  el.classList.add('micro-pressed');pressed.add(el);
  const old=timers.get(el);if(old)clearTimeout(old);
  timers.set(el,setTimeout(()=>release(el),260));
 }
 doc.addEventListener('pointerdown',event=>{
  if(event.button!==0||!event.isPrimary)return;
  const el=event.target.closest?.(PRESS);if(el)press(el);
 },{passive:true});
 const clearPress=()=>{for(const el of [...pressed])release(el)};
 // A gesture ends even when the pointer is released outside the original control.
 for(const type of ['pointerup','pointercancel','dragstart','blur'])
  window.addEventListener(type,clearPress,{passive:true});
 doc.addEventListener('keydown',event=>{
  if(event.repeat||!['Enter',' '].includes(event.key)||reduce())return;
  const el=event.target.closest?.('button,[role="button"],[role="tab"],summary');
  if(el)press(el);
 });
 doc.addEventListener('keyup',clearPress);
 function acknowledge(el){
  if(reduce())return;
  const token=String(Number(el.dataset.microChangeToken||0)+1);
  el.dataset.microChangeToken=token;
  el.classList.add('micro-changed');
  setTimeout(()=>{
   if(el.dataset.microChangeToken!==token)return;
   el.classList.remove('micro-changed');
  },300);
 }
 doc.addEventListener('change',event=>{
  if(event.target.matches?.(control)){lastInteraction=performance.now();acknowledge(event.target)}
 },{passive:true});
 // Notifications only animate when their contents change, not every heartbeat.
 const messageState=new WeakMap();
 const lastShown=new WeakMap();
 const observer=new MutationObserver(records=>{
  if(reduce())return;
  const adminPanels=new Set(),messages=new Set();
  for(const rec of records){
   const target=rec.target;
   if(rec.type==='attributes'&&rec.attributeName==='hidden'&&target.matches?.('[data-admin-panel],[data-workspace-panel]')){
    if(!target.hidden&&target.isConnected)adminPanels.add(target);
   }else if(target.matches?.(live))messages.add(target);
  }
  for(const panel of adminPanels){
   if(panel.hidden||!panel.getClientRects().length)continue;
   const now=performance.now();
   if(now-(lastShown.get(panel)||0)<100)return;
   lastShown.set(panel,now);
   // A single effect replaces overlapping global CSS animations.
   panel.getAnimations?.().filter(anim=>anim.id==='beta-panel-in').forEach(anim=>anim.cancel());
   const anim=panel.animate(
    [{opacity:.75,transform:'translate3d(0,5px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],
    {duration:265,easing:'cubic-bezier(.22,.85,.22,1)'});
   anim.id='beta-panel-in';
  }
  for(const element of messages){
   const value=element.textContent?.trim()||'';
   if(!value||value===messageState.get(element)||!element.isConnected||!element.getClientRects().length)continue;
   messageState.set(element,value);
   // Remote polling and countdowns must update instantly, never blink on their own.
   if(performance.now()-lastInteraction>1200)continue;
   element.animate([{opacity:.72},{opacity:1}],{duration:190,easing:'ease-out'});
  }
 });
 function initialize(){
  const panels=doc.querySelectorAll('[data-admin-panel],[data-workspace-panel]');
  for(const el of panels)observer.observe(el,{attributes:true,attributeFilter:['hidden']});
  // Observe a few stable surfaces rather than the entire 3000-node admin document.
  for(const el of doc.querySelectorAll(live).length?doc.querySelectorAll(live):[])
   observer.observe(el,{childList:true,characterData:true,subtree:true});
  // Listen for new status nodes without animating every inserted row.
  doc.addEventListener('svitlo:motion-status',event=>{
   const el=event.target;if(el?.matches?.(live)){messageState.delete(el);acknowledge(el)}
  });
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',initialize,{once:true});
 else initialize();
 window.SvitloMicroMotion={reduce,press,release};
})();
