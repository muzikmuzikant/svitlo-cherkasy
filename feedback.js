'use strict';
const $=id=>document.getElementById(id);
const SAVED='svitlo-support-tickets-v1',DRAFT='svitlo-support-draft-v1';
const TOPICS={bug:'Помилка застосунку',address:'Адреса або підчерга',schedule:'Графік відключень',push:'Сповіщення',idea:'Пропозиція',other:'Інше'};
const HINTS={bug:'На якому екрані виникла помилка? Що саме не працює?',address:'Вкажіть населений пункт, назву вулиці та правильну підчергу, якщо знаєте її. Номер будинку необов’язковий.',schedule:'Вкажіть дату та підчергу. Якщо можливо, порівняйте з офіційним графіком.',push:'Уточніть, яке сповіщення не надійшло або прийшло двічі, та модель пристрою.',idea:'Розкажіть, як ця функція спростить використання застосунку.',other:'Опишіть ваше питання якомога конкретніше.'};
const STATUSES={new:'Нове',in_progress:'У роботі',resolved:'Вирішено'};
let customCategories=null;
let mediaAvailable=false;
function enableMediaForms(allowed){
 mediaAvailable=allowed===true;
 for(const [section,input,status] of [['newTicketMediaSection','newTicketFiles','newTicketFileStatus'],['replyTicketMediaSection','replyTicketFiles','replyTicketFileStatus']]){
  if($(section)){
   $(section).hidden=false;
   $(section).classList.toggle('ticket-media-unavailable',!mediaAvailable);
  }
  if($(input))$(input).disabled=!mediaAvailable;
  if($(status)&&!mediaAvailable){
   $(status).textContent='Фото та відео тимчасово недоступні. Чекаємо оновлення сервера підтримки.';
  }else if($(status)&&mediaAvailable&&$(status).textContent.includes('тимчасово недоступні')){
   $(status).textContent='';
  }
 }
 for(const id of ['newTicketMediaRetry','replyTicketMediaRetry'])if($(id))$(id).hidden=mediaAvailable;
}

