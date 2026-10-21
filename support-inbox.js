/* Private support case updates in the PWA Inbox.
   No GitHub credential, server deployment, Push subscription or public feed needed.
   Poll authenticated ticket receipts already saved on THIS device. Never include
   the access token or private correspondence text in an Inbox notification.
 */
(()=>{'use strict';
 const RECEIPTS='svitlo-support-tickets-v1';
 const SNAPSHOTS='svitlo-ticket-inbox-state-v1';
 const VALID_ID=/^SC-[A-F0-9]{10}$/;
 const VALID_TOKEN=/^[a-zA-Z0-9_-]{32,80}$/;
 const STATUS={new:'Нове',in_progress:'У роботі',resolved:'Вирішено'};
 const MAX_CHECK=18,POLL_MS=120000;
 let apiPromise=null,inFlight=null,cursor=0;
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
 const receipts=()=>{const value=read(RECEIPTS,[]);return Array.isArray(value)?value.filter(x=>x&&VALID_ID.test(x.id)&&VALID_TOKEN.test(x.token||'')).slice(0,60):[]};
 const statusName=value=>STATUS[value]||'Нове';
 const replyIds=ticket=>(Array.isArray(ticket.messages)?ticket.messages:[])
  .filter(x=>x?.from==='admin'&&/^[a-f0-9]{12}$/.test(String(x.id||'')))
  .map(x=>x.id).slice(-50);
 function snapshots(){const value=read(SNAPSHOTS,{});return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
 function persist(value){
  // Only non-secret metadata. No ticket access codes, email or reply bodies.
  const active=new Set(receipts().map(x=>x.id));
  const cleaned={};
  for(const [id,row] of Object.entries(value)){
   if(!active.has(id)||!row||!STATUS[row.status])continue;
   cleaned[id]={status:row.status,replyIds:Array.isArray(row.replyIds)?row.replyIds.filter(x=>/^[a-f0-9]{12}$/.test(x)).slice(-50):[]};
  }
  try{localStorage.setItem(SNAPSHOTS,JSON.stringify(cleaned))}catch{}
 }
 // Remove a locally retained receipt only after the API confirms deletion.
 // A timeout, permission error, or rate limit is never proof of deletion.
 function forgetDeleted(id){
  if(!VALID_ID.test(id))return false;
  const current=read(RECEIPTS,[]);
  if(!Array.isArray(current)||!current.some(row=>row?.id===id))return false;
  try{localStorage.setItem(RECEIPTS,JSON.stringify(current.filter(row=>row?.id!==id)))}
  catch(error){console.warn('Support receipt cleanup:',error?.message);return false}
  const next=snapshots();delete next[id];persist(next);
  window.dispatchEvent(new CustomEvent('svitlo:support-ticket-deleted',{detail:{id}}));
  return true;
 }
 function remember(receipt,ticket=null){
  if(!VALID_ID.test(receipt?.id)||!VALID_TOKEN.test(receipt?.token||''))return false;
  const state=snapshots();
  // Registration seeds NEW with zero replies. Importing an existing ticket
  // seeds its current history, so historic correspondence isn't reported as new.
  if(!state[receipt.id]){
   state[receipt.id]={status:STATUS[ticket?.status]?ticket.status:(STATUS[receipt.status]?receipt.status:'new'),
     replyIds:ticket?replyIds(ticket):[]};
   persist(state);
  }
  return true;
 }
 async function service(){
  if(!apiPromise)apiPromise=fetch('./push-config.json',{cache:'no-store',signal:AbortSignal.timeout(10000)})
   .then(r=>{if(!r.ok)throw Error('Support configuration unavailable');return r.json()})
   .then(c=>{const url=new URL(String(c.apiBase||''));if(url.protocol!=='https:')throw Error('HTTPS required');return url.origin})
   .catch(error=>{apiPromise=null;throw error});
  return apiPromise;
 }
 const notice=(id,type,at,title,body)=>({id:'ticket:'+id+':'+type,kind:'support',
  at:Number.isFinite(Date.parse(at||''))?at:new Date().toISOString(),
  title,body,priority:'normal'});
 function updates(receipt,ticket,old){
  if(!ticket||ticket.id!==receipt.id||!STATUS[ticket.status])return {events:[],next:old};
  const recent=replyIds(ticket);
  const now=Date.now(),events=[];
  // A pre-existing installation can have old conversations. Don't create a
  // wall of historical notifications on first launch after an update.
  const known=new Set(Array.isArray(old?.replyIds)?old.replyIds:recent);
  const newReplies=(ticket.messages||[]).filter(m=>m?.from==='admin'&&/^[a-f0-9]{12}$/.test(String(m.id||''))&&!known.has(m.id));
  for(const m of newReplies){
   const t=Date.parse(m.at||'');
   if(!Number.isFinite(t)||t>now+120000||t<now-14*86400000)continue;
   events.push(notice(receipt.id,'reply:'+m.id,m.at,
    '💬 Відповідь від підтримки',
    'Служба підтримки відповіла на звернення '+receipt.id+'. Відкрийте «Мої звернення», щоб прочитати відповідь.'));
  }
  const previous=old?.status||receipt.status;
  if(STATUS[previous]&&previous!==ticket.status){
   // A user's own follow-up and the automatic transition caused by the same
   // admin reply should not create a second, misleading notification.
   const latest=(ticket.messages||[]).at(-1);
   const automated=previous==='new'&&ticket.status==='in_progress'&&newReplies.length>0;
   const userAction=latest?.from==='user'&&Math.abs(Date.parse(latest.at||'')-Date.parse(ticket.updatedAt||''))<2000;
   if(!automated&&!userAction){
    events.push(notice(receipt.id,'status:'+ticket.status+':'+String(ticket.updatedAt||'').replace(/[^0-9A-Za-z]/g,''),
     ticket.updatedAt,'📋 Оновлено статус звернення',
     'Статус звернення '+receipt.id+': '+statusName(ticket.status)+'.'));
   }
  }
  return {events,next:{status:ticket.status,replyIds:recent}};
 }
 async function checkOne(base,receipt,state){
  const response=await fetch(base+'/api/ticket/status',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({id:receipt.id,token:receipt.token}),cache:'no-store',
   signal:AbortSignal.timeout(12000)
  });
  if(response.status===404){
   const body=await response.json().catch(()=>({}));
   if(body?.error==='Звернення не знайдено.')return {deleted:true};
  }
  if(!response.ok)throw Error('Ticket query '+response.status);
  const ticket=await response.json();
  if(ticket?.id!==receipt.id||!ticket.canReply||!Array.isArray(ticket.messages))return null;
  return updates(receipt,ticket,state[receipt.id]);
 }
 async function localNotify(events){
  // Local OS notifications are best-effort while the PWA is running. They do
  // not request permission and never expose a private token or reply content.
  if(!events.length||!('Notification' in window)||Notification.permission!=='granted'||!('serviceWorker' in navigator))return;
  const registration=await navigator.serviceWorker.getRegistration().catch(()=>null);
  if(!registration?.showNotification)return;
  for(const item of events){
   try{await registration.showNotification(item.title,{
    body:item.body,tag:item.id.slice(0,70),renotify:false,lang:'uk',
    icon:'./assets/icon-192-v692.png',badge:'./assets/icon-192-v692.png',
    data:{inboxId:item.id,inbox:true,noticeId:null}
   })}catch(error){console.warn('Support notification:',error?.message)}
  }
 }
 async function scan({limit=MAX_CHECK}={}){
  if(inFlight)return inFlight;
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return [];
  const saved=receipts(),store=window.SvitloInbox;
  if(!saved.length)return [];
  inFlight=(async()=>{
   const base=await service();
   // Restrict request bursts for users with many imported receipts.
   const size=Math.min(MAX_CHECK,Math.max(1,Math.trunc(Number(limit)||MAX_CHECK)));
   const checks=saved.length<=size?saved:[...saved.slice(cursor),...saved.slice(0,cursor)].slice(0,size);
   cursor=(cursor+checks.length)%saved.length;
   const state=snapshots(),events=[];
   let changed=false,index=0;
   const worker=async()=>{
    while(index<checks.length){
     const receipt=checks[index++];
     try{
      const result=await checkOne(base,receipt,state);
      if(!result)continue;
      if(result.deleted){
       if(forgetDeleted(receipt.id))changed=true;
       delete state[receipt.id];
       continue;
      }
      if(!receipts().some(row=>row.id===receipt.id&&row.token===receipt.token))continue;
      state[receipt.id]=result.next;
      events.push(...result.events);changed=true;
     }catch(error){console.warn('Support Inbox:',String(error.message).slice(0,80))}
    }
   };
   await Promise.all(Array.from({length:Math.min(3,checks.length)},worker));
   // Save the Inbox items first. If storage fails, retry later with the
   // unchanged snapshot rather than silently dropping notifications.
   if(events.length&&typeof store?.add==='function')await store.add(events);
   if(changed)persist(state);
   if(events.length){
    void localNotify(events).catch(()=>{});
    window.dispatchEvent(new CustomEvent('svitlo:support-inbox-updated',{detail:{count:events.length}}));
    window.SvitloInboxUI?.refresh?.().catch?.(()=>{});
   }
   return events;
  })().finally(()=>{inFlight=null});
  return inFlight;
 }
 window.SvitloSupportInbox={scan,remember,forgetDeleted};
 window.addEventListener('online',()=>scan().catch(()=>{}));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)scan().catch(()=>{})});
 window.addEventListener('focus',()=>scan().catch(()=>{}));
 window.addEventListener('svitlo:support-receipt-saved',e=>{
  if(e.detail?.id&&e.detail?.token)remember(e.detail,e.detail.ticket||null);
 });
 // On the main screen, the Inbox tab forces a fresh check. On the separate
 // support page, the same script checks while viewing "Мої звернення".
 document.querySelectorAll('[data-go="updates"],#tabTickets,#refreshSaved').forEach(b=>
  b.addEventListener('click',()=>scan().catch(()=>{})));
 setInterval(()=>{if(!document.hidden)scan().catch(()=>{})},POLL_MS);
 scan().catch(()=>{});
})();
