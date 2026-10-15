/* Beta homepage ad carousel and opt-in installed-PWA presence. */
(()=>{'use strict';
 const host=document.getElementById('betaAd'),home=document.getElementById('home');
 if(!host||!home)return;
 const consent=document.getElementById('betaAnalyticsConsent');
 const STATS_OPT='svitlo-beta-analytics-opt-in',INSTALL_ID='svitlo-beta-install-id';
 let api='',config=null,items=[],index=0,timer=null,impressionTimer=null,refreshAt=0;
 let lastInteraction=Date.now(),observed=false,visible=false,swipeStart=null;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const enabled=()=>{try{return localStorage.getItem(STATS_OPT)==='yes'}catch{return false}};
 const key=()=>{try{let id=localStorage.getItem(INSTALL_ID);if(!id){id=crypto.randomUUID();localStorage.setItem(INSTALL_ID,id)}return id}catch{return ''}};
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
 const homeOpen=()=>!home.hidden&&getComputedStyle(home).display!=='none';
 const canDisplay=()=>document.visibilityState==='visible'&&homeOpen();
 const active=()=>canDisplay()&&host.getBoundingClientRect().bottom>0&&host.getBoundingClientRect().top<innerHeight;
 const send=(id,type)=>{if(!api)return;fetch(api+'/api/ads/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,type}),keepalive:true}).catch(()=>{})};
 const stop=()=>{clearTimeout(timer);clearTimeout(impressionTimer);timer=null;impressionTimer=null};
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
  clearTimeout(impressionTimer);
  if(!items.length)return;
  const item=items[index];
  host.replaceChildren();host.hidden=false;
  const label=make('span',item.id==='promo'?'ВАША РЕКЛАМА':'РЕКЛАМА','beta-ad-label');host.append(label);
  const a=make('a',undefined,'beta-ad-content');
  const link=item.id==='promo'?'./advertising.html':item.link;
  if(link){a.href=link;a.target='_blank';a.rel='noopener noreferrer'}else{a.tabIndex=-1;a.setAttribute('aria-disabled','true')}
  if(item.image){const img=make('img');img.src=item.image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';a.append(img)}
  const body=make('div');body.append(make('strong',item.title||'Реклама'),make('small',item.description||''));
  const action=make('em',item.id==='promo'?(config.contactLabel||'Дізнатися більше'):(item.button||'Дізнатися більше'),'beta-ad-action');
  body.append(action);a.append(body);a.append(make('span','↗','beta-ad-arrow'));
  a.style.backgroundColor=item.background||'#ffffff';a.style.color=item.foreground||'#142338';
  a.addEventListener('click',()=>{if(link)send(item.id,'click')});
  host.append(a);
  const footer=make('div',undefined,'beta-ad-controls');
  const prev=make('button','‹','beta-ad-arrowbtn'),next=make('button','›','beta-ad-arrowbtn');
  prev.type=next.type='button';prev.setAttribute('aria-label','Попередня реклама');next.setAttribute('aria-label','Наступна реклама');
  prev.onclick=()=>move(-1);next.onclick=()=>move(1);
  footer.append(prev,make('span',(index+1)+' / '+items.length,'beta-ad-counter'),next);
  if(items.length>1&&config.manualSwipe)host.append(footer);
  if(config.animation==='slide')host.dataset.animation='slide';
  else if(config.animation==='none')host.dataset.animation='none';
  else host.dataset.animation='fade';
  if(canDisplay())impressionTimer=setTimeout(()=>{if(active()&&items[index]?.id===item.id)send(item.id,'impression')},1000);
 }
 function move(delta){if(!items.length)return;index=(index+delta+items.length)%items.length;render();schedule()}
 host.addEventListener('touchstart',e=>{if(config?.manualSwipe)swipeStart=e.touches[0]?.clientX??null},{passive:true});
 host.addEventListener('touchend',e=>{if(swipeStart==null)return;const dx=(e.changedTouches[0]?.clientX??swipeStart)-swipeStart;swipeStart=null;if(Math.abs(dx)>45)move(dx>0?-1:1)},{passive:true});
 function onVisible(){if(document.hidden){stop();return}if(items.length){render();schedule()}if(Date.now()-refreshAt>120000)load(true).catch(console.warn);heartbeat()}
 document.addEventListener('visibilitychange',onVisible);
 new MutationObserver(()=>{if(canDisplay()){render();schedule()}else stop()}).observe(home,{attributes:true,attributeFilter:['hidden','class','style']});
 if(consent){
  consent.checked=enabled();consent.addEventListener('change',async()=>{
   try{localStorage.setItem(STATS_OPT,consent.checked?'yes':'no')}catch{}
   if(!consent.checked){const id=(()=>{try{return localStorage.getItem(INSTALL_ID)}catch{return null}})();
    if(id&&api)fetch(api+'/api/pwa/forget',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})}).catch(()=>{});
    try{localStorage.removeItem(INSTALL_ID)}catch{}
   }else heartbeat();
  });
 }
 for(const name of ['pointerdown','touchstart','keydown','scroll'])document.addEventListener(name,()=>{lastInteraction=Date.now()},{passive:true});
 function platform(){const ua=navigator.userAgent||'';return /iPad/i.test(ua)?'iPad':/iPhone|iPod/i.test(ua)?'iPhone':/Android/i.test(ua)?'Android':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Інше'}
 async function heartbeat(){
  if(!enabled()||!standalone()||document.visibilityState!=='visible'||Date.now()-lastInteraction>90000)return;
  try{if(!api){const c=await fetch('./push-config.json',{cache:'no-store'}).then(r=>r.json());api=String(c.apiBase||'')}
   const id=key();if(!id)return;
   await fetch(api+'/api/pwa/presence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,mode:'standalone',consent:true,platform:platform()}),keepalive:true});
  }catch{}
 }
 setInterval(heartbeat,15000);setTimeout(heartbeat,1200);
 load().catch(e=>console.warn('[beta-ads]',e.message));
})();