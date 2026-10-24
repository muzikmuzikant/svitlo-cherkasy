/* Svitlo Insights 7.9.7. Aggregated events only; no visitor or installation claims. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),root=$('analyticsSummary');
 if(!root)return;
 const make=(tag,text,cls='')=>{const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=String(text);if(cls)e.className=cls;return e};
 const pretty=n=>new Intl.NumberFormat('uk-UA').format(Number(n)||0);
 const pct=(a,b)=>b>0?(a/b*100).toLocaleString('uk-UA',{maximumFractionDigits:1})+'%':'немає бази';
 const campaignURL='https://svitlo-cherkasy.pp.ua/?src=telegram-cherkasy-golovne';
 const sourceNames={
  'telegram-cherkasy-golovne':'Черкаси головне',
  'telegram-echerkasy':'єЧеркаси Світло',
  telegram:'Інші Telegram-переходи',
  direct:'Без мітки джерела',
  other:'Інші джерела'
 };
 let state=null,busy=false,queued=false;
 const kyivDay=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day};
 const shiftDay=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const extended=()=>!['48','7','30'].includes($('analyticsRange').value);
 const syncDateControls=()=>{
  const mode=$('analyticsRange').value,start=$('analyticsDateFrom'),end=$('analyticsDateTo');
  $('analyticsDateFields').hidden=!['from','custom'].includes(mode);
  start.max=end.max=kyivDay();
  if(!start.value)start.value=state?.earliestAvailable||shiftDay(kyivDay(),-6);
  if(!end.value)end.value=kyivDay();
  end.hidden=$('analyticsDateToLabel').hidden=mode==='from';
 };
 const chosenDates=()=>{
  const mode=$('analyticsRange').value,today=kyivDay();
  if(mode==='all')return {from:state?.earliestAvailable||today,to:today};
  if(['90','365'].includes(mode))return {from:shiftDay(today,1-Number(mode)),to:today};
  if(mode==='from')return {from:$('analyticsDateFrom').value,to:today};
  if(mode==='custom')return {from:$('analyticsDateFrom').value,to:$('analyticsDateTo').value};
  return null;
 };

 const totalsSource=(channels,key)=>channels?.[key]||{landing:0,appOpen:0,installGuide:0};
 function card(label,value,description,sign){
  const e=make('div',null,'analytics-kpi');
  e.append(make('span',sign,'analytics-kpi-icon'),make('small',label),
   make('strong',value),make('span',description,'analytics-kpi-foot'));return e;
 }
 function plot(host,items,keys,labels,limit){
  host.replaceChildren();
  const max=Math.max(1,...items.map(i=>keys.reduce((n,k)=>Math.max(n,Number(i[k])||0),0)));
  items.forEach((item,index)=>{
   const cell=make('div',null,'analytics-day');
   const group=make('div',null,'analytics-day-bars');
   for(const [k,cls] of keys.map((k,i)=>[k,i?'installed':'landing'])){
    const bar=make('div',null,'analytics-bar '+cls);
    bar.style.height=Math.max(2,(Number(item[k])||0)/max*100)+'%';
    bar.title=(item.date||item.hour)+': '+pretty(item[k])+' '+(k==='landing'?'відкриттів':'запусків PWA');
    group.append(bar);
   }
   let label='';
   if(limit==='48')label=index%6===0?item.hour.slice(11):'';
   else if(limit==='30')label=index%5===0?item.date.slice(8):'';
   else if(limit==='custom')label=index%Math.max(1,Math.ceil(items.length/10))===0?item.date.slice(5):'';
   else label=new Date(item.date+'T12:00:00Z').toLocaleDateString('uk-UA',{weekday:'short',timeZone:'UTC'});
   cell.append(group,make('small',label));
   cell.setAttribute('aria-label',(item.date||item.hour)+': відкриття '+item.landing+', запуски '+item.appOpen);
   host.append(cell);
  });
 }
 function render(){
  if(!state)return;
  const range=$('analyticsRange').value,historical=extended(),period=range==='48'?'48':range==='7'?'7':'30',selection=historical?state.range:null;
  if(historical&&!selection){$('analyticsStatus').textContent='Завантажте дані за обраний період.';return}
  const sources=historical?selection.sources:(state['sources'+period]||{});
  const totals=historical?selection.totals:(state['totals'+period]||{landing:0,appOpen:0,installGuide:0});
  const own=totalsSource(sources,'telegram-cherkasy-golovne');
  const days=historical?selection.chartDays:(period==='48'?(state.hours48||state.hours||[]):(state.days||[]).slice(-Number(period)));
  $('analyticsPeriod').textContent=historical?selection.from+' / '+selection.to:period==='48'?'48 годин':period+' днів';
  $('analyticsCoverage').textContent=historical?'Період: '+selection.from+' - '+selection.to+'. Найдавніша збережена дата: '+(selection.earliestAvailable||'немає')+(selection.partial?'. Частина історії недоступна.':'.'):'';
  $('analyticsComparison').textContent=historical?(selection.previousTotals?'Порівняння з '+selection.previousFrom+' - '+selection.previousTo+': відкриття '+pretty(selection.previousTotals.landing)+' → '+pretty(totals.landing)+', запуски PWA '+pretty(selection.previousTotals.appOpen)+' → '+pretty(totals.appOpen):'Попередній аналогічний період недоступний.'):'';

  root.replaceChildren(
   card('Відкриття сторінки',pretty(totals.landing),'Один підрахунок на вкладку за день','🔗'),
   card('Намір встановити',pretty(totals.installGuide),'Натискання кнопки встановлення','↓'),
   card('Запуски застосунку',pretty(totals.appOpen),'Запуски PWA, не встановлення','📱'),
   card('З реклами «Черкаси головне»',pretty(own.landing),'Відкриття за спеціальним посиланням','💝')
  );

  const pwa=state.betaPwa||{},advertising=state.betaAdvertising||{};
  const pwaBox=$('betaPwaMetrics');
  if(pwaBox&&!historical){pwaBox.replaceChildren(
    card('Зараз у встановленому PWA',pretty(pwa.online),'Активні за останні 45 секунд, зі згодою','●'),
    card('Відомі інсталяції PWA',pretty(pwa.known),'Не точна кількість встановлень або людей','📱'),
    card('Активні PWA за 24 год',pretty(pwa.active24h),'Унікальні інсталяції зі згодою','📡'),
    card('Активні PWA за 7 днів',pretty(pwa.active7d),'За псевдонімними ідентифікаторами','🔗'),
    card('Активні PWA за 30 днів',pretty(pwa.active30d),'За псевдонімними ідентифікаторами','📋'),
    card('Нові інсталяції PWA за 7 днів',pretty(pwa.new7d),'Вперше зафіксовані інсталяції','＋')
  )}
  if(pwaBox&&historical)pwaBox.replaceChildren(make('p','За довільний історичний період не можна достовірно підрахувати унікальні інсталяції PWA. Для них залишаються фільтри 48 годин, 7 і 30 днів.','analytics-range-status'));
  const adBox=$('betaAdsMetrics');
  if(adBox){
   const raw=historical?Object.fromEntries(Object.entries(advertising.daily||{}).filter(([d])=>d>=selection.from&&d<=selection.to)):(advertising.stats||{});
   const value=Object.values(raw).reduce((s,v)=>({impressions:s.impressions+(Number(v.impressions)||0),clicks:s.clicks+(Number(v.clicks)||0)}),{impressions:0,clicks:0});
   adBox.replaceChildren(
    card('Покази рекламних карток',pretty(value.impressions),'Облік видимих карток','📱'),
    card('Переходи по рекламі',pretty(value.clicks),'Натискання користувачів','🔗'),
    card('Рекламний CTR',pct(value.clicks,value.impressions),'Частка кліків від показів','%')
   )
  }
  // Popularity panels are about consented unique PWA installations, never events.
  // Repeated launches of the same installation do not increase these counts.
  const audience=historical?{}:(pwa['audience'+period]||{});
  for(const [dimension,id] of [['queues','analyticsTopQueues'],['localities','analyticsTopLocalities'],
   ['platforms','analyticsTopPlatforms'],['versions','analyticsTopVersions']]){
   const holder=$(id);if(!holder)continue;holder.replaceChildren();
   const data=audience[dimension]||{items:[],total:0,other:0,unknown:0};
   const rows=Array.isArray(data.items)?data.items:[];
   const base=make('p',null,'analytics-privacy-small');
   base.textContent=historical?'Історичну унікальну аудиторію для цих дат не визначаємо.':'Унікальних активних інсталяцій із відомою категорією: '+pretty(data.total||0);
   holder.append(base);
   if(!rows.length&&!historical)holder.append(make('p','Поки немає достатньо даних зі згодою. Старі події не враховуємо.','analytics-no-data'));
   for(const item of rows){
    const line=make('div',null,'analytics-popularity-row'),heading=make('div',null,'analytics-popularity-row-head');
    const percent=Number.isFinite(Number(item.percent))?Number(item.percent):0;
    heading.append(make('span',item.label),make('strong',pretty(item.count)+' · '+percent.toLocaleString('uk-UA',{maximumFractionDigits:1})+'%'));
    const track=make('div',null,'analytics-popularity-track'),bar=make('i');
    bar.style.width=Math.max(0,Math.min(100,percent))+'%';
    track.append(bar);line.append(heading,track);holder.append(line);
   }
   if(data.other>0)holder.append(make('p','Інші або приховані з міркувань приватності: '+pretty(data.other),'analytics-privacy-small'));
   if(data.unknown>0)holder.append(make('p','Не вказано або ще не оновлено: '+pretty(data.unknown),'analytics-privacy-small'));
  }
  const campaign=$('analyticsCampaignMetrics');campaign.replaceChildren();
  const stats=[
   ['Переходи за міткою',pretty(own.landing),'Відкриття сторінки'],
   ['Натискання встановлення',pretty(own.installGuide),'Дії з інструкцією'],
   ['Співвідношення дій',pct(own.installGuide,own.landing),'Не конверсія в інсталяції'],
   [historical?'Запуски PWA за період':'Відкриття за 48 годин',pretty(historical?totals.appOpen:((state.sources48||{})['telegram-cherkasy-golovne']?.landing||0)),'Анонімні події']
  ];
  for(const [name,value,desc] of stats){
   const c=make('div',null,'analytics-campaign-stat');
   c.append(make('small',name),make('strong',value),make('span',desc));campaign.append(c);
  }
  const funnel=$('analyticsFunnel');funnel.replaceChildren();
  const stages=[
   ['Відкрито сторінку',totals.landing],
   ['Натиснуто встановлення',totals.installGuide],
   ['Запущено PWA',totals.appOpen]
  ],max=Math.max(1,...stages.map(x=>x[1]));
  for(const [label,n] of stages){
   const e=make('div',null,'analytics-funnel-row'),line=make('div',null,'analytics-funnel-label');
   line.append(make('span',label),make('strong',pretty(n)));
   const track=make('div',null,'analytics-funnel-track'),fill=make('div',null,'analytics-funnel-fill');
   fill.style.width=(n?Math.max(2,n/max*100):0)+'%';track.append(fill);e.append(line,track);funnel.append(e);
  }
  const chart=$('analyticsTrendChart');
  plot(chart,days,['landing','appOpen'],null,historical?'custom':period);
  const hours=historical?[]:period==='48'?(state.hours48||[]):(state.hours||[]);
  $('analyticsHourlyTitle').textContent=historical?'Погодинна деталізація':period==='48'?'48 годин, погодинно':'Останні 24 години';
  const hourly=$('analyticsHourlyChart');hourly.replaceChildren();if(historical)hourly.append(make('p','Погодинний графік доступний у фільтрі 48 годин.','analytics-range-status'));
  const top=Math.max(1,...hours.map(h=>(Number(h.landing)||0)+(Number(h.appOpen)||0)));
  hours.forEach((h,i)=>{
   const e=make('div',null,'analytics-hour-col'),bar=make('div',null,'analytics-hour-bar');
   bar.style.height=Math.max(2,((h.landing||0)+(h.appOpen||0))/top*100)+'%';
   bar.title=h.hour+': '+pretty((h.landing||0)+(h.appOpen||0))+' подій';
   e.append(bar,make('small',i%Math.max(1,Math.round(hours.length/8))===0?h.hour.slice(11):''));hourly.append(e);
  });
  const list=$('analyticsReferrals');list.replaceChildren();
  for(const key of ['telegram-cherkasy-golovne','telegram-echerkasy','telegram','direct','other']){
   const record=totalsSource(sources,key),line=make('div',null,'analytics-ref-row');
   line.append(make('span',sourceNames[key]),make('strong',pretty(record.landing)));list.append(line);
  }
  $('analyticsSince').textContent=state.since?'Дані з '+new Date(state.since).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'short',timeStyle:'short'}):'Поки немає зафіксованих подій';
  $('analyticsUpdated').textContent=state.lastUpdated?'Остання подія '+new Date(state.lastUpdated).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'short',timeStyle:'short'}):'';
  $('analyticsStatus').textContent=historical?'Історичні числа показують анонімні події, а не підтверджені встановлення або унікальних людей. Рекламні дані зберігаються до 90 днів та групуються за UTC.':'Підчерги, населені пункти, пристрої та версії: унікальні активні інсталяції PWA за згодою. Це наближення до кількості людей, а не точний підрахунок фізичних осіб. Історичні події не перетворюємо на користувачів.';
 }
 async function refresh(){
  if(busy){queued=true;return}
  if(typeof remote==='undefined'||!remote)return;
  busy=true;$('analyticsStatus').textContent='Завантажуємо статистику з Railway…';
  try{
   if(extended()&&!state)state=await api('analytics');
   if(extended()&&state?.earliestAvailable&&!$('analyticsDateFrom').dataset.edited)$('analyticsDateFrom').value=state.earliestAvailable;
   syncDateControls();
   const dates=extended()?chosenDates():null;
   if(dates&&(!/^20\d{2}-\d{2}-\d{2}$/.test(dates.from)||!/^20\d{2}-\d{2}-\d{2}$/.test(dates.to)||dates.from>dates.to||dates.to>kyivDay()))throw Error('Перевірте початкову та кінцеву дати');
   const query=dates?'?from='+encodeURIComponent(dates.from)+'&to='+encodeURIComponent(dates.to):'';
   state=await api('analytics'+query);syncDateControls();render();
  }catch(e){$('analyticsStatus').textContent='Аналітика недоступна: '+e.message}
  finally{busy=false;if(queued){queued=false;refresh()}}
 }
 $('analyticsRange')?.addEventListener('change',()=>{syncDateControls();refresh()});
 for(const id of ['analyticsDateFrom','analyticsDateTo'])$(id)?.addEventListener('change',()=>{
  $(id).dataset.edited='true';refresh();
 });
 $('analyticsReload')?.addEventListener('click',refresh);
 $('analyticsExportCsv')?.addEventListener('click',()=>{
  if(!state)return;
  const mode=$('analyticsRange').value;
  const rows=extended()?(state.range?.days||[]):mode==='48'?(state.hours48||[]):(state.days||[]).slice(-Number(mode));
  if(!rows.length){$('analyticsStatus').textContent='Немає даних для експорту.';return}
  const lines=[['Дата або година','Відкриття','Намір встановити','Запуски PWA'],
   ...rows.map(r=>[r.date||r.hour,Number(r.landing)||0,Number(r.installGuide)||0,Number(r.appOpen)||0])];
  const csv='\uFEFF'+lines.map(cols=>cols.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='svitlo-analytics-'+mode+'-'+kyivDay()+'.csv';
  document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 });
 syncDateControls();
 $('analyticsCopyLink')?.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(campaignURL);$('analyticsCopyLink').textContent='Скопійовано ✅'}
  catch{$('analyticsCopyLink').textContent='Скопіюйте адресу поруч'}
 });
 document.querySelector('[data-admin-tab="insights"]')?.addEventListener('click',refresh);
 // The 15-second live refresh runs only while the Insights panel is visible.
 setInterval(()=>{const panel=document.querySelector('[data-admin-panel="insights"]');if(panel&&!panel.hidden&&!document.hidden)refresh()},15000);
 document.addEventListener('svitlo:admin-ready',refresh);
 document.addEventListener('svitlo:admin-logout',()=>{state=null;root.replaceChildren();$('betaPwaMetrics')?.replaceChildren();$('betaAdsMetrics')?.replaceChildren();$('analyticsTrendChart').replaceChildren();$('analyticsHourlyChart').replaceChildren();$('analyticsCampaignMetrics').replaceChildren();$('analyticsFunnel').replaceChildren()});
 window.SvitloAdminAnalytics={refresh};
})();
