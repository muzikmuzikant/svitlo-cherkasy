importScripts('./notification-center.js');
const VERSION='svitlo-cherkasy-shell-v7.3.2';
const SHELL=["./","./index.html","./app.js","./address-lookup.js","./notification-center.js","./inbox-ui.js","./site-mode.js","./admin-control.js","./admin-control.css","./data-merge.js","./hour-paint.js","./admin.html","./admin.js","./style.css","./install.css","./install.js","./version-check.js","./release.json","./manifest.webmanifest","./privacy.html","./about.html","./feedback.html","./feedback.js","./help.html","./help.css","./help.js","./admin-extra.js","./admin-planner.js","./schedule-planner.js","./favicon.ico","./favicon-16.png","./favicon-32.png","./favicon-48.png","./assets/icon.svg","./assets/icon-192-v692.png","./assets/icon-512-v692.png","./assets/icon-512-maskable-v692.png","./apple-touch-icon-v692.png","./apple-touch-icon.png"];
const CACHE_DATA='svitlo-cherkasy-data-v6.7';
const CACHE_IMAGES='svitlo-cherkasy-media-v74';
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>![VERSION,CACHE_DATA,CACHE_IMAGES].includes(k)).map(k=>caches.delete(k)))),self.clients.claim()])));
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
 if(u.pathname.endsWith('/release.json')){event.respondWith(fetch(req,{cache:'no-store'}));return;}
 if(u.pathname.includes('/data/')||u.pathname.endsWith('/push-config.json')){
   event.respondWith((async()=>{
     const key=new Request(u.origin+u.pathname);
     const cache=await caches.open(CACHE_DATA);
     try{const fresh=await fetch(req);if(fresh.ok){await cache.put(key,fresh.clone());return fresh}const old=await cache.match(key);return old||fresh}catch{const old=await cache.match(key);return old||new Response('Offline, no cache',{status:503,headers:{'Content-Type':'text/plain'}})}
   })());return;
 }
 event.respondWith((async()=>{try{const fresh=await fetch(req);if(fresh.ok&&u.pathname.match(/(?:\.js|\.css|\.html|\.png|\.svg|\.webmanifest)$/)){const c=await caches.open(VERSION);c.put(req,fresh.clone())}return fresh}catch{return (await caches.match(req))||(await caches.match('./index.html'))||Response.error()}})());
});
self.addEventListener('push',event=>{
 let msg={title:'💡 Світло Черкаси',body:'Є нове повідомлення про графік.'};
 try{if(event.data)msg=Object.assign(msg,event.data.json())}catch{}
 // iOS requires a visible notification for every push.
 const tag=String(msg.tag||msg.title).slice(0,70);
 const id=typeof msg.notificationId==='string'&&/^notice:[A-Za-z0-9_-]{6,64}$/.test(msg.notificationId)?msg.notificationId:'push:'+tag;
 event.waitUntil(Promise.all([
  self.registration.showNotification(String(msg.title).slice(0,85),{body:String(msg.body).slice(0,220),icon:'./assets/icon-192-v692.png',badge:'./assets/icon-192-v692.png',lang:'uk',tag,data:{url:msg.url||self.registration.scope,inboxId:id}}),
  self.SvitloInbox.add({id,title:msg.title,body:msg.body,kind:id.startsWith('notice:')?'announcement':'push',at:new Date().toISOString(),url:msg.url||self.registration.scope})
   .then(()=>self.clients.matchAll({type:'window',includeUncontrolled:true}))
   .then(clients=>clients.forEach(client=>client.postMessage({type:'SVITLO_INBOX_UPDATED'})))
   .catch(error=>console.warn('Inbox save:',error))
 ]));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const id=String(event.notification.data?.inboxId||'').slice(0,150);
  const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const tab of tabs){if(tab.url.startsWith(self.registration.scope)){
   await tab.focus();
   tab.postMessage({type:'SVITLO_OPEN_INBOX',id});
   return;
  }}
  const link=new URL(self.registration.scope);
  if(id)link.searchParams.set('inbox',id);
  await self.clients.openWindow(link.href);
 })());
});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
