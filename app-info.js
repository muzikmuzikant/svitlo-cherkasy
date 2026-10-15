/* User-facing version, installation, permissions and explicit SW update check. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),button=$('checkAppRelease');if(!button)return;
 const set=(id,value)=>{if($(id))$(id).textContent=value};
 const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 function report(){
  const current=document.querySelector('meta[name="svitlo-version"]')?.content||'Невідома';
  set('appBuildDetails','Встановлена версія: '+current);
  set('appPwaDetails',installed()?'Встановлений застосунок (PWA)':'Відкрито у браузері');
  const permission='Notification'in window?Notification.permission:'unsupported';
  set('appPushDetails',({granted:'Дозволені пристроєм',denied:'Заблоковані пристроєм',default:'Дозвіл ще не надано',unsupported:'Не підтримуються'})[permission]||'Невідомо');
 }
 button.onclick=async()=>{
  if(button.disabled)return;button.disabled=true;
  set('appReleaseStatus','Перевіряємо…');
  try{
   const response=await fetch('./release.json?_fresh='+Date.now(),{cache:'no-store'});
   if(!response.ok)throw Error('Не вдалося отримати дані про версію');
   const release=await response.json();
   const current=document.querySelector('meta[name="svitlo-version"]')?.content||'';
   if('serviceWorker'in navigator){const reg=await navigator.serviceWorker.getRegistration();await reg?.update()}
   const version=String(release.version||'');
   const diff=version&&version!==current;
   set('appReleaseStatus',diff?'На сервері доступна версія '+version+'. Оновлення перевірено.':'Поточна версія: '+current+'. Запит на оновлення виконано.');
  }catch(e){set('appReleaseStatus','Не вдалося перевірити оновлення: '+e.message)}
  finally{button.disabled=false}
 };
 document.querySelector('[data-go="settings"]')?.addEventListener('click',report);
 window.addEventListener('focus',report);setTimeout(report,200);
})();