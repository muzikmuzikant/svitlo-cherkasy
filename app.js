'use strict';
/* Svitlo Cherkasy v6. All displayed power states are published predictions, never sensor readings. */
const $=id=>document.getElementById(id);
const TZ='Europe/Kyiv';
const QUEUES=Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat();
const OFFICIAL='https://www.cherkasyoblenergo.com/off';
const STORE='svitlo-addresses-v6', PREF='svitlo-prefs-v6', SEEN='svitlo-notifications-v6', PUSH_CONSENT='svitlo-push-consent-v6';
const ICON='<svg class="bolt" viewBox="0 0 20 24" aria-hidden="true"><path fill="currentColor" d="M11.8 1 2 13h7l-1.5 10L18 9.9h-7z"/></svg>';
const PIN='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2.4"/></svg>';
const safeJSON=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k)??'null')??fallback}catch{return fallback}};
const legacy=safeJSON('svitlo-addresses-v3',safeJSON('svitlo-addresses-v2',[]));
let addresses=safeJSON(STORE,Array.isArray(legacy)?legacy:[]), prefs=Object.assign({primaryId:null,off:true,on:true,changes:true,tomorrow:true,emergency:true},safeJSON(PREF,{}));
let pushActive=false, emergency={events:[],lastChecked:null},overrides={schedules:{days:[]},addresses:{},emergency:{events:[]}},data={days:[],changes:[]},index={keys:{},streets:{},localities:{}},active='home',daySelected=null,editId=null,suggestion=null,toastTimeout=null,lastPub=null,pushConfig=null,swRegistration=null,notified=new Set(safeJSON(SEEN,[])),lastRefresh=0,hasCheckedOnce=false,lastDownloadAt=null,lastSyncFailed=false,refreshInFlight=null;
if(!Array.isArray(addresses))addresses=[];
const byId=id=>addresses.find(x=>x.id===id);
const primary=()=>byId(prefs.primaryId)||addresses[0]||null;
const saveAddresses=()=>localStorage.setItem(STORE,JSON.stringify(addresses));
const savePrefs=()=>localStorage.setItem(PREF,JSON.stringify(prefs));
const id=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
function norm(s){return String(s||'').toLocaleLowerCase('uk-UA').replace(/[’ʼ`]/g,"'").replace(/^(вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|пр-т\.?|б-р\.?|бульвар|узвіз)\s+/i,'').replace(/[^\p{L}\p{N}/]+/gu,'')}
function normTown(s){
  const key=norm(String(s||'').replace(/^(с\.|смт\.?|село|місто|м\.|селище)\s*/i,''));
  return ({'червонаслобода':'слобода','первомайське':'соснове','іванівка':'яничі'})[key]||key;
}
function houseKey(s){return norm(s).replace(/-/g,'')}
for(const a of addresses){if(normTown(a.settlement)==='слобода')a.settlement='Слобода';else if(normTown(a.settlement)==='соснове')a.settlement='Соснове';else if(normTown(a.settlement)==='яничі')a.settlement='Яничі';}
saveAddresses();
const dateParts=(d=new Date(),tz=TZ)=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(p=>[p.type,p.value]));
const today=()=>{const p=dateParts();return `${p.year}-${p.month}-${p.day}`};
const nowMinutes=()=>{const x=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return +x.hour*60 + +x.minute};
function shiftDay(d,num){const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+num);return x.toISOString().slice(0,10)}
const formatDate=(v,options={day:'numeric',month:'long'})=>new Intl.DateTimeFormat('uk-UA',Object.assign({timeZone:'UTC'},options)).format(new Date(v+'T12:00:00Z'));
function fmtStamp(v){if(!v)return 'невідомо';const d=new Date(v);return isNaN(d)?'невідомо':new Intl.DateTimeFormat('uk-UA',{timeZone:TZ,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)}
const currentDay=date=>data.days.find(x=>x.date===date&&x.verified===true);
const minute=s=>s==='24:00'?1440:/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?Number(s.slice(0,2))*60+Number(s.slice(3)):-1;
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
function timeline(date,queue){const day=currentDay(date);const q=day?.queues?.[queue]||(day?.verified===true&&day?.complete===true?{knownFrom:'00:00',off:[]}:null);if(!q)return null;const start=minute(q.knownFrom||'00:00');if(start<0)return null;const a=new Int8Array(1440);a.fill(-1);a.fill(0,start,1440);let last=0;for(const [s,e] of q.off||[]){const f=minute(s),t=minute(e);if(f<last||f>=t||t>1440)return null;a.fill(1,Math.max(f,start),t);last=t}return a}
function stateAt(a,m){return a?.[m]===1?'off':a?.[m]===0?'on':'unknown'}
function transition(a,m){if(!a||a[m]<0)return null;for(let i=m+1;i<1440;i++)if(a[i]!==a[m])return {time:i,to:a[i]};return null}
function stats(a){if(!a)return null;let on=0,off=0,unknown=0,longest=0,run=0;for(const v of a){if(v===0)on++;if(v===1){off++;run++;longest=Math.max(longest,run)}else run=0;if(v<0)unknown++}return {on,off,unknown,longest}}
function minutesLabel(n){return (n/60).toLocaleString('uk-UA',{maximumFractionDigits:1})}
function flash(s){const el=$('toast');el.textContent=s;el.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.hidden=true,3400)}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function label(a){return a?.nickname?.trim()||[a?.street,a?.house].filter(Boolean).join(', ')||'Додайте адресу'}
function fullAddress(a){return a?[a.settlement||'Черкаси',[a.street,a.house].filter(Boolean).join(', ')].join(' · '):'Оберіть адресу'}
function setText(id,text){if($(id).textContent!==String(text))$(id).textContent=String(text)}
function render(){renderHome();if(active==='detail')renderDetail();if(active==='updates')renderUpdates();if(active==='settings')renderSettings()}
function scheduleQueueChanged(before, after, queue) {
 // Ignore rollovers and re-publications which do not change actual queue intervals.
 if (!queue || !before?.days?.length || !after?.days?.length) return false;
 const earlier = new Map(before.days.filter(d => d.verified === true).map(d => [d.date,d.queues?.[queue]]));
 return after.days.some(day => earlier.has(day.date) &&
   JSON.stringify(earlier.get(day.date) ?? null) !== JSON.stringify(day.queues?.[queue] ?? null));
}
function renderSyncStatus(){
 const box=$('syncStatus');if(!box)return;
 const checked=Date.parse(data.lastChecked||'');
 const checkKnown=Number.isFinite(checked)&&checked<=Date.now()+5*60_000;
 const sourceStale=!checkKnown||(Date.now()-checked>2*3600_000);
 const offline=navigator.onLine===false;
 box.dataset.state=!hasCheckedOnce?'pending':offline||lastSyncFailed?'error':sourceStale?'stale':'fresh';
 const title=!hasCheckedOnce?'Завантажуємо графіки…':offline?'Немає інтернету':lastSyncFailed?'Не вдалося отримати графіки':sourceStale?'Перевірка оператора затримується':'Автооновлення графіків активне';
 const details=!hasCheckedOnce?'При відкритті й кожні 5 хвилин, поки застосунок відкритий':
   `Джерело: ${checkKnown?fmtStamp(data.lastChecked):'час невідомий'} · На телефоні: ${lastDownloadAt?fmtStamp(lastDownloadAt):'немає нових даних'}`;
 setText('syncStatusTitle',title);setText('syncStatusDetails',details);
}
function renderFreshness(){
 renderSyncStatus();const node=$('dataFreshness');if(!node)return;
 // The timestamp describes the source-import check, NOT the publication time and
 // not a live power meter. A manual refresh only re-downloads published data.
 const checked=Date.parse(data.lastChecked||'');
 const age=Date.now()-checked;
 const hasTime=Number.isFinite(checked)&&age>=0;
 const stale=!hasTime||age>2*3600_000;
 const offline=navigator.onLine===false;
 // Avoid alarming users while the initial network request is still in flight.
 node.hidden=!hasCheckedOnce||(!stale&&!offline);
 if(node.hidden)return;
 node.replaceChildren();
 const title=el('strong','',offline?'Немає інтернету':hasTime?'Можливо, графік застарів':'Актуальність графіка не підтверджена');
 const message=el('span','',offline
   ?' Показуємо останні доступні дані. Вони могли змінитися.'
   :hasTime
     ?` Публікації оператора востаннє перевіряли ${fmtStamp(data.lastChecked)}. Новіші зміни можуть бути відсутні.`
     :' Не вдалося визначити час останньої перевірки публікацій.');
 const link=el('a','', 'Перевірити в оператора ↗');
 link.href=OFFICIAL;link.target='_blank';link.rel='noopener noreferrer';
 node.append(title,message,link);
}
function renderHome(){renderEmergency();renderFreshness();const a=primary();setText('primaryName',label(a));setText('primarySub',a?`${a.settlement||'Черкаси'} · ${a.queue?'підчерга '+a.queue:'підчергу не визначено'}`:'Черкаси або села району');const schedule=a?.queue?currentDay(today()):null;const timelineToday=a?.queue?timeline(today(),a.queue):null,st=stateAt(timelineToday,nowMinutes()),nxt=transition(timelineToday,nowMinutes());const panel=$('heroStatus');panel.className='status-panel status-'+st;
 $('stateIcon').innerHTML=ICON;setText('stateCaption',a?.method==='street-auto'?'ПІДЧЕРГА ЗА ПЕРЕЛІКОМ ВУЛИЦЬ':a?'ЗА ОПУБЛІКОВАНИМ ГРАФІКОМ':'ВАШ ГРАФІК');
 if(st==='unknown'){setText('heroTitle','Немає даних');setText('heroCountdown',a?.queue?'Графік для цієї години не підтверджений':'Додайте адресу або виберіть підчергу')}else{setText('heroTitle',`${st==='on'?'Є світло':'Немає світла'} до: ${nxt&&nxt.to>=0?clock(nxt.time):'—:—'}`);setText('heroCountdown',nxt&&nxt.to>=0?`До ${nxt.to===1?'відключення':'планового відновлення'} ${Math.floor((nxt.time-nowMinutes())/60)} год ${String((nxt.time-nowMinutes())%60).padStart(2,'0')} хв`:'До кінця відомого графіка змін не заплановано')}
 setText('sourceStamp',schedule?`Опубліковано ${fmtStamp(schedule.publishedAt)}`:'Графік не підтверджено');setText('queueChip',a?.queue?`Черга ${a.queue}`:'—');setText('overviewDate',formatDate(today(),{weekday:'long',day:'numeric',month:'long'}));setText('overviewLabel',timelineToday?'24 години':'Графік не опублікований');renderBar(timelineToday);const t=stats(timelineToday);setText('hoursOn',t&&t.unknown===0?minutesLabel(t.on):t&&t.on?`${minutesLabel(t.on)}+`:'—');setText('hoursOff',t&&t.unknown===0?minutesLabel(t.off):t&&t.off?`${minutesLabel(t.off)}+`:'—');
 const list=$('placeList');list.replaceChildren();for(const item of addresses){const b=el('button','place-card');b.type='button';const avatar=el('span','place-avatar');avatar.innerHTML=PIN;b.append(avatar);const copy=el('span','place-text');copy.append(el('strong','',label(item)),el('small','',`${item.settlement||'Черкаси'} · ${item.queue?'черга '+item.queue:'черга невідома'}`));b.append(copy);const state=stateAt(timeline(today(),item.queue),nowMinutes());b.append(el('span','place-status '+state,state==='on'?'Є світло':state==='off'?'Без світла':'—'));b.onclick=()=>{prefs.primaryId=item.id;savePrefs();navigate('detail')};list.append(b)}if(!addresses.length){const e=el('div','empty-places');e.append(el('strong','','Ще немає збережених місць'),el('span','','Додайте адресу, щоб отримати персональний графік.'));list.append(e)}const add=el('button','add-place-card','+  Додати адресу');add.onclick=()=>openAddressSheet();list.append(add)
}
function renderBar(a){const bar=$('overviewBar');bar.replaceChildren();if(!a){const b=el('span','bar-segment unknown');b.style.flex='1';bar.append(b);return}let start=0,v=a[0];for(let i=1;i<=1440;i++){if(i===1440||a[i]!==v){const seg=el('span','bar-segment '+(v===1?'off':v===0?'on':'unknown'));seg.style.flex=String(i-start);seg.title=`${clock(start)}–${clock(i)} · ${v===1?'відключення':v===0?'світло':'немає даних'}`;bar.append(seg);start=i;v=a[i]}}const line=el('span','bar-now');line.style.left=(nowMinutes()/1440*100)+'%';bar.append(line)}
function navigate(name){if(!['home','detail','updates','settings'].includes(name))return;if(name==='detail'&&!primary()){openAddressSheet();return}active=name;for(const n of ['home','detail','updates','settings'])$(n).hidden=n!==name;document.querySelectorAll('[data-go]').forEach(x=>{if(x.classList.contains('nav-item'))x.classList.toggle('active',x.dataset.go===name)});if(name==='detail'){daySelected=today();renderDetail()}else if(name==='updates')renderUpdates();else if(name==='settings')renderSettings();else renderHome();window.scrollTo({top:0,behavior:'instant'});}
function renderDetail(){const a=primary();if(!a)return;setText('detailAddress',fullAddress(a));const tToday=timeline(today(),a.queue),st=stateAt(tToday,nowMinutes()),nxt=transition(tToday,nowMinutes());const status=$('detailStatus');status.className='detail-status '+st;status.textContent=st==='unknown'?'Немає підтверджених даних':`${st==='on'?'Є світло':'Немає світла'} до: ${nxt&&nxt.to>=0?clock(nxt.time):'—:—'}`;
 const day=daySelected||today();const mon=shiftDay(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));const root=$('days');root.replaceChildren();for(let i=0;i<7;i++){const d=shiftDay(mon,i),b=el('button','day-choice'+(d===day?' selected':''),['Пн','Вт','Ср','Чт','Пт','Сб','Нд'][i]);b.append(el('b','',String(Number(d.slice(8)))));b.setAttribute('aria-pressed',String(d===day));b.onclick=()=>{daySelected=d;renderDetail()};root.append(b)}const pub=currentDay(day),t=timeline(day,a.queue);setText('detailDayLabel',formatDate(day));setText('detailUpdated',pub?`Опубліковано ${fmtStamp(pub.publishedAt)}`:'Не опубліковано');const grid=$('hourGrid');grid.replaceChildren();
 for(let h=0;h<24;h++){
   let on=0,off=0;
   for(let m=h*60;m<h*60+60;m++){if(t?.[m]===0)on++;if(t?.[m]===1)off++}
   const visual=window.SvitloHour.paintHour(t,h),type=visual.kind;
   const c=el('div','hour-cell '+type+(day===today()&&h===Math.floor(nowMinutes()/60)?' current':''));
   c.style.background=visual.background;
   c.dataset.hour=clock(h*60);
   const iconBolt='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.6 1.3 3.7 13.7h7l-1.2 9.1 10.8-13.4h-7.2z"/></svg>';
   const iconOff='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.6 1.3 3.7 13.7h7l-1.2 9.1 10.8-13.4h-7.2z"/><path d="M2.5 21.5 21.5 2.5" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/></svg>';
   for(const [mode,mask,icon] of [['on',visual.onMask,iconBolt],['off',visual.offMask,iconOff],['unknown',visual.unknownMask,iconBolt]]){
     const layer=el('span','hour-ink hour-ink-'+mode);
     layer.innerHTML='<span class="hour-ink-content">'+icon+'<span>'+clock(h*60)+'</span></span>';
     layer.style.webkitMaskImage=mask;layer.style.maskImage=mask;
     layer.setAttribute('aria-hidden','true');c.append(layer);
   }
   c.setAttribute('role','img');
   c.setAttribute('aria-label',clock(h*60)+': '+(type==='unknown'?'немає підтверджених даних':type==='mixed'?`за графіком зі світлом ${on} хвилин, без світла ${off} хвилин`:type==='off'?'за графіком немає світла':'за графіком є світло'));
   c.title=c.getAttribute('aria-label');grid.append(c);
 }
 const next=transition(tToday,nowMinutes());setText('nextTime',next?clock(next.time):'—:—');setText('nextDescription',next?`Планове ${next.to===1?'відключення':'відновлення електропостачання'}`:'До завершення відомого графіка змін не виявлено');$('articleLink').href=pub?.queueSources?.[a.queue]||pub?.source||'https://www.cherkasyoblenergo.com/news'}
function renderUpdates(){setText('lastCheck',data.lastChecked?fmtStamp(data.lastChecked):'Час перевірки невідомий');setText('updateNote',data.lastChecked?'Це час звіряння з публікаціями оператора, а не час появи нового графіка.':'Перевірте графік безпосередньо на сайті оператора.');const root=$('updateList');root.replaceChildren();const all=[...(data.changes||[]).map(x=>({kind:'change',...x})),...(data.days||[]).map(x=>({kind:'publication',...x}))].sort((a,b)=>String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0,24);if(!all.length)root.append(el('div','empty-places','Поки немає підтверджених публікацій.'));for(const d of all){const c=el('div','update-card');c.append(el('time','',fmtStamp(d.publishedAt)),el('strong','',d.kind==='change'?`Графік скориговано · ${formatDate(d.date)}`:`Опубліковано графік · ${formatDate(d.date)}`));const meta=el('div','small-source',d.kind==='change'?`Змінені підчерги: ${(d.queues||[]).join(', ')||'не уточнено'}`:`Редакцій: ${d.revisions||1}`);c.append(meta);const link=el('a','', 'Офіційна публікація ↗');link.href=d.source||'https://www.cherkasyoblenergo.com/news';link.target='_blank';link.rel='noopener';c.append(link);root.append(c)}}
function renderSettings(){for(const [key,field] of [['off','notifyOff'],['on','notifyOn'],['changes','notifyChanges'],['tomorrow','notifyTomorrow'],['emergency','notifyEmergency']])$(field).checked=!!prefs[key];const connected=!!pushConfig?.apiBase&&!!pushConfig?.publicKey;setText('pushHeadline','Сповіщення');setText('pushDescription',connected?'Отримуйте нагадування про відключення та зміни графіків, навіть коли застосунок закритий.':'Наразі нагадування доступні тільки під час використання застосунку.');setText('enableNotifications',connected?'Увімкнути сповіщення':'Дозволити нагадування');$('disableNotifications').hidden=!connected}
function fillQueueSelect(){const root=$('manualQueue');root.replaceChildren(new Option('Оберіть підчергу',''),...QUEUES.map(q=>new Option(q,q)))}
function town(){return $('settlement').value==='Інше'?$('customSettlement').value.trim():$('settlement').value}
function localIndex(){const k=normTown(town());return k===normTown('Черкаси')?{keys:index.keys||{},streets:index.streets||{},streetQueues:index.streetQueues||{}}:index.localities?.[k]||{keys:{},streets:{},streetQueues:{}}}
function findQueue(){
 const idx=localIndex();
 const selectedKey=suggestion&&SvitloAddressLookup.normalize(suggestion.label)===SvitloAddressLookup.normalize($('street').value)?suggestion.key:null;
 return SvitloAddressLookup.resolve({idx,settlement:town(),street:$('street').value,house:$('house').value,selectedKey});
}
function checkLookup(){
 const r=findQueue(),hint=$('lookupFeedback'),manual=$('manualLookup'),possible=$('possibleQueues');
 hint.className='lookup-feedback'+(['exact','street'].includes(r.status)?' found':r.status==='incomplete'?'':' warn');
 const list=(r.queues||[]).join(', ');
 const messages={
  incomplete:'Оберіть населений пункт і вулицю. Номер будинку вводити необов’язково.',
  unavailable:'Для цього населеного пункту наразі немає адресного переліку. Якщо ви знаєте підчергу, можете вказати її вручну.',
  ambiguous:'Знайдено декілька вулиць із такою назвою. Виберіть точну вулицю зі списку підказок.',
  nostreet:'Поки не знайшли цю вулицю в переліку. Спробуйте підказки або вкажіть відому вам підчергу.',
  needhouse:'Оператор указав окремі будинки цієї вулиці. Номер допоможе знайти точну підчергу, але ви можете вказати відому вам підчергу вручну.',
  nohouse:'Для введеної адреси немає однозначного запису. За потреби вкажіть підчергу вручну.',
  exact:`За офіційним переліком для цієї адреси: підчерга ${r.queue}.`,
  street:`За переліком вулиць: підчерга ${r.queue}. Номер будинку вводити не потрібно.`,
  possible:`Для цієї вулиці вказано декілька підчерг: ${list}. ${r.reason==='house-conflict'?'Цей номер будинку є у різних записах. ':'За можливості уточніть номер будинку.'}Оберіть свою підчергу.`
 };
 hint.textContent=messages[r.status]||'Не вдалося визначити підчергу.';
 manual.hidden=['incomplete','exact','street'].includes(r.status);
 possible.replaceChildren();
 if(r.status==='possible'&&r.queues?.length){
   possible.hidden=false;
   possible.append(el('div','possible-title','Підчерги з опублікованого переліку:'));
   for(const q of r.queues){
     const b=el('button','possible-queue'+($('manualQueue').value===q?' selected':''),`Підчерга ${q}`);
     b.type='button';b.setAttribute('aria-pressed',String($('manualQueue').value===q));
     b.onclick=()=>{$('manualQueue').value=q;checkLookup()};possible.append(b);
   }
 }else possible.hidden=true;
 const chosen=$('manualQueue').value;
 $('saveAddress').disabled=!(r.status==='exact'||r.status==='street'||
   (r.status!=='incomplete'&&town().trim()&&$('street').value.trim()&&QUEUES.includes(chosen)));
 return r;
}
function suggestions(){
 const root=$('streetSuggestions');root.replaceChildren();
 const matches=SvitloAddressLookup.suggest(localIndex(),$('street').value);
 root.hidden=!matches.length;
 for(const [key,name] of matches){const b=el('button','',name);b.type='button';b.onclick=()=>{
   $('street').value=name;suggestion={key,label:name};root.hidden=true;checkLookup();
 };root.append(b)}
}
function openAddressSheet(item=null){editId=item?.id||null;suggestion=null;setText('sheetTitle',item?'Редагувати адресу':'Нова адреса');$('nickname').value=item?.nickname||'';$('street').value=item?.street||'';$('house').value=item?.house||'';const opt=Array.from($('settlement').options).find(x=>normTown(x.value)===normTown(item?.settlement));$('settlement').value=opt?opt.value:item?.settlement?'Інше':'Черкаси';$('customSettlement').hidden=$('settlement').value!=='Інше';$('customSettlement').value=opt?'':item?.settlement||'';$('manualQueue').value=item?.queue||'';$('deleteAddress').hidden=!item;$('streetSuggestions').hidden=true;checkLookup();showSheet($('addressSheet'))}
let sheetScroll=0;
function showSheet(dialog){if(!document.body.classList.contains('sheet-open'))sheetScroll=window.scrollY;dialog.showModal();document.body.classList.add('sheet-open');document.body.style.position='fixed';document.body.style.top=`-${sheetScroll}px`;document.body.style.width='100%'}
function unlockSheet(){if($('addressSheet').open||$('placesSheet').open)return;document.body.classList.remove('sheet-open');document.body.style.position='';document.body.style.top='';document.body.style.width='';window.scrollTo({top:sheetScroll,behavior:'instant'})}
function closeSheet(dialog){if(dialog.open)dialog.close();unlockSheet()}
function saveAddress(event){event.preventDefault();const r=checkLookup(),queue=['exact','street'].includes(r.status)?r.queue:$('manualQueue').value;if(!QUEUES.includes(queue)){flash('Укажіть підчергу для адреси');return}const a={id:editId||id(),nickname:$('nickname').value.trim(),street:$('street').value.trim(),house:$('house').value.trim(),settlement:normTown(town())==='слобода'?'Слобода':town(),queue,method:r.status==='exact'?'automatic':r.status==='street'?'street-auto':r.status==='possible'&&r.queues?.includes(queue)?'street-choice':'manual'};if(editId){const idx=addresses.findIndex(x=>x.id===editId);if(idx>=0)addresses[idx]=a}else addresses.push(a);if(!primary()||!editId)prefs.primaryId=a.id;saveAddresses();savePrefs();closeSheet($('addressSheet'));render();flash(['exact','street'].includes(r.status)?`Підчергу ${queue} знайдено`:'Адресу збережено');if(!editId)navigate('detail');updatePushSubscription().catch(()=>{});}
function deleteAddress(){if(!editId||!confirm('Видалити цю адресу?'))return;addresses=addresses.filter(x=>x.id!==editId);if(prefs.primaryId===editId)prefs.primaryId=addresses[0]?.id||null;saveAddresses();savePrefs();closeSheet($('addressSheet'));navigate('home');flash('Адресу видалено');if(!primary())disableNotifications().catch(console.warn);else updatePushSubscription().catch(console.warn)}
function movePlace(id,direction){const i=addresses.findIndex(x=>x.id===id);const j=i+direction;if(i<0||j<0||j>=addresses.length)return;[addresses[i],addresses[j]]=[addresses[j],addresses[i]];saveAddresses();openPickerContent();renderHome()}
function openPickerContent(){const root=$('placesOptions');root.replaceChildren();for(const [i,a] of addresses.entries()){
 const row=el('div','place-option');row.draggable=true;row.dataset.id=a.id;
 const choose=el('button','place-choose');const txt=el('span');txt.append(el('strong','',label(a)),el('small','',fullAddress(a)));choose.append(txt,el('span','',a.id===primary()?.id?'✓':'›'));choose.onclick=()=>{prefs.primaryId=a.id;savePrefs();closeSheet($('placesSheet'));render();updatePushSubscription().catch(()=>{})};row.append(choose);
 const moves=el('span','place-moves');for(const [n,txtval] of [[-1,'↑'],[1,'↓']]){const b=el('button','move-btn',txtval);b.type='button';b.disabled=n===-1?i===0:i===addresses.length-1;b.setAttribute('aria-label',n<0?'Перемістити вище':'Перемістити нижче');b.onclick=()=>movePlace(a.id,n);moves.append(b)}row.append(moves);
 row.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',a.id);e.dataTransfer.effectAllowed='move'});row.addEventListener('dragover',e=>e.preventDefault());row.addEventListener('drop',e=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain');const at=addresses.findIndex(x=>x.id===from),to=addresses.findIndex(x=>x.id===a.id);if(at<0||to<0||at===to)return;const [m]=addresses.splice(at,1);addresses.splice(to,0,m);saveAddresses();openPickerContent();renderHome()});root.append(row)}}
function openPicker(){openPickerContent();showSheet($('placesSheet'))}

function officialOpen(){const address=[town(),$('street').value.trim(),$('house').value.trim()].filter(Boolean).join(', ');const link=window.open(OFFICIAL,'_blank','noopener');if(navigator.clipboard?.writeText){navigator.clipboard.writeText(address).then(()=>flash('Адресу скопійовано — вставте її на офіційному сайті')).catch(()=>flash('Офіційний пошук відкрито'))}else flash('Офіційний пошук відкрито');if(!link){/* popups may be blocked; retain plain official URL below */}}
function emergencyEvents(){
 const all=[...(emergency.events||[]),...(overrides.emergency?.events||[])];
 return all.filter(e=>e&&typeof e.source==='string'&&/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(e.source)&&Number.isFinite(new Date(e.publishedAt).getTime())).sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
}
function latestEmergency(){
 // Do not infer a currently active interruption from old or ambiguous reports.
 return emergencyEvents().find(e=>{const age=Date.now()-new Date(e.publishedAt).getTime();return age>=0&&age<24*60*60*1000})||null;
}
function renderEmergency(){
 const e=latestEmergency(),banner=$('emergencyBanner');
 if(!e){banner.hidden=true;return}
 banner.hidden=false;
 const recent=Date.now()-new Date(e.publishedAt).getTime()<3*60*60*1000;
 banner.className='emergency-banner '+(e.status==='active'&&recent?'is-warning':'is-note');
 setText('emergencyTitle',e.status==='active'&&recent?'Офіційне повідомлення про аварійні відключення':e.status==='ended'?'Оновлення: завершення обмежень':'Повідомлення про аварійні відключення');
 setText('emergencyText',`${e.title||'Інформація про відключення'} · ${fmtStamp(e.publishedAt)}. Перевіряйте поточний стан в оператора.`);
 $('emergencySource').href=e.source;
}
function notifyEmergencyEvent(){
 const e=latestEmergency();if(!e||e.status!=='active')return;
 const age=Date.now()-new Date(e.publishedAt).getTime();if(age<0||age>60*60*1000)return;
 notify('🪫Графік не діє','Розпочинаються екстрені відключення світла поза графіком.',`emergency:${e.id||e.source}`);
}
function applyOverrides(){
 const days=overrides.schedules?.days;
 if(Array.isArray(days)&&days.length){
   const map=new Map(data.days.map(d=>[d.date,d]));
   for(const correction of days){
     if(!/^20\d{2}-\d{2}-\d{2}$/.test(correction.date)||!correction.source?.startsWith('https://www.cherkasyoblenergo.com/')||correction.verified!==true)continue;
     const base=map.get(correction.date)||{date:correction.date,queues:{},verified:true,publishedAt:correction.publishedAt,source:correction.source};
     const queueSources={...(base.queueSources||{})};
     for(const q of Object.keys(correction.queues||{}))queueSources[q]=correction.source;
     map.set(correction.date,{...base,queues:{...base.queues,...correction.queues},queueSources,adminCorrection:true});
   }
   data.days=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
 }
 index=mergeIndexes(index,overrides.addresses||{});
}
function normalizeData(obj){if(!obj||!Array.isArray(obj.days))throw Error('Bad JSON');return {days:obj.days.filter(x=>/^20\d\d-\d\d-\d\d$/.test(x.date)&&x.verified===true),changes:Array.isArray(obj.changes)?obj.changes:[],lastChecked:obj.lastChecked||null}}
function mergeIndexes(live,backup){
 const clean=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
 const unionQueues=(a,b)=>[...new Set([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])])].sort((x,y)=>Number(x)-Number(y));
 const streetQueues={...clean(live.streetQueues)};
 for(const [key,q] of Object.entries(clean(backup.streetQueues)))streetQueues[key]=unionQueues(streetQueues[key],q);
 const result={keys:{...clean(live.keys),...clean(backup.keys)},streets:{...clean(live.streets),...clean(backup.streets)},streetQueues,localities:{...clean(live.localities)}};
 for(const [town,extra] of Object.entries(clean(backup.localities))){
   const base=clean(result.localities[town]),bq={...clean(base.streetQueues)};
   for(const [key,queues] of Object.entries(clean(extra.streetQueues)))bq[key]=unionQueues(bq[key],queues);
   result.localities[town]={...base,keys:{...clean(base.keys),...clean(extra.keys)},streets:{...clean(base.streets),...clean(extra.streets)},streetQueues:bq};
 }
 return result;
}
async function refreshData(manual=false){
 if(refreshInFlight)return refreshInFlight;
 if(Date.now()-lastRefresh<7000&&!manual)return;
 lastRefresh=Date.now();
 const before=data,hadChecked=hasCheckedOnce;
 const refreshButton=$('syncNow');if(refreshButton)refreshButton.disabled=true;
 refreshInFlight=(async()=>{
   let schedulesOk=false;
   try{
     const response=await fetch(`./data/schedules.json?refresh=${Date.now()}`,{cache:'no-store'});
     if(!response.ok)throw Error('schedules HTTP '+response.status);
     const loaded=normalizeData(await response.json());
     data=loaded;schedulesOk=true;lastSyncFailed=false;lastDownloadAt=new Date().toISOString();
   }catch(error){lastSyncFailed=true;console.warn('Schedule fetch:',error)}
   try{
     const [remote,seed]=await Promise.allSettled([
       fetch(`./data/addresses.json?refresh=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}),
       fetch(`./data/published_street_fallback.json?refresh=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()})
     ]);
     if(remote.status==='fulfilled'||seed.status==='fulfilled'){
       const live=remote.status==='fulfilled'?remote.value:{};
       const backup=seed.status==='fulfilled'?seed.value:{};
       index=mergeIndexes(live,backup);
       if($('addressSheet').open){suggestions();checkLookup()}
     }
   }catch(error){console.warn('Address fetch:',error)}
   try{
     const [alertRes,overrideRes]=await Promise.allSettled([
       fetch('./data/emergency.json?v='+Date.now(),{cache:'no-store'}),
       fetch('./data/manual_overrides.json?v='+Date.now(),{cache:'no-store'})
     ]);
     if(alertRes.status==='fulfilled'&&alertRes.value.ok){const parsed=await alertRes.value.json();if(Array.isArray(parsed.events))emergency=parsed}
     if(overrideRes.status==='fulfilled'&&overrideRes.value.ok){const parsed=await overrideRes.value.json();if(parsed.schemaVersion===1)overrides=parsed}
     applyOverrides();
   }catch(error){console.warn('Bulletin or admin overrides:',error)}
   hasCheckedOnce=true;render();
   if(manual)flash(schedulesOk?'Графіки перевірено. Час перевірки оператора показано вище.':'Не вдалося завантажити дані — показуємо останні доступні');
   if(schedulesOk){
     if(hadChecked&&scheduleQueueChanged(before,data,primary()?.queue))flash('Графік для вашої підчерги оновлено');
     announceChanges(before,data);
   }
 })();
 try{return await refreshInFlight}finally{refreshInFlight=null;if(refreshButton)refreshButton.disabled=false}
}
function notify(title,body,key){if(pushActive||notified.has(key)||!('Notification' in window)||Notification.permission!=='granted')return;notified.add(key);localStorage.setItem(SEEN,JSON.stringify([...notified].slice(-400)));navigator.serviceWorker?.ready.then(r=>r.showNotification(title,{body,icon:'./assets/icon-192-v673.png',tag:key})).catch(()=>{try{new Notification(title,{body})}catch{}})}
function announceChanges(previous,current){if(!prefs.changes||!previous?.lastChecked)return;const a=primary();if(!a?.queue)return;for(const c of current.changes||[])if(c.queues?.includes(a.queue)&&!previous.changes?.some(x=>x.date===c.date&&x.publishedAt===c.publishedAt)){notify('Світло: графік змінено',`Оновлена підчерга ${a.queue} на ${formatDate(c.date)}.`, `change:${c.date}:${c.publishedAt}:${a.queue}`)}}
function checkNotifications(){
 if(!('Notification' in window)||Notification.permission!=='granted')return;
 // Regional emergency notices are useful even when there is no known schedule.
 if(prefs.emergency)notifyEmergencyEvent();
 const a=primary();if(!a?.queue)return;
 const date=today(),m=nowMinutes(),arr=timeline(date,a.queue);
 if(arr&&arr[m]>=0){
   for(const [type,offset,desired,txt] of [['off',30,1,'відключення'],['on',15,0,'повернення світла']]){
     if(!prefs[type])continue;
     const future=m+offset;
     if(future>=1440)continue;
     if(arr[future]===desired&&arr[future-1]!==desired&&arr[future-1]!==-1){
       notify(`Світло: скоро ${txt}`,`Через ${offset} хвилин за графіком: ${label(a)}, підчерга ${a.queue}.`,`${type}:${date}:${future}:${a.id}`);
     }
   }
 }
 if(prefs.tomorrow){const tomorrow=shiftDay(date,1),published=currentDay(tomorrow);
   if(published?.queues?.[a.queue]&&m>=19*60)notify('Світло: графік на завтра',`Для підчерги ${a.queue} опубліковано графік на ${formatDate(tomorrow)}.`,`tomorrow:${tomorrow}:${a.id}`);
 }
}
async function getPushConfig(){
 try{
  const r=await fetch('./push-config.json',{cache:'no-store'});
  if(r.ok){const c=await r.json();if(/^https:\/\/[^\s]+$/.test(c?.apiBase||'')&&typeof c.publicKey==='string'&&/^[A-Za-z0-9_-]{87}$/.test(c.publicKey))pushConfig=c}
  if(pushConfig&&'Notification' in window&&Notification.permission==='granted'&&localStorage.getItem(PUSH_CONSENT)!=='no'){
   // Existing subscribers are migrated; new users must tap the consent button.
   const existing=await (await navigator.serviceWorker.ready).pushManager.getSubscription();
   if(existing||localStorage.getItem(PUSH_CONSENT)==='yes')await updatePushSubscription();
  }
 }catch(e){console.warn('Push config:',e.message)}renderSettings();
}
function urlsafe(value){const str=(value+'='.repeat((4-value.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(str),x=>x.charCodeAt(0))}
async function updatePushSubscription(){
 if(!('Notification' in window)||!pushConfig||Notification.permission!=='granted'||!primary()?.queue)return;
 const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
 const key=urlsafe(pushConfig.publicKey);
 // VAPID rotation requires a new subscription. Never silently reuse an old key.
 if(sub&&sub.options?.applicationServerKey){
  const old=Array.from(new Uint8Array(sub.options.applicationServerKey));
  if(old.length!==key.length||old.some((v,i)=>v!==key[i])){await sub.unsubscribe();sub=null}
 }
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 const payload={subscription:sub.toJSON(),queue:primary().queue,preferences:{off:prefs.off,on:prefs.on,changes:prefs.changes,tomorrow:prefs.tomorrow,emergency:prefs.emergency}};
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(pushConfig.apiBase.replace(/\/$/,'')+'/api/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
  if(!response.ok)throw Error('Push server response '+response.status);
  pushActive=true;localStorage.setItem(PUSH_CONSENT,'yes');
 }finally{clearTimeout(timeout)}
}
async function disableNotifications(){
 try{
  const registration=await navigator.serviceWorker.ready;
  const sub=await registration.pushManager.getSubscription();
  if(sub){
   if(pushConfig?.apiBase){
    const result=await fetch(pushConfig.apiBase.replace(/\/$/,'')+'/api/unsubscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subscription:{endpoint:sub.endpoint}})});
    if(!result.ok)throw Error('Сервер не підтвердив відписку');
   }else throw Error('Підписка тимчасово недоступна');
   await sub.unsubscribe();
  }
  pushActive=false;localStorage.setItem(PUSH_CONSENT,'no');flash('Сповіщення вимкнено. Підписку скасовано');renderSettings();
 }catch(e){console.warn(e);flash('Не вдалося відписатися — повторіть, коли є інтернет')}
}
async function enableNotifications(){if(!('Notification' in window)){flash('Цей браузер не підтримує сповіщення');return}if(Notification.permission==='denied'){flash('Дозвольте сповіщення у налаштуваннях iPhone');return}const granted=await Notification.requestPermission();if(granted!=='granted'){flash('Дозвіл на сповіщення не надано');return}if(pushConfig){try{await updatePushSubscription();flash('Сповіщення увімкнено')}catch(e){console.warn(e);flash('Не вдалося ввімкнути сповіщення. Спробуйте пізніше')}}else flash('Нагадування увімкнено для відкритого застосунку');renderSettings()}
// Event wiring
for(const b of document.querySelectorAll('[data-go]'))b.addEventListener('click',()=>navigate(b.dataset.go));
$('syncNow').onclick=()=>refreshData(true);$('refreshTop').onclick=()=>refreshData(true);$('refreshDetail').onclick=()=>refreshData(true);$('manualRefresh').onclick=()=>refreshData(true);$('primaryPicker').onclick=()=>addresses.length?openPicker():openAddressSheet();$('addFromHome').onclick=()=>openAddressSheet();$('addFromSettings').onclick=()=>openAddressSheet();$('editActive').onclick=()=>openAddressSheet(primary());$('openDetail').onclick=()=>navigate('detail');
$('closeSheet').onclick=()=>closeSheet($('addressSheet'));$('closePlaces').onclick=()=>closeSheet($('placesSheet'));$('sheetAddPlace').onclick=()=>{closeSheet($('placesSheet'));openAddressSheet()};
for(const dialog of [$('addressSheet'),$('placesSheet')])dialog.addEventListener('close',unlockSheet);
$('settlement').onchange=()=>{$('manualQueue').value='';$('customSettlement').hidden=$('settlement').value!=='Інше';suggestion=null;suggestions();checkLookup()};$('customSettlement').oninput=()=>{$('manualQueue').value='';checkLookup()};$('street').oninput=()=>{$('manualQueue').value='';suggestion=null;suggestions();checkLookup()};$('house').oninput=()=>{$('manualQueue').value='';checkLookup()};$('manualQueue').onchange=checkLookup;$('addressForm').onsubmit=saveAddress;$('deleteAddress').onclick=deleteAddress;$('goOfficial').onclick=officialOpen;
for(const [key,field] of [['off','notifyOff'],['on','notifyOn'],['changes','notifyChanges'],['tomorrow','notifyTomorrow'],['emergency','notifyEmergency']])$(field).onchange=e=>{prefs[key]=e.target.checked;savePrefs();updatePushSubscription().catch(console.warn)};
$('enableNotifications').onclick=enableNotifications;$('disableNotifications').onclick=disableNotifications;
fillQueueSelect();render();refreshData();getPushConfig();
setInterval(()=>{renderHome();if(active==='detail')renderDetail();checkNotifications()},30_000);
setInterval(()=>{if(!document.hidden)refreshData()},5*60_000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refreshData();checkNotifications()}});
window.addEventListener('online',()=>{renderFreshness();refreshData(true)});window.addEventListener('offline',renderFreshness);
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{swRegistration=reg}).catch(console.warn);
