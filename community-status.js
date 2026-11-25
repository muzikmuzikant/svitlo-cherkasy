/* One-tap queue status reports for the selected queue. */
(()=>{'use strict';
 const statusHost=document.getElementById('communityStatusCard');
 if(!statusHost)return;
 const QUEUE_RE=/^[1-6]\.[12]$/,STORE='svitlo-addresses-v6',PREF='svitlo-prefs-v6',CLIENT='svitlo-community-client-v1';
 let api='',queue='',busy=false,refreshTimer=0,lastData=null,notice='',loadError='';
 const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
 const safe=fn=>{try{return fn()}catch{return null}};
 async function timedFetch(url,options={},timeout=9000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}
 function selectedQueue(){const a=safe(()=>JSON.parse(localStorage.getItem(STORE)||'[]'))||[],p=safe(()=>JSON.parse(localStorage.getItem(PREF)||'{}'))||{},selected=a.find(x=>x?.id===p.primaryId)||a[0];return QUEUE_RE.test(selected?.queue||'')?selected.queue:''}
 function clientId(){try{let id=localStorage.getItem(CLIENT);if(!id){id=crypto.randomUUID?.()||('sc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));localStorage.setItem(CLIENT,id)}return id}catch{return ''}}
 async function getApi(){if(api)return api;const r=await fetch('./push-config.json',{cache:'no-store'});if(!r.ok)throw Error('config');const c=await r.json(),raw=String(c.apiBase||'').trim(),v=raw.endsWith('/')?raw.slice(0,-1):raw;if(!v.startsWith('https://'))throw Error('api');api=v;return api}
 const featureEnabled=k=>!document.documentElement.classList.contains('feature-off-'+k);
 function visibility(){statusHost.hidden=!featureEnabled('communityStatus')}
 function ageMinutes(data){
  if(!data?.updatedAt)return null;
  const stamp=Date.parse(data.updatedAt);
  return Number.isFinite(stamp)?Math.max(0,Math.floor((Date.now()-stamp)/60000)):null;
 }
 function freshnessText(data){
  const age=ageMinutes(data);
  if(age===null)return 'Ще немає повідомлень';
  return age<1?'Останнє повідомлення щойно':'Останнє повідомлення '+age+' хв тому';
 }
 function paintStatus(data){
  statusHost.replaceChildren();
  const shell=make('div',undefined,'community-card-shell');
  const disclosure=make('details',undefined,'community-disclosure');
  disclosure.open=safe(()=>localStorage.getItem('svitlo-community-collapsed')!=='1')??true;
  disclosure.addEventListener('toggle',()=>{try{localStorage.setItem('svitlo-community-collapsed',disclosure.open?'0':'1')}catch{}});
  const summary=make('summary',undefined,'community-card-summary'),title=make('span',undefined,'community-summary-copy');
  title.append(make('span','ЩО ЗІ СВІТЛОМ?','community-eyebrow'),make('strong','Фактичний стан за повідомленнями мешканців'));
  const meta=make('span',undefined,'community-summary-meta');
  meta.append(make('span',queue?'Черга '+queue:'Чергу не визначено','community-queue'),make('span','⌄','community-collapse-icon'));
  summary.append(title,meta);disclosure.append(summary);
  const refresh=make('button','↻','community-refresh');refresh.type='button';refresh.setAttribute('aria-label','Оновити повідомлення');refresh.title='Оновити';refresh.disabled=busy;refresh.addEventListener('click',()=>loadStatus(true));
  const content=make('div',undefined,'community-disclosure-content');
  if(!queue){content.append(make('p','Додайте адресу з визначеною підчергою, щоб бачити повідомлення мешканців.','community-hint'))}
  else{
   const result=make('div',undefined,'community-result'),state=data?.state||'unknown',counts=data?.counts||{on:0,off:0,total:0};
   const label=state==='on'?'За повідомленнями, світло є':state==='off'?'За повідомленнями, світла немає':'Поки недостатньо підтверджень';
   result.append(make('strong',label,'community-state community-'+state));
   result.append(make('span',freshnessText(data),'community-updated'));
   const total=Math.max(0,Number(counts.total)||0),on=Math.max(0,Number(counts.on)||0),off=Math.max(0,Number(counts.off)||0);
   const meter=make('div',undefined,'community-meter');meter.setAttribute('role','img');meter.setAttribute('aria-label','Є світло: '+on+', немає світла: '+off);
   const onBar=make('span',undefined,'community-meter-on'),offBar=make('span',undefined,'community-meter-off');
   onBar.style.width=(total?on/total*100:0)+'%';offBar.style.width=(total?off/total*100:0)+'%';meter.append(onBar,offBar);result.append(meter);
   result.append(make('span','Є світло: '+on+' · Немає світла: '+off+' · Відповідей: '+total,'community-counts'));
   if(data?.confirmed)result.append(make('span','Узгодженість повідомлень: '+data.agreementPercent+'%','community-agreement'));
   else if(total>0)result.append(make('span',total<3?'Потрібно щонайменше три різні підтвердження.':'Повідомлення різняться, тому підсумок поки не визначено.','community-hint'));
   if(data?.freshness==='aging')result.append(make('span','Дані можуть застарівати. Нове повідомлення допоможе оновити картину.','community-stale'));
   content.append(result);
   const controls=make('div',undefined,'community-actions');
   for(const [value,labelText] of [['on','Світло є'],['off','Світла немає']]){
    const b=make('button',labelText,'community-vote community-vote-'+value);b.type='button';b.disabled=busy;
    if(data?.myReport===value)b.setAttribute('aria-pressed','true');
    b.addEventListener('click',()=>sendReport(value));controls.append(b);
   }
   content.append(controls);
   if(notice)content.append(make('p',notice,'community-feedback'));
   if(loadError)content.append(make('p',loadError,'community-footnote community-error'));
   content.append(make('p','Повідомлення стосуються всієї підчерги, а не кожного окремого будинку. Це не офіційні дані оператора. Підсумок формується за останні 30 хвилин і лише за трьома або більше різними підтвердженнями.','community-footnote'));
  }
  disclosure.append(content);shell.append(disclosure,refresh);statusHost.append(shell);
 }
 async function loadStatus(force=false){
  if(statusHost.hidden)return;
  if(!queue){paintStatus(null);return}
  try{
   const root=await getApi(),url=new URL(root+'/api/community/status');url.searchParams.set('queue',queue);url.searchParams.set('clientId',clientId());
   const r=await timedFetch(url,{cache:'no-store'},8000);if(!r.ok)throw Error();
   lastData=await r.json();loadError='';paintStatus(lastData);
  }catch{
   loadError='Не вдалося оновити дані. Перевірте з’єднання.';
   if(lastData)paintStatus(lastData);else paintStatus({state:'unknown',counts:{on:0,off:0,total:0}});
  }
 }
 async function sendReport(value){
  if(busy||!queue)return;busy=true;notice='';loadError='';paintStatus(lastData||{state:'unknown',counts:{on:0,off:0,total:0}});
  try{
   const root=await getApi(),r=await timedFetch(root+'/api/community/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({queue,status:value,clientId:clientId()})},8000);
   const data=await r.json().catch(()=>({}));if(!r.ok){const wait=Number(data.retryAfter);throw Error(data.error||(wait>0?'Спробуйте ще раз через '+Math.ceil(wait/60)+' хв.':'Не вдалося надіслати повідомлення'))}
   notice='Дякуємо! Ваше повідомлення враховано.';await loadStatus(true);
  }catch(e){notice=e.message||'Не вдалося надіслати повідомлення.'}
  finally{busy=false;paintStatus(lastData||{state:'unknown',counts:{on:0,off:0,total:0}})}
 }
 async function refresh(force=false){
  visibility();const next=selectedQueue(),changed=next!==queue;
  if(changed){queue=next;lastData=null;notice='';loadError=''}
  if(changed||force){if(!statusHost.hidden)await loadStatus(true)}
 }
 visibility();refresh(true);const sub=$('primarySub');
 if(sub)new MutationObserver(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(true),120)}).observe(sub,{childList:true,subtree:true,characterData:true});
 document.addEventListener('svitlo:public-config',()=>{visibility();refresh(true)});
 window.addEventListener('storage',e=>{if(e.key===STORE||e.key===PREF)refresh(true)});
 window.addEventListener('online',()=>refresh(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});
 setInterval(()=>{if(!document.hidden&&queue&&!statusHost.hidden)loadStatus()},60000);
 window.SvitloCommunity={refresh};
})();