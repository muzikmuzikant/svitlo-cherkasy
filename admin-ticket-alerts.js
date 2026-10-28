/* Svitlo Office live new-ticket notifications.
 * Polling is driven by the existing authenticated admin.js client.
 * No ticket message, email, photo, user token or private note is persisted.
 */
(()=>{'use strict';
 const dashboard=document.getElementById('adminDashboard');
 const panel=dashboard?.querySelector('[data-admin-panel="feedback"]');
 const nav=dashboard?.querySelector('[data-admin-tab="feedback"]');
 if(!dashboard||!panel||!nav)return;
 const el=(tag,content,css)=>{
  const node=document.createElement(tag);
  if(content!==undefined)node.textContent=content;
  if(css)node.className=css;
  return node;
 };
 const badge=el('span','','office-ticket-alert-count');
 badge.hidden=true;badge.setAttribute('aria-label','Нові звернення');
 nav.append(badge);
 const line=el('div',undefined,'office-ticket-alert-line');
 const info=el('div',undefined,'office-ticket-alert-info');
 const title=el('strong','Нові звернення');
 const subtitle=el('span','Перевіряємо вхідні повідомлення…');
 info.append(title,subtitle);
 const actions=el('div',undefined,'office-ticket-alert-actions');
 const browserBtn=el('button','Сповіщення браузера','office-ticket-alert-button');
 browserBtn.type='button';
 const browse=el('button','До нових звернень','office-ticket-alert-button is-primary');
 browse.type='button';
 browse.onclick=()=>{nav.click();window.SvitloTicketWorkflow?.setView('new')};
 actions.append(browserBtn,browse);
 line.append(info,actions);
 panel.querySelector('.headline')?.after(line);
 let known=null,toastTimer=null,pushEnabled=false;
 const active=()=>!dashboard.hidden&&!!document.body.dataset.adminRole;
 const permission=()=>{
  if(!('Notification' in window))return 'unavailable';
  return window.Notification.permission;
 };
 const updatePermission=()=>{
  if(pushEnabled){browserBtn.hidden=false;browserBtn.textContent='Push увімкнено ✓';browserBtn.title='Фонові push-сповіщення підключено на цьому пристрої';browserBtn.disabled=true;return}
  const state=permission();
  browserBtn.hidden=state==='unavailable'||state==='denied';
  browserBtn.textContent=state==='granted'?'Увімкнути push на цьому пристрої':'Увімкнути push-сповіщення';
  browserBtn.title=state==='denied'?'Дозвіл вимкнений у налаштуваннях браузера':'Увімкнути фонові push про нові звернення';
 };
 browserBtn.onclick=async()=>{
  if(!active())return;
  browserBtn.disabled=true;
  const previous=browserBtn.textContent;
  browserBtn.textContent='Підключаємо push…';
  try{
   if(!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('Цей браузер не підтримує фонові push.');
   if(permission()==='default'){
    const granted=await window.Notification.requestPermission();
    if(granted!=='granted')throw Error('Дозвольте сповіщення в налаштуваннях браузера.');
   }
   if(permission()!=='granted')throw Error('Дозвіл на сповіщення вимкнений у налаштуваннях браузера.');
   const api=window.svitloAdminApi;
   if(typeof api!=='function')throw Error('Сервер адмінки ще не готовий. Оновіть сторінку.');
   const cfg=await api('push-subscription');
   if(!cfg.publicKey)throw Error('На сервері не налаштований VAPID-ключ push.');
   const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
   await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(!subscription)subscription=await registration.pushManager.subscribe({
    userVisibleOnly:true,
    applicationServerKey:Uint8Array.from(atob(cfg.publicKey.replace(/-/g,'+').replace(/_/g,'/')),ch=>ch.charCodeAt(0))
   });
   await api('push-subscription',{method:'POST',body:JSON.stringify({subscription:subscription.toJSON()})});
   pushEnabled=true;
   browserBtn.textContent='Push увімкнено ✓';
   subtitle.textContent='Цей пристрій отримуватиме фонові push про нові звернення.';
  }catch(error){
   subtitle.textContent=error.message||'Не вдалося підключити push. Спробуйте ще раз.';
   browserBtn.textContent='Повторити підключення push';
  }finally{updatePermission();if(!pushEnabled){browserBtn.disabled=false;if(previous==='Сповіщення браузера'&&permission()==='default')browserBtn.textContent='Увімкнути push-сповіщення'}}
 };
 const view=()=>{
  nav.click();
  window.SvitloTicketWorkflow?.setView('new');
 };
 function showToast(newTickets){
  document.querySelector('.office-ticket-alert-toast')?.remove();
  clearTimeout(toastTimer);
  const toast=el('div',undefined,'office-ticket-alert-toast');
  toast.setAttribute('role','status');
  const heading=el('strong',newTickets.length===1?'Надійшло нове звернення':'Нові звернення: '+newTickets.length);
  const detail=el('span',newTickets.length===1?newTickets[0].id:
   'Потрібно перевірити вхідну кореспонденцію.');
  const open=el('button','Переглянути');open.type='button';
  open.onclick=()=>{toast.remove();view()};
  const close=el('button','×','office-ticket-toast-close');
  close.type='button';close.setAttribute('aria-label','Закрити повідомлення');
  close.onclick=()=>toast.remove();
  toast.append(heading,detail,open,close);document.body.append(toast);
  toastTimer=setTimeout(()=>toast.remove(),9000);
 }
 function notifyBrowser(newTickets){
  if(permission()!=='granted')return;
  const count=newTickets.length;
  try{new window.Notification('Світло Черкаси · '+(count===1?'Нове звернення':'Нові звернення'),{
   body:count===1?'Надійшло звернення '+newTickets[0].id:'Надійшло '+count+' звернень. Відкрийте Svitlo Office.',
   tag:'svitlo-admin-ticket-'+newTickets.at(-1).id
  })}catch{}
 }
 function sync(){
  if(!active())return;
  const tickets=window.SvitloTicketWorkflow?.list();
  if(!Array.isArray(tickets))return;
  const ids=new Set(tickets.map(x=>x.id));
  const newCases=tickets.filter(x=>x.status==='new');
  badge.hidden=!newCases.length;
  badge.textContent=String(Math.min(99,newCases.length))+(newCases.length>99?'+':'');
  title.textContent=newCases.length?
   (newCases.length===1?'1 звернення очікує опрацювання':newCases.length+' звернень очікують опрацювання'):
   'Вхідні звернення';
  subtitle.textContent=newCases.length?
   'Останні нові звернення доступні в реєстрі.':
   'Нових необроблених звернень немає.';
  updatePermission();
  if(known){
   const arrivals=newCases.filter(x=>!known.has(x.id));
   if(arrivals.length){showToast(arrivals);notifyBrowser(arrivals)}
  }
  known=ids;
 }
 document.addEventListener('svitlo:tickets-loaded',sync);
 document.addEventListener('svitlo:admin-logout',()=>{
  known=null;badge.hidden=true;badge.textContent='';
  clearTimeout(toastTimer);document.querySelector('.office-ticket-alert-toast')?.remove();
  title.textContent='Нові звернення';
  subtitle.textContent='Увійдіть, щоб переглянути вхідні.';
 });
 document.addEventListener('svitlo:admin-ready',()=>{known=null;updatePermission()});
 updatePermission();
})();
