/* Office PWA: separate scope, no caching of admin pages or responses. */
(()=>{'use strict';
 if(!('serviceWorker' in navigator) || !window.isSecureContext)return;
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('/admin-app/sw.js',{
   scope:'/admin-app/',updateViaCache:'none'
  }).catch(error=>console.warn('Office PWA installation unavailable:',error));
 },{once:true});
})();
