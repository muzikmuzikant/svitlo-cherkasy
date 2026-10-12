/* Administration dashboard: sourced statuses and audit, no made-up visitor analytics. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),panel=$('opsDashboard');
 if(!panel)return;
 let busy=false,lastFetched=0;
 const el=(tag,text,cls='')=>{const x=document.createElement(tag);x.textContent=String(text??'');if(cls)x.className=cls;return x};
 const formatDate=value=>value?new Date(value).toLocaleString('uk-UA',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Kyiv'}):'Немає даних';
 const ago=(value,limit)=>value&&Number.isFinite(Date.parse(value))&&Date.now()-Date.parse(value)<limit;
 const safeCheck=(label,ok,description,kind='normal')=>({label,ok,description,kind});
 function showServices(data,release,config){
  const s=data?.sources||{},schedule=s.schedules||{},review=s.review||{},push=data?.server||{};
  const health=[
   safeCheck('Railway · Push-сервер',!!data,'Авторизоване API відповідає'),
   safeCheck('GitHub Pages · застосунок',!!release,release?.version?'Версія '+release.version:'Немає відповіді сайту'),
   safeCheck('Імпорт офіційних графіків',!schedule.error&&ago(schedule.lastChecked,2*3600000),
    schedule.error?'Помилка джерела':schedule.lastChecked?'Перевірка '+formatDate(schedule.lastChecked):'Немає перевірки'),
   safeCheck('Перевірка Push',!push.pushCheckError&&ago(push.lastPushCheck,20*60000),
    push.pushCheckError?'Помилка: '+push.pushCheckError:push.lastPushCheck?'Перевірка '+formatDate(push.lastPushCheck):'Очікуємо перевірку'),
   safeCheck('Екстрені повідомлення',!s.emergency?.error,
    s.emergency?.error||'Завантаження джерела без помилки'),
   safeCheck('Контент та техроботи',!!config,config?'Налаштування збережено на сервері':'Немає відповіді'),
  ];
  const grid=$('opsHealthGrid');grid.replaceChildren();
  health.forEach(x=>{
   const card=el('div','','ops-health-card '+(x.ok?'healthy':'needs-check'));
   card.append(el('span',x.ok?'●':'○','ops-health-light'));
   const details=el('div','','ops-health-content');
   details.append(el('strong',x.label),el('small',x.description));card.append(details);grid.append(card);
  });
  if(config){
   const status=el('div','','ops-quick-stats');
   const items=[
    [String(config.announcements?.filter(x=>x.active).length||0),'активних оголошень'],
    [String(config.announcements?.filter(x=>!x.active).length||0),'чернеток'],
    [String(data?.feedback?.new??0),'нових звернень'],
    [String(push.pushSubscribers??0),'Push-підписок']
   ];
   items.forEach(([n,label])=>{const c=el('div','','ops-quick-stat');c.append(el('strong',n),el('small',label));status.append(c)});
   grid.after(status);panel.querySelectorAll('.ops-quick-stats').forEach((node,i)=>{if(node!==status)node.remove()});
  }
 }
 function showActivity(audit){
  const events=Array.isArray(audit?.events)?audit.events:[];
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()-6+i);return d.toISOString().slice(0,10)});
  const bucket=days.map(d=>events.filter(e=>Number.isFinite(Date.parse(e.at))&&new Date(e.at).toISOString().slice(0,10)===d).length);
  const top=Math.max(1,...bucket),chart=$('opsActivityChart');chart.replaceChildren();
  days.forEach((d,i)=>{
   const col=el('div','','ops-activity-column'),bar=el('div','','ops-activity-bar');
   bar.style.height=Math.max(6,bucket[i]/top*100)+'%';bar.title=bucket[i]+' дій, '+d;
   col.append(el('b',String(bucket[i])),bar,el('small',new Date(d+'T12:00:00Z').toLocaleDateString('uk-UA',{weekday:'short',timeZone:'UTC'})));
   chart.append(col);
  });
  $('opsActivityTotal').textContent=events.length?'Із доступного журналу: '+bucket.reduce((a,b)=>a+b,0)+' дій':'Поки без дій';
  const feed=$('opsActivityFeed');feed.replaceChildren();
  events.slice(0,6).forEach(item=>{
   const line=el('div','','ops-activity-item');
   line.append(el('strong',item.action||'Операція'),el('time',formatDate(item.at)));
   if(item.details)line.append(el('small',item.details));
   feed.append(line);
  });
  if(!feed.childElementCount)feed.append(el('p','Останніх дій немає.','hint'));
 }
 function showVersions(data){
  const host=$('opsReleaseHistory');if(!host)return;host.replaceChildren();
  const rows=Array.isArray(data?.versions)?data.versions:[];
  if(!rows.length){host.append(el('p','Історія версій поки недоступна.'));return}
  for(const v of rows.slice(0,14)){
   const card=el('article','','ops-release-item');
   card.append(el('strong','v'+v.version+' · '+v.title),el('time',v.date));
   if(v.changes?.length)card.append(el('small',v.changes.join(' · ')));
   host.append(card);
  }
 }
 async function refresh(){
  if(busy||typeof remote==='undefined'||!remote)return;
  busy=true;lastFetched=Date.now();
  try{
   const [monitor,audit,config,release]=await Promise.allSettled([
    api('monitor'),api('audit'),api('app-config'),
    fetch('./release.json?dashboard='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('No release');return r.json()})
   ]);
   const value=x=>x.status==='fulfilled'?x.value:null;
   showServices(value(monitor),value(release),value(config));
   showActivity(value(audit));
   const versions=await fetch('./data/release_history.json?dashboard='+Date.now(),{cache:'no-store'})
    .then(r=>r.ok?r.json():null).catch(()=>null);
   showVersions(versions);
  }catch(error){console.warn('Admin dashboard:',error)}
  finally{busy=false}
 }
 document.querySelectorAll('[data-ops-jump]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.opsJump)));
 document.querySelector('[data-admin-tab="overview"]')?.addEventListener('click',refresh);
 $('monitorRefresh')?.addEventListener('click',refresh);
 $('connect')?.addEventListener('click',()=>setTimeout(refresh,300));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastFetched>180000&&!panel.closest('[hidden]'))refresh()});
 window.SvitloDashboard={refresh};
})();
