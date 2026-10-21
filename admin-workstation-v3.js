/* Svitlo Office V3 beta. Focused workflow, no GitHub token in the browser.
   Read all correspondence from authenticated Railway APIs. No local storage of
   letters, identifiers, email addresses or drafts. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const dashboard=$('adminDashboard'),feedback=dashboard?.querySelector('[data-admin-panel="feedback"]');
 if(!dashboard||!feedback)return;
 const mk=(tag,content,cls)=>{const el=document.createElement(tag);if(content!==undefined)el.textContent=String(content);if(cls)el.className=cls;return el};
 const goto=id=>dashboard.querySelector('[data-admin-tab="'+id+'"]')?.click();
 const api=(route,opts)=>window.svitloAdminApi(route,opts);
 const list=()=>window.SvitloTicketWorkflow?.list()||[];
 let activeSheet='overview',drawer=false,selected=new Set(),busy=false,refreshing=false,actor='',focusReturn=null;
 const role=()=>document.body.dataset.adminRole||'viewer';
 const writable=()=>role()!=='viewer';
 const bulk=mk('section',undefined,'desk-bulk');bulk.hidden=true;bulk.setAttribute('aria-live','polite');
 const bulkCount=mk('strong','0 вибрано');
 const bulkAction=mk('select');bulkAction.setAttribute('aria-label','Масова дія зі зверненнями');
 for(const [v,t] of [['','Оберіть дію'],['in_progress','Взяти в роботу'],['resolved','Завершити'],['new','Повернути до нових'],['high','Високий пріоритет'],['normal','Звичайний пріоритет']])bulkAction.add(new Option(t,v));
 const bulkRun=mk('button','Застосувати','support-send');bulkRun.type='button';
 const bulkCancel=mk('button','Скасувати вибір','secondary');bulkCancel.type='button';
 const bulkResult=mk('span','','desk-bulk-status');bulkResult.setAttribute('role','status');
 bulk.append(bulkCount,bulkAction,bulkRun,bulkCancel,bulkResult);
 const toolbar=feedback.querySelector('.support-toolbar');
 toolbar?.after(bulk);
 const quick=mk('div',undefined,'desk-tools');
 const workButtons=[
  {id:'refresh',label:'Оновити',action:()=>window.refreshTickets?.()},
  {id:'new',label:'Нові',action:()=>window.SvitloTicketWorkflow?.setView('new')},
  {id:'await',label:'Очікують відповіді',action:()=>window.SvitloTicketWorkflow?.setView('unanswered')},
  {id:'work',label:'Доручення',action:()=>goto('registry')}
 ];
 for(const item of workButtons){const button=mk('button',item.label,'desk-tool');button.type='button';button.onclick=item.action;quick.append(button)}
 const title=feedback.querySelector('.headline');
 title?.after(quick);
 const detailed=$('ticketDetail'),ticketList=$('ticketsList'),ticketWorkspace=feedback.querySelector('.support-workspace');
 const listTop=mk('div',undefined,'desk-list-top');
 const listHeading=mk('strong','Вхідні звернення');
 const selectAll=mk('label',undefined,'desk-select-all');
 const choose=mk('input');choose.type='checkbox';choose.setAttribute('aria-label','Вибрати всі видимі звернення');
 selectAll.append(choose,mk('span','Вибрати видимі'));
 listTop.append(listHeading,selectAll);
 ticketList.before(listTop);
 const listPane=mk('div',undefined,'desk-list-pane');
 listPane.append(listTop,ticketList);
 ticketWorkspace.prepend(listPane);
 // Improve existing details instead of duplicating, losing their secure handlers.
 const enhancement=window.SvitloTicketEnhance;
 const ticketTabs=[['overview','Звернення'],['conversation','Листування'],['processing','Опрацювання'],['history','Історія']];
 function detailV3(ticket,detail,save){
  enhancement?.(ticket,detail,save);
  detail.classList.add('desk-ticket');
  const title=detail.querySelector('.support-detail-head');
  const meta=detail.querySelector('.support-detail-meta');
  const device=detail.querySelector('.support-device-info');
  const controls=detail.querySelector('.support-detail-controls');
  const route=detail.querySelector('.office-correspondence-route');
  const convo=detail.querySelector('.support-thread');
  const composer=detail.querySelector('.support-compose');
  const remove=detail.querySelector('.support-delete');
  const allExtra=[...detail.querySelectorAll(':scope > .support-device-info')];
  const main=mk('section',undefined,'desk-pane');main.dataset.deskPane='overview';
  for(const block of [title,meta,...allExtra,controls])if(block)main.append(block);
  const conversation=mk('section',undefined,'desk-pane');conversation.dataset.deskPane='conversation';
  for(const block of [convo,composer])if(block)conversation.append(block);
  const processing=mk('section',undefined,'desk-pane');processing.dataset.deskPane='processing';
  const history=mk('section',undefined,'desk-pane');history.dataset.deskPane='history';
  history.append(mk('h4','Хронологія звернення'));
  if(route){
   const audit=route.querySelector('.office-route-audit');
   if(audit){audit.open=true;history.append(audit)}
   processing.append(route);
  }
  const internals=[...conversation.querySelectorAll('.support-compose > .support-internal')];
  for(const node of internals)processing.append(node);
  const deviceBox=main.querySelector('.support-device-info');
  if(deviceBox){const details=mk('details',undefined,'desk-technical');details.append(mk('summary','Технічні дані та додаткові поля'),deviceBox);main.append(details)}
  const rest=[...main.querySelectorAll('.support-device-info')];
  for(const block of rest){if(block.parentElement===main){const details=mk('details',undefined,'desk-technical');details.append(mk('summary','Додаткові відомості'),block);main.append(details)}}
  if(remove){const danger=mk('details',undefined,'desk-danger');danger.append(mk('summary','Додаткові дії'),remove);processing.append(danger)}
  const head=mk('header',undefined,'desk-detail-head');
  const back=mk('button','← До реєстру','desk-back');back.type='button';back.onclick=closeTicket;
  const code=mk('span',ticket.id,'desk-number');head.append(back,code);
  const actions=mk('div',undefined,'desk-detail-actions');
  const response=mk('button','Відповісти','desk-primary');response.type='button';response.onclick=()=>choosePane('conversation',detail,true);
  actions.append(response);
  if(writable()){
   const take=mk('button',ticket.status==='new'?'Взяти в роботу':'У роботі','desk-soft');take.type='button';
   take.disabled=ticket.status!=='new';take.onclick=async()=>{take.disabled=true;await save(ticket.id,{status:'in_progress'},'Звернення взято в роботу.')};
   const finish=mk('button',ticket.status==='resolved'?'Відкрити повторно':'Завершити','desk-soft');finish.type='button';
   finish.onclick=async()=>{
    if(ticket.status!=='resolved'&&!confirm('Завершити звернення '+ticket.id+'? Воно залишиться в історії.'))return;
    finish.disabled=true;
    await save(ticket.id,{status:ticket.status==='resolved'?'in_progress':'resolved'},'Статус звернення оновлено.');
   };
   actions.append(take,finish);
  }
  const nav=mk('nav',undefined,'desk-detail-tabs');nav.setAttribute('aria-label','Розділи картки');
  for(const [id,label] of ticketTabs){const b=mk('button',label);b.type='button';b.dataset.deskTab=id;b.setAttribute('aria-pressed','false');b.onclick=()=>choosePane(id,detail,true);nav.append(b)}
  const conversationHint=mk('p','Відповідь буде видимою користувачу в «Мої звернення». Внутрішні записи бачить лише підтримка.','desk-thread-notice');
  conversation.prepend(conversationHint);
  if(!history.children.length||history.children.length===1)history.append(mk('p','Поки немає записів історії.','support-empty'));
  detail.prepend(head,actions,nav);
  detail.append(main,conversation,processing,history);
  // Prevent saving on repeated clicks and preserve drafts when switching panes.
  if(composer){
   const reply=composer.querySelector('textarea');
   const counter=mk('span',undefined,'desk-reply-counter');
   const paint=()=>{counter.textContent=(reply?.value.length||0)+'/1600'};
   reply?.addEventListener('input',paint);paint();
   composer.querySelector('.support-send')?.before(counter);
  }
  choosePane(activeSheet,detail,false);
 }
 function choosePane(name,detail,focus){
  activeSheet=ticketTabs.some(([id])=>id===name)?name:'overview';
  for(const section of detail.querySelectorAll(':scope > .desk-pane'))section.hidden=section.dataset.deskPane!==activeSheet;
  for(const btn of detail.querySelectorAll('.desk-detail-tabs button'))btn.setAttribute('aria-pressed',String(btn.dataset.deskTab===activeSheet));
  if(focus){const selector=activeSheet==='conversation'?'.support-compose textarea':'.desk-detail-tabs button[aria-pressed="true"]';
   detail.querySelector(selector)?.focus({preventScroll:true})}
 }
 window.SvitloTicketEnhance=detailV3;
 const originalMobile=window.SvitloMobileAdmin||{};
 function closeTicket(){
  drawer=false;document.body.classList.remove('office-ticket-open','desk-ticket-open');
  detailed.removeAttribute('role');detailed.removeAttribute('aria-modal');
  if(focusReturn?.isConnected)focusReturn.focus({preventScroll:true});
  focusReturn=null;
 }
 function openTicket(){
  if(!window.matchMedia('(max-width:760px)').matches)return;
  focusReturn=document.activeElement;
  drawer=true;document.body.classList.add('desk-ticket-open');
  detailed.setAttribute('role','dialog');detailed.setAttribute('aria-modal','true');
  detailed.querySelector('.desk-back')?.focus({preventScroll:true});
 }
 window.SvitloMobileAdmin={...originalMobile,openTicket,closeTicket,decorateTicket(){}};
 function syncSelected(){
  for(const id of [...selected])if(!list().some(t=>t.id===id))selected.delete(id);
  for(const entry of ticketList.querySelectorAll('.desk-ticket-row')){
   const id=entry.dataset.ticketId;
   entry.querySelector('input[type="checkbox"]').checked=selected.has(id);
   entry.classList.toggle('desk-selected',selected.has(id));
  }
  const count=selected.size;bulk.hidden=!count;
  bulkCount.textContent=count+' вибрано';
  bulkRun.disabled=!count||busy||!writable();
  choose.checked=!!ticketList.querySelector('.desk-ticket-row')&&[...ticketList.querySelectorAll('.desk-ticket-row input')].every(e=>e.checked);
 }
 function wrapRows(){
  const cards=[...ticketList.querySelectorAll(':scope > button.ticket-row')];
  for(const card of cards){
   const ticket=list().find(t=>t.id===card.querySelector('.ticket-row-head small')?.textContent);
   if(!ticket)continue;
   const wrap=mk('div',undefined,'desk-ticket-row');wrap.dataset.ticketId=ticket.id;
   const check=mk('input');check.type='checkbox';check.value=ticket.id;check.setAttribute('aria-label','Вибрати звернення '+ticket.id);
   check.disabled=!writable();
   check.addEventListener('change',()=>{if(check.checked)selected.add(ticket.id);else selected.delete(ticket.id);syncSelected()});
   card.addEventListener('click',()=>{activeSheet='overview'});
   card.replaceWith(wrap);wrap.append(check,card);
  }
  syncSelected();
 }
 const oldRender=window.renderTicketList;
 if(typeof oldRender==='function')window.renderTicketList=function(){oldRender();wrapRows()};
 choose.addEventListener('change',()=>{
  for(const row of ticketList.querySelectorAll('.desk-ticket-row')){
   const input=row.querySelector('input');if(input.disabled)continue;
   if(choose.checked)selected.add(row.dataset.ticketId);else selected.delete(row.dataset.ticketId);
  }
  syncSelected();
 });
 bulkCancel.onclick=()=>{selected.clear();bulkAction.value='';bulkResult.textContent='';syncSelected()};
 bulkRun.onclick=async()=>{
  const action=bulkAction.value;if(!action||busy)return;
  const ids=[...selected].slice(0,50);
  if(ids.length===0)return;
  const status=['new','in_progress','resolved'].includes(action);
  const patch=status?{status:action}:{priority:action};
  if(!confirm('Змінити '+(status?'статус':'пріоритет')+' у '+ids.length+' зверненнях?'))return;
  busy=true;bulkRun.disabled=true;bulkResult.textContent='Збережено 0 із '+ids.length;
  let ok=0;const errors=[];
  for(const id of ids){
   const ticket=list().find(t=>t.id===id);if(!ticket)continue;
   const payload={...patch};
   if(Number.isSafeInteger(ticket.revision))payload.expectedRevision=ticket.revision;
   try{await api('feedback/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(payload)});ok++}
   catch(error){errors.push(id+': '+String(error.message).slice(0,90))}
   bulkResult.textContent='Збережено '+ok+' із '+ids.length;
  }
  busy=false;selected.clear();bulkAction.value='';
  bulkResult.textContent=errors.length?('Оновлено '+ok+'. Помилки: '+errors.slice(0,2).join('; ')):'Змінено '+ok+' звернень.';
  await window.refreshTickets?.();syncSelected();
 };
 // Dynamic workspace context (only server-backed actions, not GitHub publish).
 const main=dashboard.querySelector('[data-admin-panel="overview"]');
 const hub=mk('section',undefined,'desk-hub');
 hub.append(mk('div','КОМАНДНИЙ ЦЕНТР','desk-hub-overline'),mk('h3','Працюйте без GitHub-токена'),mk('p','Звернення, відповіді, Push, публікації та більшість налаштувань працюють через захищений сервер. Редагування файлів графіків і довідника відокремлено в технічні інструменти.'));
 const links=mk('div',undefined,'desk-hub-links');
 for(const [id,title,subtitle] of [['feedback','Опрацювати звернення','Листування, контроль, статуси'],['operations','Керувати повідомленнями','Створення і публікація'],['registry','Доручення','Робоча картотека'],['live','Налаштування сервісу','Функції й банери'],['push','Push-розсилки','Підписники та тестування'],['corrections','Уточнення адрес','Без редагування JSON']]){
  const b=mk('button',undefined,'desk-hub-link');b.type='button';b.append(mk('strong',title),mk('small',subtitle));b.onclick=()=>goto(id);links.append(b);
 }
 hub.append(links);
 const note=mk('p','','desk-capability');note.id='deskCapabilities';note.setAttribute('role','status');hub.append(note);
 main?.querySelector('.office-context')?.after(hub);
 const configToken=mk('div',undefined,'desk-github-note');
 configToken.append(mk('strong','Технічний редактор файлів'),mk('p','Лише публікація статичних JSON-файлів у GitHub потребує окремих прав репозиторію. Звичайні дії адмінпанелі не повинні вимагати токен.'));
 const filePanel=dashboard.querySelector('[data-admin-panel="data"]');filePanel?.querySelector('.office-context')?.after(configToken);
 async function probe(){
  if(dashboard.hidden)return;
  const checks=[['feedback','Звернення'],['app-config','Налаштування'],['work-items','Доручення'],['push/status','Push']];
  const parts=await Promise.allSettled(checks.map(async([url,label])=>{await api(url);return label}));
  const online=parts.filter(x=>x.status==='fulfilled').map(x=>x.value);
  note.textContent=online.length?'Доступні через Railway: '+online.join(' · ')+'.':'З’єднання із сервером потребує перевірки. Увійдіть повторно, якщо сеанс завершився.';
  note.dataset.level=online.length===checks.length?'ok':online.length?'partial':'error';
 }
 // No secrets, email, tickets, or private text are copied to persistent storage.
 document.addEventListener('svitlo:admin-ready',()=>{selected.clear();syncSelected();probe()});
 document.addEventListener('svitlo:admin-logout',()=>{selected.clear();closeTicket();syncSelected();note.textContent=''});
 document.addEventListener('svitlo:tickets-loaded',()=>{wrapRows();if(drawer&&detailed.querySelector('.desk-back')===null)closeTicket()});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&drawer){e.preventDefault();closeTicket()}
  if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')&&!feedback.hidden){e.preventDefault();$('ticketSearch')?.focus()}
 });
 for(const tab of dashboard.querySelectorAll('[data-admin-tab]'))tab.addEventListener('click',()=>{if(tab.dataset.adminTab!=='feedback')closeTicket()});
 window.matchMedia('(max-width:760px)').addEventListener?.('change',e=>{if(!e.matches)closeTicket()});
 window.SvitloDeskV3={closeTicket,probe};
})();
