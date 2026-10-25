importScripts('./notification-center.js');
const VERSION='svitlo-cherkasy-shell-v7.9.13-production-graph-motion-3';
const SHELL=["./","./index.html","./app.js","./address-lookup.js","./data/street_catalog.json","./notification-center.js","./notification-text.js","./message-format.js","./inbox-ui.js","./inbox-refresh.css","./support-inbox.js","./site-mode.js","./admin-control.js","./admin-richtext.js","./admin-help-richtext.js","./admin-control.css","./admin-feedback.css","./admin-ticket-workflow.js","./admin-office-plus.js","./admin-office-plus.css","./admin-mobile.js","./admin-mobile.css","./admin-workstation-v3.js","./admin-workstation-v3.css","./admin-dashboard.js","./admin-analytics.js","./admin-ads.js","./admin-ads.css","./client-errors.js","./admin-errors.js","./admin-reports.js","./motion.js","./motion.css","./bottom-sheet.js","./social-links.js","./social-links.css","./admin-social.js","./admin-social.css","./ticket-media-ui.js","./ticket-media.css","./admin-ticket-alerts.js","./admin-ticket-alerts.css","./internal-pages.js","./internal-pages.css","./legal-consent.js","./legal-consent.css","./admin-legal.js","./beta-ads.js","./ad-detail.html","./advertising.html","./support-project.html","./admin-security-ui.js","./admin-users.js","./admin-users.css","./admin-workspace.js","./admin-workspace.css","./admin-quality.js","./admin-schedule-diff.js","./admin-source-review.js","./admin-categories.js","./admin-features.js","./admin-form-safety.js","./admin-command.js","./data-merge.js","./hour-paint.js","./all-queues-core.js","./all-queues.js","./all-queues.css","./maintenance-backup.js","./micro-motion.css","./micro-motion.js","./admin-motion.css","./admin-access.js","./admin-access.css","./redesign-7913.css","./admin.html","./admin.js","./style.css","./theme.js","./theme.css","./maintenance-ui.css","./install.css","./install.js","./version-check.js","./release.json","./manifest.webmanifest","./privacy.html","./terms.html","./about.html","./feedback.html","./feedback.js","./feedback.css","./help.html","./help.css","./help.js","./admin-extra.js","./admin-planner.js","./schedule-planner.js","./favicon.ico","./favicon-16.png","./favicon-32.png","./favicon-48.png","./assets/icon.svg","./assets/icon-192-v692.png","./assets/icon-512-v692.png","./assets/icon-512-maskable-v692.png","./apple-touch-icon-v692.png","./apple-touch-icon.png"];
const CACHE_DATA='svitlo-cherkasy-data-v6.7';
const CACHE_IMAGES='svitlo-cherkasy-media-v74';
const CACHE_SNAPSHOTS='svitlo-cherkasy-offline-snapshots-v1';
const ESSENTIAL_DATA=['./data/schedules.json','./data/addresses.json','./data/published_street_fallback.json','./data/street_catalog.json','./data/street_aliases.json','./data/emergency.json','./data/manual_overrides.json','./push-config.json'];
// Only these files are required for a complete offline first screen. Optional
// pages and images are cached on demand instead of delaying SW installation.
const OFFLINE_CORE=['./','./index.html','./app.js','./style.css','./theme.js','./theme.css',
 './install.js','./hour-paint.js','./address-lookup.js',
 './data-merge.js','./notification-center.js'];
const OFFLINE_BOOT=[...OFFLINE_CORE,'./install.css','./notification-text.js','./message-format.js',
 './inbox-ui.js','./support-inbox.js','./version-check.js','./site-mode.js','./beta-ads.js',
 './client-errors.js','./internal-pages.js','./internal-pages.css',
 './all-queues-core.js','./all-queues.js','./all-queues.css','./micro-motion.js','./micro-motion.css',
 // Keep informational screens functional on a freshly installed offline PWA.
 './help.html','./help.js','./help.css','./feedback.html','./feedback.js','./feedback.css',
 './privacy.html','./terms.html','./about.html','./advertising.html',
 './support-project.html','./ad-detail.html',
 './legal-consent.js','./legal-consent.css','./motion.js','./motion.css','./bottom-sheet.js','./social-links.js','./social-links.css','./ticket-media-ui.js','./ticket-media.css',
 './maintenance-ui.css','./assets/icon-192-v692.png'];

