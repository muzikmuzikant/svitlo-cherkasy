/* Beta homepage ad carousel and opt-in installed-PWA presence. */
(()=>{'use strict';
 const host=document.getElementById('betaAd'),home=document.getElementById('home');
 if(!host||!home)return;
 const consent=document.getElementById('betaAnalyticsConsent');
 const STATS_OPT='svitlo-beta-analytics-opt-in',INSTALL_ID='svitlo-beta-install-id',PENDING='svitlo-beta-analytics-delete-pending',CHOICE='svitlo-beta-analytics-choice',CHOICE_REV='svitlo-beta-analytics-consent-revision',REVISION='7.9.11-notices';
 let api='',config=null,items=[],index=0,timer=null,impressionTimer=null,refreshAt=0;
 let lastInteraction=Date.now(),swipeStart=null,counted=false;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const enabled=()=>{try{return localStorage.getItem(STATS_OPT)==='yes'&&localStorage.getItem(CHOICE_REV)===REVISION}catch{return false}};
 const key=()=>{try{let id=localStorage.getItem(INSTALL_ID);if(!id){id=crypto.randomUUID();localStorage.setItem(INSTALL_ID,id)}return id}catch{return ''}};
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 const homeOpen=()=>!home.hidden&&getComputedStyle(home).display!=='none';
 const canDisplay=()=>document.visibilityState==='visible'&&homeOpen();
 const active=()=>canDisplay()&&host.getBoundingClientRect().bottom>0&&host.getBoundingClientRect().top<innerHeight;
 const send=(id,type)=>{if(!api)return;fetch(api+'/api/ads/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,type}),keepalive:true}).catch(()=>{})};
 const stop=()=>{clearTimeout(timer);clearTimeout(impressionTimer);timer=null;impressionTimer=null};
 function maybeCount(){if(counted||!items[index]||!active())return;const id=items[index].id;clearTimeout(impressionTimer);
  impressionTimer=setTimeout(()=>{if(!counted&&active()&&items[index]?.id===id){counted=true;send(id,'impression')}},1000)
 }
 async function deletePending(){let id='';try{id=localStorage.getItem(PENDING)||''}catch{}if(!id)return;
  try{if(!api){const c=await fetch('./push-config.json',{cache:'no-store'}).then(r=>r.json());api=String(c.apiBase||'')}const response=await fetch(api+'/api/pwa/forget',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});if(response.ok)localStorage.removeItem(PENDING)}catch{}
 }
 async function load(force=false){
  if(!force&&config&&Date.now()-refreshAt<120000)return;
  const pc=await fetch('./push-config.json',{cache:'no-store'}).then(r=>r.json());
  api=String(pc.apiBase||'').replace(/\/$/,'');
  if(!/^https:\/\//.test(api))return;
  config=await fetch(api+'/api/ads',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Advertising API unavailable');return r.json()});
  refreshAt=Date.now();build();
 }
 function build(){
  items=[];index=0;stop();
  if(!config?.enabled){host.hidden=true;return}
  const ads=config.campaigns||[],promo={id:'promo',title:config.promoTitle,description:config.promoText,seconds:config.rotationSeconds,link:'./advertising.html',button:config.contactLabel};
  const every=Math.max(1,Number(config.promoEvery)||4);
  for(let i=0;i<ads.length;i++){
   const ad=ads[i];const repeat=Math.max(1,Math.min(5,Number(ad.weight)||1));
   for(let j=0;j<repeat;j++)items.push(ad);
   if(config.showPromo&&(i+1)%every===0)items.push(promo);
  }
  if(config.showPromo&&(!ads.length||ads.length%every!==0))items.push(promo);
  if(items.length){render();schedule()}else host.hidden=true;
 }
 function schedule(){
  clearTimeout(timer);
  if(!canDisplay()||items.length<=1)return;
  const duration=Math.max(3,Math.min(60,Number(items[index]?.seconds||config.rotationSeconds||8)));
  timer=setTimeout(()=>{index=(index+1)%items.length;render();schedule()},duration*1000);
 }
 function render(){
  clearTimeout(impressionTimer);counted=false;
  if(!items.length)return;
  const item=items[index];
  host.replaceChildren();host.hidden=false;
  const label=make('span',item.id==='promo'?'ВАША РЕКЛАМА':'РЕКЛАМА','beta-ad-label');host.append(label);
  const a=make('a',undefined,'beta-ad-content');
  const link=item.id==='promo'?'./advertising.html':item.detailEnabled?'./ad-detail.html?id='+encodeURIComponent(item.id):item.link;
  if(link){a.href=link;a.target=(item.id==='promo'||item.detailEnabled)?'_self':'_blank';a.rel='noopener noreferrer'}else{a.tabIndex=-1;a.setAttribute('aria-disabled','true')}
  if(item.image){const img=make('img');img.src=item.image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';a.append(img)}
  const body=make('div');body.append(make('strong',item.title||'Реклама'),make('small',item.description||''));
  const action=make('em',item.id==='promo'?(config.contactLabel||'Дізнатися більше'):(item.detailEnabled?'Детальніше':item.button||'Дізнатися більше'),'beta-ad-action');
  body.append(action);a.append(body);a.append(make('span','🔗','beta-ad-arrow'));
  a.style.backgroundColor=item.background||'#ffffff';a.style.color=item.foreground||'#142338';
  a.dataset.style=item.cardStyle||'soft';
  if(item.cardBackgroundImage){const dark=item.cardStyle==='dark';a.style.backgroundImage=(dark?'linear-gradient(90deg,#0b1e35e8,#0b1e3533),':'linear-gradient(90deg,#fffffff2,#ffffff44),')+'url("'+item.cardBackgroundImage.replace(/"/g,'')+'")';a.style.backgroundSize='cover';a.style.backgroundPosition='center'}
  a.addEventListener('click',()=>{if(link)send(item.id,'click')});
  host.append(a);
  const footer=make('div',undefined,'beta-ad-controls');
  const prev=make('button','⬅️','beta-ad-arrowbtn'),next=make('button','➡️','beta-ad-arrowbtn');
  prev.type=next.type='button';prev.setAttribute('aria-label','Попередня реклама');next.setAttribute('aria-label','Наступна реклама');
  prev.onclick=()=>move(-1);next.onclick=()=>move(1);
  footer.append(prev,make('span',(index+1)+' / '+items.length,'beta-ad-counter'),next);
  if(items.length>1&&config.manualSwipe)host.append(footer);
  if(config.animation==='slide')host.dataset.animation='slide';
  else if(config.animation==='none')host.dataset.animation='none';
  else host.dataset.animation='fade';
  if(canDisplay())maybeCount();
 }
 function move(delta){if(!items.length)return;index=(index+delta+items.length)%items.length;render();schedule()}
 document.addEventListener('scroll',()=>{if(canDisplay())maybeCount()},{passive:true});
 window.addEventListener('resize',()=>{if(canDisplay())maybeCount()},{passive:true});
 host.addEventListener('touchstart',e=>{if(config?.manualSwipe)swipeStart=e.touches[0]?.clientX??null},{passive:true});
 host.addEventListener('touchend',e=>{if(swipeStart==null)return;const dx=(e.changedTouches[0]?.clientX??swipeStart)-swipeStart;swipeStart=null;if(Math.abs(dx)>45)move(dx>0?-1:1)},{passive:true});
 function onVisible(){if(document.hidden){stop();return}if(items.length){render();schedule()}if(Date.now()-refreshAt>120000)load(true).catch(console.warn);heartbeat()}
 document.addEventListener('visibilitychange',onVisible);
 new MutationObserver(()=>{if(canDisplay()){render();schedule()}else stop()}).observe(home,{attributes:true,attributeFilter:['hidden','class','style']});
 if(consent){
  consent.checked=enabled();consent.addEventListener('change',async()=>{
   try{localStorage.setItem(STATS_OPT,consent.checked?'yes':'no');localStorage.setItem(CHOICE_REV,REVISION);localStorage.setItem(CHOICE,consent.checked?'accepted':'declined')}catch{}
   if(!consent.checked){
    try{const id=localStorage.getItem(INSTALL_ID);if(id)localStorage.setItem(PENDING,id);localStorage.removeItem(INSTALL_ID)}catch{}
    deletePending();
   }else{await deletePending();heartbeat()}
  });
 }
 for(const name of ['pointerdown','touchstart','keydown','scroll'])document.addEventListener(name,()=>{lastInteraction=Date.now()},{passive:true});
 function platform(){const ua=navigator.userAgent||'';return /iPad/i.test(ua)?'iPad':/iPhone|iPod/i.test(ua)?'iPhone':/Android/i.test(ua)?'Android':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Інше'}
 // Only the user-selected *primary* locality and queue. Never send street,
 // building, GPS, full address, or any identifier besides the opt-in install ID.
 function audience(){
  try{
   const saved=JSON.parse(localStorage.getItem('svitlo-addresses-v6')||'[]');
   const prefs=JSON.parse(localStorage.getItem('svitlo-prefs-v6')||'{}');
   const places=Array.isArray(saved)?saved:[];
   const place=places.find(p=>p.id===prefs.primaryId)||places[0]||{};
   const queue=/^[1-6]\.[12]$/.test(String(place.queue||''))?place.queue:'';
   const locality=String(place.settlement||'').trim().replace(/\s+/g,' ').slice(0,55);
   return {queue,locality};
  }catch{return {queue:'',locality:''}}
 }
 function version(){
  const value=document.querySelector('meta[name="svitlo-version"]')?.content||'';
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)?value:'';
 }
 async function heartbeat(){
  if(!enabled()||!standalone()||document.visibilityState!=='visible'||Date.now()-lastInteraction>90000)return;
  try{if(!api){const c=await fetch('./push-config.json',{cache:'no-store'}).then(r=>r.json());api=String(c.apiBase||'')}
   const id=key();if(!id)return;
   await fetch(api+'/api/pwa/presence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,mode:'standalone',consent:true,platform:platform(),version:version(),...audience()}),keepalive:true});
  }catch{}
 }
 setInterval(heartbeat,15000);setTimeout(heartbeat,1200);
 setInterval(()=>{if(document.visibilityState==='visible')load(true).catch(()=>{})},120000);
 setTimeout(deletePending,1800);
 const consentDialog=document.getElementById('betaConsentDialog');
 const accept=document.getElementById('betaConsentAccept');
 const decline=document.getElementById('betaConsentDecline');
 function setConsentChoice(granted){
  try{localStorage.setItem(CHOICE,granted?'accepted':'declined');localStorage.setItem(STATS_OPT,granted?'yes':'no');localStorage.setItem(CHOICE_REV,REVISION)}catch{}
  if(consent)consent.checked=granted;
  if(!granted){
   try{const existing=localStorage.getItem(INSTALL_ID);if(existing)localStorage.setItem(PENDING,existing);localStorage.removeItem(INSTALL_ID)}catch{}
   deletePending();
  }else heartbeat();
  if(consentDialog?.open)(window.SvitloMotion?.closeDialog||((d)=>d.close()))(consentDialog);
 }
 if(consentDialog){
  accept?.addEventListener('click',()=>setConsentChoice(true));
  decline?.addEventListener('click',()=>setConsentChoice(false));
  consentDialog.addEventListener('cancel',()=>setConsentChoice(false));
  const tryPrompt=()=>{
   if(!standalone()||document.visibilityState!=='visible'||!homeOpen())return;
   if(document.getElementById('emergencyBanner')?.hidden===false)return;
   if(document.getElementById('maintenanceScreen')?.hidden===false)return;
   try{if(localStorage.getItem(CHOICE_REV)===REVISION)return}
   catch{return}
   if(!consentDialog.open){consentDialog.showModal()}
  };
  setTimeout(tryPrompt,6500);
  document.querySelectorAll('[data-go="home"]').forEach(button=>button.addEventListener('click',()=>setTimeout(tryPrompt,4500),{once:true}));
 }
 load().catch(e=>console.warn('[beta-ads]',e.message));
})();