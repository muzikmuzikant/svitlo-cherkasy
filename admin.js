'use strict';
const $=id=>document.getElementById(id);
const FILES={overrides:'manual_overrides.json',schedules:'schedules.json',addresses:'addresses.json',streets:'published_street_fallback.json',emergency:'emergency.json'};
let server='',sessionToken='',sha='',current='',remote=false,canPublish=false,original=null,pushBusy=false,adminRole='owner';
function message(s,good){$('result').textContent=s;$('result').style.background=good?'#e5f7ed':'#fff2db';$('result').style.color=good?'#15633e':'#825310'}
function validate(kind,obj){
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('Потрібен JSON-об’єкт');
 if(kind==='overrides'){
  if(obj.schemaVersion!==1||!Array.isArray(obj.schedules?.days)||!obj.addresses||!Array.isArray(obj.emergency?.events))throw Error('Невірна структура ручних уточнень');
  for(const d of obj.schedules.days){if(!/^20\d\d-\d\d-\d\d$/.test(d.date||'')||!d.verified||!/^https:\/\/(www\.)?cherkasyoblenergo\.com\//.test(d.source||''))throw Error('Для кожного уточнення потрібні дата, verified:true та офіційне джерело')}
 }
 if(kind==='schedules'&&!Array.isArray(obj.days))throw Error('Відсутній масив days');
 if(kind==='addresses'&&(!obj.keys||!obj.streets))throw Error('Не знайдено keys або streets');
 if(kind==='streets'&&!obj.localities)throw Error('Не знайдено localities');
 if(kind==='emergency'&&!Array.isArray(obj.events))throw Error('Відсутній масив events');
 if(JSON.stringify(obj).length>1_800_000)throw Error('Перевищений розмір файлу');
 return true;
}
async function api(route,opts={}){
 const response=await fetch(server+'/api/admin/'+route,{...opts,cache:'no-store',headers:{authorization:'Bearer '+sessionToken,'content-type':'application/json',...opts.headers}});
 const data=await response.json().catch(()=>({}));
 if(response.status===401&&remote){signOut(false);throw Error('Сеанс завершився. Увійдіть знову.')}
 if(!response.ok)throw Error(data.error||'HTTP '+response.status);
 return data;
}
window.svitloAdminApi=(route,opts)=>api(route,opts);
window.svitloAdminDraft=()=>({kind:current,original,raw:$('editor').value});
async function load(){
 const kind=$('kind').value;
 try{
  let contents;
  if(remote&&canPublish){const r=await api('file?kind='+kind);contents=r.contents;sha=r.sha}
  else{const r=await fetch('./data/'+FILES[kind]+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Файл недоступний');contents=await r.json();sha=''}
  original=contents;current=kind;$('editor').value=JSON.stringify(contents,null,2);
  $('publish').disabled=!(remote&&canPublish);
  $('editMode').textContent=remote&&canPublish?'Публікація GitHub доступна':'Попередній перегляд та експорт';
  message(remote&&canPublish
    ?'Дані завантажено. Після перевірки їх можна опублікувати у GitHub.'
    :'Редагування файлів зараз не підключено. Можна перевіряти та експортувати JSON, але опублікувати його через цю панель не вийде. Для публікації потрібен доступ GitHub у налаштуваннях сервера.',remote&&canPublish);
 }catch(e){message('Не вдалося завантажити: '+e.message,false)}
}
async function diagnostics(){
 try{
  const results=await Promise.all(Object.values(FILES).map(f=>fetch('./data/'+f+'?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():{}).catch(()=>({}))));
  const [overrides,schedules,addresses,streets,emergency]=results;
  $('scheduleStat').textContent=(schedules.days||[]).length;
  $('addressStat').textContent=Object.keys(addresses.keys||{}).length+' + '+Object.values(streets.localities||{}).reduce((n,v)=>n+Object.keys(v.streets||{}).length,0);
  $('townStat').textContent=Object.keys(addresses.localities||{}).length+' + '+Object.keys(streets.localities||{}).length;
  $('emergencyStat').textContent=(emergency.events||[]).length;
 }catch(e){message('Не вдалося отримати діагностику: '+e.message,false)}
}
function signOut(revoke=true){
 const oldToken=sessionToken,oldServer=server;
 if(revoke&&oldToken&&oldServer){fetch(oldServer+'/api/admin/logout',{method:'POST',headers:{authorization:'Bearer '+oldToken,'content-type':'application/json'},body:'{}'}).catch(()=>{})}
 remote=false;canPublish=false;sessionToken='';sha='';adminRole='owner';document.body.dataset.adminRole='';
 $('adminDashboard').hidden=true;$('adminLoginScreen').hidden=false;
 $('connection').textContent='Авторизовано';$('publish').disabled=true;
 $('password').value='';if($('otp'))$('otp').value='';setPushReady(false);
 $('loginError').textContent='';$('password').focus();document.dispatchEvent(new Event('svitlo:admin-logout'));
}
$('loginForm').onsubmit=async event=>{
 event.preventDefault();
 const url=$('server').value.trim().replace(/\/$/,'');
 if(!/^https:\/\/[^\s/]+$/.test(url)){$('loginError').textContent='Не вдалося визначити захищену адресу Railway. Оновіть сторінку.';return}
 const enteredPassword=$('password').value;
 const enteredCode=$('otp')?.value.trim()||'';
 $('connect').disabled=true;$('connect').textContent='Перевіряємо пароль…';$('loginError').textContent='';
 try{
   const response=await fetch(url+'/api/admin/login',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({username:$('adminUsername').value.trim(),password:enteredPassword,code:enteredCode})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.token)throw Error(result.error||'Помилка входу: HTTP '+response.status);
   server=url;sessionToken=result.token;adminRole=result.role||'owner';document.body.dataset.adminRole=adminRole;
   // Verify session before revealing protected tools.
   const status=await api('status');
   remote=true;canPublish=adminRole==='owner'&&!!status.editingEnabled;
   $('adminLoginScreen').hidden=true;$('adminDashboard').hidden=false;
   $('connection').textContent='Увійшли · '+({owner:'Власник',editor:'Редактор',operator:'Оператор',viewer:'Перегляд'}[adminRole]||'Адміністратор');$('connection').className='pill ok';
   $('password').value='';setPushReady(adminRole==='owner');
   await Promise.allSettled([load(),diagnostics(),refreshPushStatus(),refreshTickets()]);
   document.dispatchEvent(new Event('svitlo:admin-ready'));
 }catch(e){sessionToken='';remote=false;canPublish=false;$('loginError').textContent=e.message;setPushReady(false)}
 finally{$('password').value='';if($('otp'))$('otp').value='';$('connect').disabled=false;$('connect').textContent='Увійти до панелі →'}
};
$('disconnect').onclick=()=>signOut(true);
$('kind').onchange=load;
$('reload').onclick=()=>{if(original)$('editor').value=JSON.stringify(original,null,2);message('Відновлено завантажену версію.',true)};
$('validate').onclick=()=>{try{const obj=JSON.parse($('editor').value);validate($('kind').value,obj);message('JSON коректний, базові обмеження виконані. Це не підтверджує достовірності графіків.',true)}catch(e){message('Помилка: '+e.message,false)}};
$('download').onclick=()=>{try{const obj=JSON.parse($('editor').value);validate($('kind').value,obj);const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)+'\n'],{type:'application/json'}));a.href=url;a.download=FILES[$('kind').value];a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);message('Файл експортовано. Ви можете перевірити його перед ручним завантаженням на GitHub.',true)}catch(e){message(e.message,false)}};
$('publish').onclick=async()=>{
 if(!remote||!canPublish)return;
 try{const kind=$('kind').value;const obj=JSON.parse($('editor').value);validate(kind,obj);
   if(!confirm('Опублікувати '+FILES[kind]+' у вашому GitHub? Цю зміну побачать відвідувачі сайту.'))return;
   $('publish').disabled=true;const r=await api('file?kind='+kind,{method:'PUT',body:JSON.stringify({sha,contents:obj})});message('Опубліковано. Коміт: '+r.commit+'. Дані на GitHub Pages оновляться після розгортання.',true);await load();
 }catch(e){message('Публікація не вдалася: '+e.message,false);$('publish').disabled=false}
};
(async()=>{try{const r=await fetch('./push-config.json',{cache:'no-store'});if(r.ok){const c=await r.json();if(/^https:\/\/[^\s]+$/.test(c.apiBase||''))$('server').value=new URL(c.apiBase).origin}}catch{ $('loginError').textContent='Не вдалося визначити сервер. Оновіть сторінку.' } })();

// Guided editor: never directly changes public data. Edits the JSON staging area.
const queues=Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat();
$('quickQueue').replaceChildren(...queues.map(q=>new Option('Підчерга '+q,q)));
$('quickDay').value=new Date().toISOString().slice(0,10);
$('emergencyPublishedAt').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
const normalized=s=>String(s||'').toLocaleLowerCase('uk-UA').replace(/[’ʼ`]/g,"'").replace(/^(вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|бульвар)\s+/i,'').replace(/[^\p{L}\p{N}/]+/gu,'');
function staging(){
 if($('kind').value!=='overrides')throw Error('Оберіть файл «Ручні уточнення», а потім повторіть дію');
 const o=JSON.parse($('editor').value);validate('overrides',o);return o;
}
function staged(o,s){$('editor').value=JSON.stringify(o,null,2);message(s+(canPublish?' Перевірте JSON та опублікуйте зміни через GitHub.':' Це лише чернетка. Публікація через адмінпанель недоступна, але можна експортувати JSON.'),canPublish)}
function requiredSource(){const s=$('quickSource').value.trim();if(!/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(s))throw Error('Вставте перевірене посилання на офіційну публікацію Черкасиобленерго');return s}
$('findStreet').onclick=async()=>{try{
 const r=await fetch('./data/published_street_fallback.json?t='+Date.now());const j=await r.json();
 const town=normalized($('quickTown').value),street=normalized($('quickStreet').value);
 const loc=j.localities?.[town];const result=Object.entries(loc?.streets||{}).filter(([k,v])=>normalized(v)===street||k.split('|')[1]===street);
 message(result.length?'Знайдено в довіднику: '+result.map(([k,v])=>v+' → '+(loc.streetQueues?.[k]||[]).join(', ')).join('; '):'У довіднику такого збігу немає. Перевірте написання та офіційне джерело.',!!result.length);
 }catch(e){message(e.message,false)}};
$('addQueue').onclick=()=>{try{
 const obj=staging();requiredSource();const town=normalized($('quickTown').value),street=normalized($('quickStreet').value),house=normalized($('quickHouse').value),queue=$('quickQueue').value;
 if(!town||!street||!queues.includes(queue))throw Error('Вкажіть населений пункт, вулицю й підчергу');
 const prefix=/^пров/i.test($('quickStreet').value)?'провулок':'вулиця',key=prefix+'|'+street;
 const cleanDisplay=$('quickStreet').value.trim().replace(/^(?:вул(?:иця)?\.?|пров(?:улок|\.)?)\s+/i,'').trim();
 obj.addresses.localities??={};const loc=obj.addresses.localities[town]??={keys:{},streets:{},streetQueues:{}};
 loc.keys??={};loc.streets??={};loc.streetQueues??={};loc.streets[key]=(prefix==='провулок'?'Провулок ':'Вулиця ')+cleanDisplay;
 if(house)loc.keys[key+'|'+house]=[queue];else loc.streetQueues[key]=[...new Set([...(loc.streetQueues[key]||[]),queue])].sort();
 obj.updatedAt=new Date().toISOString();obj.addressesSource=requiredSource();
 staged(obj,house?'Підготовлено точну адресу.':'Підготовлено довідник вулиці без прив’язки до будинку.');
 }catch(e){message(e.message,false)}};
$('addSchedule').onclick=()=>{try{
 const obj=staging(),source=requiredSource(),date=$('quickDay').value,queue=$('quickQueue').value,intervals=$('quickIntervals').value.trim();
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!queues.includes(queue))throw Error('Невірна дата або підчерга');
 const off=intervals?intervals.split(',').map(item=>{
   const m=/^\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*$/.exec(item);
   if(!m)throw Error('Формат інтервалів: 19:30-21:00, 23:00-24:00');
   const time=x=>{const [h,m]=x.split(':').map(Number);return h*60+m};
   if(time(m[1])>=time(m[2])||time(m[2])>1440)throw Error('Невірний часовий інтервал');
   return [m[1].padStart(5,'0'),m[2].padStart(5,'0')];
 }):[];
 const entry=obj.schedules.days.find(d=>d.date===date&&d.source===source);
 if(entry){entry.queues[queue]={knownFrom:'00:00',off}}else obj.schedules.days.push({date,source,publishedAt:new Date().toISOString(),verified:true,queues:{[queue]:{knownFrom:'00:00',off}}});
 obj.updatedAt=new Date().toISOString();staged(obj,'Підготовлено графік для '+queue+' на '+date+'.');
 }catch(e){message(e.message,false)}};
$('addEmergency').onclick=()=>{try{
 const obj=staging(),source=requiredSource(),title=$('emergencyTitle').value.trim(),status=$('emergencyStatus').value;
 if(!title||title.length>170)throw Error('Додайте короткий заголовок офіційного повідомлення');
 const published=new Date($('emergencyPublishedAt').value);if(!Number.isFinite(published.getTime())||published.getTime()>Date.now()+5*60_000)throw Error('Вкажіть коректний час публікації');const entry={id:source,title,source,status,scope:'region',queues:[],publishedAt:published.toISOString()};
 obj.emergency.events=obj.emergency.events.filter(e=>e.id!==entry.id);obj.emergency.events.unshift(entry);obj.updatedAt=new Date().toISOString();
 staged(obj,'Підготовлено аварійний бюлетень. Перевірте час і джерело перед публікацією.');
 }catch(e){message(e.message,false)}};


// Test and manual Push messages are sent directly by the authenticated Railway server.
const pushQueues=Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat();
$('pushQueue').append(...pushQueues.map(q=>new Option('Тільки підчерга '+q,q)));
function pushResult(text,ok=null){$('pushResult').textContent=text;$('pushResult').className='push-state'+(ok===true?' good':ok===false?' error':'')}
function setPushReady(ready){$('pushAvailability').textContent=ready?'Сервер підключений':'Увійдіть для надсилання';$('pushAvailability').className='pill'+(ready?' ok':'');$('testPush').disabled=!ready;$('refreshPush').disabled=!ready;updatePushDraft()}
function updatePushDraft(){
 const title=$('pushTitle').value.trim(),body=$('pushBody').value.trim();
 $('pushTitleCount').textContent=$('pushTitle').value.length+' / 85';$('pushBodyCount').textContent=$('pushBody').value.length+' / 280';
 $('pushPreviewTitle').textContent=title||'Заголовок сповіщення';$('pushPreviewBody').textContent=body||'Тут буде твій текст повідомлення.';
 $('sendPush').disabled=!remote||pushBusy||!title||!body;
}
$('pushTitle').addEventListener('input',updatePushDraft);
$('pushBody').addEventListener('input',updatePushDraft);
async function refreshPushStatus(){
 try{const r=await api('push/status');$('pushCount').textContent=r.subscribers;return r}
 catch(e){$('pushCount').textContent='—';pushResult('Не вдалося перевірити підписки: '+e.message,false);return null}
}
$('refreshPush').onclick=async()=>{if(!remote)return;const r=await refreshPushStatus();if(r)pushResult('Зареєстровано '+r.subscribers+' пристроїв.',true)};
async function currentDeviceEndpoint(){
 if(!('serviceWorker' in navigator))return null;
 const registration=await navigator.serviceWorker.getRegistration('./');
 const subscription=await registration?.pushManager?.getSubscription();
 return subscription?.endpoint||null;
}
function deliverySummary(result){
 if(result.error)return result.error;
 return 'Прийнято Push-службами: '+result.accepted+' з '+result.attempted+'. '+
   (result.failed?'Помилок: '+result.failed+'. ':'')+
   (result.expired?'Недійсних підписок видалено: '+result.expired+'. ':'')+
   'Фактична поява на екрані iPhone перевіряється окремо.';
}
$('testPush').onclick=async()=>{
 if(!remote||pushBusy)return;
 const target=$('testAudience').value;
 if(target==='all'&&!confirm('Надіслати тестове повідомлення на ВСІ підписані пристрої?'))return;
 let endpoint='';
 if(target==='mine'){
   try{endpoint=await currentDeviceEndpoint()||''}catch{}
   if(!endpoint){pushResult('На цьому браузері не знайдено Push-підписку. Відкрийте адмінпанель із встановленого iPhone PWA або оберіть «Усім підписаним пристроям».',false);return}
 }
 pushBusy=true;$('testPush').disabled=true;
 try{const result=await api('push/test',{method:'POST',body:JSON.stringify({target,endpoint,confirmAll:target==='all'})});pushResult(deliverySummary(result),result.ok);await refreshPushStatus()}
 catch(e){pushResult('Тест не надіслано: '+e.message,false)}
 finally{pushBusy=false;$('testPush').disabled=!remote;updatePushDraft()}
};
$('sendPush').onclick=async()=>{
 if(!remote||pushBusy)return;
 const title=$('pushTitle').value.trim(),body=$('pushBody').value.trim(),queue=$('pushQueue').value;
 if(!title||!body)return;
 if(!confirm('НАДІСЛАТИ повідомлення '+(queue==='all'?'усім підписаним пристроям':'підчерзі '+queue)+'? Воно може з’явитися на заблокованих телефонах.'))return;
 pushBusy=true;updatePushDraft();
 try{
  const result=await api('push/send',{method:'POST',body:JSON.stringify({title,body,queue,confirmSend:true})});
  pushResult(deliverySummary(result),result.ok);await refreshPushStatus();
 }catch(e){pushResult('Повідомлення не надіслано: '+e.message,false)}
 finally{pushBusy=false;updatePushDraft()}
};
setPushReady(false);

// Support desk. All user text is rendered with textContent only.
const TICKET_TOPICS={bug:'Помилка застосунку',address:'Адреса або підчерга',schedule:'Графік відключень',push:'Сповіщення',idea:'Пропозиція',other:'Інше'};
const TICKET_STATES={new:'Нове',in_progress:'У роботі',resolved:'Вирішено'};
const TICKET_PRIORITY={low:'Низький',normal:'Звичайний',high:'Високий'};
let supportTickets=[],supportSelected='',supportBusy=false;
const supportDrafts=new Map(),noteDrafts=new Map(),tagDrafts=new Map();
function supportOverdue(ticket){return ticket.status!=='resolved'&&!!ticket.dueAt&&Number.isFinite(Date.parse(ticket.dueAt))&&Date.parse(ticket.dueAt)<Date.now()}
function supportNode(tag,value,cls=''){const element=document.createElement(tag);if(value!==undefined)element.textContent=String(value);if(cls)element.className=cls;return element}
function supportDate(date){const d=Date.parse(date||'');return Number.isFinite(d)?new Date(d).toLocaleString('uk-UA',{dateStyle:'medium',timeStyle:'short'}):'невідомо'}
function supportBadge(value){return supportNode('span',TICKET_STATES[value]||'Нове','ticket-state state-'+value)}
function renderTicketCounts(){
 const counts={all:supportTickets.length,new:0,in_progress:0,resolved:0};
 for(const ticket of supportTickets)if(ticket.status in counts)counts[ticket.status]++;
 const root=$('ticketCounts');root.replaceChildren();
 for(const [value,label] of [['all','Усього'],['new','Нові'],['in_progress','У роботі'],['resolved','Вирішені']]){
  const box=supportNode('div',undefined,'support-count '+value);
  box.append(supportNode('strong',counts[value]),supportNode('span',label));root.append(box);
 }
 const late=supportTickets.filter(supportOverdue).length;
 const overdueBox=supportNode('button',undefined,'support-count overdue');overdueBox.type='button';
 overdueBox.append(supportNode('strong',late),supportNode('span','Порушений строк'));
 overdueBox.addEventListener('click',()=>window.SvitloTicketWorkflow?.setView('overdue'));
 root.append(overdueBox);
}
function renderTicketList(){
 const root=$('ticketsList');root.replaceChildren();
 const q=$('ticketSearch').value.trim().toLocaleLowerCase('uk-UA'),status=$('ticketFilter').value,topic=$('ticketTopicFilter').value,priority=$('ticketPriorityFilter').value;
 const visible=supportTickets.filter(t=>(status==='all'||t.status===status)&&(topic==='all'||t.topic===topic)&&(priority==='all'||(t.priority||'normal')===priority)&&(!window.SvitloTicketWorkflow||window.SvitloTicketWorkflow.matches(t))&&(!q||[t.id,t.subject,t.message,t.queue,t.email,t.assignedTo,(t.tags||[]).join(' '),TICKET_TOPICS[t.topic],...(t.messages||[]).map(m=>m.text)].join(' ').toLocaleLowerCase('uk-UA').includes(q)));
 visible.sort((a,b)=>window.SvitloTicketWorkflow?window.SvitloTicketWorkflow.compare(a,b):(({new:0,in_progress:1,resolved:2}[a.status]??9)-({new:0,in_progress:1,resolved:2}[b.status]??9) || Number(b.priority==='high')-Number(a.priority==='high')||Date.parse(b.updatedAt||b.createdAt)-Date.parse(a.updatedAt||a.createdAt)));
 $('ticketsSummary').textContent='Показано '+visible.length+' із '+supportTickets.length+' звернень';
 if(!visible.length){root.append(supportNode('div',supportTickets.length?'Немає звернень за цими фільтрами.':'Поки немає звернень.','support-empty'));return}
 for(const item of visible){
  const card=supportNode('button',undefined,'ticket-row'+(item.id===supportSelected?' selected':''));card.type='button';card.setAttribute('aria-pressed',String(item.id===supportSelected));
  const top=supportNode('div',undefined,'ticket-row-head');
  top.append(supportNode('small',item.id),supportBadge(item.status));
  card.append(top,supportNode('strong',item.subject||TICKET_TOPICS[item.topic]||'Звернення'),supportNode('p',item.message));
  const meta=supportNode('div',undefined,'ticket-row-meta');meta.append(supportNode('span',supportDate(item.createdAt)));
  if(item.queue)meta.append(supportNode('span','Підчерга '+item.queue));
  if(item.assignedTo)meta.append(supportNode('span','Виконавець: '+item.assignedTo));
  if(item.dueAt)meta.append(supportNode('span','Контроль: '+supportDate(item.dueAt)));
  if(supportOverdue(item)){meta.append(supportNode('b','Порушено контрольний строк','support-overdue'));card.classList.add('is-overdue')}
  else if(item.status==='new'&&Date.now()-Date.parse(item.createdAt||'')>86400000)meta.append(supportNode('b','Потребує уваги понад добу','support-attention'));
    if(item.priority==='high')meta.append(supportNode('b','● Важливе'));
  if(item.messages?.length)meta.append(supportNode('span','↩ '+item.messages.length));
  card.append(meta);card.addEventListener('click',()=>{supportSelected=item.id;renderTicketList();renderTicketDetail();window.SvitloMobileAdmin?.openTicket()});root.append(card);
 }
}
function supportThreadEntry(item){
 const div=supportNode('div',undefined,'support-thread-entry '+(item.from==='admin'?'is-admin':''));
 const row=supportNode('div',undefined,'support-thread-title');
 row.append(supportNode('strong',item.from==='admin'?'Підтримка':'Користувач'),supportNode('time',supportDate(item.at)));
 div.append(row,supportNode('p',item.text));return div;
}
async function saveSupport(id,data,success){
 if(supportBusy)return false;supportBusy=true;
 try{
   const original=supportTickets.find(t=>t.id===id);
   if(original&&Number.isSafeInteger(original.revision))data={...data,expectedRevision:original.revision};
   await api('feedback/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(data)});
   await refreshTickets();
   if(success){$('ticketsSummary').textContent=success;$('ticketsSummary').classList.remove('support-error')}
   return true
 }catch(e){
   $('ticketsSummary').textContent='Не збережено: '+e.message;
   $('ticketsSummary').classList.add('support-error');
   if(/іншому сеансі|409/.test(e.message))await refreshTickets();
   return false
 }
 finally{supportBusy=false}
}
function renderTicketDetail(){
 const root=$('ticketDetail'),ticket=supportTickets.find(t=>t.id===supportSelected);root.replaceChildren();
 if(!ticket){root.append(supportNode('div','Оберіть звернення у списку, щоб переглянути історію та відповісти.','support-empty'));window.SvitloMobileAdmin?.decorateTicket(root,null);return}
 const top=supportNode('div',undefined,'support-detail-head'),info=supportNode('div');
 info.append(supportNode('small',ticket.id),supportNode('h3',ticket.subject||TICKET_TOPICS[ticket.topic]||'Звернення'));
 top.append(info,supportBadge(ticket.status));root.append(top);
 const meta=supportNode('div',undefined,'support-detail-meta');
 meta.append(supportNode('span','Створено '+supportDate(ticket.createdAt)),supportNode('span',TICKET_TOPICS[ticket.topic]||'Інше'));
 if(ticket.queue)meta.append(supportNode('span','Підчерга '+ticket.queue));
 if(Number.isInteger(ticket.rating))meta.append(supportNode('strong','Оцінка підтримки: '+ticket.rating+' / 5'));

 if(ticket.extra&&typeof ticket.extra==='object'){
  const extra=supportNode('section',undefined,'support-device-info');extra.append(supportNode('h4','Додаткові дані звернення'));
  for(const field of Object.values(ticket.extra)){if(!field||typeof field!=='object')continue;const row=supportNode('div',undefined,'support-device-row');
   row.append(supportNode('span',field.label||'Поле'),supportNode('strong',field.value||'Не зазначено'));extra.append(row)}
  root.append(extra)
 }
 const deviceInfo=supportNode('section',undefined,'support-device-info');
 deviceInfo.append(supportNode('h4','Інформація про пристрій'));
 if(ticket.diagnostics){
  const d=ticket.diagnostics;
  const labels=[['Пристрій',d.platform],['Система',d.os],['Браузер',d.browser],['Версія застосунку',d.appVersion||'Не визначена']];
  for(const [label,value] of labels){const line=supportNode('div',undefined,'support-device-row');line.append(supportNode('span',label),supportNode('strong',value||'Немає даних'));deviceInfo.append(line)}
 }else deviceInfo.append(supportNode('p','Технічні дані не надано. Користувач не підтвердив їх передавання або дані недоступні.'));

 if(ticket.email){const email=document.createElement('a');email.textContent=ticket.email;email.href='mailto:'+encodeURIComponent(ticket.email).replace(/%40/g,'@');meta.append(email)}
 root.append(meta,deviceInfo);
 const control=supportNode('div',undefined,'support-detail-controls');
 for(const [field,label,values] of [['status','Статус',TICKET_STATES],['priority','Пріоритет',TICKET_PRIORITY]]){
  const wrap=supportNode('label',label);const select=document.createElement('select');
  for(const [value,title] of Object.entries(values))select.add(new Option(title,value));
  select.value=field==='priority'?(ticket.priority||'normal'):ticket.status;
  select.disabled=adminRole==='viewer';
  select.addEventListener('change',async()=>{
   const chosen=select.value;select.disabled=true;
   if(!await saveSupport(ticket.id,{[field]:chosen},'Зміни збережено.')){select.value=ticket[field]||(field==='priority'?'normal':'new');select.disabled=false}
  });
  wrap.append(select);control.append(wrap);
 }
 root.append(control);
 const thread=supportNode('section',undefined,'support-thread');thread.append(supportNode('h4','Листування'));
 thread.append(supportThreadEntry({from:'user',text:ticket.message,at:ticket.createdAt}));
 for(const m of ticket.messages||[])thread.append(supportThreadEntry(m));
 root.append(thread);
 if(adminRole!=='viewer'){
  const compose=supportNode('section',undefined,'support-compose');compose.append(supportNode('h4','Відповідь користувачу'));
  const reply=document.createElement('textarea');reply.rows=4;reply.maxLength=1600;reply.placeholder='Напишіть відповідь. Користувач побачить її у «Мої звернення»…';reply.setAttribute('aria-label','Відповідь користувачу');reply.value=supportDrafts.get(ticket.id)||'';reply.addEventListener('input',()=>supportDrafts.set(ticket.id,reply.value));
  const templates=supportNode('div',undefined,'support-templates');
  for(const sample of supportTemplates){
   const button=supportNode('button',sample,'support-template');button.type='button';button.addEventListener('click',()=>{reply.value=sample;supportDrafts.set(ticket.id,reply.value);reply.dispatchEvent(new Event('input',{bubbles:true}));reply.focus()});templates.append(button);
  }
  const send=supportNode('button','Надіслати відповідь →','support-send');send.type='button';
  send.addEventListener('click',async()=>{
   const body=reply.value.trim();if(body.length<2){alert('Напишіть текст відповіді.');return}
   send.disabled=true;
   if(await saveSupport(ticket.id,{reply:body},'Відповідь збережено. Користувач може прочитати її у зверненні.')){supportDrafts.delete(ticket.id);renderTicketDetail()}else send.disabled=false;
  });
  compose.append(reply,templates,send);
  const notes=supportNode('div',undefined,'support-internal');notes.append(supportNode('h4','Внутрішня нотатка'),supportNode('p','Не відображається користувачу.'));
  const note=document.createElement('textarea');note.rows=3;note.maxLength=1600;note.value=noteDrafts.has(ticket.id)?noteDrafts.get(ticket.id):(ticket.internalNote||'');note.addEventListener('input',()=>noteDrafts.set(ticket.id,note.value));note.placeholder='Що вже перевірено, наступні кроки…';note.setAttribute('aria-label','Приватна нотатка');
  const save=supportNode('button','Зберегти нотатку','secondary');save.type='button';
  save.addEventListener('click',async()=>{save.disabled=true;if(await saveSupport(ticket.id,{internalNote:note.value},'Нотатку збережено.'))noteDrafts.delete(ticket.id);else save.disabled=false});
  notes.append(note,save);compose.append(notes);
  const tags=supportNode('div',undefined,'support-internal');tags.append(supportNode('h4','Теги звернення'));
  const tagInput=document.createElement('input');tagInput.type='text';tagInput.maxLength=500;tagInput.placeholder='потребує перевірки, адреса, терміново';tagInput.value=tagDrafts.has(ticket.id)?tagDrafts.get(ticket.id):(ticket.tags||[]).join(', ');tagInput.addEventListener('input',()=>tagDrafts.set(ticket.id,tagInput.value));
  tagInput.setAttribute('aria-label','Теги через кому');
  const saveTags=supportNode('button','Зберегти теги','secondary');saveTags.type='button';saveTags.onclick=async()=>{saveTags.disabled=true;if(await saveSupport(ticket.id,{tags:tagInput.value.split(',').map(v=>v.trim()).filter(Boolean).slice(0,12)},'Теги оновлено.'))tagDrafts.delete(ticket.id);else saveTags.disabled=false};
  tags.append(tagInput,saveTags);compose.append(tags);root.append(compose);
 }
 if(adminRole==='owner'||adminRole==='editor'){
  const remove=supportNode('button','Видалити назавжди','danger');remove.type='button';remove.className+=' support-delete';
  remove.addEventListener('click',async()=>{
   if(!confirm('Видалити звернення '+ticket.id+' разом із листуванням?'))return;
   remove.disabled=true;try{await api('feedback/'+encodeURIComponent(ticket.id),{method:'DELETE'});supportSelected='';await refreshTickets()}catch(e){alert(e.message);remove.disabled=false}
  });
  root.append(remove);
 }
 window.SvitloTicketEnhance?.(ticket,root,saveSupport);
 window.SvitloMobileAdmin?.decorateTicket(root,ticket);
}
window.betaAdminAdsApi=async(method='GET',settings)=>api('ads',{method,body:method==='PUT'?JSON.stringify(settings):undefined});
window.betaAdminUploadAdPhoto=async(file)=>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1900000)throw Error('PNG, JPG або WebP не більше 1,9 МБ');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Не вдалося прочитати файл'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file)});
 const result=await api('media',{method:'POST',body:JSON.stringify({mime:file.type,data})});
 return server.replace(/\/$/,'')+'/api/media/'+result.id;
};
let supportTemplates=['Дякуємо! Перевіряємо цю інформацію та повідомимо про результат.'];
function renderSupportTemplateEditor(){
 const box=$('adminReplyTemplates');if(!box)return;
 box.replaceChildren();if(adminRole==='viewer'||adminRole==='operator')return;
 box.append(supportNode('h4','Шаблони відповідей'));
 const list=supportNode('div',undefined,'reply-template-list');
 for(const [i,t] of supportTemplates.entries()){
  const row=supportNode('div',undefined,'reply-template-row');const input=document.createElement('textarea');input.rows=2;input.maxLength=1600;input.value=t;
  input.oninput=()=>{supportTemplates[i]=input.value};row.append(input);
  const del=supportNode('button','Видалити','secondary');del.type='button';del.onclick=()=>{supportTemplates.splice(i,1);renderSupportTemplateEditor()};row.append(del);list.append(row)
 }
 box.append(list);
 const add=supportNode('button','+ Додати шаблон','secondary');add.type='button';add.onclick=()=>{supportTemplates.push('Новий шаблон відповіді');renderSupportTemplateEditor()};
 const save=supportNode('button','Зберегти шаблони','support-send');save.type='button';
 save.onclick=async()=>{save.disabled=true;try{const result=await api('feedback/templates',{method:'PUT',body:JSON.stringify({templates:supportTemplates.filter(Boolean)})});supportTemplates=result.templates;renderSupportTemplateEditor()}catch(e){alert(e.message);save.disabled=false}};
 box.append(add,save)
}
let lastTicketsFingerprint='',ticketsReloading=false;
async function refreshTickets(){
 if(!remote||ticketsReloading)return;
 ticketsReloading=true;
 if(!supportTickets.length)$('ticketsSummary').textContent='Завантажуємо звернення…';
 try{
  const result=await api('feedback');
  const templ=await api('feedback/templates').catch(()=>({templates:supportTemplates}));
  const incoming=Array.isArray(result.items)?result.items:[];
  const templates=Array.isArray(templ.templates)?templ.templates:supportTemplates;
  const fingerprint=JSON.stringify([incoming,templates,result.capabilities||null]);
  if(fingerprint===lastTicketsFingerprint){
   $('ticketsSummary').classList.remove('support-error');
   return; // Preserve editors, scroll, filters and pane on unchanged data.
  }
  const listScroll=$('ticketsList').scrollTop,detailScroll=$('ticketDetail').scrollTop;
  lastTicketsFingerprint=fingerprint;
  supportTickets=incoming;supportTemplates=templates;
  window.SvitloTicketWorkflow?.sync(supportTickets,result.capabilities);renderSupportTemplateEditor();
  $('ticketsSummary').classList.remove('support-error');
  if(!supportTickets.some(t=>t.id===supportSelected))supportSelected=supportTickets[0]?.id||'';
  renderTicketCounts();renderTicketList();renderTicketDetail();
  $('ticketsList').scrollTop=listScroll;$('ticketDetail').scrollTop=detailScroll;
  document.dispatchEvent(new Event('svitlo:tickets-loaded'));
 }catch(e){$('ticketsSummary').textContent='Помилка завантаження: '+e.message}
 finally{ticketsReloading=false}
}
$('refreshTickets').addEventListener('click',refreshTickets);
document.addEventListener('svitlo:admin-logout',()=>{lastTicketsFingerprint='';supportDrafts.clear();noteDrafts.clear();tagDrafts.clear();supportTickets=[];supportSelected='';$('ticketsList').replaceChildren();$('ticketDetail').replaceChildren();window.SvitloTicketWorkflow?.reset()});
