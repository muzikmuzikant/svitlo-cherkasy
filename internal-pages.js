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
 browser.append(chrome,frame);document.body.append(browser);
 const labels={'help.html':'Центр допомоги','feedback.html':'Зв’язок із нами','privacy.html':'Конфіденційність','terms.html':'Умови користування','about.html':'Джерела даних','advertising.html':'Реклама у нас','support-project.html':'Підтримати проєкт','ad-detail.html':'Рекламне оголошення'};
 let previousOverflow='',isOpen=false,previousFocus=null,leaveTimer=null;
 function internal(input){try{const u=new URL(input,location.href),file=u.pathname.split('/').pop();return u.origin===location.origin&&allowed.has(file)?u:null}catch{return null}}
 function finishClose(){
  browser.hidden=true;browser.classList.remove('svitlo-internal-leaving','svitlo-internal-loading');
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
 function dismiss(){if(!isOpen)return;if(history.state?.svitloInternal){history.back()}else close()}
 function display(url,remember=true){const u=internal(url);if(!u)return;
  const resumingClose=leaveTimer!==null;
  if(leaveTimer){clearTimeout(leaveTimer);leaveTimer=null}
  browser.classList.remove('svitlo-internal-leaving');
  if(!isOpen&&!resumingClose){previousOverflow=document.documentElement.style.overflow;previousFocus=document.activeElement}
  isOpen=true;browser.hidden=false;document.documentElement.style.overflow='hidden';
  browser.classList.add('svitlo-internal-loading');
  name.textContent=labels[u.pathname.split('/').pop()]||'Світло Черкаси';
  frame.src=u.href;
  if(remember)history.pushState({svitloInternal:true,path:u.pathname+u.search},'',location.pathname+location.search+'#internal='+encodeURIComponent(u.pathname+u.search));
  back.focus({preventScroll:true});
 }
 back.addEventListener('click',dismiss);
 addEventListener('popstate',event=>{if(event.state?.svitloInternal){if(!isOpen||frame.src!==new URL(event.state.path,location.origin).href)display(event.state.path,false)}else close()});
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
  try{
   const doc=frame.contentDocument;
   if(!doc||frame.contentWindow.location.origin!==location.origin)return;
   // Child page navigation stays inside this container; returning to app closes it.
   doc.addEventListener('click',e=>{
    if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const anchor=e.target.closest?.('a[href]');if(!anchor||anchor.hasAttribute('download'))return;
    const target=new URL(anchor.href,frame.contentWindow.location.href);
    if(target.origin!==location.origin)return;
    // Scroll to a section in the current page without reloading the iframe.
    if(target.pathname===frame.contentWindow.location.pathname&&target.search===frame.contentWindow.location.search&&target.hash)return;
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
  }catch(error){console.warn('Internal page shell:',error.message)}
  finally{browser.classList.remove('svitlo-internal-loading')}
 });
 window.SvitloInternalPages={open:url=>display(url),close:dismiss};
})();