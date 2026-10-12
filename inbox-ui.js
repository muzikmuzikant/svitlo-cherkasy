/* Full-screen inbox v7.4. Safe text rendering, deep links and offline history. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),store=window.SvitloInbox;
 if(!store||!$('inboxList'))return;
 let selected='all',rows=[],notices=window.SvitloPublicConfig?.announcements||[],busy=false,lastSync=0,activeDetail=null;
 const time=s=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).format(new Date(s));
 const date=s=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z'));
 const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=String(text??'');if(cls)node.className=cls;return node};
 const local=(key,otherwise)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??otherwise}catch{return otherwise}};
 const primaryQueue=()=>{const settings=local('svitlo-prefs-v6',{}),addresses=local('svitlo-addresses-v6',[]);
  return (addresses.find(x=>x.id===settings.primaryId)||addresses[0])?.queue||null};
 const validUrl=url=>{try{const u=new URL(url,location.href);return u.protocol==='https:'&&(u.origin===location.origin||/(^|\.)cherkasyoblenergo\.com$/.test(u.hostname))?u.href:''}catch{return ''}};
 const isGraph=item=>item.kind==='schedule'||item.kind==='push'&&/(графік|підчерг|відключення через|відновлення через)/i.test(item.title+' '+item.body);
 function graphDate(item){
  const found=String(item.id).match(/:(20\d{2}-\d{2}-\d{2})(?=:|$)/);
  if(found)return found[1];
  const stamp=Number.isFinite(Date.parse(item.at))?new Date(item.at):new Date();
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(stamp).map(x=>[x.type,x.value]));
  const d=new Date(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z');
  if(/на завтра/i.test(item.title+' '+item.body))d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
 }
 const dialog=document.createElement('dialog');dialog.className='inbox-detail';dialog.id='inboxDetail';
 const close=el('button','×','inbox-detail-close');close.type='button';close.setAttribute('aria-label','Закрити повідомлення');
 const content=el('div','','inbox-detail-content');dialog.append(close,content);document.body.append(dialog);
 close.onclick=()=>dialog.close();
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{activeDetail=null});
 function rich(target,raw){
  const text=String(raw||'');target.replaceChildren();
  for(const line of text.split('\n').slice(0,100)){
   const txt=line.trim();
   if(!txt){target.append(el('div','','inbox-line-space'));continue}
   const heading=/^#{1,3}\s+/.test(txt),bullet=/^[-*]\s+/.test(txt);
   const body=txt.replace(/^#{1,3}\s+|^[-*]\s+/,'');
   const p=el(heading?'h3':'p','',heading?'inbox-rich-heading':bullet?'inbox-rich-bullet':'');
   if(bullet)p.append(el('span','• ','inbox-bullet'));
   // Only **bold** is interpreted; everything else is a plain text node.
   const tokens=body.split(/(\*\*[^*]{1,160}\*\*|\[[^\]]{1,100}\]\(https:\/\/[^\s)]+\))/g);
   tokens.forEach(part=>{
    if(part.startsWith('**')&&part.endsWith('**'))p.append(el('strong',part.slice(2,-2)));
    else if(/^\[[^\]]+\]\(https:\/\//.test(part)){
     const match=part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
     if(match){const link=el('a',match[1]);link.href=match[2];link.target='_blank';link.rel='noopener noreferrer';p.append(link)}
     else p.append(document.createTextNode(part));
    }else p.append(document.createTextNode(part))
   });
   target.append(p);
  }
 }
 function open(id){
  const item=rows.find(x=>x.id===id);if(!item)return false;
  activeDetail=id;content.replaceChildren();
  const top=el('div','','inbox-detail-top');
  top.append(el('span',({schedule:'Графіки',emergency:'Важливо',announcement:'Повідомлення',push:'Push'})[item.kind]||'Повідомлення','inbox-detail-category'),el('time',time(item.at)));
  content.append(top,el('h2',item.title),el('p',item.body,'inbox-detail-summary'));
  if(item.images?.length){
   const gallery=el('div','','inbox-gallery');
   for(const url of item.images){
    try{const u=new URL(url);if(u.protocol!=='https:')continue;
     const img=document.createElement('img');img.src=u.href;img.alt='Ілюстрація до повідомлення';img.loading='lazy';img.decoding='async';img.tabIndex=0;img.title='Натисніть, щоб збільшити';img.onclick=()=>img.classList.toggle('expanded');img.onkeydown=e=>{if(e.key==='Enter')img.classList.toggle('expanded')};gallery.append(img);
    }catch{}
   }
   if(gallery.childElementCount)content.append(gallery);
  }
  if(item.content&&item.content!==item.body){const body=el('div','','inbox-rich');rich(body,item.content);content.append(body)}
  const buttons=el('div','','inbox-detail-actions');
  if(isGraph(item)){const graph=el('button','📅 Відкрити графік','inbox-detail-primary');graph.type='button';graph.onclick=()=>{
   dialog.close();window.dispatchEvent(new CustomEvent('svitlo:open-schedule',{detail:{date:graphDate(item)}}));
  };buttons.append(graph)}
  if(validUrl(item.url)){const a=el('a','Офіційне джерело ↗');a.href=validUrl(item.url);a.target='_blank';a.rel='noopener noreferrer';buttons.append(a)}
  content.append(buttons);
  try{dialog.showModal()}catch{dialog.setAttribute('open','')}
  if(!item.read)store.mark([id]).then(refresh).catch(console.warn);
  return true;
 }
 async function refresh(){
  rows=await store.all();
  const unread=rows.filter(x=>!x.read).length;
  $('inboxUnread').hidden=!unread;$('inboxUnread').textContent=unread>99?'99+':String(unread);
  $('navUnread').hidden=!unread;$('navUnread').textContent=unread>9?'9+':String(unread);
  const visible=rows.filter(x=>selected==='all'||selected==='unread'&&!x.read||selected==='schedule'&&x.kind==='schedule'||selected==='important'&&['emergency','announcement'].includes(x.kind));
  const root=$('inboxList');root.replaceChildren();
  if(!visible.length){const empty=el('div','Тут поки тихо ✨','inbox-empty');empty.append(el('p',selected==='unread'?'Нових повідомлень немає.':'Важливі оновлення з’являться тут.'));root.append(empty)}
  for(const item of visible){
   const card=el('article','','inbox-item inbox-interactive'+(!item.read?' is-unread':'')+(item.pinned?' is-pinned':''));
   card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Відкрити повідомлення: '+item.title);
   card.onclick=()=>open(item.id);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(item.id)}};
   const head=el('div','','inbox-item-head');head.append(el('span',item.pinned?'📌 Закріплено':({schedule:'Графіки',emergency:'Важливе',announcement:'Оголошення',push:'Push'})[item.kind],'inbox-kind'),el('time',time(item.at),'inbox-time'));
   card.append(head,el('strong',item.title),el('p',item.body));
   if(item.updatedAt&&Date.parse(item.updatedAt)>Date.parse(item.at)+60000)card.append(el('span','Оновлено ✨','inbox-kind'));
   card.append(el('span','Переглянути детальніше  →','inbox-more'));
   if(item.images?.length){const img=document.createElement('img');img.src=item.images[0];img.alt='';img.loading='lazy';img.className='inbox-cover';card.append(img)}
   root.append(card);
  }
  document.querySelectorAll('[data-inbox-filter]').forEach(b=>{const state=b.dataset.inboxFilter===selected;b.classList.toggle('selected',state);b.setAttribute('aria-pressed',String(state))});
  if(activeDetail&&dialog.open&&rows.some(x=>x.id===activeDetail)){/* keep detail open while marking read */}
 }
 async function sync(){
  if(busy)return;busy=true;
  try{
   const queue=primaryQueue(),now=Date.now(),incoming=[];
   const [schedules,emergency]=await Promise.all([
    fetch('./data/schedules.json?inbox='+now,{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null),
    fetch('./data/emergency.json?inbox='+now,{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null)
   ]);
   if(queue&&Array.isArray(schedules?.days)){
    for(const x of schedules.changes||[]){const at=Date.parse(x.detectedAt||x.publishedAt||'');
     if(!x.queues?.includes(queue)||!Number.isFinite(at)||at<now-72*3600000||at>now+120000)continue;
     incoming.push({id:'change:'+queue+':'+x.date+':'+(x.revisionId||x.publishedAt),title:'🔄 Графік оновлено',
      body:'Підчерга '+queue+' · Змінено години на '+date(x.date)+'.',kind:'schedule',at:new Date(at).toISOString(),url:x.source});
    }
    for(const x of schedules.days){const at=Date.parse(x.publishedAt||'');
     if(!x.verified||!Number.isFinite(at)||at<now-72*3600000||at>now+120000)continue;
     incoming.push({id:'day:'+queue+':'+x.date+':'+x.publishedAt,title:'🗓️ Графік на '+date(x.date),
      body:'Для підчерги '+queue+' опубліковано розклад.',kind:'schedule',at:new Date(at).toISOString(),url:x.source});
    }
   }
   for(const x of (emergency?.events||[]).slice(0,12)){const at=Date.parse(x.publishedAt||'');
    if(!Number.isFinite(at)||at<now-72*3600000||at>now+120000||!validUrl(x.source))continue;
    if(x.queues?.length&&(!queue||!x.queues.includes(queue)))continue;
    incoming.push({id:'emergency:'+String(x.id||x.source)+':'+x.publishedAt,
     kind:'emergency',at:new Date(at).toISOString(),title:x.status==='active'?'⚠️ Екстрені відключення':x.status==='ended'?'✅ Обмеження завершено':'📣 Повідомлення оператора',
     body:x.title||'Нова інформація від оператора.',url:x.source,priority:'important'});
   }
   for(const a of notices){
    if(a.active!==true||a.queue&&a.queue!=='all'&&a.queue!==queue||a.scheduledAt&&Date.parse(a.scheduledAt)>now||a.expiresAt&&Date.parse(a.expiresAt)<=now)continue;
    incoming.push({id:'notice:'+a.id,kind:'announcement',title:(a.icon||({important:'📣',update:'✨',emergency:'⚠️',schedule:'🗓️'})[a.kind]||'💬')+' '+a.title,
     body:a.body,content:a.content,images:a.images,at:a.publishedAt,updatedAt:a.updatedAt,pinned:a.pinned,priority:a.priority});
   }
   if(incoming.length)await store.add(incoming);
   lastSync=Date.now();await refresh();
  }finally{busy=false}
 }
 function routePush(id){
  document.querySelector('[data-go="updates"]')?.click();
  const target=id||'';
  if(target&&open(target))return;
  if(target){sync().then(()=>open(target)).catch(console.warn)}
 }
 document.querySelectorAll('[data-inbox-filter]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.inboxFilter;refresh().catch(console.warn)}));
 $('inboxMarkAll').onclick=async()=>{await store.mark(rows.map(x=>x.id));await refresh()};
 $('inboxClear').onclick=async()=>{await store.clearRead();await refresh()};
 document.querySelectorAll('[data-go="updates"]').forEach(b=>b.addEventListener('click',()=>refresh().catch(console.warn)));
 window.addEventListener('svitlo:public-config',event=>{const next=event.detail?.announcements||[];
  if(JSON.stringify(next)!==JSON.stringify(notices)){notices=next;sync().catch(console.warn)}
 });
 navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type==='SVITLO_INBOX_UPDATED')refresh().catch(console.warn);
  if(event.data?.type==='SVITLO_OPEN_INBOX')routePush(event.data.id);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync().catch(console.warn)});
 window.addEventListener('online',()=>sync().catch(console.warn));
 window.addEventListener('focus',()=>{if(Date.now()-lastSync>45000)sync().catch(console.warn)});
 window.SvitloInboxUI={refresh,sync,open};
 refresh().then(async()=>{await sync();const id=new URL(location.href).searchParams.get('inbox');
  if(id){history.replaceState(null,'',location.pathname+location.hash);routePush(id)}
 }).catch(console.warn);
 setInterval(()=>{if(!document.hidden)sync().catch(console.warn)},5*60000);
})();
