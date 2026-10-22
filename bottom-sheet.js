/* Accessible native bottom sheets. Mobile touch gestures are handled with
 * non-passive touch listeners (iOS WebKit can cancel pointer gestures on scroll).
 * Pointer Events remain for mouse/pen. Scrollable content and controls are untouched.
 */
(()=>{'use strict';
 const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true||
  document.documentElement.classList.contains('feature-off-animations');
 const states=new WeakMap(),EXIT_MS=215,SPRING_MS=235;
 const handles='.sheet-handle,.sheet-top,.share-preview-grabber,.share-preview-head,.inbox-drag-handle';
 const interactive='button,a,input,select,textarea,summary,label,[contenteditable="true"]';
 const isMobile=()=>!window.matchMedia?.('(min-width: 601px)')?.matches;
 function bind(dialog,onDismiss){
  if(!dialog)return;
  if(states.has(dialog)){states.get(dialog).onDismiss=onDismiss;return}
  const st={onDismiss,gesture:null,closing:false,animation:null,timer:null};
  states.set(dialog,st);
  dialog.classList.add('svitlo-draggable');
  const clearAnimation=()=>{st.animation?.cancel();st.animation=null};
  const settle=()=>{dialog.classList.add('svitlo-sheet-settled');dialog.classList.remove('svitlo-sheet-gesture','svitlo-sheet-snapping','svitlo-sheet-dragging')};
  const clear=()=>{
   if(st.timer){clearTimeout(st.timer);st.timer=null}
   clearAnimation();st.gesture=null;st.closing=false;
   dialog.classList.remove('svitlo-sheet-closing','svitlo-sheet-settled','svitlo-sheet-gesture','svitlo-sheet-dragging','svitlo-sheet-snapping');
   dialog.style.removeProperty('transform');
   dialog.style.removeProperty('opacity');
   dialog.style.removeProperty('--sheet-exit-from');
   dialog.style.removeProperty('--sheet-drag-y');
  };
  function closeNow(){if(dialog.open)dialog.close();else clear()}
  function dismiss(from=0){
   if(!dialog.open||st.closing)return false;
   st.closing=true;st.gesture=null;clearAnimation();
   dialog.classList.add('svitlo-sheet-settled');
   dialog.style.setProperty('--sheet-exit-from',Math.max(0,Math.round(from))+'px');
   dialog.classList.remove('svitlo-sheet-gesture','svitlo-sheet-dragging','svitlo-sheet-snapping');
   // Both the in-app reader and sharing preview have their own close lifecycle.
   if(typeof st.onDismiss==='function'){
    dialog.style.removeProperty('transform');
    st.onDismiss();return true;
   }
   if(reduce()){closeNow();return true}
   dialog.classList.add('svitlo-sheet-closing');
   dialog.style.removeProperty('transform');
   st.timer=setTimeout(closeNow,EXIT_MS);
   return true;
  }
  function eligible(target){
   if(!dialog.open||st.closing||!(target instanceof Element))return false;
   if(dialog.matches('.share-preview-dialog,.inbox-detail')&&!isMobile())return false;
   const handle=target.closest(handles);
   if(!handle||!dialog.contains(handle)||target.closest(interactive))return false;
   if(dialog.matches('.inbox-detail')&&!target.closest('.inbox-drag-handle'))return false;
   return true;
  }
  function start(target,x,y,time,identifier,kind){
   if(!eligible(target)||st.gesture)return;
   clearAnimation();
   st.gesture={kind,identifier,x,y,lastY:y,lastTime:time,distance:0,velocity:0,active:false};
  }
  function move(x,y,time,event,identifier,kind){
   const g=st.gesture;if(!g||g.kind!==kind||g.identifier!==identifier||st.closing)return;
   const dy=y-g.y,dx=x-g.x;
   if(!g.active){
    if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.25){st.gesture=null;return}
    if(dy<-9){st.gesture=null;return}
    if(dy<5)return;
    g.active=true;
    dialog.classList.add('svitlo-sheet-settled','svitlo-sheet-gesture','svitlo-sheet-dragging');
    dialog.classList.remove('svitlo-sheet-snapping');
   }
   const distance=Math.max(0,Math.min(dialog.clientHeight+100,dy));
   const dt=Math.max(1,time-g.lastTime);
   // Keep the average a little smooth for iOS touch events delivered in batches.
   g.velocity=g.velocity*.45+((y-g.lastY)/dt)*.55;
   g.lastY=y;g.lastTime=time;g.distance=distance;
   dialog.style.transform='translate3d(0,'+distance+'px,0)';
   if(event?.cancelable)event.preventDefault();
  }
  function spring(from){
   settle();
   if(reduce()||from<1){dialog.style.removeProperty('transform');return}
   dialog.classList.add('svitlo-sheet-snapping');
   clearAnimation();
   const anim=dialog.animate([
    {transform:'translate3d(0,'+from+'px,0)'},
    {transform:'translate3d(0,0,0)'}
   ],{duration:SPRING_MS,easing:'cubic-bezier(.19,1,.32,1)',fill:'forwards'});
   st.animation=anim;
   anim.finished.then(()=>{
    if(st.animation!==anim)return;
    dialog.style.removeProperty('transform');
    anim.cancel();st.animation=null;
    dialog.classList.remove('svitlo-sheet-snapping');
   },()=>{});
  }
  function end(identifier,kind,cancelled=false){
   const g=st.gesture;if(!g||g.identifier!==identifier||g.kind!==kind)return;
   st.gesture=null;
   if(!g.active)return;
   const threshold=Math.min(135,Math.max(85,dialog.clientHeight*.19));
   if(!cancelled&&(g.distance>=threshold||(g.distance>38&&g.velocity>.62))){
    dismiss(g.distance);
   }else spring(g.distance);
  }
  dialog.addEventListener('close',clear);
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss()},true);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dismiss()});
  dialog.addEventListener('svitlo:sheet-dismiss',()=>dismiss());
  // iOS/iPadOS: non-passive touchmove is required to stop the page scroll.
  dialog.addEventListener('touchstart',event=>{
   if(event.touches.length!==1)return;
   const t=event.changedTouches[0];
   start(event.target,t.clientX,t.clientY,event.timeStamp,t.identifier,'touch');
  },{passive:true});
  dialog.addEventListener('touchmove',event=>{
   const g=st.gesture;
   if(!g||g.kind!=='touch')return;
   const t=Array.from(event.changedTouches).find(t=>t.identifier===g.identifier);
   if(t)move(t.clientX,t.clientY,event.timeStamp,event,t.identifier,'touch');
  },{passive:false});
  dialog.addEventListener('touchend',event=>{
   for(const t of event.changedTouches)end(t.identifier,'touch');
  },{passive:true});
  dialog.addEventListener('touchcancel',event=>{
   for(const t of event.changedTouches)end(t.identifier,'touch',true);
  },{passive:true});
  // Desktop trackpads/mouse, stylus. Touch pointer events are deliberately
  // ignored to avoid duplicate streams/cancellation on mobile Safari.
  dialog.addEventListener('pointerdown',event=>{
   if(event.pointerType==='touch'||event.button!==0||!event.isPrimary)return;
   start(event.target,event.clientX,event.clientY,event.timeStamp,event.pointerId,'pointer');
  });
  dialog.addEventListener('pointermove',event=>{
   if(event.pointerType!=='touch')move(event.clientX,event.clientY,event.timeStamp,event,event.pointerId,'pointer');
  });
  dialog.addEventListener('pointerup',event=>end(event.pointerId,'pointer'));
  dialog.addEventListener('pointercancel',event=>end(event.pointerId,'pointer',true));
 }
 function dismiss(dialog){
  if(!dialog?.open)return false;
  if(!states.has(dialog)){dialog.close();return true}
  dialog.dispatchEvent(new Event('svitlo:sheet-dismiss'));return true;
 }
 const boot=()=>document.querySelectorAll('dialog.sheet').forEach(dialog=>bind(dialog));
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
 window.SvitloSheetMotion={bind,dismiss,reduced:reduce};
})();