function selectedCategory(){return customCategories?.find(c=>c.id===$('topic').value)||null}
function renderExtraFields(){
 const root=$('extraTicketFields');if(!root)return;root.replaceChildren();
 const cat=selectedCategory();if(!cat)return;
 for(const field of cat.fields||[]){
  const wrap=document.createElement('label');wrap.className='extra-ticket-field';
  const label=document.createElement('span');label.textContent=field.label+(field.required?' *':'');wrap.append(label);
  const inp=field.type==='select'?document.createElement('select'):document.createElement('input');
  inp.dataset.key=field.id;inp.dataset.type=field.type;
  if(field.type==='select'){inp.append(new Option('Оберіть варіант',''));for(const option of field.options||[])inp.append(new Option(option,option))}
  else if(field.type==='checkbox')inp.type='checkbox';else{inp.type='text';inp.maxLength=200}
  inp.required=field.required;wrap.append(inp);root.append(wrap);
 }
}
async function loadTicketCategories(){
 try{
  const base=await service();const r=await fetch(base+'/api/feedback/categories',{cache:'no-store'});
  if(!r.ok)return;const data=await r.json();enableMediaForms(data.capabilities?.attachments===true);
   if(!data.categories?.length)return;
  customCategories=data.categories;const previous=$('topic').value;$('topic').replaceChildren();
  for(const c of customCategories){TOPICS[c.id]=c.title;HINTS[c.id]=c.hint||c.title;$('topic').append(new Option(c.title,c.id))}
  if(customCategories.some(c=>c.id===previous))$('topic').value=previous;
  setTopic();
 }catch(e){enableMediaForms(false);console.warn('Feedback categories:',e.message)}
}

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
let saved=Array.isArray(read(SAVED,[]))?read(SAVED,[]):[];
let selectedTicket=null,lastSent=null,basePromise=null;
let initialFiles=null,replyFiles=null;
const filesApi=()=>window.SvitloTicketMedia;
const CHAT_REFRESH_MS=4500;
let chatRequestBusy=false,chatFingerprint='',chatGeneration=0;
const ticketFingerprint=t=>JSON.stringify([
 t.status,t.updatedAt,t.rating,t.canReply,
 (t.messages||[]).map(m=>[m.id,m.from,m.text,m.at,(m.attachments||[]).map(a=>a.id)]),
 (t.attachments||[]).map(a=>a.id)
]);
function chatIndicator(message,mode='ok'){
 const el=$('chatLiveStatus');if(!el)return;
 el.textContent=message;el.dataset.state=mode;
}
function updateSavedStatus(ticket){
 const item=saved.find(x=>x.id===ticket.id);
 if(item&&item.status!==ticket.status){item.status=ticket.status;storeTickets()}
}
async function refreshOpenChat(){
 if(chatRequestBusy||document.hidden||$('viewTickets').hidden||$('ticketConversation').hidden||!selectedTicket?.token)return;
 const id=selectedTicket.id,token=selectedTicket.token,generation=chatGeneration;
 chatRequestBusy=true;
 try{
  const ticket=await loadTicket(id,token);
  if(generation!==chatGeneration||selectedTicket?.id!==id||$('ticketConversation').hidden)return;
  const hash=ticketFingerprint(ticket);
  chatIndicator('На зв’язку · оновлено '+new Date().toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}));
  if(hash===chatFingerprint)return;
  chatFingerprint=hash;
  updateSavedStatus(ticket);
  const root=$('conversationMessages');
  const entries=[...(ticket.message?[{id:'initial',from:'user',text:ticket.message,at:ticket.createdAt,attachments:ticket.attachments||[]}]:[]),...(ticket.messages||[])];
  const existing=[...root.querySelectorAll('.conversation-bubble')];
  const isPrefix=existing.length<=entries.length&&existing.every((node,i)=>node.dataset.messageKey===String(entries[i].id||i));
  if(isPrefix){
   const nearBottom=(document.scrollingElement?.scrollHeight-(window.scrollY+window.innerHeight)<360)&&
    document.activeElement!==$('replyMessage');
   for(const [i,entry] of entries.entries()){
    if(i<existing.length)continue;
    const node=bubble(entry.from,entry.text,entry.at,entry.attachments||[],id,token);node.dataset.messageKey=String(entry.id||i);
    root.append(node);
   }
   if(nearBottom&&entries.length>existing.length)root.lastElementChild?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }else{
   root.replaceChildren();
   entries.forEach((entry,i)=>{const node=bubble(entry.from,entry.text,entry.at,entry.attachments||[],id,token);node.dataset.messageKey=String(entry.id||i);root.append(node)});
  }
  $('conversationStatus').replaceWith(Object.assign(statusNode(ticket.status),{id:'conversationStatus'}));
  $('ticketRating').hidden=ticket.canReply!==true||ticket.status!=='resolved';
  $('ticketRatingOptions').hidden=!!ticket.rating;
  $('replyForm').hidden=ticket.canReply!==true;
  if(!$('viewTickets').classList.contains('is-reading'))renderSaved();
 }catch(error){
  if(generation!==chatGeneration)return;
  if(wasDeleted(error)){forgetDeletedTicket(id);return}
  chatIndicator('З’єднання нестабільне · повторюємо перевірку','error');
 }finally{chatRequestBusy=false}
}
setInterval(()=>{void refreshOpenChat()},CHAT_REFRESH_MS);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshOpenChat()});
window.addEventListener('online',()=>{void refreshOpenChat();scanVisibleReceipts(8)});
window.addEventListener('focus',()=>{void refreshOpenChat();scanVisibleReceipts(8)});
$('chatRefresh')?.addEventListener('click',()=>void refreshOpenChat());

