/* Svitlo Sheets: native modal gesture controller for the PWA.
 * Bottom-sheet drag is restricted to the grabber/header so that scrolling,
 * text selection, native select fields and keyboard input remain reliable.
 * No stored user data, network calls or gesture tracking.
 */
(()=>{'use strict';
 const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===
  true||document.documentElement.classList.contains('feature-off-animations');
 const bound=new WeakMap(),CLOSE_MS=330;
 const nativeClose=dialog=>{if(dialog?.open)dialog.close()};
 function bind(dialog,onDismiss){
  if(!dialog||bound.has(dialog))return;
  const state={onDismiss,closing:false,gesture:null,animation:null,timer:null};
  bound.set(dialog,state);
  dialog.classList.add('svitlo-draggable');
  const reset=()=>{
   state.gesture=null;state.closing=false;
   if(state.animation){state.animation.cancel();state.animation=null}
   clearTimeout(state.timer);state.timer=null;
   dialog.classList.remove('svitlo-sheet-dragging','svitlo-sheet-closing');
   dialog.style.removeProperty('--sheet-exit-from');
   dialog.style.removeProperty('--sheet-drag-y');
   dialog.style.removeProperty('transform');
   dialog.style.removeProperty('opacity');
  };
  const snapBack=()=>{
   const g=state.gesture;state.gesture=null;
   dialog.classList.remove('svitlo-sheet-dragging');
   if(!dialog.open||state.closing)return;
   const delta=Math.max(0,g?.distance||0);
   // Snap back naturally, not an abrupt jump.
   dialog.style.removeProperty('transform');
   if(reduce()||delta<2)return;
   const animation=dialog.animate(
    [{transform:'translate3d(0,'+delta+'px,0)'},{transform:'translate3d(0,0,0)'}],
    {duration:360,easing:'cubic-bezier(.22,1,.36,1)'});
   state.animation=animation;
   animation.finished.then(()=>{if(state.animation===animation)state.animation=null},()=>{});
  };
  const finish=()=>{
   if(!dialog.open)return reset();
   clearTimeout(state.timer);state.timer=null;
   nativeClose(dialog);
  };
  function dismiss(from=0){
   if(!dialog.open||state.closing)return false;
   const source=state.onDismiss;
   state.gesture=null;
   dialog.classList.remove('svitlo-sheet-dragging');
   if(state.animation){state.animation.cancel();state.animation=null}
   dialog.style.removeProperty('transform');
   if(typeof source==='function'){
    dialog.style.setProperty('--sheet-exit-from',Math.max(0,from)+'px');
    state.closing=true;
    // Existing reader/preview handlers own cleanup and their close event.
    source();
    return true;
   }
   if(reduce()){finish();return true}
   state.closing=true;
   dialog.style.setProperty('--sheet-exit-from',Math.max(0,from)+'px');
   dialog.classList.add('svitlo-sheet-closing');
   // The CSS supplies matching exit and backdrop animations. Native close
   // occurs only after those animations have finished.
   state.timer=setTimeout(finish,CLOSE_MS);
   return true;
  }
  // On each opening the dialog is reused, not rebound (prevents duplicate handlers).
  dialog.addEventListener('close',reset);
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss()},true);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dismiss()});
  dialog.addEventListener('pointerdown',event=>{
   if(!dialog.open||state.closing||!event.isPrimary||event.button!==0)return;
   if(dialog.matches('.share-preview-dialog,.inbox-detail')&&
      window.matchMedia('(min-width: 601px)').matches)return;
   const target=event.target;
   if(!(target instanceof Element))return;
   const grabber=target.closest('.sheet-handle,.sheet-top,.share-preview-head,.inbox-drag-handle');
   if(!grabber||grabber.closest('button,a,input,select,textarea,[contenteditable="true"]'))return;
   if(target.closest('button,a,input,select,textarea,[contenteditable="true"],label'))return;
   if(dialog.matches('.inbox-detail')&&!target.closest('.inbox-drag-handle'))return;
   if(state.animation){state.animation.cancel();state.animation=null}
   state.gesture={pointer:event.pointerId,startY:event.clientY,startX:event.clientX,
    lastY:event.clientY,lastT:event.timeStamp,distance:0,velocity:0,active:false};
  });
  dialog.addEventListener('pointermove',event=>{
   const g=state.gesture;
   if(!g||g.pointer!==event.pointerId||state.closing)return;
   const dy=event.clientY-g.startY,dx=event.clientX-g.startX;
   if(!g.active){
    if(Math.abs(dx)>Math.abs(dy)*1.25&&Math.abs(dx)>8){state.gesture=null;return}
    if(Math.abs(dy)<7)return;
    if(dy<0){state.gesture=null;return}
    g.active=true;dialog.classList.add('svitlo-sheet-dragging');
    try{dialog.setPointerCapture(event.pointerId)}catch{}
   }
   const distance=Math.max(0,Math.min(dy,dialog.clientHeight+90));
   const dt=Math.max(1,event.timeStamp-g.lastT);
   g.velocity=(event.clientY-g.lastY)/dt;
   g.lastT=event.timeStamp;g.lastY=event.clientY;
   g.distance=distance;
   dialog.style.setProperty('--sheet-drag-y',distance+'px');
   dialog.style.transform='translate3d(0,'+distance+'px,0)';
   if(event.cancelable)event.preventDefault();
  },{passive:false});
  const release=(event,cancelled=false)=>{
   const g=state.gesture;
   if(!g||g.pointer!==event.pointerId)return;
   try{if(dialog.hasPointerCapture(event.pointerId))dialog.releasePointerCapture(event.pointerId)}catch{}
   const distance=g.distance,fast=g.velocity>.55&&distance>48;
   if(!cancelled&&g.active&&(distance>Math.min(155,Math.max(100,dialog.clientHeight*.21))||fast)){
    dismiss(distance);
   }else snapBack();
  };
  dialog.addEventListener('pointerup',event=>release(event));
  dialog.addEventListener('pointercancel',event=>release(event,true));
  dialog.addEventListener('lostpointercapture',event=>{
   if(state.gesture?.pointer===event.pointerId&&!state.closing)snapBack();
  });
 }
 function dismiss(dialog){const state=bound.get(dialog);if(!dialog?.open)return false;
  if(!state){nativeClose(dialog);return true}
  // The event-driven implementation is shared via an internal, non-DOM event
  // so every explicit button can use the exact same close path.
  dialog.dispatchEvent(new Event('svitlo:sheet-dismiss'));
  return true;
 }
 // A single synthetic action keeps buttons and gesture close consistent.
 function wire(dialog,onDismiss){
  bind(dialog,onDismiss);
  if(dialog.dataset.sheetDismissWired)return;
  dialog.dataset.sheetDismissWired='true';
  dialog.addEventListener('svitlo:sheet-dismiss',()=>{
   const cancel=new Event('cancel',{cancelable:true});
   dialog.dispatchEvent(cancel);
  });
 }
 const boot=()=>document.querySelectorAll('dialog.sheet').forEach(dialog=>wire(dialog));
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
 window.SvitloSheetMotion={bind:wire,dismiss,reduced:reduce};
})();
