'use strict';
const $=id=>document.getElementById(id);
const SAVED='svitlo-support-tickets-v1',DRAFT='svitlo-support-draft-v1';
const TOPICS={bug:'Помилка застосунку',address:'Адреса або підчерга',schedule:'Графік відключень',push:'Сповіщення',idea:'Пропозиція',other:'Інше'};
const HINTS={bug:'На якому екрані виникла помилка? Що саме не працює?',address:'Вкажіть населений пункт, назву вулиці та правильну підчергу, якщо знаєте її. Номер будинку необов’язковий.',schedule:'Вкажіть дату та підчергу. Якщо можливо, порівняйте з офіційним графіком.',push:'Уточніть, яке сповіщення не надійшло або прийшло двічі, та модель пристрою.',idea:'Розкажіть, як ця функція спростить використання застосунку.',other:'Опишіть ваше питання якомога конкретніше.'};
const STATUSES={new:'Нове',in_progress:'У роботі',resolved:'Вирішено'};
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
let saved=Array.isArray(read(SAVED,[]))?read(SAVED,[]):[];
let selectedTicket=null,lastSent=null,basePromise=null;
const safeTickets=()=>saved.filter(x=>x&&/^SC-[A-F0-9]{10}$/.test(x.id)&&(!x.token||/^[a-zA-Z0-9_-]{32,80}$/.test(x.token))).slice(0,60);
saved=safeTickets();
const storeTickets=()=>{try{localStorage.setItem(SAVED,JSON.stringify(saved))}catch{}};
function service(){
 if(basePromise)return basePromise;
 basePromise=fetch('./push-config.json',{cache:'no-store',signal:AbortSignal.timeout(10000)})
 .then(r=>{if(!r.ok)throw Error('Служба підтримки тимчасово недоступна.');return r.json()})
 .then(cfg=>{const url=new URL(String(cfg.apiBase||''));if(url.protocol!=='https:')throw Error('Неправильне підключення служби підтримки.');return url.origin})
 .catch(error=>{basePromise=null;throw error});
 return basePromise;
}
async function post(route,payload){
 const base=await service();
 const response=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(17000),body:JSON.stringify(payload)});
 const value=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(value.error||'Не вдалося зв’язатися з підтримкою.');
 return value;
}
function friendlyError(error){
 if(error?.name==='TimeoutError'||error?.name==='AbortError'||error instanceof TypeError)return 'Не вдалося підключитися. Перевірте інтернет і повторіть спробу.';
 return error?.message||'Помилка зв’язку із сервером.';
}
function alertAt(id,message,good=false){const el=$(id);el.textContent=message;el.hidden=false;el.classList.toggle('good',good)}
function chooseTab(name){
 const newer=name==='new';
 $('viewNew').hidden=!newer;$('viewTickets').hidden=newer;
 for(const [id,active] of [['tabNew',newer],['tabTickets',!newer]]){
  $(id).classList.toggle('selected',active);$(id).setAttribute('aria-selected',String(active));
 }
 if(!newer)renderSaved();
}
function setTopic(){
 const topic=$('topic').value;
 $('topicHint').textContent=HINTS[topic]||HINTS.other;
 $('message').placeholder=HINTS[topic]||HINTS.other;
}
function saveDraft(){
 const draft={topic:$('topic').value,subject:$('subject').value,queue:$('queue').value,email:$('email').value,message:$('message').value};
 try{sessionStorage.setItem(DRAFT,JSON.stringify(draft))}catch{}
 $('count').textContent=$('message').value.length+' / 2000';
}
function restoreDraft(){
 const draft=(()=>{try{return JSON.parse(sessionStorage.getItem(DRAFT)||'null')}catch{return null}})();
 if(draft){for(const id of ['topic','subject','queue','email','message'])if(typeof draft[id]==='string'&&$(id).tagName==='INPUT'||typeof draft?.[id]==='string'&&$(id).tagName==='TEXTAREA')$(id).value=draft[id];if(TOPICS[draft.topic])$('topic').value=draft.topic;if(/^[1-6]\.[12]$/.test(draft.queue||''))$('queue').value=draft.queue}
 else{
  try{
   const addresses=read('svitlo-addresses-v6',[]),prefs=read('svitlo-prefs-v6',{});
   const selected=addresses.find(x=>x.id===prefs.primaryId)||addresses[0];
   if(selected&&/^[1-6]\.[12]$/.test(selected.queue))$('queue').value=selected.queue;
  }catch{}
 }
 $('count').textContent=$('message').value.length+' / 2000';
 setTopic();
}
function statusNode(status){
 const el=document.createElement('span');
 el.className='support-status is-'+(STATUSES[status]?status:'new');
 el.textContent=STATUSES[status]||'Нове';return el;
}
function text(tag,value,cls){const el=document.createElement(tag);el.textContent=String(value||'');if(cls)el.className=cls;return el}
const displayDate=stamp=>{const n=Date.parse(stamp||'');return Number.isFinite(n)?new Date(n).toLocaleString('uk-UA',{dateStyle:'medium',timeStyle:'short'}):''};
function remember(receipt){
 const old=saved.find(x=>x.id===receipt.id);
 saved=saved.filter(x=>x.id!==receipt.id);
 saved.unshift({id:receipt.id,token:receipt.token||old?.token||'',createdAt:receipt.createdAt||old?.createdAt||new Date().toISOString(),topic:receipt.topic||old?.topic||'other',subject:receipt.subject||old?.subject||'',status:receipt.status||old?.status||'new'});
 saved=saved.slice(0,60);storeTickets();updateSavedCount();
}
function updateSavedCount(){
 $('savedCount').hidden=!saved.length;
 $('savedCount').textContent=String(saved.length);
}
function renderSaved(){
 const root=$('savedTickets');root.replaceChildren();
 if(!saved.length){const empty=text('div','','saved-empty');empty.append(text('strong','Тут поки порожньо'),text('p','Після першого звернення воно з’явиться тут автоматично.'));root.append(empty);return}
 for(const item of saved){
  const card=document.createElement('button');card.type='button';card.className='saved-ticket';
  card.append(text('span','✉','saved-ticket-icon'));
  const copy=text('div','','saved-ticket-copy');
  copy.append(text('strong',item.subject||TOPICS[item.topic]||'Звернення'),text('small',item.id+' · '+displayDate(item.createdAt)));
  card.append(copy,statusNode(item.status),'›');
  card.addEventListener('click',()=>openTicket(item.id));
  root.append(card);
 }
}
async function loadTicket(id,token){
 const payload={id};if(token)payload.token=token;
 return post('/api/ticket/status',payload);
}
function bubble(from,value,at){
 const box=text('div','','conversation-bubble'+(from==='admin'?' from-admin':''));
 box.append(text('strong',from==='admin'?'Підтримка «Світло Черкаси»':'Ви'),text('time',displayDate(at)),text('p',value));
 return box;
}
function showConversation(ticket){
 selectedTicket={id:ticket.id,token:saved.find(x=>x.id===ticket.id)?.token||''};
 $('ticketConversation').hidden=false;$('conversationId').textContent=ticket.id;
 $('conversationHeading').textContent=ticket.subject||TOPICS[ticket.topic]||'Ваше звернення';
 $('conversationStatus').replaceWith(Object.assign(statusNode(ticket.status),{id:'conversationStatus'}));
 $('conversationMeta').replaceChildren(text('span','Створено: '+displayDate(ticket.createdAt)),...(ticket.queue?[text('span','Підчерга '+ticket.queue)]:[]));
 const root=$('conversationMessages');root.replaceChildren();
 if(ticket.message){
  root.append(bubble('user',ticket.message,ticket.createdAt));
  for(const entry of ticket.messages||[])root.append(bubble(entry.from,entry.text,entry.at));
 }else root.append(text('p','Для старого звернення доступний лише статус. Для листування потрібен приватний код доступу.','support-alert'));
 $('replyForm').hidden=ticket.canReply!==true;
 $('conversationMessage').hidden=true;
 $('ticketConversation').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
async function openTicket(id){
 const item=saved.find(x=>x.id===id);if(!item)return;
 $('ticketConversation').hidden=false;$('conversationId').textContent=id;
 $('conversationHeading').textContent='Завантажуємо звернення…';
 $('conversationMessages').replaceChildren();
 try{
  const result=await loadTicket(id,item.token);
  item.status=result.status;storeTickets();renderSaved();showConversation(result);
 }catch(e){alertAt('conversationMessage',friendlyError(e));$('conversationHeading').textContent='Не вдалося отримати звернення';}
}
$('tabNew').addEventListener('click',()=>chooseTab('new'));
$('tabTickets').addEventListener('click',()=>chooseTab('tickets'));
$('topic').addEventListener('change',()=>{setTopic();saveDraft()});
for(const name of ['subject','queue','email','message'])$(name).addEventListener('input',saveDraft);
$('feedbackForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!$('feedbackForm').reportValidity())return;
 const message=$('message').value.trim();if(message.length<12){alertAt('formMessage','Опишіть ситуацію трохи детальніше (мінімум 12 символів).');return}
 const button=$('send');button.disabled=true;button.textContent='Надсилаємо…';$('formMessage').hidden=true;
 try{
  const payload={topic:$('topic').value,subject:$('subject').value.trim(),queue:$('queue').value,message,email:$('email').value.trim(),website:$('website').value};
  const result=await post('/api/feedback',payload);
  remember({...result,topic:payload.topic,subject:payload.subject});
  lastSent=result;
  $('ticketId').textContent=result.id;
  $('feedbackForm').hidden=true;$('success').hidden=false;
  try{sessionStorage.removeItem(DRAFT)}catch{}
 }catch(e){alertAt('formMessage',friendlyError(e))}
 finally{button.disabled=false;button.textContent='Надіслати звернення →'}
});
$('another').addEventListener('click',()=>{$('feedbackForm').reset();$('feedbackForm').hidden=false;$('success').hidden=true;$('formMessage').hidden=true;restoreDraft()});
$('openSent').addEventListener('click',()=>{if(!lastSent)return;chooseTab('tickets');openTicket(lastSent.id)});
$('copyReceipt').addEventListener('click',async()=>{
 if(!lastSent)return;
 const value='Світло Черкаси\nЗвернення: '+lastSent.id+'\nПриватний код: '+lastSent.token+'\nНе передавайте цей код стороннім.';
 try{await navigator.clipboard.writeText(value);$('copyReceipt').textContent='Скопійовано ✓'}catch{$('copyReceipt').textContent='Не вдалося скопіювати'}
});
$('refreshSaved').addEventListener('click',async()=>{
 const button=$('refreshSaved');button.disabled=true;button.textContent='Перевіряємо…';
 try{
  await Promise.all(saved.map(async item=>{try{const status=await loadTicket(item.id,item.token);item.status=status.status}catch{}}));
  storeTickets();renderSaved();
 }finally{button.disabled=false;button.textContent='Оновити статуси ↻'}
});
$('lookupForm').addEventListener('submit',async event=>{
 event.preventDefault();const id=$('lookupId').value.trim().toUpperCase(),token=$('lookupToken').value.trim();
 if(!/^SC-[A-F0-9]{10}$/.test(id)){alertAt('lookupMessage','Перевірте номер звернення, наприклад SC-12AB34CD56.');return}
 $('lookupMessage').hidden=true;
 try{
  const result=await loadTicket(id,token);
  remember({id,token,topic:result.topic,subject:result.subject,status:result.status,createdAt:result.createdAt});
  renderSaved();showConversation(result);$('lookupForm').reset();
 }catch(e){alertAt('lookupMessage',friendlyError(e))}
});
$('closeConversation').addEventListener('click',()=>{$('ticketConversation').hidden=true;selectedTicket=null});
$('replyForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!selectedTicket?.token||!$('replyForm').reportValidity())return;
 const button=$('sendReply');button.disabled=true;button.textContent='Надсилаємо…';$('conversationMessage').hidden=true;
 try{
  await post('/api/ticket/reply',{id:selectedTicket.id,token:selectedTicket.token,message:$('replyMessage').value.trim()});
  const id=selectedTicket.id;$('replyForm').reset();await openTicket(id);
  alertAt('conversationMessage','Доповнення надіслано. Підтримка побачить його у зверненні.',true);
 }catch(e){alertAt('conversationMessage',friendlyError(e))}
 finally{button.disabled=false;button.textContent='Надіслати →'}
});
const topicQuery=new URLSearchParams(location.search).get('topic');if(TOPICS[topicQuery])$('topic').value=topicQuery;
restoreDraft();if(TOPICS[topicQuery]){$('topic').value=topicQuery;setTopic()}
updateSavedCount();
if(new URLSearchParams(location.search).get('tab')==='tickets')chooseTab('tickets');
