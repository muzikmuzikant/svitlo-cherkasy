/* Beta 7.9.14: day planner, per-address Push hours, schedule history and address comparison. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),STORE='svitlo-smart-tools-v7914';
 const defaultHours=()=>({enabled:false,weekdays:{enabled:false,from:'08:00',to:'20:00'},weekends:{enabled:false,from:'08:00',to:'20:00'}});
 const readStore=()=>{try{const x=JSON.parse(localStorage.getItem(STORE)||'{}');return x&&typeof x==='object'?x:{}}catch{return {}}};
 let saved=readStore(),selectedDate='',selectedIds=new Set(),syncTimer=null;
 const core=()=>window.SvitloCore;
 const addresses=()=>core()?.getAddresses?.()||[];
 const primary=()=>core()?.getPrimary?.()||null;
 const data=()=>core()?.getData?.()||{days:[],changes:[],history:[]};
 const today=()=>core()?.getToday?.()||new Date().toISOString().slice(0,10);
 const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 const duration=n=>{const h=Math.floor(n/60),m=n%60;return h?(m?h+' год '+m+' хв':h+' год'):m+' хв'};
 const node=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x};
 const button=(label,cls)=>{const b=node('button',cls,label);b.type='button';return b};
 const intervals=(values,state)=>{if(!values)return [];const out=[];let start=-1;for(let i=0;i<=1440;i++){const yes=i<1440&&values[i]===state;if(yes&&start<0)start=i;if(!yes&&start>=0){out.push({from:start,to:i});start=-1}}return out};
 const intervalText=xs=>xs.length?xs.map(x=>clock(x.from)+'–'+clock(x.to)).join(', '):'немає';
 const getAllowedHours=()=>{const a=primary();return a?.id?(saved[a.id]||defaultHours()):defaultHours()};
 const saveHours=hours=>{const a=primary();if(!a?.id)return;saved[a.id]=hours;localStorage.setItem(STORE,JSON.stringify(saved));queuePushSync()};
 function queuePushSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>{if(core()?.isPushActive?.())window.dispatchEvent(new Event('svitlo:push-hours-changed'))},500)}
 window.SvitloSmartTools={getAllowedHours};
 function insertAfter(reference,element){reference?.parentNode?.insertBefore(element,reference.nextSibling)}
 function makeCard(id,title,subtitle){
  const section=node('section','smart-tools-card surface');section.id=id;
  const head=node('div','smart-tools-head');head.append(node('div','smart-tools-heading',title),node('p','smart-tools-subtitle',subtitle));section.append(head);return section;
 }
 function ensurePanels(){
  if(!$('smartDayPlan')){
   const plan=makeCard('smartDayPlan','План дня','Коли за графіком найдовше є світло');
   const stats=document.querySelector('#home .stats-row'),tomorrow=document.querySelector('#home .tomorrow-preview');
   if(stats?.parentNode)stats.parentNode.insertBefore(plan,tomorrow||stats.nextSibling);
  }
  if(!$('smartCompare')){
   const compare=makeCard('smartCompare','Порівняти адреси','Знайдіть години, коли у вибраних місцях одночасно є світло');
   const notice=document.querySelector('#home .notice-strip'),places=$('placeList');
   if(notice?.parentNode)notice.parentNode.insertBefore(compare,notice);
   else if(places?.parentNode)insertAfter(places.parentNode,compare);
  }
  if(!$('smartHistory')){
   const history=makeCard('smartHistory','Історія змін графіка','Порівняння попередньої та актуальної редакцій');
   const list=$('updateList');if(list)insertAfter(list,history);
  }
  if(!$('smartPushHours')){
   const card=makeCard('smartPushHours','Години отримання Push','Окремі налаштування для кожної збереженої адреси');
   const categories=$('pushCategorySettings');if(categories)insertAfter(categories,card);
  }
 }
 function renderPlanner(){
  const root=$('smartDayPlan');if(!root)return;
  const a=primary();root.replaceChildren();
  const head=node('div','smart-tools-head');head.append(node('div','smart-tools-heading','План дня'),node('p','smart-tools-subtitle',a?(a.nickname||a.street||'Ваша адреса')+' · підчерга '+(a.queue||'не визначена'):'Додайте адресу, щоб побудувати план'));root.append(head);
  if(!a?.queue){root.append(node('p','smart-tools-empty','Після збереження адреси тут з’являться найдовші періоди зі світлом та без нього.'));return}
  const values=core()?.getTimeline?.(today(),a.queue);
  if(!values){root.append(node('p','smart-tools-empty','На сьогодні немає підтверджених даних для розрахунку.'));return}
  const on=intervals(values,0),off=intervals(values,1),longest=[...on].sort((x,y)=>(y.to-y.from)-(x.to-x.from))[0];
  const grid=node('div','smart-plan-grid');
  const best=node('div','smart-plan-highlight');best.append(node('span','smart-plan-label','Найдовше вікно зі світлом'),node('strong','smart-plan-time',longest?clock(longest.from)+'–'+clock(longest.to):'Не визначено'),node('small','smart-plan-duration',longest?duration(longest.to-longest.from):'Немає підтвердженого інтервалу'));grid.append(best);
  const minute=nowMinutes();let boundary=-1;for(let i=Math.max(1,minute+1);i<1440;i++){if(values[i]>=0&&values[i-1]>=0&&values[i]!==values[i-1]){boundary=i;break}}
  const nextState=boundary<0?null:values[boundary],nextLabel=nextState===1?'Відключення о ':nextState===0?'Світло з ':'';
  const next=node('div','smart-plan-next');next.append(node('span','smart-plan-label','Наступна зміна'),node('strong','smart-plan-time',boundary>=0?nextLabel+clock(boundary):'Змін не зазначено'),node('small','smart-plan-duration',boundary>=0?'Плановий інтервал':'За опублікованим графіком'));grid.append(next);
  root.append(grid, node('p','smart-tools-footnote','Це розрахунок за опублікованим графіком, а не вимірювання фактичної наявності електроенергії.'));
 }
 function nowMinutes(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return Number(p.hour)*60+Number(p.minute)}
 function renderCompare(){
  const root=$('smartCompare');if(!root)return;
  const places=addresses();
  if(!selectedIds.size)places.forEach((a,i)=>{if(i<Math.min(4,places.length))selectedIds.add(a.id)});
  for(const id of [...selectedIds])if(!places.some(a=>a.id===id))selectedIds.delete(id);
  const dates=core()?.getDates?.()||[today()];if(!selectedDate||!dates.includes(selectedDate))selectedDate=today();
  const key=JSON.stringify([places.map(a=>[a.id,a.queue,a.nickname,a.street]),selectedDate,[...selectedIds].sort(),data().lastChecked,data().history?.[0]?.id]);
  if(root.dataset.renderKey===key)return;root.dataset.renderKey=key;root.replaceChildren();
  const head=node('div','smart-tools-head');head.append(node('div','smart-tools-heading','Порівняти адреси'),node('p','smart-tools-subtitle','Оберіть місця та день, щоб побачити спільні години зі світлом'));root.append(head);
  if(places.length<2){root.append(node('p','smart-tools-empty','Додайте ще одну адресу, щоб порівняти графіки.'));return}
  const controls=node('div','smart-compare-controls'),dateSelect=node('select','smart-compare-date');
  dates.forEach(date=>{const option=node('option','',date===today()?'Сьогодні':new Intl.DateTimeFormat('uk-UA',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')));option.value=date;dateSelect.append(option)});
  dateSelect.value=selectedDate;dateSelect.addEventListener('change',()=>{selectedDate=dateSelect.value;renderCompare()});
  controls.append(node('label','smart-compare-date-label','День'),dateSelect);root.append(controls);
  const pickers=node('div','smart-compare-pickers');
  places.forEach(a=>{
   const label=node('label','smart-compare-place'),input=node('input');input.type='checkbox';input.checked=selectedIds.has(a.id);
   input.addEventListener('change',()=>{if(input.checked)selectedIds.add(a.id);else selectedIds.delete(a.id);renderCompare()});
   label.append(input,node('span','', (a.nickname||a.street||a.settlement)+' · '+(a.queue||'без підчерги')));pickers.append(label);
  });root.append(pickers);
  const chosen=places.filter(a=>selectedIds.has(a.id));
  if(chosen.length<2){root.append(node('p','smart-tools-empty','Оберіть щонайменше дві адреси.'));return}
  const rows=chosen.map(a=>({address:a,values:a.queue?core()?.getTimeline?.(selectedDate,a.queue):null}));
  const list=node('div','smart-compare-results');
  rows.forEach(({address,values})=>{
   const row=node('div','smart-compare-row');row.append(node('strong','smart-compare-name',address.nickname||address.street||address.settlement));
   if(!values)row.append(node('span','smart-compare-detail','Немає підтверджених даних'));
   else row.append(node('span','smart-compare-detail','Зі світлом: '+intervalText(intervals(values,0))));
   list.append(row);
  });root.append(list);
  if(rows.some(x=>!x.values)){root.append(node('p','smart-tools-empty','Спільні години не розраховані: для однієї або кількох адрес немає підтвердженого графіка.'));return}
  const common=[];let start=-1;
  for(let minute=0;minute<=1440;minute++){
   const yes=minute<1440&&rows.every(row=>row.values[minute]===0);
   if(yes&&start<0)start=minute;
   if(!yes&&start>=0){common.push({from:start,to:minute});start=-1}
  }
  const result=node('div','smart-compare-common');result.append(node('span','smart-plan-label','Одночасно зі світлом у всіх вибраних місцях'),node('strong','smart-plan-time',common.length?intervalText(common):'Спільного вікна не знайдено'));root.append(result);
 }
 function formatPlan(plan){
  if(!plan)return 'Немає попередньої підтвердженої редакції';
  const off=Array.isArray(plan.off)?plan.off:[];
  return off.length?off.map(x=>x[0]+'–'+x[1]).join(', '):'Планових відключень не зазначено';
 }
 function renderHistory(){
  const root=$('smartHistory');if(!root)return;
  const q=primary()?.queue,history=(data().history||[]).filter(item=>!q||(item.queues||[]).includes(q)).slice(0,12);
  const key=JSON.stringify([q,history[0]?.id,history.length,(data().changes||[]).at(-1)?.id]);
  if(root.dataset.renderKey===key)return;root.dataset.renderKey=key;root.replaceChildren();const head=node('div','smart-tools-head');head.append(node('div','smart-tools-heading','Історія змін графіка'),node('p','smart-tools-subtitle','Що саме змінилося в опублікованій редакції'));root.append(head);
  if(history.length){
   history.forEach(item=>{
    const card=node('article','smart-history-item'),title=node('strong','smart-history-title',item.date+' · '+(item.queues?.join(', ')||'графік оновлено'));
    const stamp=node('time','smart-history-time',item.detectedAt?new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).format(new Date(item.detectedAt)):'Час не вказано');card.append(title,stamp);
    const change=item.changes?.[q];
    if(change){card.append(node('p','smart-history-before','Було: '+formatPlan(change.before)),node('p','smart-history-after','Стало: '+formatPlan(change.after)))}
    else card.append(node('p','smart-history-note','Зміни зафіксовано, але попередні години для цієї редакції ще не зберігалися.'));
    if(item.source&&/^https:\/\/www\.cherkasyoblenergo\.com\//.test(item.source)){const link=node('a','smart-history-source','Офіційне джерело ↗');link.href=item.source;link.target='_blank';link.rel='noopener noreferrer';card.append(link)}
    root.append(card);
   });
   return;
  }
  const legacy=(data().changes||[]).filter(item=>!q||(item.queues||[]).includes(q)).slice(-8).reverse();
  if(legacy.length){legacy.forEach(item=>{const card=node('article','smart-history-item');card.append(node('strong','smart-history-title',item.date+' · '+(item.queues?.join(', ')||'оновлення')),node('p','smart-history-note','Оновлення графіка зафіксовано. Детального збереженого порівняння попередніх годин для цієї редакції немає.'));root.append(card)})}
  else root.append(node('p','smart-tools-empty','Поки немає збережених змін графіка для цієї підчерги.'));
 }
 function createTimeRow(parent,label,period,key){
  const row=node('div','smart-hours-row'),title=node('strong','smart-hours-label',label),toggle=node('input');toggle.type='checkbox';toggle.checked=!!period.enabled;toggle.addEventListener('change',()=>{const next=getAllowedHours();next[key].enabled=toggle.checked;saveHours(next);renderPushHours()});
  const toggleLabel=node('label','smart-hours-toggle');toggleLabel.append(toggle,node('span','', 'Обмежити'));
  const from=node('input','smart-hours-time'),to=node('input','smart-hours-time');from.type=to.type='time';from.value=period.from||'08:00';to.value=period.to||'20:00';
  const range=node('div','smart-hours-range');range.append(from,node('span','', 'до'),to);
  [from,to].forEach((input,index)=>input.addEventListener('change',()=>{const next=getAllowedHours();next[key][index?'to':'from']=input.value||'08:00';if(next[key].from===next[key].to){next[key][index?'from':'to']=index?'08:00':'20:00'}saveHours(next);renderPushHours()}));
  row.append(title,toggleLabel,range);parent.append(row);
 }
 function renderPushHours(){
  const root=$('smartPushHours');if(!root)return;
  const a=primary(),config=getAllowedHours(),key=String(a?.id||'none')+JSON.stringify(config);
  if(root.dataset.renderKey===key)return;root.dataset.renderKey=key;root.replaceChildren();
  const head=node('div','smart-tools-head');head.append(node('div','smart-tools-heading','Години отримання Push'),node('p','smart-tools-subtitle',a?'Для адреси: '+(a.nickname||a.street||a.settlement)+' · '+(a.queue||'підчерга не визначена'):'Спершу додайте адресу з підчергою'));root.append(head);
  if(!a?.id){root.append(node('p','smart-tools-empty','Збережіть адресу, щоб налаштувати години сповіщень окремо для неї.'));return}
  const masterLabel=node('label','smart-hours-master'),master=node('input');master.type='checkbox';master.checked=!!config.enabled;
  master.addEventListener('change',()=>{const next=getAllowedHours();next.enabled=master.checked;saveHours(next);renderPushHours()});
  masterLabel.append(master,node('span','', 'Отримувати Push лише у вибрані години'));root.append(masterLabel);
  const fields=node('div','smart-hours-fields');fields.hidden=!config.enabled;
  createTimeRow(fields,'Будні (Пн–Пт)',config.weekdays,'weekdays');
  createTimeRow(fields,'Вихідні (Сб–Нд)',config.weekends,'weekends');root.append(fields);
  root.append(node('p','smart-tools-footnote','Аварійні повідомлення оператора не обмежуються цими годинами. Якщо період для буднів або вихідних вимкнений, Push для цих днів надходитимуть цілодобово.'));
  root.append(node('p','smart-tools-footnote','Налаштування зберігаються окремо для кожної адреси на цьому пристрої та застосовуються до її підчерги після синхронізації Push.'));
  if(config.enabled&&!config.weekdays.enabled&&!config.weekends.enabled)root.append(node('p','smart-tools-warning','Усі дні залишаються без обмежень. Увімкніть обмеження для буднів або вихідних.'));
 }
 function refresh(){ensurePanels();renderPlanner();renderCompare();renderHistory();renderPushHours()}
 window.addEventListener('svitlo:smart-tools-refresh',refresh);
 window.addEventListener('svitlo:smart-tools-settings-refresh',()=>{ensurePanels();renderPushHours()});
 document.addEventListener('DOMContentLoaded',refresh,{once:true});
 if(document.readyState!=='loading')refresh();
})();
