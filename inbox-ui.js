/* Full-screen inbox v7.4. Safe text rendering, deep links and offline history. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),store=window.SvitloInbox;
 // Keep the entire Inbox usable if an older service worker cannot load
 // the independently published optional notification-text.js file yet.
 const copy=window.SvitloNotificationText||(()=>{
  const date=s=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z'));
  const firstPublishedAt=d=>String(d?.publications?.[0]?.publishedAt||d?.publishedAt||'');
  const dayId=(q,d)=>'day:'+q+':'+d.date+':'+firstPublishedAt(d);
  const changeId=(q,c)=>'change:'+q+':'+c.date+':'+(c.revisionId||c.publishedAt);
  const hash=s=>{let h=2166136261;for(const char of String(s||'')){h^=char.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};
  const emergencyId=e=>'emergency:'+hash(e.id||e.source)+':'+e.status+':'+e.publishedAt;
  const hours=(d,q)=>!d||d.verified!==true?'Години уточнюються.':
   !d.queues?.[q]?.off?.length?'Планові відключення для підчерги не зазначені.':
   'Планові відключення: '+d.queues[q].off.map(r=>r.join('–')).join(', ')+'.';
  return {firstPublishedAt,dayId,changeId,emergencyId,
   tomorrowCopy:(q,d,plan)=>({content:'**Графік на '+date(d)+'**\\n\\nОператор опублікував розклад для підчерги '+q+'.\\n\\n'+hours(plan,q)+'\\n\\nПеревірте актуальні години у вкладці «Графік».'}),
   changeCopy:(q,d,plan)=>({title:'🔄 Графік оновлено',body:'Підчерга '+q+' · Змінено години на '+date(d)+'.',content:'**Графік змінено**\\n\\nОператор оновив розклад для підчерги '+q+' на '+date(d)+'.\\n\\n'+hours(plan,q)}),
   emergencyCopy:status=>({title:status==='ended'?'✅ Екстрені обмеження завершено':'⚠️ Екстрені відключення',body:status==='ended'?'Оператор повідомив про завершення обмежень.':'Оператор повідомив про екстрені обмеження.',content:'Перевірте офіційні повідомлення оператора, щоб дізнатися про актуальний стан.'})};
 })();
 if(!store||!$('inboxList'))return;
 let selected='all',rows=[],notices=window.SvitloPublicConfig?.announcements||[],busy=false,lastSync=0,activeDetail=null,noticeFeedConfirmed=window.SvitloPublicConfig?.serverVerified===true,needsResync=false;
 // Only voluntary opt-in PWA installations count toward custom notice engagement.
 // "Read" is an approximation: detail stayed in the foreground for two seconds.
 let metricApi='',readTimer=null,seenObserver=null;
 const reported=new Set(),pendingMetrics=new Set();
 const analyticsReady=()=>{try{
  return (matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)
   &&localStorage.getItem('svitlo-beta-analytics-opt-in')==='yes'
   &&localStorage.getItem('svitlo-beta-analytics-consent-revision')==='7.9.11-notices'
   &&localStorage.getItem('svitlo-beta-analytics-choice')==='accepted';
 }catch{return false}};
 async function trackNotice(id,type){
  if(!/^notice:[A-Za-z0-9_-]{6,64}$/.test(id||'')||!['seen','opened','read','pushClick'].includes(type)||!analyticsReady())return;
  const installId=localStorage.getItem('svitlo-beta-install-id')||'';
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,56}$/i.test(installId))return;
  const key=installId+':'+id+':'+type;
  if(reported.has(key)||pendingMetrics.has(key))return;
  pendingMetrics.add(key);
  try{
   if(!metricApi){const cfg=await fetch('./push-config.json',{cache:'no-store'}).then(x=>x.json());metricApi=String(cfg.apiBase||'')}
   if(!metricApi)return;
   const result=await fetch(metricApi+'/api/notice/engagement',{method:'POST',
    headers:{'content-type':'application/json'},keepalive:true,
    body:JSON.stringify({noticeId:id.slice(7),installId,type})});
   if(result.ok)reported.add(key);
  }catch{}finally{pendingMetrics.delete(key)}
 }
 function observeNoticeCards(){
  seenObserver?.disconnect();
  const screen=$('updates');
  if(!screen||screen.hidden||document.hidden||!analyticsReady())return;
  const cards=[...document.querySelectorAll('#inboxList [data-notice-id]')];
  if(!('IntersectionObserver' in window))return;
  seenObserver=new IntersectionObserver(entries=>{
   if(screen.hidden||document.hidden)return;
   for(const entry of entries)if(entry.isIntersecting&&entry.intersectionRatio>=.5){
    trackNotice(entry.target.dataset.noticeId,'seen');
    seenObserver.unobserve(entry.target);
   }
  },{threshold:.5});
  cards.forEach(card=>seenObserver.observe(card));
 }
 const time=s=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).format(new Date(s));
 const date=s=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z'));
 const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=String(text??'');if(cls)node.className=cls;return node};
 const local=(key,otherwise)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??otherwise}catch{return otherwise}};
 const normalizedTown=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('uk-UA')
  .replace(/^[мс]\.\s*/,'').replace(/[’ʼ`]/g,"'").replace(/\s+/g,' ').trim();
 const primarySettlement=()=>{const p=local('svitlo-prefs-v6',{}),a=local('svitlo-addresses-v6',[]);
  return (a.find(x=>x.id===p.primaryId)||a[0])?.settlement||''};
 const targeted=a=>!a.settlement||normalizedTown(a.settlement)===normalizedTown(primarySettlement());
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
 let detailCloseTimer=null,detailClosing=false,afterDetailClose=null;
 const reducedDetailMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||
  document.documentElement.classList.contains('feature-off-animations');
 function closeDetail(next){
  if(typeof next==='function')afterDetailClose=next;
  if(detailClosing)return;
  if(!dialog.open){
   const done=afterDetailClose;afterDetailClose=null;if(done)done();
   return;
  }
  if(reducedDetailMotion()){dialog.close();return}
  detailClosing=true;dialog.classList.add('is-leaving');
  detailCloseTimer=setTimeout(()=>{detailCloseTimer=null;if(dialog.open)dialog.close()},300);
 }
 close.onclick=()=>closeDetail();
 dialog.addEventListener('click',event=>{if(event.target===dialog)closeDetail()});
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail()});
 dialog.addEventListener('close',()=>{
  clearTimeout(readTimer);readTimer=null;
  clearTimeout(detailCloseTimer);detailCloseTimer=null;detailClosing=false;
  dialog.classList.remove('is-leaving');activeDetail=null;
  const next=afterDetailClose;afterDetailClose=null;if(next)next();
 });
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
  if(detailClosing){clearTimeout(detailCloseTimer);detailCloseTimer=null;detailClosing=false;afterDetailClose=null;dialog.classList.remove('is-leaving')}
  clearTimeout(readTimer);readTimer=null;
  activeDetail=id;content.replaceChildren();
  trackNotice(id,'opened');
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
   closeDetail(()=>window.dispatchEvent(new CustomEvent('svitlo:open-schedule',{detail:{date:graphDate(item)}})));
  };buttons.append(graph)}
  if(validUrl(item.url)){const a=el('a','Офіційне джерело ↗');a.href=validUrl(item.url);a.target='_blank';a.rel='noopener noreferrer';buttons.append(a)}
  content.append(buttons);
  if(!dialog.open)try{dialog.showModal()}catch{dialog.setAttribute('open','')}
  if(id.startsWith('notice:'))readTimer=setTimeout(()=>{
   if(activeDetail===id&&dialog.open&&!document.hidden&&!detailClosing)trackNotice(id,'read');
  },2000);
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
   if(item.id.startsWith('notice:'))card.dataset.noticeId=item.id;
   card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Відкрити повідомлення: '+item.title);
   card.onclick=()=>open(item.id);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(item.id)}};
   const head=el('div','','inbox-item-head');head.append(el('span',item.pinned?'📌 Закріплено':({schedule:'Графіки',emergency:'Важливе',announcement:'Оголошення',push:'Push'})[item.kind],'inbox-kind'),el('time',time(item.at),'inbox-time'));
   card.append(head,el('strong',item.title),el('p',item.body));
   card.append(el('span','Переглянути детальніше  →','inbox-more'));
   if(item.images?.length){const img=document.createElement('img');img.src=item.images[0];img.alt='';img.loading='lazy';img.className='inbox-cover';card.append(img)}
   root.append(card);
  }
  document.querySelectorAll('[data-inbox-filter]').forEach(b=>{const state=b.dataset.inboxFilter===selected;b.classList.toggle('selected',state);b.setAttribute('aria-pressed',String(state))});
  if(activeDetail&&dialog.open&&!rows.some(x=>x.id===activeDetail))dialog.close();
  observeNoticeCards();
 }
 async function sync(){
  if(busy){needsResync=true;return}busy=true;
  try{
   const queue=primaryQueue(),now=Date.now(),incoming=[];
   if(noticeFeedConfirmed){
    const allowed=notices.filter(a=>a.active===true&&(!a.queue||a.queue==='all'||a.queue===queue)
      &&targeted(a)&&(!a.scheduledAt||Date.parse(a.scheduledAt)<=now)&&(!a.expiresAt||Date.parse(a.expiresAt)>now))
      .map(a=>'notice:'+a.id);
    await store.reconcileAnnouncements(allowed);
   }
   const [schedules,emergency]=await Promise.all([
    fetch('./data/schedules.json?inbox='+now,{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null),
    fetch('./data/emergency.json?inbox='+now,{cache:'no-store'}).then(x=>x.ok?x.json():null).catch(()=>null)
   ]);
   if(queue&&Array.isArray(schedules?.days)){
    for(const x of schedules.changes||[]){
     const at=Date.parse(x.detectedAt||x.publishedAt||'');
     if(!x.queues?.includes(queue)||!Number.isFinite(at)||at<now-72*3600000||at>now+120000)continue;
     const day=schedules.days.find(d=>d.date===x.date&&d.verified===true);
     incoming.push({id:copy.changeId(queue,x),...copy.changeCopy(queue,x.date,day),
      kind:'schedule',at:new Date(at).toISOString(),url:x.source});
    }
    for(const x of schedules.days){
     const at=Date.parse(copy.firstPublishedAt(x));
     if(!x.verified||!Number.isFinite(at)||at<now-72*3600000||at>now+120000)continue;
     incoming.push({id:copy.dayId(queue,x),
      title:'🗓️ Графік на '+date(x.date),body:'Для підчерги '+queue+' опубліковано розклад.',
      content:copy.tomorrowCopy(queue,x.date,x).content,kind:'schedule',at:new Date(at).toISOString(),url:x.source});
    }
   }
   for(const x of (emergency?.events||[]).slice(0,12)){const at=Date.parse(x.publishedAt||'');
    if(!Number.isFinite(at)||at<now-72*3600000||at>now+120000||!validUrl(x.source))continue;
    if(x.queues?.length&&(!queue||!x.queues.includes(queue)))continue;
    const message=copy.emergencyCopy(x.status);
    incoming.push({id:copy.emergencyId(x),kind:'emergency',at:new Date(at).toISOString(),
      title:message?.title||(x.title||'📣 Повідомлення оператора'),
      body:message?.body||(x.title||'Нова інформація від оператора.'),
      content:message?.content||x.title||'',url:x.source,priority:'important'});
   }
   for(const a of notices){
    if(a.active!==true||!targeted(a)||a.queue&&a.queue!=='all'&&a.queue!==queue||a.scheduledAt&&Date.parse(a.scheduledAt)>now||a.expiresAt&&Date.parse(a.expiresAt)<=now)continue;
    incoming.push({id:'notice:'+a.id,kind:'announcement',title:(a.icon||({important:'📣',update:'✨',emergency:'⚠️',schedule:'🗓️'})[a.kind]||'💬')+' '+a.title,
     body:a.body,content:a.content,images:a.images,at:a.publishedAt,updatedAt:a.updatedAt,pinned:a.pinned,priority:a.priority,authoritative:true});
   }
   if(incoming.length){
    await store.add(incoming);
    // Older Inbox database scripts remain supported during iOS PWA updates.
    if(typeof store.reconcileAutomated==='function')await store.reconcileAutomated(incoming);
   }
   lastSync=Date.now();await refresh();
  }catch(error){
   // Partial network or migration failures must not block cached messages.
   console.warn('Inbox synchronization failed:',error);
   await refresh().catch(console.warn);
  }finally{busy=false;if(needsResync){needsResync=false;queueMicrotask(()=>sync().catch(console.warn))}}
 }
 function routePush(id,pushClick=false){
  if(pushClick)trackNotice(id,'pushClick');
  document.querySelector('[data-go="updates"]')?.click();
  // Push tap should always request a fresh authoritative server snapshot.
  window.dispatchEvent(new CustomEvent('svitlo:refresh-content'));
  const target=id||'';
  if(target&&open(target))return;
  if(target){sync().then(()=>open(target)).catch(console.warn)}
 }
 document.querySelectorAll('[data-inbox-filter]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.inboxFilter;refresh().catch(console.warn)}));
 $('inboxMarkAll').onclick=async()=>{await store.mark(rows.map(x=>x.id));await refresh()};
 $('inboxClear').onclick=async()=>{await store.clearRead();await refresh()};
 document.querySelectorAll('[data-go="updates"]').forEach(b=>b.addEventListener('click',()=>{
  window.dispatchEvent(new CustomEvent('svitlo:refresh-content'));
  sync().catch(console.warn);
 }));
 window.addEventListener('svitlo:public-config',event=>{
  if(event.detail?.serverVerified!==true)return;
  notices=Array.isArray(event.detail.announcements)?event.detail.announcements:[];
  noticeFeedConfirmed=true;
  // Reconcile even when the latest response is [] or text is unchanged.
  // This fixes the race where the first event arrived before inbox-ui loaded.
  sync().catch(console.warn);
 });
 window.addEventListener('svitlo:content-updated',()=>sync().catch(console.warn));
 navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type==='SVITLO_INBOX_UPDATED'){
   window.dispatchEvent(new CustomEvent('svitlo:refresh-content'));
   sync().catch(console.warn);
  }
  if(event.data?.type==='SVITLO_OPEN_INBOX')routePush(event.data.id,event.data.pushClick===true);
  if(event.data?.type==='SVITLO_NOTICE_PUSH_CLICK')trackNotice(event.data.id,'pushClick');
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync().catch(console.warn);else clearTimeout(readTimer)});
 window.addEventListener('online',()=>sync().catch(console.warn));
 window.addEventListener('focus',()=>{
  window.dispatchEvent(new CustomEvent('svitlo:refresh-content'));
  sync().catch(console.warn)
 });
 window.SvitloInboxUI={refresh,sync,open};
 // Opening the Inbox is a meaningful freshness boundary even on iOS, where
 // background polling may be throttled while the user is on another screen.
 document.querySelectorAll('[data-go="updates"]').forEach(button=>
  button.addEventListener('click',()=>window.SvitloControls?.refresh?.()));
 refresh().then(async()=>{
  // If server config was fetched before this dynamically loaded script,
  // consume it now. Do not trust local snapshots as removal authority.
  if(window.SvitloPublicConfig?.serverVerified===true){
   notices=window.SvitloPublicConfig.announcements||[];
   noticeFeedConfirmed=true;
  }
  await sync();window.dispatchEvent(new CustomEvent('svitlo:refresh-content'));
  const params=new URL(location.href).searchParams;
  const pushClick=params.get('pushclick');
  if(pushClick)trackNotice(pushClick,'pushClick');
  const id=params.get('inbox');
  if(id||pushClick)history.replaceState(null,'',location.pathname+location.hash);
  if(id)routePush(id);
 }).catch(console.warn);
 setInterval(()=>{if(!document.hidden)sync().catch(console.warn)},5*60000);
})();
