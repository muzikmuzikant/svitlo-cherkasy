/* Beta 7.9.14: day planner, per-address Push hours, schedule history and address comparison. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),STORE='svitlo-smart-tools-v7914';
 const defaultHours=()=>({enabled:false,days:Array.from({length:7},(_,day)=>({day,enabled:false,windows:[]}))});
 const readStore=()=>{try{const x=JSON.parse(localStorage.getItem(STORE)||'{}');return x&&typeof x==='object'?x:{}}catch{return {}}};
 let saved=readStore(),selectedDate='',selectedIds=new Set(),syncTimer=null,pushSyncMessage='';
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
 const normalizeHours=value=>{
  if(Array.isArray(value?.days)){
   const days=Array.from({length:7},(_,day)=>{
    const raw=value.days.find(x=>Number(x?.day)===day),windows=(Array.isArray(raw?.windows)?raw.windows:[]).slice(0,2)
     .filter(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x?.from||'')&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x?.to||'')&&x.from<x.to)
     .map(x=>({from:x.from,to:x.to})).sort((a,b)=>a.from.localeCompare(b.from));
    return {day,enabled:!!raw?.enabled&&windows.length>0,windows};
   });
   return {enabled:!!value.enabled,days};
  }
  if(value?.weekdays&&value?.weekends){
   return {enabled:!!value.enabled,days:Array.from({length:7},(_,day)=>{
    const period=day===0||day===6?value.weekends:value.weekdays;
    const valid=/^([01]\d|2[0-3]):[0-5]\d$/.test(period.from||'')&&/^([01]\d|2[0-3]):[0-5]\d$/.test(period.to||'')&&period.from!==period.to;
    return {day,enabled:!!period.enabled&&valid,windows:period.enabled&&valid?[{from:period.from,to:period.to}]:[]};
   })};
  }
  return defaultHours();
 };
 const getAllowedHours=()=>{const a=primary();return a?.id?normalizeHours(saved[a.id]):defaultHours()};
 const saveHours=hours=>{const a=primary();if(!a?.id)return;saved[a.id]=normalizeHours(hours);localStorage.setItem(STORE,JSON.stringify(saved));queuePushSync()};
 function queuePushSync(){
  clearTimeout(syncTimer);
  pushSyncMessage=core()?.isPushActive?.()?'Зміни збережено. Синхронізуємо з Push…':'Зміни збережено на цьому пристрої. Після ввімкнення Push вони синхронізуються автоматично.';
  syncTimer=setTimeout(()=>{if(core()?.isPushActive?.())window.dispatchEvent(new Event('svitlo:push-hours-changed'));renderPushHours()},500);
 }
 window.addEventListener('svitlo:push-hours-sync',event=>{
  pushSyncMessage=event.detail?.ok?'Години Push синхронізовано.':'Не вдалося синхронізувати години. Перевірте інтернет і спробуйте ще раз.';
  renderPushHours();
 });
 window.SvitloSmartTools={getAllowedHours};
 function insertAfter(reference,element){reference?.parentNode?.insertBefore(element,reference.nextSibling)}
 function makeCard(id,title,subtitle){
  const section=node('section','smart-tools-card surface');section.id=id;
  const head=node('div','smart-tools-head');head.append(node('div','smart-tools-heading',title),node('p','smart-tools-subtitle',subtitle));section.append(head);return section;
 }
 function openDialog(dialog){
  if(dialog.open)return;
  dialog.showModal();
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   dialog.animate([{opacity:0,transform:'translateY(12px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
 }
 function closeDialog(dialog){
  if(!dialog?.open||dialog.dataset.closing==='true')return;
  dialog.dataset.closing='true';
  const finish=()=>{if(dialog.open)dialog.close();delete dialog.dataset.closing};
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return}
  const animation=dialog.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(9px) scale(.99)'}],{duration:180,easing:'cubic-bezier(.4,0,.7,.3)'});
  animation.finished.then(finish,finish);
 }
 function ensurePanels(){
  if(!$('smartCompare')){
   const compare=makeCard('smartCompare','Порівняти адреси','Знайдіть години, коли у вибраних місцях одночасно є світло');
   const notice=document.querySelector('#home .notice-strip'),places=$('placeList');
   if(notice?.parentNode)notice.parentNode.insertBefore(compare,notice);
   else if(places?.parentNode)insertAfter(places.parentNode,compare);
  }
  if(!$('smartHistory')){
   const history=node('details','smart-history-panel surface');history.id='smartHistory';
   const summary=node('summary','smart-history-summary');
   summary.append(node('strong','','Історія графіка'),node('span','smart-history-chevron','⌄'));
   const body=node('div','smart-history-body');body.id='smartHistoryBody';
   history.append(summary,body);
   const anchor=document.querySelector('#detail .schedule-meta');
   if(anchor?.parentNode)insertAfter(anchor,history);
  }
  if(!$('smartPushHoursDialog')){
   const dialog=node('dialog','smart-push-dialog');dialog.id='smartPushHoursDialog';
   const panel=node('div','smart-push-dialog-panel'),top=node('div','smart-push-dialog-top');
   top.append(node('strong','smart-push-dialog-title','Персональні години Push'));
   const close=button('Закрити','smart-push-dialog-close');close.addEventListener('click',()=>closeDialog(dialog));top.append(close);
   const body=node('div','smart-push-body');body.id='smartPushHoursBody';panel.append(top,body);dialog.append(panel);
   dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog(dialog)});dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog)});document.body.append(dialog);
   const title=document.querySelector('#settings .settings-push-controls .subsection-title');
   if(title&&!$('smartPushHoursOpen')){const trigger=button('Години Push','smart-push-trigger');trigger.id='smartPushHoursOpen';trigger.setAttribute('aria-label','Налаштувати години отримання Push');trigger.addEventListener('click',()=>openDialog(dialog));title.append(trigger)}
  }
 }
 function nowMinutes(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return Number(p.hour)*60+Number(p.minute)}
 function renderCompare(){
  const root=$('smartCompare');if(!root)return;
  const places=addresses();
  const availableDates=core()?.getDates?.();
  const dates=Array.isArray(availableDates)&&availableDates.length?availableDates:[today()];
  if(!selectedDate||!dates.includes(selectedDate))selectedDate=dates.includes(today())?today():dates[0];
  const validIds=places.map(a=>a.id);
  let firstId=validIds.includes([...selectedIds][0])?[...selectedIds][0]:(places[0]?.id||'');
  let secondId=validIds.find(id=>id!==firstId)||'';
  if(selectedIds.size>=2){const ids=[...selectedIds].filter(id=>validIds.includes(id));if(ids.length>=2){firstId=ids[0];secondId=ids[1]}}
  const key=JSON.stringify([places.map(a=>[a.id,a.queue,a.nickname,a.street]),selectedDate,firstId,secondId,data().lastChecked,data().history?.[0]?.id]);
  if(root.dataset.renderKey===key)return;root.dataset.renderKey=key;root.replaceChildren();
  const head=node('div','smart-tools-head');
  head.append(node('div','smart-tools-heading','Порівняння адрес'),node('p','smart-tools-subtitle','Виберіть два місця, щоб побачити, коли в обох одночасно є світло'));
  root.append(head);
  if(places.length<2){root.append(node('p','smart-tools-empty','Щоб порівняти графіки, додайте ще одну адресу.'));return}
  const controls=node('div','smart-compare-controls'),dateLabel=node('label','smart-compare-date-label','День'),dateSelect=node('select','smart-compare-date');
  dateSelect.setAttribute('aria-label','День для порівняння');
  dates.forEach(date=>{const option=node('option','',date===today()?'Сьогодні':new Intl.DateTimeFormat('uk-UA',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')));option.value=date;dateSelect.append(option)});
  dateSelect.value=selectedDate;dateSelect.addEventListener('change',()=>{selectedDate=dateSelect.value;root.dataset.renderKey='';renderCompare()});
  controls.append(dateLabel,dateSelect);root.append(controls);
  const pickers=node('div','smart-compare-pickers');
  const makePicker=(labelText,value,exclude)=>{
   const label=node('label','smart-compare-field');label.append(node('span','smart-compare-field-label',labelText));
   const select=node('select','smart-compare-date');select.setAttribute('aria-label',labelText);
   places.forEach(a=>{const option=node('option','',(a.nickname||a.street||a.settlement)+' · '+(a.queue||'підчерга не визначена'));option.value=a.id;option.disabled=a.id===exclude;select.append(option)});
   select.value=value;select.addEventListener('change',()=>{const first=select===firstPicker.select?select.value:firstPicker.select.value;const second=select===secondPicker.select?select.value:secondPicker.select.value;selectedIds=new Set([first,second]);root.dataset.renderKey='';renderCompare()});
   return {label,select};
  };
  let firstPicker,secondPicker;
  firstPicker=makePicker('Перша адреса',firstId,secondId);
  secondPicker=makePicker('Друга адреса',secondId,firstId);
  pickers.append(firstPicker.label,secondPicker.label);root.append(pickers);
  selectedIds=new Set([firstId,secondId]);
  const chosen=places.filter(a=>selectedIds.has(a.id));
  if(chosen.length!==2){root.append(node('p','smart-tools-empty','Оберіть дві різні адреси.'));return}
  const rows=chosen.map(a=>({address:a,values:a.queue?core()?.getTimeline?.(selectedDate,a.queue):null}));
  const list=node('div','smart-compare-results');
  rows.forEach(({address,values})=>{
   const row=node('div','smart-compare-row');
   row.append(node('strong','smart-compare-name',address.nickname||address.street||address.settlement));
   row.append(node('span','smart-compare-detail','Підчерга '+(address.queue||'не визначена')));
   if(!values)row.append(node('span','smart-compare-detail','Для цієї підчерги немає підтвердженого графіка на вибраний день.'));
   else row.append(node('span','smart-compare-detail','Світло: '+intervalText(intervals(values,0))));
   list.append(row);
  });
  root.append(list);
  if(rows.some(x=>!x.values)){root.append(node('p','smart-tools-empty','Спільні години не розраховані, бо для однієї з адрес немає підтвердженого графіка.'));return}
  const common=[];let startMinute=-1;
  for(let minute=0;minute<=1440;minute++){
   const yes=minute<1440&&rows.every(row=>row.values[minute]===0);
   if(yes&&startMinute<0)startMinute=minute;
   if(!yes&&startMinute>=0){common.push({from:startMinute,to:minute});startMinute=-1}
  }
  const result=node('div','smart-compare-common');
  result.append(node('span','smart-plan-label','Одночасно зі світлом'),node('strong','smart-plan-time',common.length?intervalText(common):'Спільного часу зі світлом немає'));
  root.append(result);
 }
 function formatPlan(plan){
  if(!plan)return 'Немає попередньої підтвердженої редакції';
  const off=Array.isArray(plan.off)?plan.off:[];
  return off.length?off.map(x=>x[0]+'–'+x[1]).join(', '):'Планових відключень не зазначено';
 }
 function renderHistory(){
  const root=$('smartHistoryBody');if(!root)return;
  const q=primary()?.queue,history=(data().history||[]).filter(item=>!q||(item.queues||[]).includes(q)).slice(0,12);
  const lastChange=(data().changes||[]).at(-1);const key=JSON.stringify([q,history[0]?.id,history.length,lastChange?.date,lastChange?.queues]);
  if(root.dataset.renderKey===key)return;root.dataset.renderKey=key;root.replaceChildren();const head=node('div','smart-tools-head');head.append(node('p','smart-tools-subtitle','Зміни опублікованих графіків для вашої підчерги'));root.append(head);
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
 function createDayRow(parent,dayConfig,dayName){
  const row=node('section','smart-hours-day'),head=node('div','smart-hours-day-head');
  const title=node('strong','smart-hours-label',dayName),toggle=node('input');toggle.type='checkbox';toggle.checked=!!dayConfig.enabled;
  const toggleLabel=node('label','smart-hours-toggle');toggleLabel.append(toggle,node('span','', 'За годинами'));
  const status=node('span','smart-hours-day-status',dayConfig.enabled?'За розкладом':'Увесь день');
  head.append(title,toggleLabel,status);row.append(head);
  const body=node('div','smart-hours-day-body');
  toggle.addEventListener('change',()=>{
   const next=getAllowedHours(),target=next.days[dayConfig.day];target.enabled=toggle.checked;
   if(target.enabled&&!target.windows.length)target.windows=[{from:'08:00',to:'18:00'}];
   saveHours(next);renderPushHours();
  });
  if(!dayConfig.enabled)body.append(node('p','smart-hours-all-day','Push надходитимуть цілодобово'));
  else {
   dayConfig.windows.forEach((period,index)=>{
    const range=node('div','smart-hours-range'),from=node('input','smart-hours-time'),to=node('input','smart-hours-time');
    from.type=to.type='time';from.value=period.from;to.value=period.to;
    const update=(field,value,input)=>{
     const next=getAllowedHours(),target=next.days[dayConfig.day],candidate={...target.windows[index],[field]:value};
     if(!value||candidate.from>=candidate.to){input.setCustomValidity('Час початку має бути раніше за завершення.');input.reportValidity();input.setCustomValidity('');return}
     const windows=target.windows.map((x,i)=>i===index?candidate:x).sort((a,b)=>a.from.localeCompare(b.from));
     if(windows.some((x,i)=>i>0&&windows[i-1].to>x.from)){input.setCustomValidity('Проміжки не мають перетинатися.');input.reportValidity();input.setCustomValidity('');return}
     target.windows=windows;saveHours(next);renderPushHours();
    };
    from.addEventListener('change',()=>update('from',from.value,from));
    to.addEventListener('change',()=>update('to',to.value,to));
    range.append(from,node('span','', 'до'),to);
    if(dayConfig.windows.length>1){
     const remove=node('button','smart-hours-remove','Прибрати');remove.type='button';remove.setAttribute('aria-label','Прибрати цей проміжок');
     remove.addEventListener('click',()=>{const next=getAllowedHours();next.days[dayConfig.day].windows.splice(index,1);saveHours(next);renderPushHours()});
     range.append(remove);
    }
    body.append(range);
   });
   if(dayConfig.windows.length<2){
    const add=node('button','smart-hours-add','Додати ще один проміжок');add.type='button';
    const candidates=[{from:'08:00',to:'12:00'},{from:'14:00',to:'18:00'},{from:'19:00',to:'22:00'},{from:'00:00',to:'06:00'}];
    const available=candidates.find(extra=>!dayConfig.windows.some(x=>x.from<extra.to&&extra.from<x.to));
    if(!available){add.disabled=true;add.textContent='Немає вільного проміжку'}
    add.addEventListener('click',()=>{
     if(!available)return;
     const next=getAllowedHours(),target=next.days[dayConfig.day];target.windows.push(available);target.windows.sort((a,b)=>a.from.localeCompare(b.from));saveHours(next);renderPushHours();
    });
    body.append(add);
   }
  }
  row.append(body);parent.append(row);
 }
 function renderPushHours(){
  const root=$('smartPushHoursBody');if(!root)return;
  const a=primary(),config=getAllowedHours(),key=String(a?.id||'none')+JSON.stringify(config);
  if(root.dataset.renderKey===key)return;root.dataset.renderKey=key;root.replaceChildren();
  const head=node('div','smart-tools-head');head.append(node('p','smart-tools-subtitle',a?'Основна адреса: '+(a.nickname||a.street||a.settlement)+' · '+(a.queue||'підчерга не визначена'):'Спершу додайте адресу з підчергою'));root.append(head);
  if(!a?.id){root.append(node('p','smart-tools-empty','Збережіть адресу, щоб налаштувати години сповіщень окремо для неї.'));return}
  const masterLabel=node('label','smart-hours-master'),master=node('input');master.type='checkbox';master.checked=!!config.enabled;
  master.addEventListener('change',()=>{const next=getAllowedHours();next.enabled=master.checked;saveHours(next);renderPushHours()});
  masterLabel.append(master,node('span','', 'Обмежити Push вибраними годинами'));root.append(masterLabel);
  const fields=node('div','smart-hours-fields');fields.hidden=!config.enabled;
  if(config.enabled){
   const days=node('div','smart-hours-days'),names=['Неділя','Понеділок','Вівторок','Середа','Четвер','П’ятниця','Субота'];
   config.days.forEach(day=>createDayRow(days,day,names[day.day]));fields.append(days);
  }
  root.append(fields);
  root.append(node('p','smart-tools-footnote','Для кожного дня можна задати до двох проміжків. Якщо вимкнути обмеження дня, планові Push надходитимуть цілодобово. Аварійні повідомлення оператора не обмежуються.'));
  root.append(node('p','smart-tools-footnote','Налаштування зберігаються окремо для кожної адреси на цьому пристрої та застосовуються до її підчерги після синхронізації Push.'));
  if(config.enabled&&!config.days.some(day=>day.enabled))root.append(node('p','smart-tools-warning','Зараз усі дні дозволені цілодобово. Увімкніть обмеження для тих днів, коли потрібні конкретні години.'));
  root.append(node('p','smart-push-sync-status',pushSyncMessage||'Зміни зберігаються автоматично.'));
 }
 function refresh(){ensurePanels();renderCompare();renderHistory();renderPushHours()}
 window.addEventListener('svitlo:smart-tools-refresh',refresh);
 window.addEventListener('svitlo:smart-tools-settings-refresh',()=>{ensurePanels();renderPushHours()});
 document.addEventListener('DOMContentLoaded',refresh,{once:true});
 if(document.readyState!=='loading')refresh();
})();
