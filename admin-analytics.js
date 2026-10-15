/* Aggregate-only private admin analytics. Counts are not unique visitors. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),root=$('analyticsSummary');
 if(!root)return;
 const el=(tag,text,cls='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
 const pretty=n=>new Intl.NumberFormat('uk-UA').format(Number(n)||0);
 let state=null,busy=false;
 function render(){
  if(!state)return;
  const n=$('analyticsRange').value==='30'?30:7,days=state.days.slice(-n),totals=n===30?state.totals30:state.totals7;
  $('analyticsPeriod').textContent=n+' днів';root.replaceChildren();
  const cards=[
   {label:'Відкриття сторінки',value:totals.landing,desc:'Сторінка встановлення',sign:'↗'},
   {label:'Запуски PWA',value:totals.appOpen,desc:'Не унікальні користувачі',sign:'▣'},
   {label:'Намір встановити',value:totals.installGuide,desc:'Натискання інструкції',sign:'↓'},
   {label:'Із реклами єЧеркаси',value:totals.telegram,desc:'Події з міткою каналу',sign:'◈'}
  ];
  for(const c of cards){const card=el('div',null,'analytics-kpi');
   card.append(el('span',c.sign,'analytics-kpi-icon'),el('small',c.label),el('strong',pretty(c.value)),el('span',c.desc,'analytics-kpi-foot'));root.append(card)}
  const chart=$('analyticsTrendChart');chart.replaceChildren();
  const top=Math.max(1,...days.map(x=>Math.max(x.landing,x.appOpen)));
  for(const item of days){
   const col=el('div',null,'analytics-day'),bars=el('div',null,'analytics-day-bars');
   for(const [key,cls] of [['landing','landing'],['appOpen','installed']]){
    const b=el('div',null,'analytics-bar '+cls);b.style.height=Math.max(2,item[key]/top*100)+'%';
    b.title=item.date+': '+pretty(item[key])+(key==='landing'?' відкриттів':' запусків PWA');
    bars.append(b);
   }
   const day=new Date(item.date+'T12:00:00Z');
   const label=n===7?day.toLocaleDateString('uk-UA',{weekday:'short',timeZone:'UTC'}):day.getUTCDate().toString();
   col.append(bars,el('small',label));col.setAttribute('aria-label',item.date+' відкриття '+item.landing+', запуски '+item.appOpen);
   chart.append(col);
  }
  const hourly=$('analyticsHourlyChart');hourly.replaceChildren();
  const hourTop=Math.max(1,...state.hours.map(h=>h.landing+h.appOpen));
  for(const hour of state.hours){
   const entry=el('div',null,'analytics-hour-col'),bar=el('div',null,'analytics-hour-bar');
   bar.style.height=Math.max(2,(hour.landing+hour.appOpen)/hourTop*100)+'%';
   bar.title=hour.hour+': '+pretty(hour.landing+hour.appOpen)+' подій';
   entry.append(bar,el('small',hour.hour.slice(-2)));hourly.append(entry);
  }
  const sum=(key)=>days.reduce((x,y)=>x+y[key],0),referrals=$('analyticsReferrals');referrals.replaceChildren();
  for(const [label,v] of [['Переходи на сторінку з усіх джерел',sum('landing')],['Події з міткою Telegram єЧеркаси',sum('telegram')]]){
   const line=el('div',null,'analytics-ref-row');line.append(el('span',label),el('strong',pretty(v)));referrals.append(line);
  }
  $('analyticsSince').textContent=state.since?'Збір даних із '+new Date(state.since).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'Поки немає зафіксованих подій';
  $('analyticsStatus').textContent='Числа не є унікальними відвідувачами або встановленнями. Дані збираються з моменту ввімкнення лічильника.';
 }
 async function refresh(){
  if(busy||typeof remote==='undefined'||!remote)return;busy=true;
  $('analyticsStatus').textContent='Оновлюємо статистику…';
  try{state=await api('analytics');render()}
  catch(e){$('analyticsStatus').textContent='Аналітику поки недоступно: '+e.message}
  finally{busy=false}
 }
 $('analyticsRange').addEventListener('change',render);
 $('analyticsReload').addEventListener('click',refresh);
 document.querySelector('[data-admin-tab="insights"]')?.addEventListener('click',refresh);
 document.addEventListener('svitlo:admin-ready',refresh);
 document.addEventListener('svitlo:admin-logout',()=>{state=null;root.replaceChildren();$('analyticsTrendChart').replaceChildren();$('analyticsHourlyChart').replaceChildren()});
 window.SvitloAdminAnalytics={refresh};
})();
