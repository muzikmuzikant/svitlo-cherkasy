/* Svitlo Office: protected correspondence register, controller and card routing.
   Never persist ticket contents, emails, drafts or filters to browser storage. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const root=document.querySelector('[data-admin-panel="feedback"]');
 if(!root)return;
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
 const statusText={new:'Зареєстровано',in_progress:'На виконанні',resolved:'Завершено'};
 const viewButtons=[...root.querySelectorAll('[data-ticket-view]')];
 let view='all',items=[],routingAvailable=false;
 const date=value=>{const t=Date.parse(value||'');return Number.isFinite(t)?new Date(t).toLocaleString('uk-UA',{dateStyle:'medium',timeStyle:'short'}):'Не встановлено'};
 const dueTime=t=>{const n=Date.parse(t?.dueAt||'');return Number.isFinite(n)?n:Infinity};
 const isOverdue=t=>t.status!=='resolved'&&dueTime(t)<Date.now();
 const awaiting=t=>t.status!=='resolved'&&(!Array.isArray(t.messages)||!t.messages.length||t.messages[t.messages.length-1].from==='user');
 const currentUser=()=>($('adminUsername')?.value||'owner').trim().toLocaleLowerCase('uk-UA');
 function matches(t){
  const assignment=$('ticketAssigneeFilter')?.value||'all';
  if(assignment!=='all'&&(assignment==='unassigned'?!!t.assignedTo:t.assignedTo!==assignment))return false;
  return view==='all'||view==='new'&&t.status==='new'||
   view==='mine'&&t.status!=='resolved'&&String(t.assignedTo||'').toLocaleLowerCase('uk-UA')===currentUser()||
   view==='overdue'&&isOverdue(t)||view==='unanswered'&&awaiting(t);
 }
 function compare(a,b){
  const sort=$('ticketSort')?.value||'attention';
  const byNewest=()=>Date.parse(b.updatedAt||b.createdAt||'')-Date.parse(a.updatedAt||a.createdAt||'');
  if(sort==='newest')return Date.parse(b.createdAt||'')-Date.parse(a.createdAt||'');
  if(sort==='oldest')return Date.parse(a.createdAt||'')-Date.parse(b.createdAt||'');
  if(sort==='due')return dueTime(a)-dueTime(b)||byNewest();
  if(sort==='priority')return priority(b)-priority(a)||byNewest();
  const urgency=t=>isOverdue(t)?0:t.status==='new'?1:awaiting(t)?2:t.status==='in_progress'?3:4;
  return urgency(a)-urgency(b)||priority(b)-priority(a)||dueTime(a)-dueTime(b)||byNewest();
 }
 const priority=t=>({high:3,normal:2,low:1}[t.priority]||2);
 function selectView(next){
  view=['all','new','mine','overdue','unanswered'].includes(next)?next:'all';
  for(const btn of viewButtons){const selected=btn.dataset.ticketView===view;btn.setAttribute('aria-pressed',String(selected))}
  if(typeof renderTicketList==='function')renderTicketList();
 }
 function sync(list,capabilities){
  items=Array.isArray(list)?list:[];
  routingAvailable=capabilities?.routing===true;
  const select=$('ticketAssigneeFilter');
  if(select){
   const prev=select.value;
   select.replaceChildren(new Option('Усі виконавці','all'),new Option('Без виконавця','unassigned'));
   for(const value of [...new Set(items.map(t=>String(t.assignedTo||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'uk'))){
    select.add(new Option(value,value));
   }
   select.value=[...select.options].some(o=>o.value===prev)?prev:'all';
  }
  const count=name=>items.filter(t=>name==='all'||name==='new'&&t.status==='new'||name==='mine'&&t.status!=='resolved'&&String(t.assignedTo||'').toLocaleLowerCase('uk-UA')===currentUser()||name==='overdue'&&isOverdue(t)||name==='unanswered'&&awaiting(t)).length;
  for(const btn of viewButtons){
   const base=btn.dataset.label||btn.textContent.trim().replace(/\s+\(\d+\)$/,'');
   btn.dataset.label=base;
   btn.textContent=base+' ('+count(btn.dataset.ticketView)+')';
  }
 }
 function reset(){
  items=[];view='all';routingAvailable=false;
  for(const btn of viewButtons)btn.setAttribute('aria-pressed',String(btn.dataset.ticketView==='all'));
 }
 viewButtons.forEach(btn=>btn.addEventListener('click',()=>selectView(btn.dataset.ticketView)));
 for(const id of ['ticketAssigneeFilter','ticketSort']){
  $(id)?.addEventListener('change',()=>renderTicketList());
 }
 $('ticketReset')?.addEventListener('click',()=>{
  for(const id of ['ticketSearch','ticketFilter','ticketTopicFilter','ticketPriorityFilter','ticketAssigneeFilter']){
   if($(id))$(id).value=id==='ticketSearch'?'':'all';
  }
  if($('ticketSort'))$('ticketSort').value='attention';
  selectView('all');$('ticketSearch')?.focus();
 });
 const csvEscape=value=>{
  let str=String(value??'').replace(/[\r\n\t]+/g,' ').trim();
  if(/^[=+\-@]/.test(str))str="'"+str; // guard spreadsheet formula injection
  return '"'+str.replace(/"/g,'""')+'"';
 };
 $('ticketCsv')?.addEventListener('click',()=>{
  if(!items.length)return;
  if(!confirm('Завантажити приватний реєстр без текстів звернень та контактів? Не публікуйте його.'))return;
  const rows=[['Номер','Тема','Статус','Пріоритет','Виконавець','Контрольний строк','Створено','Оновлено'],
   ...items.map(t=>[t.id,t.topic,statusText[t.status]||t.status,t.priority||'normal',t.assignedTo||'',t.dueAt||'',t.createdAt||'',t.updatedAt||''])];
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(csvEscape).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='svitlo-register-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 });
 window.SvitloTicketWorkflow={matches,compare,sync,setView:selectView,reset,isOverdue};
 window.SvitloTicketEnhance=(ticket,detail,save)=>{
  const existing=detail.querySelector('.support-detail-controls');
  const unit=node('section',undefined,'office-correspondence-route');
  const head=node('div',undefined,'office-route-title');
  head.append(node('h4','Реєстраційна картка та маршрут'));
  const controls=node('div',undefined,'office-route-actions');
  const copy=node('button','Копіювати номер','secondary');copy.type='button';
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(ticket.id);copy.textContent='Номер скопійовано'}catch{copy.textContent='Копіювання недоступне'}};
  const work=node('button','Створити доручення ↗','secondary');work.type='button';
  work.onclick=()=>{
   document.querySelector('[data-admin-tab="registry"]')?.click();
   window.dispatchEvent(new CustomEvent('svitlo:open-work',{detail:{
    title:('Опрацювати звернення '+ticket.id).slice(0,120),
    reference:ticket.id,details:((ticket.subject||'')+'\n'+(ticket.message||'')).slice(0,1500)
   }}));
  };
  controls.append(copy,work);head.append(controls);unit.append(head);
  if(!routingAvailable){
   const notice=node('p','Бета-сервер Railway ще не підтримує маршрут і журнал картки. Після його оновлення ці поля стануть доступними; відповіді, статуси та нотатки працюють як раніше.','office-route-notice');
   notice.setAttribute('role','status');unit.append(notice);
  }
  const progress=node('div',undefined,'office-route-progress');
  const steps=[['Зареєстровано',true],['Взято в роботу',ticket.status!=='new'],['Завершено',ticket.status==='resolved']];
  for(const [label,complete] of steps)progress.append(node('span',label,'office-route-step'+(complete?' is-complete':'')));
  unit.append(progress);
  const fields=node('div',undefined,'office-route-fields');
  const control=(caption,type,value,maxLength)=>{
   const label=node('label',undefined,'office-route-field');label.append(node('span',caption));
   const input=node(type==='textarea'?'textarea':'input');
   if(type!=='textarea')input.type=type;
   input.value=value||'';
   if(maxLength)input.maxLength=maxLength;
   input.disabled=document.body.dataset.adminRole==='viewer'||!routingAvailable;
   label.append(input);fields.append(label);return input;
  };
  const assignee=control('Відповідальний виконавець','text',ticket.assignedTo||'',60);
  assignee.placeholder='Логін або ім’я працівника';
  const localDate=iso=>{
   if(!iso)return '';
   const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '';
   const v=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);return v;
  };
  const due=control('Контрольний строк (ваш місцевий час)','datetime-local',localDate(ticket.dueAt));
  const outcome=control('Внутрішній висновок / результат','textarea',ticket.resolution||'',800);
  outcome.rows=3;outcome.placeholder='Що перевірено і яке рішення прийнято. Не відображається користувачу.';
  const helper=node('p','Призначення виконавця та контрольний строк внутрішні. Вони не надсилають автоматичних листів і не змінюють офіційний статус звернення.','office-route-hint');
  unit.append(fields,helper);
  const saveButton=node('button','Зберегти маршрут','support-send');saveButton.type='button';
  const feedback=node('p','','office-route-result');feedback.setAttribute('role','status');
  saveButton.disabled=document.body.dataset.adminRole==='viewer'||!routingAvailable;
  saveButton.onclick=async()=>{
   if(!routingAvailable){feedback.textContent='Оновлення бета-сервера Railway ще не розгорнуто.';return}
   if(due.value&&!Number.isFinite(new Date(due.value).getTime())){feedback.textContent='Укажіть коректну дату';return}
   const data={assignedTo:assignee.value.trim(),dueAt:due.value?new Date(due.value).toISOString():'',resolution:outcome.value};
   saveButton.disabled=true;feedback.textContent='Зберігаємо маршрут на сервері…';
   const saved=await save(ticket.id,data,'Маршрут звернення збережено.');
   if(!saved){saveButton.disabled=false;feedback.textContent='Не збережено. Перевірте стан угорі реєстру.'}
  };
  unit.append(saveButton,feedback);
  const activity=node('details',undefined,'office-route-audit');
  activity.append(node('summary','Історія дій за карткою ('+(ticket.activity?.length||0)+')'));
  const history=node('ol');
  for(const event of (ticket.activity||[]).slice().reverse()){
   const line=node('li');
   line.append(node('strong',event.label||'Зміна картки'),node('span',date(event.at)+' · '+(event.by||'система')));
   history.append(line);
  }
  if(!history.children.length)history.append(node('li','Історія для цієї старої картки почнеться з наступного редагування.'));
  activity.append(history);unit.append(activity);
  if(existing)existing.after(unit);else detail.append(unit);
 };
})();