function offlineCopy(response){
 const headers=new Headers(response.headers);
 headers.set('X-Svitlo-Cache','offline');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(VERSION);
 // Only the minimum startup chain is critical: a transient missing icon or
 // optional helper must never prevent iOS from installing the offline shell.
 // Failed core files abort the upgrade so the previously working SW survives.
 await cache.addAll(OFFLINE_CORE.map(url=>new Request(url,{cache:'reload'})));
 await Promise.allSettled(OFFLINE_BOOT.filter(url=>!OFFLINE_CORE.includes(url)).map(async url=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
  try{
   const fresh=await fetch(new Request(url,{cache:'reload',signal:controller.signal}));
   if(fresh.ok)await cache.put(new Request(url),fresh);
  }finally{clearTimeout(timer)}
 }));
 // Seed offline schedules and addresses. Missing optional data must not prevent
 // the application shell from becoming available, and never wipe old caches.
 const dataCache=await caches.open(CACHE_DATA);
 await Promise.allSettled(ESSENTIAL_DATA.map(async url=>{
  try{
   const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),4000);
   try{
    const response=await fetch(new Request(url,{cache:'reload',signal:ctrl.signal}));
    if(response.ok)await dataCache.put(new Request(url),response.clone());
   }finally{clearTimeout(timeout)}
  }catch(error){console.warn('Optional offline seed:',url,error?.message)}
 }));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>![VERSION,CACHE_DATA,CACHE_IMAGES,CACHE_SNAPSHOTS].includes(k)).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const u=new URL(req.url);
 if(u.origin!==self.location.origin){
   // Cache photos displayed in the message reader for offline access.
   if(req.destination==='image'&&u.protocol==='https:'){
    event.respondWith((async()=>{
     const cache=await caches.open(CACHE_IMAGES),saved=await cache.match(req);
     try{const live=await fetch(req);if(live.ok||live.type==='opaque'){
       await cache.put(req,live.clone()).catch(()=>{});
       const entries=await cache.keys();if(entries.length>45)await cache.delete(entries[0]);
       return live;
      }return saved||live
     }catch{return saved||Response.error()}
    })());return;
   }
   return;
 }
 const scopePath=new URL(self.registration.scope).pathname;
 const relative=u.pathname.startsWith(scopePath)?'./'+u.pathname.slice(scopePath.length):null;
 const appShell=u.pathname===scopePath||relative==='./index.html';
 const subsidiaryPages=new Set(['./help.html','./feedback.html','./privacy.html','./terms.html',
  './about.html','./advertising.html','./support-project.html','./ad-detail.html']);
 const subsidiary=relative&&subsidiaryPages.has(relative);
 // On the network, refresh HTML and essential JS/CSS so installed iPhone
 // PWAs can pick up a deployed release rather than always showing old cache.
 // Offline fallback preserves the last complete shell. Shared-link params are
 // deliberately ignored for the cache key.
 if(req.mode==='navigate'||(relative&&OFFLINE_BOOT.includes(relative))){
  event.respondWith((async()=>{
   const cache=await caches.open(VERSION),key=new Request(u.origin+u.pathname);
   const cached=await cache.match(key);
   // Secondary pages are complete HTML documents, NOT a substitute index.html.
   // Returning index.html from a help/feedback iframe makes its contents look blank
   // or like a nested PWA installer. Always use that page's own cached document.
   const fallback=async()=>{
    if(cached)return offlineCopy(cached);
    if(appShell)return (await cache.match('./index.html'))||Response.error();
    if(subsidiary)return new Response('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;padding:24px"><main id="svitloInternalOffline"><h1>Немає з’єднання</h1><p>Не вдалося завантажити цю сторінку. Підключіться до інтернету та спробуйте ще раз.</p></main></body></html>',{status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    return Response.error();
   };
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),req.mode==='navigate'?6500:2500);
   try{
    const fresh=await fetch(new Request(req,{cache:'no-store',signal:controller.signal}));
    if(fresh.ok){
     await cache.put(key,fresh.clone()).catch(()=>{});
     return fresh;
    }
    return await fallback();
   }catch{
    return await fallback();
   }finally{clearTimeout(timeout)}
  })());return;
 }
 if(u.pathname.endsWith('/release.json')){
  event.respondWith((async()=>{try{return await fetch(req,{cache:'no-store'})}
   catch{return (await caches.match('./release.json'))||Response.error()}})());return;
 }
 if(u.pathname.includes('/data/')||u.pathname.endsWith('/push-config.json')){
   event.respondWith((async()=>{
     const key=new Request(u.origin+u.pathname);
     const cache=await caches.open(CACHE_DATA);
     const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),2500);
     try{
      const fresh=await fetch(req,{signal:ctrl.signal});
      if(fresh.ok){await cache.put(key,fresh.clone());return fresh}
      const old=await cache.match(key);return old?offlineCopy(old):fresh;
     }catch{
      const old=await cache.match(key);
      return old?offlineCopy(old):new Response('Offline, no cache',{status:503,headers:{'Content-Type':'text/plain'}});
     }finally{clearTimeout(timeout)}
   })());return;
 }
 event.respondWith((async()=>{
 const cache=await caches.open(VERSION),key=new Request(u.origin+u.pathname);
 const cached=await cache.match(key);
 if(cached)return cached;
 try{
  const fresh=await fetch(req);
  if(fresh.ok&&u.pathname.match(/(?:\.js|\.css|\.html|\.png|\.svg|\.webmanifest)$/))
   await cache.put(key,fresh.clone()).catch(()=>{});
  return fresh;
 }catch{return Response.error()}
})());
});
// Include a short hash so long change IDs cannot share the same truncated tag.
function stablePushTag(value){
 const text=String(value||'push');let hash=2166136261;
 for(const ch of text){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)}
 return text.slice(0,54)+'-'+(hash>>>0).toString(36);
}
// A receipt confirms ONLY that showNotification() resolved, not that a user saw
// an alert. Failure to report must never block the visible notification.
async function reportPushDisplay(receiptId){
 if(typeof receiptId!=='string'||!/^[A-Za-z0-9_-]{24}$/.test(receiptId))return;
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),3000);
 try{
  const response=await fetch('./push-config.json',{cache:'no-store',signal:ctrl.signal});
  if(!response.ok)return;
  const config=await response.json(),origin=String(config?.apiBase||'');
  if(!/^https:\/\/[^\s/]+(?:\/)?$/.test(origin))return;
  await fetch(origin.replace(/\/$/,'')+'/api/push/receipt',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({receiptId,status:'display-requested'}),signal:ctrl.signal,cache:'no-store'
  });
 }catch(error){console.warn('Push display receipt:',error?.message||error)}
 finally{clearTimeout(timeout)}
}
self.addEventListener('push',event=>{
 let msg={title:'💡 Світло Черкаси',body:'Є нове повідомлення про графік.'};
 try{if(event.data)msg=Object.assign(msg,event.data.json())}catch{}
 // Even a push with malformed optional content must show a visible alert on iOS.
 const canonical=typeof msg.notificationId==='string'&&(
  /^notice:[A-Za-z0-9_-]{6,64}$/.test(msg.notificationId)||
  /^(?:day|change|emergency|transition):[A-Za-z0-9_.:+-]{1,145}$/.test(msg.notificationId)
 )?msg.notificationId:null;
 const id=canonical||'push:'+stablePushTag(msg.tag||msg.title);
 const inboxAllowed=msg.inbox!==false;
 const kind=['schedule','emergency','announcement','push'].includes(msg.kind)?msg.kind:(id.startsWith('notice:')?'announcement':'push');
 const title=String(msg.title||'Світло Черкаси').slice(0,85);
 const body=String(msg.body||'Нове повідомлення').slice(0,220);
 const data={url:msg.url||self.registration.scope,inboxId:inboxAllowed?id:null,noticeId:canonical,inbox:inboxAllowed};
 const display=Promise.resolve().then(()=>self.registration.showNotification(title,{
  body,icon:'./assets/icon-192-v692.png',badge:'./assets/icon-192-v692.png',lang:'uk',
  tag:stablePushTag(canonical||msg.tag||msg.title),data
 })).catch(async error=>{
  console.warn('Rich Push display failed:',error?.message||error);
  // Retry without optional assets/tag for platform-specific option failures.
  await self.registration.showNotification(title,{body,lang:'uk',data});
 }).then(()=>reportPushDisplay(msg.receiptId));
 const inbox=(inboxAllowed?self.SvitloInbox.add({
  id,title:msg.title,body:msg.body,content:msg.content||'',kind,
  at:msg.at||new Date().toISOString(),url:msg.url||self.registration.scope
 }):Promise.resolve())
  .then(()=>self.clients.matchAll({type:'window',includeUncontrolled:true}))
  .then(clients=>clients.forEach(client=>client.postMessage({type:'SVITLO_INBOX_UPDATED'})))
  .catch(error=>console.warn('Inbox save:',error?.message||error));
 event.waitUntil(Promise.all([display,inbox]));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const id=String(event.notification.data?.inboxId||'').slice(0,150);
  const noticeId=String(event.notification.data?.noticeId||'').slice(0,150);
  const inboxAllowed=event.notification.data?.inbox!==false;
  const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const scope=new URL(self.registration.scope);
  for(const tab of tabs){
   // A same-scope support/admin tab cannot receive inbox navigation commands.
   // Open/focus the actual PWA shell, particularly on Android notification taps.
   let isApp=false;
   try{
    const u=new URL(tab.url);
    isApp=u.origin===scope.origin&&(u.pathname===scope.pathname||u.pathname===scope.pathname+'index.html');
   }catch{}
   if(isApp){
   await tab.focus();
   if(/^notice:[A-Za-z0-9_-]{6,64}$/.test(noticeId))tab.postMessage({type:'SVITLO_NOTICE_PUSH_CLICK',id:noticeId});
   if(inboxAllowed)tab.postMessage({type:'SVITLO_OPEN_INBOX',id});
   return;
  }}
  const link=new URL(self.registration.scope);
  if(id)link.searchParams.set('inbox',id);
  if(/^notice:[A-Za-z0-9_-]{6,64}$/.test(noticeId))link.searchParams.set('pushclick',noticeId);
  await self.clients.openWindow(link.href);
 })());
});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
