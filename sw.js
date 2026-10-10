const VERSION='svitlo-cherkasy-shell-v6.7.0';
const SHELL=['./','./index.html','./app.js','./hour-paint.js','./admin.html','./admin.js','./style.css','./install.css','./install.js','./version-check.js','./release.json','./manifest.webmanifest','./privacy.html','./about.html','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
const CACHE_DATA='svitlo-cherkasy-data-v6.7';
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>![VERSION,CACHE_DATA].includes(k)).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const u=new URL(req.url);
 if(u.origin!==self.location.origin)return;
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
 let msg={title:'Світло Черкаси',body:'Є оновлення графіка.'};
 try{if(event.data)msg=Object.assign(msg,event.data.json())}catch{}
 // iOS requires a visible notification for every push.
 event.waitUntil(self.registration.showNotification(String(msg.title).slice(0,100),{body:String(msg.body).slice(0,250),icon:'./assets/icon-192.png',badge:'./assets/icon-192.png',tag:String(msg.tag||msg.title).slice(0,70),data:{url:msg.url||self.registration.scope}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const url=new URL(event.notification.data?.url||self.registration.scope);if(url.origin!==self.location.origin)url.href=self.registration.scope;const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const tab of tabs){if(tab.url.startsWith(self.registration.scope)){await tab.focus();return}}await self.clients.openWindow(url.href)})())});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
