const CACHE='svitlo-cherkasy-shell-v4';
const STATIC=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const u=new URL(event.request.url);if(u.origin!==self.location.origin)return;
 if(u.pathname.includes('/data/')){
 event.respondWith(fetch(event.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(event.request.url.replace(u.search,''),copy))}return res}).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(event.request.url.replace(u.search,''))||new Response('{"days":[],"keys":{},"streets":{}}',{headers:{'Content-Type':'application/json'}})}));return;
 }
 event.respondWith(fetch(event.request).then(res=>{if(res.ok&&u.pathname.match(/(?:\.js|\.css|\.html)$/)){const copy=res.clone();caches.open(CACHE).then(c=>c.put(event.request,copy))}return res}).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))));
});
