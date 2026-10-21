/* Public social directory. No tracking, private identifiers, or HTML injection.
 * Railway /api/app-config remains authoritative for what is shown. */
(()=>{'use strict';
 const DEFAULT={enabled:true,showInApp:true,showInFooter:true,
  links:[{id:'telegram_official',platform:'telegram',label:'Telegram',url:'https://t.me/svitlo_cherkasy_of',enabled:true}]};
 const ICONS={
  telegram:'✈',instagram:'◎',facebook:'f',tiktok:'♪',youtube:'▶',
  threads:'@',website:'↗',other:'↗'
 };
 const NAME={telegram:'Telegram',instagram:'Instagram',facebook:'Facebook',
  tiktok:'TikTok',youtube:'YouTube',threads:'Threads',website:'Сайт',other:'Посилання'};
 const $=id=>document.getElementById(id);
 let lastSite=null,fetchPending=null,base='';
 function secureUrl(value){
  try{
   const u=new URL(String(value||''));
   return u.protocol==='https:'&&!u.username&&!u.password&&!/[\s<>]/.test(String(value||''))?
    u.href:'';
  }catch{return ''}
 }
 function social(site){
  const raw=site?.social===undefined?DEFAULT:site.social;
  if(!raw||raw.enabled===false)return {showInApp:false,showInFooter:false,links:[]};
  const source=Array.isArray(raw.links)?raw.links:[];
  const links=source.slice(0,12).flatMap(x=>{
   if(!x||x.enabled===false)return [];
   const href=secureUrl(x.url),label=String(x.label||'').trim().slice(0,48);
   if(!href||!label)return [];
   const platform=Object.hasOwn(ICONS,x.platform)?x.platform:'other';
   return [{href,label,platform}];
  });
  return {showInApp:raw.showInApp!==false,showInFooter:raw.showInFooter!==false,links};
 }
 function createLink(info){
  const link=document.createElement('a');
  link.href=info.href;link.target='_blank';link.rel='noopener noreferrer';
  link.className='svitlo-social-link social-'+info.platform;
  link.setAttribute('aria-label',info.label+' (відкриється в новій вкладці)');
  const logo=document.createElement('span');logo.className='svitlo-social-icon';
  logo.textContent=ICONS[info.platform];logo.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.textContent=info.label;
  link.append(logo,label);return link;
 }
 function mountFooter(){
  const old=$('svitloSocialFooter');if(old)return old;
  const footer=document.querySelector('footer:not(.maintenance-bottom)')||
   (()=>{const el=document.createElement('footer');el.className='svitlo-page-footer';
    const parent=document.querySelector('main')||document.body;
    parent.append(el);return el})();
  const host=document.createElement('nav');
  host.id='svitloSocialFooter';host.className='svitlo-social-footer';
  host.setAttribute('aria-label','Соціальні мережі Світло Черкаси');
  host.hidden=true;footer.append(host);return host;
 }
 function mountSettings(){return $('svitloSocialSettings')}
 function mountLanding(){return $('svitloSocialLanding')}
 function draw(target,list,kind){
  if(!target)return;
  target.replaceChildren();
  target.hidden=!list.length;
  if(!list.length)return;
  if(kind==='app'){
   const text=document.createElement('span');text.className='svitlo-social-caption';text.textContent='Ми в соцмережах';
   target.append(text);
  }else{
   const text=document.createElement('span');text.className='svitlo-social-caption';
   text.textContent='Слідкуйте за оновленнями';
   target.append(text);
  }
  const row=document.createElement('div');row.className='svitlo-social-links';
  for(const entry of list)row.append(createLink(entry));
  target.append(row);
 }
 function render(site){
  if(!site||typeof site!=='object')return;
  lastSite=site;
  const data=social(site);
  const app=mountSettings(),landing=mountLanding();
  draw(app,data.showInApp?data.links:[],'app');
  if(landing)draw(landing,data.showInFooter?data.links:[],'footer');
  const footerHost=app?null:mountFooter();
  if(footerHost)draw(footerHost,data.showInFooter?data.links:[],'footer');
 }
 async function refresh(){
  if(fetchPending)return fetchPending;
  fetchPending=(async()=>{
   if(!base){
    const config=await fetch('./push-config.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!config.ok)throw Error('Site configuration is unavailable');
    const obj=await config.json(),url=new URL(String(obj.apiBase||''));
    if(url.protocol!=='https:')throw Error('Invalid public API');
    base=url.origin;
   }
   const response=await fetch(base+'/api/app-config',{cache:'no-store',signal:AbortSignal.timeout(9000)});
   if(!response.ok)throw Error('Public configuration unavailable');
   const result=await response.json();
   render(result.site);return true;
  })().catch(()=>false).finally(()=>{fetchPending=null});
  return fetchPending;
 }
 function initialize(){
  // Installed PWA receives the same config from site-mode.js, without extra requests.
  if($('svitloSocialSettings')){
   if(window.SvitloPublicConfig?.site)render(window.SvitloPublicConfig.site);
   window.addEventListener('svitlo:public-config',e=>render(e.detail?.site));
  }else{
   mountFooter();void refresh();
   window.addEventListener('focus',()=>{if(!document.hidden)void refresh()});
   window.addEventListener('online',()=>void refresh());
   const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('svitlo-content-v1'):null;
   channel?.addEventListener('message',e=>{if(e.data?.type==='REFRESH_APP_CONFIG')void refresh()});
   window.addEventListener('pagehide',()=>channel?.close(),{once:true});
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
 else initialize();
 window.SvitloSocialLinks={render,refresh};
})();
