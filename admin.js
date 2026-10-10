'use strict';
const $=id=>document.getElementById(id);
const FILES={overrides:'manual_overrides.json',schedules:'schedules.json',addresses:'addresses.json',streets:'published_street_fallback.json',emergency:'emergency.json'};
let server='',sessionToken='',sha='',current='',remote=false,canPublish=false,original=null,pushBusy=false;
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
async function load(){
 const kind=$('kind').value;
 try{
  let contents;
  if(remote&&canPublish){const r=await api('file?kind='+kind);contents=r.contents;sha=r.sha}
  else{const r=await fetch('./data/'+FILES[kind]+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Файл недоступний');contents=await r.json();sha=''}
  original=contents;current=kind;$('editor').value=JSON.stringify(contents,null,2);
  $('publish').disabled=!(remote&&canPublish);$('editMode').textContent=remote&&canPublish?'Серверний режим':'Локальна копія';message('Дані завантажено. Ручне редагування не вплине на застосунок до публікації.',true);
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
 remote=false;canPublish=false;sessionToken='';sha='';
 $('adminDashboard').hidden=true;$('adminLoginScreen').hidden=false;
 $('connection').textContent='Авторизовано';$('publish').disabled=true;
 $('password').value='';setPushReady(false);
 $('loginError').textContent='';$('password').focus();
}
$('loginForm').onsubmit=async event=>{
 event.preventDefault();
 const url=$('server').value.trim().replace(/\/$/,'');
 if(!/^https:\/\/[^\s/]+/.test(url)){$('loginError').textContent='Укажіть HTTPS-адресу Railway у налаштуваннях нижче.';return}
 const enteredPassword=$('password').value;
 $('connect').disabled=true;$('connect').textContent='Перевіряємо пароль…';$('loginError').textContent='';
 try{
   const response=await fetch(url+'/api/admin/login',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({password:enteredPassword})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.token)throw Error(result.error||'Помилка входу: HTTP '+response.status);
   server=url;sessionToken=result.token;
   // Verify session before revealing protected tools.
   const status=await api('status');
   remote=true;canPublish=!!status.editingEnabled;
   $('adminLoginScreen').hidden=true;$('adminDashboard').hidden=false;
   $('connection').textContent='Увійшли · '+(canPublish?'Push + GitHub':'Push');$('connection').className='pill ok';
   $('password').value='';setPushReady(true);
   await Promise.all([load(),diagnostics(),refreshPushStatus(),refreshTickets()]);
 }catch(e){sessionToken='';remote=false;canPublish=false;$('loginError').textContent=e.message;setPushReady(false)}
 finally{$('password').value='';$('connect').disabled=false;$('connect').textContent='Увійти до панелі →'}
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
(async()=>{try{const r=await fetch('./push-config.json',{cache:'no-store'});if(r.ok){const c=await r.json();if(c.apiBase)$('server').value=c.apiBase}}catch{} })();

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
function staged(o,s){$('editor').value=JSON.stringify(o,null,2);message(s+' Натисніть «Перевірити JSON», потім «Опублікувати» для збереження на GitHub.',true)}
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

// Feedback inbox: never use innerHTML for user-provided messages.
const TICKET_TOPICS={bug:'Помилка застосунку',address:'Адреса або підчерга',idea:'Пропозиція',other:'Інше'};
const TICKET_STATES={new:'Нове',in_progress:'У роботі',resolved:'Вирішено'};
async function refreshTickets(){
 if(!remote)return;
 const list=$('ticketsList');$('ticketsSummary').textContent='Завантажуємо…';
 try{
  const result=await api('feedback');list.replaceChildren();
  $('ticketsSummary').textContent='Усього звернень: '+result.count;
  if(!result.items.length){const empty=document.createElement('p');empty.className='ticket-empty';empty.textContent='Поки немає звернень.';list.append(empty);return}
  for(const ticket of result.items){
   const card=document.createElement('article');card.className='ticket';
   const head=document.createElement('div');head.className='ticket-head';
   const title=document.createElement('strong');title.textContent=(TICKET_TOPICS[ticket.topic]||'Звернення')+' · '+ticket.id;
   const date=document.createElement('span');date.className='ticket-date';date.textContent=new Date(ticket.createdAt).toLocaleString('uk-UA',{dateStyle:'medium',timeStyle:'short'});
   head.append(title,date);
   const body=document.createElement('p');body.className='ticket-text';body.textContent=ticket.message;
   const controls=document.createElement('div');controls.className='ticket-controls';
   const status=document.createElement('select');status.setAttribute('aria-label','Статус звернення '+ticket.id);
   for(const [key,label] of Object.entries(TICKET_STATES))status.add(new Option(label,key));status.value=ticket.status;
   status.addEventListener('change',async()=>{status.disabled=true;try{await api('feedback/'+encodeURIComponent(ticket.id),{method:'PATCH',body:JSON.stringify({status:status.value})});$('ticketsSummary').textContent='Статус збережено.'}catch(e){alert(e.message);status.value=ticket.status}finally{status.disabled=false}});
   const remove=document.createElement('button');remove.className='danger';remove.type='button';remove.textContent='Видалити';
   remove.addEventListener('click',async()=>{if(!confirm('Назавжди видалити звернення '+ticket.id+'?'))return;remove.disabled=true;try{await api('feedback/'+encodeURIComponent(ticket.id),{method:'DELETE'});await refreshTickets()}catch(e){alert(e.message);remove.disabled=false}});
   controls.append(status,remove);card.append(head,body);
   if(ticket.email){const email=document.createElement('p');email.className='ticket-mail';email.append('Для відповіді: ');const link=document.createElement('a');link.href='mailto:'+encodeURIComponent(ticket.email).replace(/%40/g,'@');link.textContent=ticket.email;email.append(link);card.append(email)}
   card.append(controls);list.append(card);
  }
 }catch(e){$('ticketsSummary').textContent='Не вдалося завантажити звернення: '+e.message}
}
$('refreshTickets').addEventListener('click',refreshTickets);
