/* Clear read-only timetable when the main app is blocked by maintenance. */
(()=>{'use strict';
 const root=document.getElementById('maintenanceScreen'),panel=document.getElementById('maintenanceBackup');
 if(!root||!panel)return;
 const $=id=>document.getElementById(id);
 const notice=$('maintenanceNoticePanel'),tabNotice=$('maintenanceViewNotice'),tabSchedule=$('maintenanceViewSchedule');
 const select=$('maintenanceBackupPlace'),days=$('maintenanceBackupDays'),hours=$('maintenanceBackupHours');
 const status=$('maintenanceBackupStatus'),state=$('maintenanceBackupState'),hint=$('maintenanceBackupStateHint');
 const caption=$('maintenanceBackupStateLabel'),intervals=$('maintenanceBackupIntervals'),meta=$('maintenanceBackupMeta');
 const refreshButton=$('maintenanceBackupRefresh'),official=$('maintenanceBackupOfficial');
 const WEEK=['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
 const QUEUES=Array.from({length:6},(_,i)=>[String(i+1)+'.1',String(i+1)+'.2']).flat();
 let active=false,view='notice',api='',snapshot=null,request=null,checkedAt=0,selectedDay='',selectedPlace='';
 const parts=()=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const today=()=>{const p=parts();return p.year+'-'+p.month+'-'+p.day};
 const addDay=(iso,shift)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+shift);return d.toISOString().slice(0,10)};
 const weekday=iso=>new Date(iso+'T12:00:00Z').getUTCDay();
 const thisWeek=()=>{const t=today(),start=addDay(t,-((weekday(t)+6)%7));return Array.from({length:7},(_,i)=>addDay(start,i))};
 const at=m=>m===1440?'24:00':String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const minute=x=>x==='24:00'?1440:typeof x==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x)?Number(x.slice(0,2))*60+Number(x.slice(3)):-1;
 const el=(tag,className,content)=>{const n=document.createElement(tag);if(className)n.className=className;if(content!==undefined)n.textContent=content;return n};
 const saved=()=>{try{const list=JSON.parse(localStorage.getItem('svitlo-addresses-v6')||'[]');return Array.isArray(list)?list.filter(a=>a&&QUEUES.includes(a.queue)).slice(0,40):[]}catch{return []}};
 const cached=()=>{try{const s=JSON.parse(localStorage.getItem('svitlo-offline-schedule-v74')||'null');return Array.isArray(s?.days)?s:null}catch{return null}};
 function populatePlaces(){
  const list=saved(),previous=selectedPlace||select.value;
  select.replaceChildren(new Option('Оберіть свою адресу або підчергу',''));
  if(list.length){
   const g=document.createElement('optgroup');g.label='Збережені адреси';
   list.forEach((a,i)=>g.append(new Option((a.nickname?.trim()||[a.street,a.house].filter(Boolean).join(', ')||a.settlement||'Адреса')+' · '+a.queue,'saved:'+i)));
   select.append(g);
  }
  const group=document.createElement('optgroup');group.label='Перегляд за підчергою без адреси';
  QUEUES.forEach(q=>group.append(new Option('Підчерга '+q,'queue:'+q)));select.append(group);
  const pref=(()=>{try{return JSON.parse(localStorage.getItem('svitlo-prefs-v6')||'{}')}catch{return {}}})();
  const primary=list.findIndex(a=>a.id===pref.primaryId);
  const choices=[...select.options].map(o=>o.value);
  const next=choices.includes(previous)?previous:primary>=0?'saved:'+primary:list.length?'saved:0':'';
  select.value=next;selectedPlace=next;
 }
 function show(which){
  if(!active)return;
  view=which==='schedule'?'schedule':'notice';
  const backup=view==='schedule';notice.hidden=backup;panel.hidden=!backup;
  tabNotice.classList.toggle('selected',!backup);tabNotice.setAttribute('aria-pressed',String(!backup));
  tabSchedule.classList.toggle('selected',backup);tabSchedule.setAttribute('aria-pressed',String(backup));
  root.scrollTop=0;
  if(backup){render();void update(false)}
 }
 function renderDays(){
  days.replaceChildren();
  for(const d of thisWeek()){
   const btn=el('button','maintenance-backup-day'+(d===selectedDay?' selected':''));btn.type='button';
   btn.append(el('span','',WEEK[weekday(d)]),el('b','',String(Number(d.slice(-2)))));
   btn.setAttribute('aria-pressed',String(d===selectedDay));btn.setAttribute('aria-label',(d===today()?'Сьогодні, ':'')+d);
   btn.onclick=()=>{selectedDay=d;render()};days.append(btn);
  }
 }
 function getInfo(when){
  const s=snapshot||cached(),day=s?.days?.find(x=>x.date===when&&x.verified===true);
  const list=saved(),key=select.value;
  const q=key.startsWith('queue:')?key.slice(6):key.startsWith('saved:')?list[Number(key.slice(6))]?.queue:null;
  const item=q?day?.queues?.[q]:null;
  const stamp=Date.parse(s?.lastChecked||''),fresh=Number.isFinite(stamp)&&stamp<=Date.now()+300000&&Date.now()-stamp<=55*60000;
  const confirmed=Array.isArray(s?.confirmedNoScheduleDates)&&s.confirmedNoScheduleDates.includes(when)&&fresh;
  const off=[];
  if(Array.isArray(item?.off))for(const v of item.off){
   const a=minute(v[0]),b=minute(v[1]);if(a>=0&&b>a&&b<=1440)off.push([a,b]);
  }
  const known=minute(item?.knownFrom||'00:00');
  const complete=(!!day&&Array.isArray(item?.off))||(!day&&confirmed);
  const src=typeof day?.queueSources?.[q]==='string'?day.queueSources[q]:day?.source;
  return {q,day,item,s,fresh,confirmed,complete,knownStart:day&&item?known:0,off,source:src};
 }
 function slot(record,begin,end){
  if(!record.complete||record.knownStart<0||begin<record.knownStart)return 'unknown';
  if(record.off.some(([a,b])=>begin<b&&end>a))return 'off';
  return 'on';
 }
 function render(){
  if(!active||view!=='schedule')return;
  populatePlaces();renderDays();
  const date=selectedDay||today(),p=parts(),current=Number(p.hour)*60+Number(p.minute);
  const record=getInfo(date),chosen=!!record.q,nowDay=date===today();
  const currentState=chosen?slot(record,current,current+1):'unknown';
  let title='',detail='',mood='unknown';
  if(!chosen){title='Оберіть адресу або підчергу';detail='Перегляд доступний навіть без збереженої адреси.'}
  else if(!record.complete){title='Немає підтвердженого графіка';detail='Для цього дня або підчерги інформацію поки не опубліковано.'}
  else if(nowDay){
   mood=currentState;
   let next=-1;
   for(let m=current+1;m<1440;m++){const val=slot(record,m,m+1);if(val!==currentState&&val!=='unknown'&&currentState!=='unknown'){next=m;break}}
   title=currentState==='off'?'За графіком немає світла':currentState==='on'?'За графіком світло є':'Час не підтверджений';
   detail=next>=0?(currentState==='off'?'Планове відновлення о ':'Наступне відключення о ')+at(next):currentState==='unknown'?'Уточніть дані в оператора.':'Інших змін на сьогодні не опубліковано.';
  }else{
   title='Графік на '+date;
   detail=record.off.length?'Планових періодів відключень: '+record.off.length+'.':'Планових відключень немає.';
  }
  caption.textContent=(nowDay?'СЬОГОДНІ':'ДАТА: '+date)+' · ЗА ГРАФІКОМ';
  status.dataset.state=mood;state.textContent=title;hint.textContent=detail;
  hours.replaceChildren();intervals.replaceChildren();
  if(chosen&&record.complete){
   for(let h=0;h<24;h++){
    const block=el('div','maintenance-backup-hour'+(nowDay&&Math.floor(current/60)===h?' current':''));
    block.append(el('strong','',at(h*60)));
    const row=el('div','maintenance-backup-halves');
    for(let i=0;i<2;i++){
     const begin=h*60+i*30,kind=slot(record,begin,begin+30);
     const part=el('span','maintenance-backup-half '+kind);
     part.setAttribute('aria-label',at(begin)+'–'+at(begin+30)+': '+(kind==='off'?'планове відключення':kind==='on'?'за графіком світло є':'без даних'));
     part.title=part.getAttribute('aria-label');row.append(part);
    }
    block.append(row);hours.append(block);
   }
   if(record.off.length)for(const [a,b] of record.off){
    const item=el('div','maintenance-backup-interval');item.append(el('span','',at(a)+' – '+at(b)),el('span','','Планове відключення'));intervals.append(item);
   }else intervals.append(el('p','maintenance-backup-empty','Планових відключень на вибраний день немає.'));
  }else{
   hours.append(el('p','maintenance-backup-empty',chosen?'Підтвердженого графіка на цей день немає.':'Спочатку виберіть місце зі списку.'));
   intervals.append(el('p','maintenance-backup-empty','Підтверджених інтервалів немає.'));
  }
  const checked=Date.parse(record.s?.lastChecked||'');
  const time=Number.isFinite(checked)?new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(checked)):'невідомо';
  meta.textContent='Остання перевірка: '+time+'. '+(!record.fresh?'Дані можуть бути застарілими. ':'')+'Показано план, а не фактичний стан мережі.';
  const valid=typeof record.source==='string'&&/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(record.source);
  official.href=valid?record.source:'https://www.cherkasyoblenergo.com/off';
 }
 async function update(force){
  if(!active||view!=='schedule'||request)return;
  if(!force&&checkedAt&&Date.now()-checkedAt<60000)return;
  if(!api){
   try{const cfg=await fetch('./push-config.json',{cache:'no-store'}).then(r=>r.json());api=new URL(cfg.apiBase).origin}
   catch{render();return}
  }
  checkedAt=Date.now();refreshButton.disabled=true;refreshButton.textContent='Оновлюємо…';
  request=fetch(api+'/api/data/schedules.json',{cache:'no-store',signal:AbortSignal.timeout(7000)})
   .then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})
   .then(value=>{if(Array.isArray(value?.days)){snapshot=value;render()}})
   .catch(e=>{console.warn('Backup schedule:',e.message);render()})
   .finally(()=>{request=null;refreshButton.disabled=false;refreshButton.textContent='Оновити'});
  await request;
 }
 tabNotice.addEventListener('click',()=>show('notice'));tabSchedule.addEventListener('click',()=>show('schedule'));
 select.addEventListener('change',()=>{selectedPlace=select.value;render()});
 refreshButton.addEventListener('click',()=>{checkedAt=0;void update(true)});
 window.SvitloMaintenanceBackup={
  configure(base){if(typeof base==='string'&&base.startsWith('https://'))api=base.replace(/\/+$/,'')},
  setActive(value){active=value===true;if(active){selectedDay=today();selectedPlace='';populatePlaces();show('notice')}
    else{view='notice';panel.hidden=true;notice.hidden=false}}
 };
})();
