/* Public, non-privileged control plane. Fail open on network errors.
 * Maintenance is OFF unless the authenticated Railway setting says otherwise.
 */
(()=>{'use strict';
 const overlay=document.getElementById('maintenanceScreen');
 if(!overlay)return;
 let lastActive=false,apiBase='',busy=false;
 const title=document.getElementById('maintenanceTitle'),message=document.getElementById('maintenanceMessage');
 const eta=document.getElementById('maintenanceEta');
 const humanTime=value=>new Date(value).toLocaleString('uk-UA',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Kyiv'});
 async function refresh(){
  if(busy)return;busy=true;
  try{
   if(!apiBase){const r=await fetch('./push-config.json',{cache:'no-store'});if(!r.ok)throw Error('No public config');
    const cfg=await r.json();if(!/^https:\/\//.test(cfg.apiBase||''))throw Error('Invalid service URL');
    apiBase=cfg.apiBase.replace(/\/$/,'');
   }
   const r=await fetch(apiBase+'/api/app-config',{cache:'no-store',signal:AbortSignal.timeout(9000)});
   if(!r.ok)throw Error('Operations endpoint unavailable');
   const data=await r.json(),m=data?.maintenance||{};
   const on=m.enabled===true&&(!m.until||Date.parse(m.until)>Date.now());
   title.textContent=String(m.title||'Технічні роботи');
   message.textContent=String(m.message||'Незабаром повернемося.');
   eta.textContent=m.until&&Number.isFinite(Date.parse(m.until))?'Орієнтовно до '+humanTime(m.until):'';
   overlay.hidden=!on;
   for(const part of [document.getElementById('installLanding'),document.querySelector('.viewport')])if(part)part.inert=on;
   lastActive=on;
   window.SvitloPublicConfig={announcements:Array.isArray(data.announcements)?data.announcements:[],maintenance:on};
   window.dispatchEvent(new CustomEvent('svitlo:public-config',{detail:window.SvitloPublicConfig}));
  }catch(e){if(!lastActive)overlay.hidden=true;console.warn('Public site controls:',e.message)}
  finally{busy=false}
 }
 refresh();setInterval(()=>{if(!document.hidden)refresh()},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
