/* Shared motion behaviors; no tab cooldowns and no animation requirement for reduced motion. */
(()=>{'use strict';
 const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
 const reduced=()=>mq.matches||document.documentElement.classList.contains('feature-off-animations');
 document.documentElement.classList.add('svitlo-motion-ready');
 const activeDetails=new WeakMap();
 const animateDetails=(details,opening)=>{
  const old=activeDetails.get(details);if(old){old.cancel();activeDetails.delete(details)}
  const summary=details.querySelector(':scope > summary');if(!summary)return;
  details.style.removeProperty('height');
  details.style.removeProperty('overflow');
  let from,to;
  if(opening){from=details.getBoundingClientRect().height;details.open=true;to=details.getBoundingClientRect().height}
  else{from=details.getBoundingClientRect().height;details.open=false;to=details.getBoundingClientRect().height;details.open=true}
  if(Math.abs(to-from)<2){details.open=opening;return}
  details.style.overflow='clip';
  details.style.height=from+'px';
  const anim=details.animate([{height:from+'px',opacity:opening ? 0.86 : 1},{height:to+'px',opacity:opening?1:.9}],{duration:opening?285:225,easing:opening?'cubic-bezier(.2,.85,.25,1)':'cubic-bezier(.4,0,.7,.3)'});
  activeDetails.set(details,anim);
  const done=()=>{if(activeDetails.get(details)!==anim)return;activeDetails.delete(details);details.open=opening;details.style.removeProperty('height');details.style.removeProperty('overflow')};
  anim.finished.then(done,()=>{}); // cancelled animation is superseded by the next tap
 };
 document.addEventListener('click',event=>{
  const summary=event.target.closest?.('summary');if(!summary||summary.parentElement?.tagName!=='DETAILS'||reduced())return;
  if(event.target.closest('a,button,input,select'))return;
  event.preventDefault();
  const details=summary.parentElement;
  const previous=activeDetails.get(details);
  const opening=previous?details.dataset.motionTarget!=='open':!details.open;
  details.dataset.motionTarget=opening?'open':'closed';
  animateDetails(details,opening);
 });
 // Reveal asynchronously rendered advertising plans, donation methods and expense cards too.
 if(marketing&&'MutationObserver'in window){
  const watch=new MutationObserver(records=>{
   const fresh=[];
   for(const record of records)for(const element of record.addedNodes){
    if(element.nodeType!==1)continue;
    if(element.matches?.('.benefit,.format,.plan,.method,.goal,.expense,.contact'))fresh.push(element);
    element.querySelectorAll?.('.benefit,.format,.plan,.method,.goal,.expense,.contact').forEach(x=>fresh.push(x));
   }
   for(const element of fresh){
    if(element.classList.contains('motion-reveal'))continue;
    element.classList.add('motion-reveal');
    element.classList.add('motion-visible'); // newly fetched cards remain visible without awaiting scrolling
   }
  });
  watch.observe(document.body,{childList:true,subtree:true});
 }
  const closingDialogs=new WeakMap();
 function closeDialog(dialog,callback){
  if(!dialog?.open)return;
  const finish=()=>{
   if(closingDialogs.get(dialog)!==finish)return;
   closingDialogs.delete(dialog);
   dialog.classList.remove('svitlo-motion-closing');
   dialog.close();
   if(typeof callback==='function')callback();
  };
  if(reduced()||dialog.matches('.sheet,.share-preview-dialog')){dialog.close();callback?.();return}
  if(closingDialogs.has(dialog))return;
  closingDialogs.set(dialog,finish);
  dialog.classList.add('svitlo-motion-closing');
  window.setTimeout(finish,220);
 }
 // Escape closes new consent dialogs smoothly. Existing sheet/share-preview close logic is left intact.
 document.addEventListener('cancel',event=>{
  if(!event.target?.matches?.('dialog:not(.sheet):not(.share-preview-dialog)')||reduced())return;
  event.preventDefault();
  closeDialog(event.target);
 },true);
 // Scroll reveals for the two newly redesigned landing pages and their components.
 const marketing=/\/(advertising|support-project|ad-detail)\.html$/.test(location.pathname);
 if(marketing){
  const targets=[...document.querySelectorAll('.hero,.section,.benefit,.format,.plan,.method,.goal,.expense,.faq details,.contact-banner,.gratitude,.article,.aside')];
  for(let i=0;i<targets.length;i++){
   targets[i].classList.add('motion-reveal');
   targets[i].style.setProperty('--motion-delay',(i%3)*48+'ms');
  }
  if('IntersectionObserver'in window&&!reduced()){
   const io=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('motion-visible');io.unobserve(entry.target)}
   },{threshold:.08,rootMargin:'0px 0px 40px 0px'});
   targets.forEach(t=>io.observe(t));
  }else targets.forEach(t=>t.classList.add('motion-visible'));
 }
 window.SvitloMotion={closeDialog,reduced};
})();
