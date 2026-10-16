/* Coarse error analytics are strictly opt-in. Never submit messages, stacks, paths or addresses. */
(()=>{'use strict';
 const pref='svitlo-beta-analytics-opt-in',choice='svitlo-beta-analytics-choice';
 const consent=()=>{try{return localStorage.getItem(pref)==='yes'&&localStorage.getItem(choice)!=='declined'}catch{return false}};
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const seen=new Set(),started=Date.now();let api='',sent=0;
 const post=async kind=>{
  if(!consent()||!standalone()||sent>=3||Date.now()-started>86400000)return;
  const version=document.querySelector('meta[name="svitlo-version"]')?.content||'';
  const key=kind+'|'+version;if(seen.has(key))return;seen.add(key);sent++;
  try{if(!api){const cfg=await fetch('./push-config.json',{cache:'no-store'}).then(r=>r.json());api=new URL(cfg.apiBase).origin}
   await fetch(api+'/api/diagnostics/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind,version,mode:'standalone',consent:true}),keepalive:true});
  }catch{}
 };
 addEventListener('error',event=>{post(event.target&&event.target!==window?'resource':'uncaught')},true);
 addEventListener('unhandledrejection',()=>post('promise'));
})();
