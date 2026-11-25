/* One-tap queue status reports and clearly separated planned/observed statistics. */
(()=>{'use strict';
 const statusHost=document.getElementById('communityStatusCard'),statsHost=document.getElementById('electricityStatsCard');
 if(!statusHost||!statsHost)return;
 const QUEUE_RE=/^[1-6]\.[12]$/,STORE='svitlo-addresses-v6',PREF='svitlo-prefs-v6',CLIENT='svitlo-community-client-v1';
 let api='',queue='',period='day',busy=false,volatileClientId='';
 const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
 const safe=fn=>{try{return fn()}catch{return null}};
 async function timedFetch(url,options={},timeout=9000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}
 function selectedQueue(){const a=safe(()=>JSON.parse(localStorage.getItem(STORE)||'[]'))||[],p=safe(()=>JSON.parse(localStorage.getItem(PREF)||'{}'))||{},selected=a.find(x=>x?.id===p.primaryId)||a[0];return QUEUE_RE.test(selected?.queue||'')?selected.queue:''}
 function clientId(){try{let id=localStorage.getItem(CLIENT);if(!id){id=crypto.randomUUID?.()||('sc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));localStorage.setItem(CLIENT,id)}return id}catch{if(!volatileClientId)volatileClientId=crypto.randomUUID?.()||('sc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));return volatileClientId}}
 async function getApi(){if(api)return api;const r=await timedFetch('./push-config.json',{cache:'no-store'},8000);if(!r.ok)throw Error('config');const c=await r.json(),v=String(c.apiBase||'').replace(/\/$/,'');if(!/^https:\/\//.test(v))throw Error('api');api=v;return api}
 const featureEnabled=k=>!document.documentElement.classList.contains('feature-off-'+k);
 function visibility(){statusHost.hidden=!featureEnabled('communityStatus');statsHost.hidden=!featureEnabled('electricityStats')}
 function paintStatus(data){
  statusHost.replaceChildren();const head=make('div',undefined,'community-card-head'),title=make('div');
  title.append(make('span','ЩО ЗІ СВІТЛОМ?','community-eyebrow'),make('h2','Повідомте сусідам про електропостачання'));
  head.append(title,make('span',queue?'Черга '+queue:'Чергу не визначено','community-queue'));statusHost.append(head);
  if(!queue){statusHost.append(make('p','Додайте адресу з визначеною підчергою, щоб бачити повідомлення мешканців.','community-hint'));return}
  const result=make('div',undefined,'community-result'),state=data?.state||'unknown';
  const label=state==='on'?'За повідомленнями, світло є':state==='off'?'За повідомленнями, світла немає':'Поки недостатньо підтверджень';
  result.append(make('strong',label,'community-state community-'+state));
  const counts=data?.counts||{on:0,off:0,total:0};
  result.append(make('span',data?.confirmed?'Є світло: '+(counts.on||0)+' · Немає світла: '+(counts.off||0)+' · Відповідей: '+(counts.total||0):'Потрібно щонайменше три незалежні повідомлення за останні 30 хвилин.','community-counts'));
  if(data?.updatedAt)result.append(make('small','Оновлено о '+new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'}).format(new Date(data.updatedAt)),'community-updated'));
  statusHost.append(result);const controls=make('div',undefined,'community-actions');
  for(const [value,labelText] of [['on','Світло є'],['off','Світла немає']]){
   const b=make('button',labelText,'community-vote community-vote-'+value);b.type='button';b.disabled=busy;if(data?.myReport===value)b.setAttribute('aria-pressed','true');b.addEventListener('click',()=>sendReport(value));controls.append(b);
  }
  statusHost.append(controls,make('p','Повідомлення не містять імені чи адреси. Підсумок показується лише після трьох підтверджень і враховує останні 30 хвилин.','community-footnote'));
 }
 async function loadStatus(){if(statusHost.hidden)return;if(!queue){paintStatus(null);return}try{const root=await getApi(),url=new URL(root+'/api/community/status');url.searchParams.set('queue',queue);url.searchParams.set('clientId',clientId());const r=await timedFetch(url,{cache:'no-store'},8000);if(!r.ok)throw Error();paintStatus(await r.json())}catch{paintStatus({state:'unknown',counts:{on:0,off:0,total:0}});statusHost.append(make('p','Не вдалося оновити повідомлення. Перевірте з’єднання.','community-footnote'))}}
 async function sendReport(value){if(busy||!queue)return;busy=true;statusHost.querySelectorAll('button').forEach(b=>b.disabled=true);try{const root=await getApi(),r=await timedFetch(root+'/api/community/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({queue,status:value,clientId:clientId()})},8000),data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Не вдалося надіслати повідомлення');await loadStatus()}catch(e){statusHost.append(make('p',e.message||'Не вдалося надіслати повідомлення','community-footnote community-error'))}finally{busy=false;statusHost.querySelectorAll('button').forEach(b=>b.disabled=false)}}
 const hours=n=>(Number(n||0)/60).toLocaleString('uk-UA',{minimumFractionDigits:1,maximumFractionDigits:1})+' год';
 function statLine(label,value,detail,kind){const row=make('div',undefined,'electricity-stat-line'),copy=make('div');copy.append(make('strong',label),make('small',detail||''));row.append(copy,make('b',value,kind||''));return row}
 function paintStats(data){
  statsHost.replaceChildren();const head=make('div',undefined,'electricity-stats-head'),title=make('div');
  title.append(make('span','СТАТИСТИКА ЕЛЕКТРОПОСТАЧАННЯ','community-eyebrow'),make('h2','План і фактичні спостереження окремо'));head.append(title);statsHost.append(head);
  const tabs=make('div',undefined,'electricity-periods');
  for(const [key,label] of [['day','День'],['week','Тиждень'],['month','Місяць']]){const b=make('button',label);b.type='button';b.setAttribute('aria-pressed',String(period===key));b.addEventListener('click',()=>{if(period!==key){period=key;loadStats()}});tabs.append(b)}
  statsHost.append(tabs);const plan=data?.planned||{},actual=data?.actual||{},cols=make('div',undefined,'electricity-stats-columns');
  const planned=make('section',undefined,'electricity-stats-group');planned.append(make('h3','За офіційним графіком'));
  planned.append(statLine('Планове постачання',hours(plan.onMinutes),'Розрахунок за підтвердженими годинами','is-on'),statLine('Планові відключення',hours(plan.offMinutes),'Не є фактичним вимірюванням','is-off'),statLine('Невідомий час',hours(plan.unknownMinutes),'Не зараховується до жодної категорії'),statLine('Аварійні відключення',plan.emergencyOffMinutes==null?(plan.emergencyEvents?plan.emergencyEvents+' повідомл.':'Немає даних'):hours(plan.emergencyOffMinutes),plan.emergencyOffMinutes==null?(plan.emergencyEvents?'Є повідомлення без точного часу':'Немає підтверджених інтервалів'):'Тривалість за часовими мітками','is-emergency'));
  const observed=make('section',undefined,'electricity-stats-group');observed.append(make('h3','За повідомленнями мешканців'));
  observed.append(statLine('Фактично було світло',hours(actual.onMinutes),'Підтверджені 10-хвилинні інтервали','is-on'),statLine('Фактично не було світла',hours(actual.offMinutes),'Підтверджені 10-хвилинні інтервали','is-off'),statLine('Без достатніх підтверджень',hours(actual.unknownMinutes),'Пропуски не домальовуються'));
  const coverage=actual.totalMinutes?Math.round(actual.coverageMinutes/actual.totalMinutes*100):0;observed.append(make('p','Підтверджено '+coverage+'% часу. Для кожного інтервалу потрібно щонайменше три різні повідомлення.','community-footnote'));
  cols.append(planned,observed);statsHost.append(cols,make('p','Фактичні дані залежать від добровільних повідомлень користувачів і не є показниками лічильника.','community-footnote'));
 }
 async function loadStats(){if(statsHost.hidden)return;if(!queue){statsHost.replaceChildren(make('p','Додайте адресу з визначеною підчергою.','community-hint'));return}statsHost.replaceChildren(make('p','Завантажуємо статистику…','community-hint'));try{const root=await getApi(),url=new URL(root+'/api/community/stats');url.searchParams.set('queue',queue);url.searchParams.set('period',period);const r=await timedFetch(url,{cache:'no-store'},10000);if(!r.ok)throw Error();paintStats(await r.json())}catch{statsHost.replaceChildren(make('p','Статистика тимчасово недоступна. Спробуйте пізніше.','community-hint'))}}
 async function refresh(force=false){visibility();const next=selectedQueue(),changed=next!==queue;queue=next;if(changed||force){if(!statusHost.hidden)await loadStatus();if(!statsHost.hidden)await loadStats()}}
 visibility();refresh(true);const sub=$('primarySub');
 if(sub)new MutationObserver(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(true),120)}).observe(sub,{childList:true,subtree:true,characterData:true});
 document.addEventListener('svitlo:public-config',()=>{visibility();refresh(true)});window.addEventListener('storage',e=>{if(e.key===STORE||e.key===PREF)refresh(true)});window.addEventListener('online',()=>refresh(true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});
 setInterval(()=>{if(!document.hidden&&queue&&!statusHost.hidden)loadStatus()},60000);window.SvitloCommunity={refresh};
})();