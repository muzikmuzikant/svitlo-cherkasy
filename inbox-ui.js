/* Installed PWA inbox: queue-specific official events + background Push.
 * Works without a logged-in account; no names or street addresses leave the device.
 */
(()=>{'use strict';
 const $=id=>document.getElementById(id),store=window.SvitloInbox;
 if(!store||!$('inboxList'))return;
 let selected='all',rows=[],notices=window.SvitloPublicConfig?.announcements||[],busy=false,lastSync=0;
 const ago=72*3600_000;
 const date=s=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z'));
 const time=s=>new Intl.DateTimeFormat('uk-UA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).format(new Date(s));
 const el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=String(text??'');if(cls)n.className=cls;return n};
 const primaryQueue=()=>{try{
  const p=JSON.parse(localStorage.getItem('svitlo-prefs-v6')||'{}'),addrs=JSON.parse(localStorage.getItem('svitlo-addresses-v6')||'[]');
  return (addrs.find(x=>x.id===p.primaryId)||addrs[0])?.queue||null
 }catch{return null}};
 function safeLink(s){try{const u=new URL(s,location.href);return u.protocol==='https:'&&(u.origin===location.origin||/(^|\.)cherkasyoblenergo\.com$/.test(u.hostname))?u.href:''}catch{return ''}}
 async function refresh(){
  rows=await store.all();
  const unread=rows.filter(x=>!x.read).length;
  $('inboxUnread').hidden=unread===0;$('inboxUnread').textContent=unread>99?'99+':String(unread);
  $('navUnread').hidden=unread===0;$('navUnread').textContent=unread>9?'9+':String(unread);
  const selectedRows=rows.filter(x=>selected==='all'||selected==='unread'&&!x.read||selected==='schedule'&&x.kind==='schedule'||selected==='important'&&['emergency','announcement'].includes(x.kind));
  const list=$('inboxList');list.replaceChildren();
  if(!selectedRows.length){
   const empty=el('div','Усе спокійно ✨','inbox-empty');
   empty.append(el('p',selected==='unread'?'Непрочитаних повідомлень немає.':'Коли з’являться важливі оновлення, ви побачите їх тут.'));
   list.append(empty);
  }
  for(const item of selectedRows){
   const card=document.createElement('article');card.className='inbox-item'+(item.read?'':' is-unread');
   const head=el('div','','inbox-item-head');
   head.append(el('span',({schedule:'Графіки',push:'Push',emergency:'Важливе',announcement:'Оголошення'})[item.kind]||'Оновлення','inbox-kind'),el('time',time(item.at),'inbox-time'));
   card.append(head,el('strong',item.title),el('p',item.body));
   const actions=el('div','','inbox-actions'),href=safeLink(item.url);
   if(href){const link=el('a','Переглянути ↗');link.href=href;link.rel='noopener noreferrer';link.target='_blank';actions.append(link)}
   if(!item.read){const b=el('button','Прочитано ✓');b.type='button';b.onclick=async()=>{await store.mark([item.id]);await refresh()};actions.append(b)}
   card.append(actions);list.append(card);
  }
  document.querySelectorAll('[data-inbox-filter]').forEach(b=>{
   const current=b.dataset.inboxFilter===selected;b.classList.toggle('selected',current);b.setAttribute('aria-pressed',String(current))
  });
 }
 async function sync(){
  if(busy)return;busy=true;
  try{
   const queue=primaryQueue(),now=Date.now(),incoming=[];
   const [schedule,emergency]=await Promise.all([
    fetch('./data/schedules.json?inbox='+now,{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null),
    fetch('./data/emergency.json?inbox='+now,{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null)
   ]);
   if(queue&&schedule?.days){
    for(const c of schedule.changes||[]){
     const t=Date.parse(c.detectedAt||c.publishedAt||'');
     if(!c.queues?.includes(queue)||!Number.isFinite(t)||t<now-ago||t>now+120000)continue;
     incoming.push({id:'change:'+queue+':'+c.date+':'+(c.revisionId||c.publishedAt),
      title:'🔄 Графік оновлено',body:`Підчерга ${queue} · Змінено години на ${date(c.date)}.`,kind:'schedule',at:new Date(t).toISOString(),url:c.source});
    }
    for(const d of schedule.days||[]){
     const t=Date.parse(d.publishedAt||'');
     if(d.verified!==true||!Number.isFinite(t)||t<now-ago||t>now+120000)continue;
     incoming.push({id:'day:'+queue+':'+d.date+':'+d.publishedAt,title:'🗓️ Графік на '+date(d.date),
      body:`Для підчерги ${queue} опубліковано розклад.`,kind:'schedule',at:new Date(t).toISOString(),url:d.source});
    }
   }
   for(const event of (emergency?.events||[]).slice(0,12)){
    const t=Date.parse(event.publishedAt||'');
    if(!Number.isFinite(t)||t<now-ago||t>now+120000||!event.source?.startsWith('https://www.cherkasyoblenergo.com/'))continue;
    if(Array.isArray(event.queues)&&event.queues.length&&queue&&!event.queues.includes(queue))continue;
    incoming.push({id:'emergency:'+String(event.id||event.source)+':'+event.publishedAt,kind:'emergency',at:new Date(t).toISOString(),
     title:event.status==='active'?'⚠️ Екстрені відключення':event.status==='ended'?'✅ Обмеження завершено':'📣 Повідомлення оператора',
     body:event.title||'Важливе повідомлення оператора.',url:event.source});
   }
   for(const a of notices){if(a?.active!==true||a.expiresAt&&Date.parse(a.expiresAt)<=now)continue;
    incoming.push({id:'notice:'+a.id,kind:'announcement',title:(a.kind==='important'?'📣 ':a.kind==='update'?'✨ ':'💬 ')+a.title,body:a.body,at:a.publishedAt||new Date().toISOString()});
   }
   if(incoming.length)await store.add(incoming);
   lastSync=now;await refresh();
  }finally{busy=false}
 }
 document.querySelectorAll('[data-inbox-filter]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.inboxFilter;refresh().catch(console.warn)}));
 $('inboxMarkAll').addEventListener('click',async()=>{await store.mark(rows.map(x=>x.id));await refresh()});
 $('inboxClear').addEventListener('click',async()=>{await store.clearRead();await refresh()});
 document.querySelectorAll('[data-go="updates"]').forEach(b=>b.addEventListener('click',()=>refresh().catch(console.warn)));
 window.addEventListener('svitlo:public-config',ev=>{notices=ev.detail?.announcements||[];sync().catch(console.warn)});
 navigator.serviceWorker?.addEventListener('message',ev=>{if(ev.data?.type==='SVITLO_INBOX_UPDATED')refresh().catch(console.warn)});
 window.addEventListener('focus',()=>{if(Date.now()-lastSync>45000)sync().catch(console.warn)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync().catch(console.warn)});
 refresh().then(sync).catch(console.warn);
 setInterval(()=>{if(!document.hidden)sync().catch(console.warn)},5*60_000);
 window.SvitloInboxUI={refresh,sync};
})();
