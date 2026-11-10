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
 function animateItems(root,selector){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('feature-off-animations'))return;
  root.querySelectorAll(selector).forEach((element,index)=>{
   if(element.dataset.motionPlayed)return;element.dataset.motionPlayed='1';
   element.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,delay:Math.min(index*48,192),easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
  });
 }
 function ensurePanels(){
  if(!$('smartCompare')){
   const compare=makeCard('smartCompare','Порівняння графіків','Побачте спільні години зі світлом для двох адрес');
   compare.classList.add('smart-compare-card');
   const detail=$('detail'),anchor=detail?.querySelector('.info-card');
   if(anchor?.parentNode)insertAfter(anchor,compare);
  }
  if(!$('smartPushHoursDialog')){
   const dialog=node('dialog','sheet smart-push-dialog');dialog.id='smartPushHoursDialog';
   const handle=node('div','sheet-handle');
   const top=node('div','sheet-top'),copy=node('div');
   copy.append(node('h2','','Години Push'),node('p','','Виберіть, коли отримувати планові сповіщення'));
   const close=button('×','sheet-close');close.setAttribute('aria-label','Закрити');
   close.addEventListener('click',()=>window.SvitloSheetMotion?.dismiss(dialog)||dialog.close());
   top.append(copy,close);
   const inner=node('div','sheet-inner'),body=node('div','smart-push-body');body.id='smartPushHoursBody';
   inner.append(body);dialog.append(handle,top,inner);document.body.append(dialog);
   window.SvitloSheetMotion?.bind(dialog);
  }
  if(!$('smartPushHoursOpen')){
   const anchor=document.querySelector('#settings .settings-push-controls .push-master-card');
   if(anchor?.parentNode){
    const trigger=button('Налаштувати години Push','smart-push-trigger');trigger.id='smartPushHoursOpen';
    trigger.setAttribute('aria-label','Налаштувати години отримання Push');
    trigger.append(node('span','smart-push-trigger-arrow','›'));
    trigger.addEventListener('click',()=>{const dialog=$('smartPushHoursDialog');if(dialog&&!dialog.open)dialog.showModal()});
    insertAfter(anchor,trigger);
   }
  }
 }
 function nowMinutes(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return Number(p.hour)*60+Number(p.minute)}
 function renderCompare(){
  const root=$('smartCompare');if(!root)return;
  const places=addresses(),available=core()?.getDates?.();
  const dates=Array.isArray(available)&&available.length?available:[today()];
  if(!selectedDate||!dates.includes(selectedDate))selectedDate=dates.includes(today())?today():dates[0];
  const valid=places.map(a=>a.id);
  let first=valid.includes([...selectedIds][0])?[...selectedIds][0]:(places[0]?.id||'');
  let second=valid.find(id=>id!==first)||'';
  if(selectedIds.size>=2){const ids=[...selectedIds].filter(id=>valid.includes(id));if(ids.length>=2){first=ids[0];second=ids[1]}}
  const key=JSON.stringify([places.map(a=>[a.id,a.queue,a.nickname,a.street]),selectedDate,first,second,data().lastChecked]);
  if(root.dataset.renderKey===key)return;
  root.dataset.renderKey=key;root.replaceChildren();
  const intro=node('div','smart-compare-intro');
  intro.append(node('span','smart-compare-kicker','ДЛЯ ДВОХ АДРЕС'),node('h2','','Коли у вас одночасно є світло?'),node('p','','Порівняйте графіки двох місць на один день та знайдіть спільний час.'));
  root.append(intro);
  if(places.length<2){root.append(node('p','smart-tools-empty','Додайте ще одну адресу, щоб порівняти графіки.'));return}
  const controls=node('div','smart-compare-controls');
  const makePicker=(labelText,value,exclude)=>{
   const label=node('label','smart-compare-field');label.append(node('span','smart-compare-field-label',labelText));
   const select=node('select','smart-compare-select');select.setAttribute('aria-label',labelText);
   places.forEach(a=>{const option=node('option','',(a.nickname||a.street||a.settlement)+' · '+(a.queue||'черга невідома'));option.value=a.id;option.disabled=a.id===exclude;select.append(option)});
   select.value=value;return {label,select};
  };
  let firstPicker,secondPicker;
  firstPicker=makePicker('Перша адреса',first,second);
  secondPicker=makePicker('Друга адреса',second,first);
  const update=()=>{selectedIds=new Set([firstPicker.select.value,secondPicker.select.value]);root.dataset.renderKey='';renderCompare()};
  firstPicker.select.addEventListener('change',update);secondPicker.select.addEventListener('change',update);
  controls.append(firstPicker.label,secondPicker.label);root.append(controls);
  const dayHead=node('div','smart-compare-day-head');
  dayHead.append(node('strong','','День порівняння'),node('span','','Оберіть дату'));
  const dateStrip=node('div','smart-compare-date-strip');
  dates.slice(0,7).forEach(date=>{
   const label=date===today()?'Сьогодні':new Intl.DateTimeFormat('uk-UA',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
   const pill=button(label,'smart-compare-date-pill'+(date===selectedDate?' is-active':''));
   pill.setAttribute('aria-pressed',String(date===selectedDate));
   pill.addEventListener('click',()=>{selectedDate=date;root.dataset.renderKey='';renderCompare()});
   dateStrip.append(pill);
  });
  dayHead.append(dateStrip);root.append(dayHead);
  selectedIds=new Set([firstPicker.select.value,secondPicker.select.value]);
  const chosen=places.filter(a=>selectedIds.has(a.id));
  const rows=chosen.map(a=>({address:a,values:a.queue?core()?.getTimeline?.(selectedDate,a.queue):null}));
  if(rows.length!==2){root.append(node('p','smart-tools-empty','Оберіть дві різні адреси.'));return}
  const chart=node('div','smart-compare-chart');
  rows.forEach(({address,values},index)=>{
   const row=node('section','smart-compare-track-row');
   const meta=node('div','smart-compare-track-meta');
   const left=node('div','smart-compare-address-copy');
   left.append(node('strong','',address.nickname||address.street||address.settlement),node('span','',address.settlement+' · '+(address.queue||'підчерга не визначена')));
   meta.append(node('span','smart-compare-index',String(index+1).padStart(2,'0')),left);
   row.append(meta);
   const track=node('div','smart-compare-track');track.setAttribute('role','img');
   track.setAttribute('aria-label',(address.nickname||address.street)+' — погодинний графік');
   if(values){
    for(let slot=0;slot<48;slot++){
     const from=slot*30,a=values[from],b=values[Math.min(1439,from+29)];
     const state=a<0||b<0?'unknown':a===1||b===1?'off':'on';
     const cell=node('span','smart-compare-segment is-'+state);
     cell.title=clock(from)+'–'+clock(from+30)+': '+(state==='on'?'є світло':state==='off'?'відключення':'немає даних');
     track.append(cell);
    }
   }else track.append(node('span','smart-compare-track-empty','Немає підтвердженого графіка'));
   row.append(track);chart.append(row);
  });
  const axis=node('div','smart-compare-axis');
  ['00:00','06:00','12:00','18:00','24:00'].forEach(x=>axis.append(node('span','',x)));
  chart.append(axis);root.append(chart);
  const legend=node('div','smart-compare-legend');
  [['is-on','Є світло'],['is-off','Відключення'],['is-unknown','Немає даних']].forEach(([cls,label])=>{const item=node('span','');item.append(node('i',cls),node('span','',label));legend.append(item)});
  root.append(legend);
  if(rows.some(x=>!x.values)){root.append(node('p','smart-tools-warning','Спільні години не розраховані: для однієї з адрес немає підтвердженого графіка на цю дату.'));return}
  const common=[];let startMinute=-1;
  for(let minute=0;minute<=1440;minute++){
   const yes=minute<1440&&rows.every(row=>row.values[minute]===0);
   if(yes&&startMinute<0)startMinute=minute;
   if(!yes&&startMinute>=0){common.push({from:startMinute,to:minute});startMinute=-1}
  }
  const result=node('div','smart-compare-common');
  result.append(node('span','smart-compare-common-label','СПІЛЬНИЙ ЧАС ЗІ СВІТЛОМ'),node('strong','smart-compare-common-value',common.length?intervalText(common):'Спільних годин немає'));
  if(common.length)result.append(node('span','smart-compare-common-note',common.reduce((sum,x)=>sum+x.to-x.from,0)>=60?'Можна планувати справи на цей проміжок':'Короткі спільні проміжки протягом дня'));
  root.append(result);
  animateItems(root,'.smart-compare-track-row,.smart-compare-common,.smart-compare-legend');
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
   [1,2,3,4,5,6,0].forEach(day=>createDayRow(days,config.days[day],names[day]));fields.append(days);
  }
  root.append(fields);
  root.append(node('p','smart-tools-footnote','Для кожного дня можна задати до двох проміжків. Якщо вимкнути обмеження дня, планові Push надходитимуть цілодобово. Аварійні повідомлення оператора не обмежуються.'));
  root.append(node('p','smart-tools-footnote','Налаштування зберігаються окремо для кожної адреси на цьому пристрої та застосовуються до її підчерги після синхронізації Push.'));
  if(config.enabled&&!config.days.some(day=>day.enabled))root.append(node('p','smart-tools-warning','Зараз усі дні дозволені цілодобово. Увімкніть обмеження для тих днів, коли потрібні конкретні години.'));
  root.append(node('p','smart-push-sync-status',pushSyncMessage||'Зміни зберігаються автоматично.'));
  animateItems(root,'.smart-hours-master,.smart-hours-day,.smart-push-sync-status');
 }
 function refresh(){ensurePanels();renderCompare();renderPushHours()}
 window.addEventListener('svitlo:smart-tools-refresh',refresh);
 window.addEventListener('svitlo:smart-tools-settings-refresh',()=>{ensurePanels();renderPushHours()});
 document.addEventListener('DOMContentLoaded',refresh,{once:true});
 if(document.readyState!=='loading')refresh();
})();