const safeTickets=()=>saved.filter(x=>x&&/^SC-[A-F0-9]{10}$/.test(x.id)&&(!x.token||/^[a-zA-Z0-9_-]{32,80}$/.test(x.token))).slice(0,60);
saved=safeTickets();
const storeTickets=()=>{try{localStorage.setItem(SAVED,JSON.stringify(saved))}catch{}};
// Only an authenticated lookup returning an exact missing-ticket 404 may
// remove a receipt. Temporary network, session and throttling failures do not.
const wasDeleted=error=>error?.status===404&&error?.message==='Звернення не знайдено.';
function syncSavedReceipts(){
 const current=read(SAVED,[]);
 saved=Array.isArray(current)?current:[];
 saved=safeTickets();
 if(selectedTicket&&!saved.some(row=>row.id===selectedTicket.id)){
  chatGeneration++;chatFingerprint='';
  selectedTicket=null;
  $('ticketConversation').hidden=true;
  $('viewTickets').classList.remove('is-reading');
  const notice=$('supportTicketsNotice');
  if(notice){notice.textContent='Це звернення видалено службою підтримки. Воно більше не доступне.';notice.hidden=false}
 }
 updateSavedCount();renderSaved();
}
function forgetDeletedTicket(id){
 if(!/^SC-[A-F0-9]{10}$/.test(id))return;
 const handled=window.SvitloSupportInbox?.forgetDeleted?.(id);
 if(!handled){
  const current=read(SAVED,[]);
  if(Array.isArray(current)&&current.some(row=>row?.id===id)){
   try{localStorage.setItem(SAVED,JSON.stringify(current.filter(row=>row?.id!==id)))}catch{}
  }
 }
 syncSavedReceipts();
}
window.addEventListener('svitlo:support-ticket-deleted',event=>{
 if(!event.detail?.id)return;
 syncSavedReceipts();
 if(!$('viewTickets').hidden){
  const notice=$('supportTicketsNotice');
  if(notice){notice.textContent='Видалене службою підтримки звернення прибрано з вашого списку.';notice.hidden=false}
 }
});
window.addEventListener('storage',event=>{
 if(event.key===SAVED||event.key===null)syncSavedReceipts();
});
function scanVisibleReceipts(limit=4){
 if(document.hidden||$('viewTickets').hidden||!$('ticketConversation').hidden)return;
 window.SvitloSupportInbox?.scan?.({limit})?.catch?.(()=>{});
}
setInterval(()=>scanVisibleReceipts(4),20000);

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
 const response=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(payload?.attachments?.length||route==='/api/ticket/attachment'?90_000:17000),body:JSON.stringify(payload)});
 const value=await response.json().catch(()=>({}));
 if(!response.ok){
  const error=new Error(value.error||'Не вдалося зв’язатися з підтримкою.');
  error.status=response.status;
  throw error;
 }
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
 if(newer){chatGeneration++;$('viewTickets').classList.remove('is-reading');$('ticketConversation').hidden=true;selectedTicket=null;}
 if(!newer){syncSavedReceipts();scanVisibleReceipts(8)}
}
function setTopic(){
 const topic=$('topic').value;
 $('topicHint').textContent=HINTS[topic]||HINTS.other;
 $('message').placeholder=HINTS[topic]||HINTS.other;
 renderExtraFields();
}
function saveDraft(){
 const draft={topic:$('topic').value,subject:$('subject').value,queue:$('queue').value,email:$('email').value,message:$('message').value};
 try{sessionStorage.setItem(DRAFT,JSON.stringify(draft))}catch{}
 $('count').textContent=$('message').value.length+' / 2000';
}
function restoreDraft(){
 const draft=(()=>{try{return JSON.parse(sessionStorage.getItem(DRAFT)||'null')}catch{return null}})();
 if(draft){for(const id of ['subject','email','message'])if(typeof draft[id]==='string')$(id).value=draft[id];if(TOPICS[draft.topic])$('topic').value=draft.topic;if(/^[1-6]\.[12]$/.test(draft.queue||''))$('queue').value=draft.queue}
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
  copy.append(text('strong',item.subject||TOPICS[item.topic]||'Звернення'),text('small',displayDate(item.createdAt)));
  card.append(copy,statusNode(item.status),'›');
  card.addEventListener('click',()=>openTicket(item.id));
  root.append(card);
 }
}
async function loadTicket(id,token){
 const payload={id};if(token)payload.token=token;
 return post('/api/ticket/status',payload);
}
function bubble(from,value,at,attachments=[],ticketId=selectedTicket?.id,token=selectedTicket?.token){
 const box=text('div','','conversation-bubble'+(from==='admin'?' from-admin':''));
 box.append(text('strong',from==='admin'?'Підтримка «Світло Черкаси»':'Ви'),text('time',displayDate(at)));
 if(value)box.append(text('p',value));
 if(attachments.length){
  const view=filesApi()?.render(attachments,attachmentId=>post('/api/ticket/attachment',{id:ticketId,token,attachmentId}));
  if(view)box.append(view);
 }
 return box;
}
function showConversation(ticket){
 selectedTicket={id:ticket.id,token:saved.find(x=>x.id===ticket.id)?.token||''};
 chatFingerprint=ticketFingerprint(ticket);
 $('viewTickets').classList.add('is-reading');
 $('ticketConversation').hidden=false;$('conversationId').textContent=ticket.id;
 $('conversationHeading').textContent=ticket.subject||TOPICS[ticket.topic]||'Ваше звернення';
 $('conversationStatus').replaceWith(Object.assign(statusNode(ticket.status),{id:'conversationStatus'}));
 $('conversationMeta').replaceChildren(text('span','Створено: '+displayDate(ticket.createdAt)),...(ticket.queue?[text('span','Підчерга '+ticket.queue)]:[]));
 const root=$('conversationMessages');root.replaceChildren();
 if(ticket.message){
  const first=bubble('user',ticket.message,ticket.createdAt,ticket.attachments||[],ticket.id,selectedTicket.token);first.dataset.messageKey='initial';root.append(first);
  for(const [i,entry] of (ticket.messages||[]).entries()){const node=bubble(entry.from,entry.text,entry.at,entry.attachments||[],ticket.id,selectedTicket.token);node.dataset.messageKey=String(entry.id||i);root.append(node)}
 }else root.append(text('p','Для старого звернення доступний лише статус. Для листування потрібен приватний код доступу.','support-alert'));
 $('ticketRating').hidden=ticket.canReply!==true||ticket.status!=='resolved';
 $('ticketRatingOptions').hidden=!!ticket.rating;
 $('ratingNotice').textContent=ticket.rating?'Ваша оцінка: '+ticket.rating+' із 5. Дякуємо!':'';
 $('replyForm').hidden=ticket.canReply!==true;
 $('conversationMessage').hidden=true;
 /* Preserve scroll position when a reply or a status is refreshed. */
}
$('ticketRatingOptions')?.addEventListener('click',async event=>{
 const button=event.target.closest('button[data-rating]');if(!button||!selectedTicket?.token)return;
 const rating=Number(button.dataset.rating);
 if(!Number.isInteger(rating)||rating<1||rating>5)return;
 button.disabled=true;$('ratingNotice').textContent='Зберігаємо оцінку…';
 try{const id=selectedTicket.id;await post('/api/ticket/rate',{id,token:selectedTicket.token,rating});
  await openTicket(id);$('ratingNotice').textContent='Дякуємо за оцінку!'
 }catch(error){$('ratingNotice').textContent=friendlyError(error)}
 finally{button.disabled=false}
});
async function openTicket(id){
 const notice=$('supportTicketsNotice');if(notice)notice.hidden=true;
 const item=saved.find(x=>x.id===id);if(!item)return;
 const changingCase=selectedTicket?.id!==id;
 const requestGeneration=++chatGeneration;
 if(changingCase)chatFingerprint='';
 $('viewTickets').classList.add('is-reading');
 $('ticketConversation').hidden=false;$('conversationId').textContent=id;
 $('conversationHeading').textContent='Завантажуємо звернення…';
 $('conversationMessages').replaceChildren();
 try{
  const result=await loadTicket(id,item.token);
  if(requestGeneration!==chatGeneration)return;
  item.status=result.status;storeTickets();renderSaved();showConversation(result);
  chatIndicator('На зв’язку · повідомлення оновлюються автоматично');
  if(changingCase)$('viewTickets').scrollIntoView({block:'start',behavior:'auto'});
 }catch(e){if(requestGeneration===chatGeneration){
  if(wasDeleted(e)){forgetDeletedTicket(id);return}
  alertAt('conversationMessage',friendlyError(e));$('conversationHeading').textContent='Не вдалося отримати звернення';
 }}
}
$('tabNew').addEventListener('click',()=>chooseTab('new'));
$('tabTickets').addEventListener('click',()=>chooseTab('tickets'));
$('topic').addEventListener('change',()=>{setTopic();saveDraft()});
for(const name of ['subject','queue','email','message'])$(name).addEventListener('input',saveDraft);
function coarseDiagnostics(){
 const ua=navigator.userAgent||'';
 const platform=/iPad/i.test(ua)?'iPad':/iPhone|iPod/i.test(ua)?'iPhone':/Android/i.test(ua)?'Android':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Інше';
 const osName=platform==='iPhone'?'iOS':platform==='iPad'?'iPadOS':platform==='Android'?'Android':platform==='Windows'?'Windows':platform==='macOS'?'macOS':platform==='Linux'?'Linux':'Інше';
 const osMatch=ua.match(platform==='iPhone'||platform==='iPad'?/OS (\d{1,2})[_\d]*/:platform==='Android'?/Android (\d{1,2})/:platform==='Windows'?/Windows NT (\d+)\./:platform==='macOS'?/Mac OS X (\d{1,2})[_\d]*/:/$^/);
 const os=osName+(osMatch?' '+osMatch[1]:'');
 const browser=/Edg\//.test(ua)?'Edge':/SamsungBrowser\//.test(ua)?'Samsung Internet':/Firefox|FxiOS/.test(ua)?'Firefox':/CriOS|Chrome\//.test(ua)?'Chrome':/Safari|AppleWebKit/.test(ua)?'Safari':'Інше';
 const appVersion=document.querySelector('meta[name="svitlo-version"]')?.content||'';
 return {platform,os,browser,appVersion:/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(appVersion)?appVersion:''};
}
function updateDiagnosticsPreview(){
 const checked=$('includeDiagnostics')?.checked===true;
 const p=$('diagnosticsPreview');if(!p)return;
 const d=coarseDiagnostics();
 p.textContent=checked?'Буде передано: '+[d.platform,d.os,d.browser,d.appVersion&&('версія '+d.appVersion)].filter(Boolean).join(' · '):'Технічна інформація не надсилається без вашої згоди.';
}
$('includeDiagnostics')?.addEventListener('change',updateDiagnosticsPreview);
loadTicketCategories();
updateDiagnosticsPreview();
enableMediaForms(false);
for(const id of ['newTicketMediaRetry','replyTicketMediaRetry'])$(id)?.addEventListener('click',()=>void loadTicketCategories());
window.addEventListener('online',()=>void loadTicketCategories());
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!mediaAvailable)void loadTicketCategories()});
initialFiles=filesApi()?.picker($('newTicketFiles'),$('newTicketFilePreview'),$('newTicketFileStatus'));
replyFiles=filesApi()?.picker($('replyTicketFiles'),$('replyTicketFilePreview'),$('replyTicketFileStatus'));
$('feedbackForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!$('feedbackForm').reportValidity())return;
 const message=$('message').value.trim();if(message.length<12){alertAt('formMessage','Опишіть ситуацію трохи детальніше (мінімум 12 символів).');return}
 const button=$('send');button.disabled=true;button.textContent='Надсилаємо…';$('formMessage').hidden=true;
 try{
  const payload={topic:$('topic').value,subject:$('subject').value.trim(),queue:$('queue').value,message,email:$('email').value.trim(),website:$('website').value};
  const extraFields=[...document.querySelectorAll('#extraTicketFields [data-key]')];
  if(extraFields.length){payload.extra={};for(const inp of extraFields){payload.extra[inp.dataset.key]=inp.dataset.type==='checkbox'?inp.checked:inp.value.trim()}}
  if($('includeDiagnostics')?.checked){payload.includeDiagnostics=true;payload.diagnostics=coarseDiagnostics()}
  if(initialFiles?.count())payload.attachments=await initialFiles.collect();
  const result=await post('/api/feedback',payload);
  if(payload.attachments?.length&&result.attached!==payload.attachments.length){
   // A stale server must never make us claim media was received.
   remember({...result,topic:payload.topic,subject:payload.subject});
   alertAt('formMessage','Звернення створено, але сервер не підтвердив вкладення. Перевірте звернення перед повторним надсиланням.');
   return;
  }
  remember({...result,topic:payload.topic,subject:payload.subject});
  window.dispatchEvent(new CustomEvent('svitlo:support-receipt-saved',{detail:{id:result.id,token:result.token,status:'new'}}));
  lastSent=result;initialFiles?.clear();
  $('ticketId').textContent=result.id;
  $('feedbackForm').hidden=true;$('success').hidden=false;
  try{sessionStorage.removeItem(DRAFT)}catch{}
 }catch(e){alertAt('formMessage',friendlyError(e))}
 finally{button.disabled=false;button.textContent='Надіслати звернення →'}
});
$('another').addEventListener('click',()=>{initialFiles?.clear();$('feedbackForm').reset();updateDiagnosticsPreview();$('feedbackForm').hidden=false;$('success').hidden=true;$('formMessage').hidden=true;restoreDraft()});
$('openSent').addEventListener('click',()=>{if(!lastSent)return;chooseTab('tickets');openTicket(lastSent.id)});
$('copyReceipt').addEventListener('click',async()=>{
 if(!lastSent)return;
 const value='Світло Черкаси\nЗвернення: '+lastSent.id+'\nПриватний код: '+lastSent.token+'\nНе передавайте цей код стороннім.';
 try{await navigator.clipboard.writeText(value);$('copyReceipt').textContent='Скопійовано ✓'}catch{$('copyReceipt').textContent='Не вдалося скопіювати'}
});
$('refreshSaved').addEventListener('click',async()=>{
 const button=$('refreshSaved');button.disabled=true;button.textContent='Перевіряємо…';
 try{
  const copies=saved.slice();
  await Promise.all(copies.map(async item=>{
   try{
    const result=await loadTicket(item.id,item.token);
    const actual=saved.find(row=>row.id===item.id);
    if(actual)actual.status=result.status;
   }catch(error){if(wasDeleted(error))forgetDeletedTicket(item.id)}
  }));
  storeTickets();updateSavedCount();renderSaved();
 }finally{button.disabled=false;button.textContent='Оновити статуси ↻'}
});
$('lookupForm')?.addEventListener('submit',async event=>{
 event.preventDefault();const id=$('lookupId').value.trim().toUpperCase(),token=$('lookupToken').value.trim();
 if(!/^SC-[A-F0-9]{10}$/.test(id)){alertAt('lookupMessage','Перевірте номер звернення, наприклад SC-12AB34CD56.');return}
 $('lookupMessage').hidden=true;
 try{
  const result=await loadTicket(id,token);
  remember({id,token,topic:result.topic,subject:result.subject,status:result.status,createdAt:result.createdAt});
  window.dispatchEvent(new CustomEvent('svitlo:support-receipt-saved',{detail:{id,token,status:result.status,ticket:result}}));
  renderSaved();showConversation(result);$('lookupForm').reset();
 }catch(e){alertAt('lookupMessage',friendlyError(e))}
});
$('closeConversation').addEventListener('click',()=>{chatGeneration++;chatFingerprint='';$('ticketConversation').hidden=true;$('viewTickets').classList.remove('is-reading');selectedTicket=null;renderSaved();});
$('replyForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!selectedTicket?.token||!$('replyForm').reportValidity())return;
 if($('replyMessage').value.trim().length<3&&!replyFiles?.count()){alertAt('conversationMessage','Напишіть повідомлення або прикріпіть файл.');return}
 const button=$('sendReply');button.disabled=true;button.textContent='Надсилаємо…';$('conversationMessage').hidden=true;
 try{
  const payload={id:selectedTicket.id,token:selectedTicket.token,message:$('replyMessage').value.trim()};
  if(replyFiles?.count())payload.attachments=await replyFiles.collect();
  const result=await post('/api/ticket/reply',payload);
  if(payload.attachments?.length&&result.attached!==payload.attachments.length){
   const id=selectedTicket.id;await openTicket(id);
   alertAt('conversationMessage','Повідомлення надіслано, але сервер не підтвердив вкладення. Перевірте історію перед повторним надсиланням.');
   return;
  }
  const id=selectedTicket.id;$('replyForm').reset();replyFiles?.clear();await openTicket(id);
  alertAt('conversationMessage','Доповнення надіслано. Підтримка побачить його у зверненні.',true);
 }catch(e){if(wasDeleted(e))forgetDeletedTicket(selectedTicket?.id||'');
  else alertAt('conversationMessage',friendlyError(e))}
 finally{button.disabled=false;button.textContent='Надіслати →'}
});
const topicQuery=new URLSearchParams(location.search).get('topic');if(TOPICS[topicQuery])$('topic').value=topicQuery;
restoreDraft();if(TOPICS[topicQuery]){$('topic').value=topicQuery;setTopic()}
updateSavedCount();
const ticketParams=new URLSearchParams(location.search);
if(ticketParams.get('tab')==='tickets'||ticketParams.has('ticket'))chooseTab('tickets');
const linkedTicket=ticketParams.get('ticket');
if(linkedTicket&&/^SC-[A-F0-9]{10}$/.test(linkedTicket)&&saved.some(x=>x.id===linkedTicket&&VALID_TOKEN_HELPER(x.token))){
 openTicket(linkedTicket).catch(console.warn);
}
function VALID_TOKEN_HELPER(value){return /^[a-zA-Z0-9_-]{32,80}$/.test(String(value||''))}
