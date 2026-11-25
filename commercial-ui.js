/* Additional sponsored placements and permanent partner. */
(()=>{'use strict';
 const special=document.getElementById('betaSpecialPlacement'),partner=document.getElementById('permanentPartnerCard');
 if(!special||!partner)return;
 let api='',last=0,config=null,observer=null;
 const seen=new Set();
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
 const flag=k=>!document.documentElement.classList.contains('feature-off-'+k);
 async function base(){
  if(api)return api;
  const c=await fetch('./push-config.json',{cache:'no-store'}).then(r=>r.json());
  api=String(c.apiBase||'').replace(/\/$/,'');
  if(!/^https:\/\//.test(api))throw Error('api');
  return api;
 }
 function track(id,type){
  if(api)fetch(api+'/api/ads/event',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({id,type}),keepalive:true}).catch(()=>{});
 }
 function observe(node,id){
  if(seen.has(id)||!('IntersectionObserver' in window))return;
  if(!observer)observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!entry.isIntersecting||entry.intersectionRatio<0.5)continue;
    const key=entry.target.dataset.commercialId;
    if(key&&!seen.has(key)){seen.add(key);track(key,'impression')}
    observer.unobserve(entry.target);
   }
  },{threshold:0.5});
  node.dataset.commercialId=id;observer.observe(node);
 }
 function safeLink(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}
  catch{return ''}
 }
 function promoCard(item){
  const card=make('article',undefined,'commercial-card commercial-card-special');observe(card,item.id);
  card.append(make('span','РЕКЛАМА','commercial-label'));
  if(item.image&&safeLink(item.image)){
   const img=make('img');img.src=safeLink(item.image);img.alt='';img.loading='lazy';card.classList.add('has-image');card.append(img);
  }
  const copy=make('div',undefined,'commercial-copy');
  copy.append(make('strong',item.title||'Спеціальна пропозиція'),make('p',item.description||''));
  const href=safeLink(item.link),action=make('a',item.button||'Детальніше','commercial-action');
  if(href){action.href=href;action.target='_blank';action.rel='noopener noreferrer';action.addEventListener('click',()=>track(item.id,'click'))}
  else{action.tabIndex=-1;action.setAttribute('aria-disabled','true')}
  copy.append(action);card.append(copy);return card;
 }
 function render(){
  if(!config)return;
  special.replaceChildren();partner.replaceChildren();
  const promos=Array.isArray(config.specialPlacements)?config.specialPlacements:[];
  special.hidden=!flag('adSpecialPlacements')||!promos.length;
  if(!special.hidden){
   special.append(make('h2','Спеціальні пропозиції','commercial-section-title'));
   for(const item of promos.slice(0,2))special.append(promoCard(item));
  }
  const p=config.permanentPartner||{};
  partner.hidden=!flag('permanentPartner')||p.enabled!==true||!p.name;
  if(!partner.hidden){
   partner.append(make('span','ПОСТІЙНИЙ ПАРТНЕР','commercial-eyebrow'));
   const row=make('div',undefined,'permanent-partner-content');observe(row,'permanent-partner');
   if(p.logo&&safeLink(p.logo)){
    const img=make('img');img.src=safeLink(p.logo);img.alt='Логотип '+p.name;img.loading='lazy';row.append(img);
   }
   const copy=make('div');copy.append(make('strong',p.name),make('p',p.description||''));row.append(copy);
   const href=safeLink(p.url);
   if(href){const a=make('a','Сайт партнера ↗','commercial-partner-link');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.addEventListener('click',()=>track('permanent-partner','click'));row.append(a)}
   partner.append(row);
  }

 }
 async function load(force=false){
  if(!force&&Date.now()-last<120000)return;
  try{const root=await base(),response=await fetch(root+'/api/ads',{cache:'no-store'});if(!response.ok)throw Error('ads');config=await response.json();last=Date.now();render()}
  catch{special.hidden=partner.hidden=true}
 }
 load(true);
 document.addEventListener('svitlo:public-config',render);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load(true)});
 window.addEventListener('online',()=>load(true));
 window.SvitloCommercial={refresh:()=>load(true)};
})();