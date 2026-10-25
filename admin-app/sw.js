/* Office PWA scope: /admin-app/ only.
 * Never cache administrative UI, credentials, configuration or user data.
 * Offline shows a static connection warning without disclosing private content.
 */
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.mode!=='navigate'||request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||!url.pathname.startsWith('/admin-app/'))return;
 event.respondWith(fetch(new Request(request,{cache:'no-store'})).catch(()=>
  new Response('<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f6f8fc"><title>Немає з’єднання | Світло Адмін</title><body style="font:16px -apple-system,BlinkMacSystemFont,system-ui;background:#f6f8fc;color:#20324a;display:grid;place-items:center;min-height:85vh;margin:0;padding:24px"><main style="max-width:340px;text-align:center"><h1 style="font-size:23px">Немає з’єднання</h1><p style="line-height:1.6">Для безпечної роботи адмінки потрібен інтернет. Підключіться до мережі та відкрийте застосунок ще раз.</p><button onclick="location.reload()" style="border:0;border-radius:14px;padding:14px 20px;background:#347dff;color:white;font:600 16px system-ui">Спробувати ще раз</button></main></body></html>',{
   status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  })
 ));
});
