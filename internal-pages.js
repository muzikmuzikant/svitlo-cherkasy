/* Svitlo 7.9.8: same-document internal navigation keeps PWA state and scroll intact. */
(()=>{'use strict';
 const allowed=new Set(['help.html','feedback.html','privacy.html','terms.html','about.html','advertising.html','support-project.html','ad-detail.html']);
 const app=document.getElementById('app')||document.body;
 const browser=document.createElement('div');browser.id='svitloInternalPage';browser.hidden=true;
 browser.setAttribute('role','dialog');browser.setAttribute('aria-modal','true');browser.setAttribute('aria-label','Внутрішня сторінка');
 const chrome=document.createElement('div');chrome.className='svitlo-internal-head';
 const back=document.createElement('button');back.type='button';back.className='svitlo-internal-back';back.textContent='Назад';back.setAttribute('aria-label','Закрити сторінку');
 const name=document.createElement('strong');name.textContent='Світло Черкаси';name.className='svitlo-internal-title';
 chrome.append(back,name);
 const frame=document.createElement('iframe');frame.className='svitlo-internal-frame';frame.title='Інформаційна сторінка застосунку';frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 const failure=document.createElement('section');failure.className='svitlo-internal-error';failure.hidden=true;
 failure.setAttribute('role','alert');
 const failHeading=document.createElement('strong');failHeading.textContent='Не вдалося відкрити сторінку';
 const failMessage=document.createElement('p');failMessage.textContent='Перевірте інтернет і спробуйте ще раз.';
 const retry=document.createElement('button');retry.type='button';retry.textContent='Повторити';
 failure.append(failHeading,failMessage,retry);
 browser.append(chrome,frame,failure);document.body.append(browser);
 const labels={'help.html':'Центр допомоги','feedback.html':'Зв’язок із нами','privacy.html':'Конфіденційність','terms.html':'Умови користування','about.html':'Джерела даних','advertising.html':'Реклама у нас','support-project.html':'Підтримати проєкт','ad-detail.html':'Рекламне оголошення'};
 let previousOverflow='',isOpen=false,previousFocus=null,leaveTimer=null;
 let loadingTimer=null,expectedPath='',explicitDismiss=false;
 const cancelLoading=()=>{if(loadingTimer){clearTimeout(loadingTimer);loadingTimer=null}};
 const showFailure=()=>{if(!isOpen)return;cancelLoading();failure.hidden=false;frame.hidden=true;browser.classList.remove('svitlo-internal-loading')};
 function internal(input){try{const u=new URL(input,location.href),file=u.pathname.split('/').pop();return u.origin===location.origin&&allowed.has(file)?u:null}catch{return null}}
 function finishClose(){
  cancelLoading();browser.hidden=true;failure.hidden=true;frame.hidden=false;browser.classList.remove('svitlo-internal-leaving','svitlo-internal-loading');
  document.documentElement.style.overflow=previousOverflow;frame.src='about:blank';
  leaveTimer=null;try{previousFocus?.focus({preventScroll:true})}catch{}
 }
 function close(){
  if(!isOpen)return;isOpen=false;
  if(leaveTimer){clearTimeout(leaveTimer);leaveTimer=null}
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('feature-off-animations')){finishClose();return}
  browser.classList.add('svitlo-internal-leaving');
  leaveTimer=setTimeout(finishClose,270);
 }
 function dismiss(){
  if(!isOpen)return;
  // Close immediately even if Safari delays/drops the History API popstate.
  close();
  if(history.state?.svitloInternal){explicitDismiss=true;history.back()}
 }
 function display(url,remember=true){const u=internal(url);if(!u)return;
  const wasOpen=isOpen;const resumingClose=leaveTimer!==null;
  if(leaveTimer){clearTimeout(leaveTimer);leaveTimer=null}
  browser.classList.remove('svitlo-internal-leaving');
  if(!isOpen&&!resumingClose){previousOverflow=document.documentElement.style.overflow;previousFocus=document.activeElement}
  isOpen=true;browser.hidden=false;failure.hidden=true;frame.hidden=false;
  expectedPath=u.pathname;cancelLoading();document.documentElement.style.overflow='hidden';
  browser.classList.add('svitlo-internal-loading');
  loadingTimer=setTimeout(showFailure,12000);
  name.textContent=labels[u.pathname.split('/').pop()]||'Світло Черкаси';
  frame.src=u.href;
  if(remember){
   const state={svitloInternal:true,path:u.pathname+u.search};
   const link=location.pathname+location.search+'#internal='+encodeURIComponent(u.pathname+u.search);
   // Internal links are one screen, not an unbounded stack of modal history.
   if(wasOpen||history.state?.svitloInternal)history.replaceState(state,'',link);
   else history.pushState(state,'',link);
  }
  back.focus({preventScroll:true});
 }
 retry.addEventListener('click',()=>{if(expectedPath)display(expectedPath+new URL(frame.src).search,false)});
 back.addEventListener('click',dismiss);
 addEventListener('popstate',event=>{
  if(explicitDismiss){explicitDismiss=false;close();return}
  if(event.state?.svitloInternal){
   if(!isOpen||frame.src!==new URL(event.state.path,location.origin).href)display(event.state.path,false)
  }else close();
 });
 addEventListener('keydown',event=>{if(isOpen&&event.key==='Escape'){event.preventDefault();dismiss()}});
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const a=event.target.closest?.('a[href]');if(!a||a.hasAttribute('download'))return;
  // Keep legal links inside a modal accessible as separate pages, not behind the top-layer dialog.
  if(a.closest('dialog[open]'))return;
  const u=internal(a.href);if(!u)return;
  event.preventDefault();display(u.href);
 },true);
 frame.addEventListener('load',()=>{
  if(!isOpen)return;
  try{
   const doc=frame.contentDocument,src=new URL(frame.contentWindow.location.href);
   if(src.origin!==location.origin||src.pathname!==expectedPath)return;
   if(!doc||doc.querySelector('#appBootScreen,#svitloInternalOffline')||!doc.body){
    showFailure();return;
   }
   cancelLoading();failure.hidden=true;frame.hidden=false;
   browser.classList.remove('svitlo-internal-loading');
   // Child page navigation stays inside this container; returning to app closes it.
   doc.addEventListener('click',e=>{
    if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const anchor=e.target.closest?.('a[href]');if(!anchor||anchor.hasAttribute('download'))return;
    const target=new URL(anchor.href,frame.contentWindow.location.href);
    if(target.origin!==location.origin)return;
    // Local section links scroll inside the iframe without adding history entries.
    // Otherwise the first Back press would undo the hash rather than close this page.
    if(target.pathname===frame.contentWindow.location.pathname&&target.search===frame.contentWindow.location.search&&target.hash){
     const section=doc.getElementById(decodeURIComponent(target.hash.slice(1)));
     if(section){e.preventDefault();section.scrollIntoView({behavior:frame.contentWindow.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}
     return;
    }
    if(/(?:\/index\.html|\/)$/.test(target.pathname)){e.preventDefault();dismiss();return}
    const next=internal(target.href);
    if(next){e.preventDefault();display(next.href)}
   },true);
   // One consistent back button lives in the host header. Hide legacy return buttons in embedded pages only.
   doc.documentElement.classList.add('svitlo-embedded');
   const style=doc.createElement('style');style.id='svitlo-embedded-back-cleanup';
   style.textContent='.svitlo-embedded a.back,.svitlo-embedded a.support-back,.svitlo-embedded a[href="./"],.svitlo-embedded a[href="/"],.svitlo-embedded a[href^="./index.html"],.svitlo-embedded header.support-top{display:none!important}';
   doc.head.append(style);
   // Legal information and the support brand remain available when the page is opened standalone.
  }catch(error){console.warn('Internal page shell:',error.message);showFailure()}
 });
 window.SvitloInternalPages={open:url=>display(url),close:dismiss};
})();