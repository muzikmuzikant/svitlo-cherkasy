/* Public maintenance & announcements. Server configuration is authoritative.
 * Full/incident mode can hide the PWA; limited mode shows a non-blocking banner.
 */
(()=>{'use strict';
 const overlay=document.getElementById('maintenanceScreen');if(!overlay)return;
 const $=id=>document.getElementById(id),viewport=document.querySelector('.viewport');
 let apiBase='',busy=false,lastConfig=null;
 const banner=document.createElement('aside');banner.className='maintenance-inline';banner.hidden=true;
 banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 if(viewport)viewport.prepend(banner);
 const symbol=overlay.querySelector('.maintenance-symbol');
 function timed(m){
  const now=Date.now();return m?.enabled===true&&(!m.startsAt||Date.parse(m.startsAt)<=now)&&(!m.until||Date.parse(m.until)>now);
 }
 function display(data,{offline=false}={}){
  const m=data?.maintenance||{},active=!offline&&timed(m),full=active&&m.mode!=='limited';
  overlay.hidden=!full;banner.hidden=!(active&&!full);
  for(const part of [document.getElementById('installLanding'),viewport])if(part)part.inert=full;
  $('maintenanceTitle').textContent=m.title||'Технічні роботи';
  $('maintenanceMessage').textContent=m.message||'Незабаром повернемося.';
  overlay.dataset.theme=['blue','midnight','light','violet'].includes(m.theme)?m.theme:'blue';
  if(symbol){symbol.replaceChildren();
   if(typeof m.imageUrl==='string'&&/^https:\/\//.test(m.imageUrl)){
    const img=document.createElement('img');img.src=m.imageUrl;img.alt='Ілюстрація техробіт';symbol.append(img);
   }else symbol.textContent=String(m.icon||'✨').slice(0,18);
  }
  let remaining='';
  if(m.until&&Number.isFinite(Date.parse(m.until))&&Date.parse(m.until)>Date.now()){
   const minutes=Math.ceil((Date.parse(m.until)-Date.now())/60000);
   remaining=minutes<60?'Орієнтовно ще '+minutes+' хв': 'Орієнтовно до '+new Date(m.until).toLocaleString('uk-UA',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Kyiv'});
  }
  $('maintenanceEta').textContent=remaining;
  if(active&&!full){
   banner.replaceChildren();
   const icon=document.createElement('strong');icon.textContent=String(m.icon||'🛠️').slice(0,18);
   const text=document.createElement('span');text.textContent=(m.title||'Технічні роботи')+'. '+(m.message||'Деякі функції можуть бути тимчасово недоступні.');
   banner.append(icon,text);
  }
  if(!offline){
   // EVERY successful server snapshot must reach Inbox, including the empty list.
   // On iPhone the first event can fire before inbox-ui.js loads. It must also
   // be available as an immediately readable state on window.
   window.SvitloPublicConfig={announcements:Array.isArray(data.announcements)?data.announcements:[],
    maintenance:active,updatedAt:data.updatedAt||null,serverVerified:true};
   window.dispatchEvent(new CustomEvent('svitlo:public-config',{detail:window.SvitloPublicConfig}));
  }
 }
 async function refresh(){
  if(busy)return;busy=true;
  try{
   if(!apiBase){const res=await fetch('./push-config.json',{cache:'no-store'});if(!res.ok)throw Error('Config unavailable');
    const cfg=await res.json();if(!/^https:\/\//.test(cfg.apiBase||''))throw Error('Server unavailable');
    apiBase=cfg.apiBase.replace(/\/$/,'');
   }
   const response=await fetch(apiBase+'/api/app-config',{cache:'no-store',signal:AbortSignal.timeout(9000)});
   if(!response.ok)throw Error('Public config HTTP '+response.status);
   const data=await response.json();lastConfig=data;display(data);
  }catch(e){
   // A temporary network outage must never trap users behind stale maintenance.
   if(lastConfig)display(lastConfig,{offline:true});
   else{overlay.hidden=true;banner.hidden=true}
   console.warn('App controls:',e.message);
  }finally{busy=false}
 }
 refresh();setInterval(()=>{if(!document.hidden)refresh()},12000);
 try{const channel=new BroadcastChannel('svitlo-content-v1');
  channel.addEventListener('message',event=>{if(event.data?.type==='REFRESH_APP_CONFIG')refresh()});
  window.addEventListener('pagehide',()=>channel.close(),{once:true});
 }catch{}
 window.SvitloControls={refresh};
 window.addEventListener('svitlo:refresh-content',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
 window.addEventListener('online',refresh);
})();
