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
 let pendingLinkId=null;
 // Explicitly shared public notices remain available across queue changes,
 // but unpublishing still removes them once the authoritative feed updates.
 const LINKED_NOTICE_IDS='svitlo-inbox-linked-notices-v1';
 let linkedNoticeIds=new Set();
 try{const saved=JSON.parse(localStorage.getItem(LINKED_NOTICE_IDS)||'[]');
  if(Array.isArray(saved))linkedNoticeIds=new Set(saved.filter(x=>/^notice:[A-Za-z0-9_-]{6,64}$/.test(x)).slice(-30));
 }catch{}
 function rememberLinkedNotice(id){
  if(!/^notice:[A-Za-z0-9_-]{6,64}$/.test(id))return;
  linkedNoticeIds.add(id);
  try{localStorage.setItem(LINKED_NOTICE_IDS,JSON.stringify([...linkedNoticeIds].slice(-30)))}catch{}
 }
 let selected='all',searchTerm='',rows=[],notices=window.SvitloPublicConfig?.announcements||[],busy=false,lastSync=0,activeDetail=null,noticeFeedConfirmed=window.SvitloPublicConfig?.serverVerified===true,needsResync=false;
 // Only voluntary opt-in PWA installations count toward custom notice engagement.
 // "Read" is an approximation: detail stayed in the foreground for two seconds.
 let metricApi='',readTimer=null,seenObserver=null;
 const reported=new Set(),pendingMetrics=new Set();
 const analyticsReady=()=>{try{
  return (matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)
   &&localStorage.getItem('svitlo-beta-analytics-opt-in')==='yes'
   &&['notice-engagement-v1','7.9.11-notices'].includes(localStorage.getItem('svitlo-beta-analytics-consent-revision'))
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
 const ticketId=item=>/^ticket:(SC-[A-F0-9]{10}):(?:reply|status):/.exec(String(item?.id||''))?.[1]||'';
 const openTicket=id=>{if(!id)return;const path='./feedback.html?tab=tickets&ticket='+encodeURIComponent(id);closeDetail(()=>{if(window.SvitloInternalPages?.open)window.SvitloInternalPages.open(path);else location.href=path})};
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
 const dragHandle=el('div','','inbox-drag-handle');
 dragHandle.setAttribute('aria-hidden','true');
 const content=el('div','','inbox-detail-content');
 dialog.append(dragHandle,close,content);document.body.append(dialog);
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
 window.SvitloSheetMotion?.bind(dialog,()=>closeDetail());
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
  if(window.SvitloMessageFormat?.render)return window.SvitloMessageFormat.render(target,raw);
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
  const detailIcon=el('span','','inbox-detail-symbol');detailIcon.setAttribute('aria-hidden','true');detailIcon.append(symbol(item.kind));
  top.append(detailIcon,el('span',labels[item.kind]||'Повідомлення','inbox-detail-category'),el('time',time(item.at)));
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
  if(item.kind==='support'&&ticketId(item)){const button=el('button','💬 Відкрити звернення','inbox-detail-primary');button.type='button';button.onclick=()=>openTicket(ticketId(item));buttons.append(button)}
  if(validUrl(item.url)){const a=el('a','Офіційне джерело ↗');a.href=validUrl(item.url);a.target='_blank';a.rel='noopener noreferrer';buttons.append(a)}
  content.append(buttons);
  if(!dialog.open)try{dialog.showModal()}catch{dialog.setAttribute('open','')}
  if(id.startsWith('notice:'))readTimer=setTimeout(()=>{
   if(activeDetail===id&&dialog.open&&!document.hidden&&!detailClosing)trackNotice(id,'read');
  },2000);
  if(!item.read)store.mark([id]).then(refresh).catch(console.warn);
  return true;
 }

 // Deliberately small category icons, matching the existing application's vector language.
 const svgNS='http://www.w3.org/2000/svg';
 const iconPaths={
  schedule:['M8 2v4','M16 2v4','M3 10h18','M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  emergency:['M10.3 3.9 2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z','M12 9v5','M12 18h.01'],
  announcement:['M3 11v2a2 2 0 0 0 2 2h3l2 5h3l-2-5h2l8 4V5l-8 4H5a2 2 0 0 0-2 2z'],
  support:['M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9.2 9.2 0 0 1-3.5-.7L3 21l1.7-5.6A8.5 8.5 0 1 1 21 11.5z'],
  push:['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9','M10 21h4']
 };
 function symbol(kind){
  const svg=document.createElementNS(svgNS,'svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  for(const d of (iconPaths[kind]||iconPaths.push)){const p=document.createElementNS(svgNS,'path');p.setAttribute('d',d);svg.append(p)}
  return svg;
 }
 const labels={schedule:'Графіки',emergency:'Важливе',announcement:'Оголошення',push:'Сповіщення',support:'Підтримка'};
 const kyivDay=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Kyiv'});
 const shortTime=new Intl.DateTimeFormat('uk-UA',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'});
 const friendlyDate=new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:'Europe/Kyiv'});
 function dayKey(item){const n=Date.parse(item?.at||'');return Number.isFinite(n)?kyivDay.format(new Date(n)):'unknown'}
 function messageSection(key,today,yesterday){
  if(key==='pinned')return 'Закріплені';
  if(key===today)return 'Сьогодні';
  if(key===yesterday)return 'Вчора';
  if(key==='unknown')return 'Раніше';
  return friendlyDate.format(new Date(key+'T12:00:00Z'));
 }
 const actionsSheet=document.createElement('dialog');
 actionsSheet.className='inbox-actions-sheet';
 actionsSheet.setAttribute('aria-label','Дії з повідомленням');
 const sheetHandle=el('div','','inbox-actions-handle');
 sheetHandle.setAttribute('aria-hidden','true');
 const sheetTitle=el('h2','','inbox-actions-heading');
 const sheetButtons=el('div','','inbox-actions-buttons');
 const sheetCancel=el('button','Скасувати','inbox-actions-cancel');sheetCancel.type='button';
 actionsSheet.append(sheetHandle,sheetTitle,sheetButtons,sheetCancel);
 document.body.append(actionsSheet);
 let actionsTimer=null,actionsClosing=false;
 const closeActions=()=>{
  if(!actionsSheet.open||actionsClosing)return;
  if(reducedDetailMotion()){actionsSheet.close();return}
  actionsClosing=true;actionsSheet.classList.add('is-leaving');
  actionsTimer=setTimeout(()=>{actionsTimer=null;if(actionsSheet.open)actionsSheet.close()},200);
 };
 actionsSheet.addEventListener('close',()=>{clearTimeout(actionsTimer);actionsTimer=null;actionsClosing=false;actionsSheet.classList.remove('is-leaving')});
 actionsSheet.addEventListener('cancel',e=>{e.preventDefault();closeActions()});
 actionsSheet.addEventListener('click',e=>{if(e.target===actionsSheet)closeActions()});
 sheetCancel.onclick=closeActions;
 window.SvitloSheetMotion?.bind(actionsSheet,closeActions);
 function showActions(item){
  if(actionsSheet.open)return;
  sheetTitle.textContent=item.title;
  sheetButtons.replaceChildren();
  const add=(name,fn)=>{
   const button=el('button',name);button.type='button';
   button.onclick=()=>{
    // Clipboard and Web Share must run immediately in the original touch event.
    try{Promise.resolve(fn()).catch(error=>console.warn('Inbox action:',error))}
    catch(error){console.warn('Inbox action:',error)}
    closeActions();
   };
   sheetButtons.append(button);
  };
  add(item.read?'Позначити непрочитаним':'Позначити прочитаним',async()=>{
   if(item.read)await store.unmark([item.id]);else await store.mark([item.id]);
   await refresh();
  });
  if(item.kind==='support'&&ticketId(item))add('Відкрити звернення',()=>openTicket(ticketId(item)));
  if(item.kind!=='support'){
   add('Копіювати текст',()=>navigator.clipboard?.writeText(item.title+'\n'+item.body)||
    window.prompt?.('Скопіюйте повідомлення:',item.title+'\n'+item.body));
   const link=()=>{const url=new URL('./',location.href);url.searchParams.set('message',item.id);return url.href};
   const copyLink=()=>navigator.clipboard?.writeText(link())||
    window.prompt?.('Скопіюйте посилання:',link());
   add('Копіювати посилання',copyLink);
   add('Поділитися',async()=>{
    if(navigator.share){try{await navigator.share({title:item.title,url:link()})}
     catch(error){if(error?.name!=='AbortError')await copyLink()}}
    else await copyLink();
   });
  }
  try{actionsSheet.showModal()}catch(error){console.warn('Inbox actions:',error)}
 }

 async function refresh(){
  rows=await store.all();
  const unread=rows.filter(item=>!item.read).length;
  $('inboxUnread').hidden=!unread;
  $('inboxUnread').textContent=unread>99?'99+':String(unread);
  $('navUnread').hidden=!unread;
  $('navUnread').textContent=unread>9?'9+':String(unread);
  const mark=$('inboxMarkAll');mark.disabled=!unread;
  mark.title=unread?'Позначити прочитаними всі '+unread+' повідомлень':'Усі повідомлення прочитано';
  const note=$('inboxUnreadNote');
  if(note)note.textContent=unread?(unread===1?'1 непрочитане повідомлення':unread+' непрочитаних'):'Усе прочитано';
  const visible=rows.filter(item=>selected==='all'||selected==='unread'&&!item.read||
   selected==='schedule'&&item.kind==='schedule'||selected==='support'&&item.kind==='support'||
   selected==='important'&&(item.kind==='emergency'||item.priority==='important'||item.priority==='urgent'||item.pinned))
   .filter(item=>!searchTerm||(item.title+' '+item.body+' '+String(item.content||'').slice(0,700)).toLocaleLowerCase('uk-UA').includes(searchTerm))
   .sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||String(b.at).localeCompare(String(a.at)));
  const root=$('inboxList');root.replaceChildren();
  if(!visible.length){
   const empty=el('div',searchTerm?'Нічого не знайдено':
    selected==='unread'?'Усе прочитано':selected==='all'?'Поки немає повідомлень':'У цій категорії поки порожньо','inbox-empty');
   empty.append(el('p',searchTerm?'Спробуйте інший запит.':
    selected==='unread'?'Нові повідомлення з’являться тут.':'Коли будуть оновлення, ви побачите їх тут.'));
   root.append(empty);
  }
  const now=new Date(),today=kyivDay.format(now),yesterday=kyivDay.format(new Date(now.getTime()-86400000));
  let previous='';
  for(const item of visible){
   const section=item.pinned?'pinned':dayKey(item);
   if(section!==previous){previous=section;root.append(el('h2',messageSection(section,today,yesterday),'inbox-day-label'))}
   const card=el('article','','inbox-item'+(!item.read?' is-unread':'')+(item.pinned?' is-pinned':''));
   if(item.id.startsWith('notice:'))card.dataset.noticeId=item.id;
   const leading=el('span','','inbox-leading kind-'+(iconPaths[item.kind]?item.kind:'push'));
   leading.setAttribute('aria-hidden','true');leading.append(symbol(item.kind));
   const opener=el('button','','inbox-card-opener');opener.type='button';
   opener.setAttribute('aria-label','Відкрити повідомлення: '+item.title);
   opener.onclick=()=>open(item.id);
   const head=el('div','','inbox-item-head');
   head.append(el('span',labels[item.kind]||'Повідомлення','inbox-kind'));
   const stamp=el('time',Number.isFinite(Date.parse(item.at))?shortTime.format(new Date(item.at)):'','inbox-time');
   stamp.dateTime=item.at||'';head.append(stamp);
   if(!item.read)head.append(el('span','','inbox-new-dot'));
   opener.append(head,el('strong',item.title),el('p',item.body||''));
   if(item.pinned)opener.append(el('span','Закріплено','inbox-pin-note'));
   const more=el('button','','inbox-row-more');more.type='button';
   more.setAttribute('aria-label','Дії з повідомленням: '+item.title);
   const dots=document.createElementNS(svgNS,'svg');dots.setAttribute('viewBox','0 0 24 24');dots.setAttribute('aria-hidden','true');
   for(const x of [5,12,19]){const dot=document.createElementNS(svgNS,'circle');dot.setAttribute('cx',String(x));dot.setAttribute('cy','12');dot.setAttribute('r','1.7');dots.append(dot)}
   more.append(dots);more.onclick=()=>showActions(item);
   card.append(leading,opener,more);root.append(card);
  }
  document.querySelectorAll('[data-inbox-filter]').forEach(button=>{
   const active=button.dataset.inboxFilter===selected;
   button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active))
  });
  if(activeDetail&&dialog.open&&!rows.some(item=>item.id===activeDetail))dialog.close();
  observeNoticeCards();
  if(pendingLinkId&&rows.some(item=>item.id===pendingLinkId)){
   const id=pendingLinkId;pendingLinkId=null;open(id);
  }
 }
 async function sync(){
  if(busy){needsResync=true;return}busy=true;
  try{
   const queue=primaryQueue(),now=Date.now(),incoming=[];
   if(noticeFeedConfirmed){
    const allowed=notices.filter(a=>a.active===true&&(!a.queue||a.queue==='all'||a.queue===queue||linkedNoticeIds.has('notice:'+a.id))
      &&(targeted(a)||linkedNoticeIds.has('notice:'+a.id))&&(!a.scheduledAt||Date.parse(a.scheduledAt)<=now)&&(!a.expiresAt||Date.parse(a.expiresAt)>now))
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
    const linked=linkedNoticeIds.has('notice:'+a.id);
    if(a.active!==true||(!targeted(a)&&!linked)||(a.queue&&a.queue!=='all'&&a.queue!==queue&&!linked)||a.scheduledAt&&Date.parse(a.scheduledAt)>now||a.expiresAt&&Date.parse(a.expiresAt)<=now)continue;
    incoming.push({id:'notice:'+a.id,kind:'announcement',title:(copy.noticeDisplayTitle?copy.noticeDisplayTitle(a):((a.icon||'📣')+' '+a.title)),icon:a.icon,
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
 async function restoreSharedMessage(id){
  try{
   const cfg=await fetch('./push-config.json?shared='+Date.now(),{cache:'no-store'}).then(r=>{
    if(!r.ok)throw Error('Push config unavailable');return r.json()
   });
   const api=new URL(cfg.apiBase);
   if(api.protocol!=='https:')throw Error('Secure Beta API required');
   const url=new URL('/api/public/message',api);url.searchParams.set('id',id);
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw Error('Message unavailable: HTTP '+response.status);
   const item=await response.json();
   if(item?.id!==id)throw Error('Shared message ID mismatch');
   if(id.startsWith('notice:'))rememberLinkedNotice(id);
   await store.add({...item,authoritative:true});
   if(pendingLinkId===id){selected='all';await refresh();
    if(open(id))pendingLinkId=null;
   }
  }catch(error){
   console.warn('Shared message resolution:',error.message);
   if(pendingLinkId===id){
    pendingLinkId=null;
    await refresh().catch(console.warn);
    const root=$('inboxList');
    root?.prepend?.(el('div','Повідомлення більше недоступне або немає з’єднання. Спробуйте відкрити посилання пізніше.','inbox-empty'));
   }
  }
 }
 function routeMessage(id){
  const target=String(id||'');
  if(!/^(?:notice|day|change|transition|emergency|push):[A-Za-z0-9_.:+-]{1,145}$/.test(target))return;
  selected='all';pendingLinkId=target;
  document.querySelector('[data-go="updates"]')?.click();
  if(open(target)){pendingLinkId=null;return}
  // Cross-device links must not depend on this device's own queue or old Inbox cache.
  sync().catch(console.warn);
  if(typeof restoreSharedMessage==='function')restoreSharedMessage(target).catch(console.warn);
 }
 function routePush(id,pushClick=false){
  if(pushClick)trackNotice(id,'pushClick');
  const target=String(id||'');
  // Graph-related Push opens the exact relevant date directly.
  // Emergency and custom announcements retain their full Inbox detail.
  if(/^(?:transition|change|day):[1-6]\.[12]:20\d{2}-\d{2}-\d{2}(?::|$)/.test(target)){
   store.mark([target]).catch(console.warn);
   window.dispatchEvent(new CustomEvent('svitlo:open-schedule',{detail:{date:graphDate({id:target,at:new Date().toISOString()})}}));
   window.dispatchEvent(new CustomEvent('svitlo:refresh-content'));
   return;
  }
  document.querySelector('[data-go="updates"]')?.click();
  window.dispatchEvent(new CustomEvent('svitlo:refresh-content'));
  if(target&&open(target))return;
  if(target)sync().then(()=>open(target)).catch(console.warn);
 }
 document.querySelectorAll('[data-inbox-filter]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.inboxFilter;refresh().catch(console.warn)}));
 let searchTimer=null;
 $('inboxSearch')?.addEventListener('input',event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{searchTerm=event.target.value.trim().toLocaleLowerCase('uk-UA');refresh().catch(console.warn)},130)});
 const searchToggle=$('inboxSearchToggle'),searchPanel=$('inboxSearchPanel'),searchInput=$('inboxSearch');
 const closeSearch=()=>{
  if(!searchPanel||!searchToggle)return;
  searchPanel.hidden=true;searchToggle.setAttribute('aria-expanded','false');
  if(searchInput?.value){searchInput.value='';searchTerm='';refresh().catch(console.warn)}
 };
 searchToggle?.addEventListener('click',()=>{
  if(!searchPanel)return;
  const show=searchPanel.hidden;
  if(!show){closeSearch();return}
  searchPanel.hidden=false;searchToggle.setAttribute('aria-expanded','true');
  searchInput?.focus({preventScroll:true});
 });
 $('inboxSearchClose')?.addEventListener('click',()=>{closeSearch();searchToggle?.focus({preventScroll:true})});
 $('inboxMarkAll').onclick=async()=>{
  const button=$('inboxMarkAll');
  const unread=rows.filter(x=>!x.read).map(x=>x.id);
  if(!unread.length)return;
  button.disabled=true;
  try{await store.mark(unread);await refresh()}
  catch(error){button.disabled=false;console.warn('Mark all:',error)}
 };
 // Read inbox items remain in the user's history.
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
 window.addEventListener('svitlo:support-inbox-updated',()=>refresh().catch(console.warn));
 navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type==='SVITLO_INBOX_UPDATED'){
   window.dispatchEvent(new CustomEvent('svitlo:refresh-content'));
   sync().catch(console.warn);
  }
  if(event.data?.type==='SVITLO_OPEN_INBOX')routePush(event.data.id,event.data.pushClick===true);
  if(event.data?.type==='SVITLO_NOTICE_PUSH_CLICK')trackNotice(event.data.id,'pushClick');
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync().catch(console.warn);else clearTimeout(readTimer)});
 window.addEventListener('svitlo:analytics-consent-updated',()=>{if(!analyticsReady())seenObserver?.disconnect();else observeNoticeCards()});
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
  const id=params.get('inbox'),shared=params.get('message');
  if(id||pushClick||shared)history.replaceState(null,'',location.pathname+location.hash);
  if(shared)routeMessage(shared);
  else if(id)routePush(id);
 }).catch(console.warn);
 setInterval(()=>{if(!document.hidden)sync().catch(console.warn)},5*60000);
})();
