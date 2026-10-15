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
 let state=null,busy=false;
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
   else label=new Date(item.date+'T12:00:00Z').toLocaleDateString('uk-UA',{weekday:'short',timeZone:'UTC'});
   cell.append(group,make('small',label));
   cell.setAttribute('aria-label',(item.date||item.hour)+': відкриття '+item.landing+', запуски '+item.appOpen);
   host.append(cell);
  });
 }
 function render(){
  if(!state)return;
  const range=$('analyticsRange').value,period=range==='48'?'48':'7'===range?'7':'30';
  const sources=state['sources'+period]||{},totals=state['totals'+period]||{landing:0,appOpen:0,installGuide:0};
  const own=totalsSource(sources,'telegram-cherkasy-golovne');
  const days=period==='48'?(state.hours48||state.hours||[]):(state.days||[]).slice(-Number(period));
  $('analyticsPeriod').textContent=period==='48'?'48 годин':period+' днів';
  root.replaceChildren(
   card('Відкриття сторінки',pretty(totals.landing),'Один підрахунок на вкладку за день','↗'),
   card('Намір встановити',pretty(totals.installGuide),'Натискання кнопки встановлення','↓'),
   card('Запуски застосунку',pretty(totals.appOpen),'Запуски PWA, не встановлення','▣'),
   card('З реклами «Черкаси головне»',pretty(own.landing),'Відкриття за спеціальним посиланням','◈')
  );
  const campaign=$('analyticsCampaignMetrics');campaign.replaceChildren();
  const stats=[
   ['Переходи за міткою',pretty(own.landing),'Відкриття сторінки'],
   ['Натискання встановлення',pretty(own.installGuide),'Дії з інструкцією'],
   ['Співвідношення дій',pct(own.installGuide,own.landing),'Не конверсія в інсталяції'],
   ['Вартість за зафіксоване відкриття',own.landing?(700/own.landing).toLocaleString('uk-UA',{maximumFractionDigits:2})+' грн':'немає даних','700 грн / події переходів']
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
  if(period==='48'&&days.length){plot(chart,days,['landing','appOpen'],null,'48')}
  else plot(chart,days,['landing','appOpen'],null,period);
  const hours=period==='48'?(state.hours48||[]):(state.hours||[]);
  $('analyticsHourlyTitle').textContent=period==='48'?'48 годин, погодинно':'Останні 24 години';
  const hourly=$('analyticsHourlyChart');hourly.replaceChildren();
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
  $('analyticsStatus').textContent='Метрики анонімні. Дані не означають унікальних відвідувачів чи підтверджених встановлень. Облік починається лише після ввімкнення лічильника.';
 }
 async function refresh(){
  if(busy||typeof remote==='undefined'||!remote)return;busy=true;
  $('analyticsStatus').textContent='Завантажуємо статистику з Railway…';
  try{state=await api('analytics');render()}
  catch(e){$('analyticsStatus').textContent='Аналітика недоступна: '+e.message}
  finally{busy=false}
 }
 $('analyticsRange')?.addEventListener('change',render);
 $('analyticsReload')?.addEventListener('click',refresh);
 $('analyticsCopyLink')?.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(campaignURL);$('analyticsCopyLink').textContent='Скопійовано ✓'}
  catch{$('analyticsCopyLink').textContent='Скопіюйте адресу поруч'}
 });
 document.querySelector('[data-admin-tab="insights"]')?.addEventListener('click',refresh);
 document.addEventListener('svitlo:admin-ready',refresh);
 document.addEventListener('svitlo:admin-logout',()=>{state=null;root.replaceChildren();$('analyticsTrendChart').replaceChildren();$('analyticsHourlyChart').replaceChildren();$('analyticsCampaignMetrics').replaceChildren();$('analyticsFunnel').replaceChildren()});
 window.SvitloAdminAnalytics={refresh};
})();
