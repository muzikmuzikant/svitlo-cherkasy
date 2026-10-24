/* Svitlo Office: unified document-oriented navigation for every administration module. */
(()=>{'use strict';
 const dashboard=document.getElementById('adminDashboard');
 const navigation=dashboard?.querySelector('.admin-tabs');
 if(!dashboard||!navigation)return;
 const tabs=[...navigation.querySelectorAll('[data-admin-tab]')];
 const panels=[...dashboard.querySelectorAll('[data-admin-panel]')];
 const names=Object.fromEntries(tabs.map(el=>[el.dataset.adminTab,el.querySelector('span')?.textContent.trim()||el.dataset.adminTab]));
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el};
 const groups={
  overview:['РОБОЧИЙ СТІЛ','Оперативна картина звернень, доручень і стану сервісу.'],
  registry:['ДІЛОВОДСТВО','Реєстр доручень із виконавцями, статусами та контрольними строками.'],
  corrections:['АДРЕСНИЙ РЕЄСТР','Чернетки уточнень підчерг із підтвердженням офіційного джерела.'],
  insights:['АНАЛІТИЧНИЙ КАБІНЕТ','Показники за доступними знеособленими даними.'],
  quality:['КОНТРОЛЬ ЯКОСТІ','Технічний стан модулів і перевірки роботи сервісу.'],
  operations:['ЕЛЕКТРОННІ ПУБЛІКАЦІЇ','Редакційні документи, чернетки, статус публікації та медіа.'],
  push:['РОЗСИЛКИ','Контроль адресатів та результатів доставки повідомлень.'],
  media:['МЕДІАТЕКА','Матеріали й обкладинки, доступні редактору публікацій.'],
  ads:['РЕКЛАМНИЙ КАБІНЕТ','Кампанії, розміщення, контактні дані та статистика.'],
  social:['КОМУНІКАЦІЇ','Реєстр офіційних соціальних каналів, порядок і публікація посилань.'],
  feedback:['ВХІДНА КОРЕСПОНДЕНЦІЯ','Реєстр звернень, контроль виконання, відповіді та журнал картки.'],
  help:['БАЗА ЗНАНЬ','Редактор статей і пояснень для користувачів.'],
  live:['ДИСПЕТЧЕРСЬКА','Оперативні налаштування без редагування файлів на GitHub.'],
  features:['КОНФІГУРАЦІЯ','Керування доступністю користувацьких функцій.'],
  design:['ОФОРМЛЕННЯ','Керування доступними параметрами зовнішнього вигляду.'],
  maintenance:['ТЕХНІЧНИЙ РЕЖИМ','Повідомлення й обмеження доступу під час технічних робіт.'],
  sources:['ОФІЦІЙНІ ДЖЕРЕЛА','Зіставлення, перевірка та погодження графіків перед публікацією.'],
  planner:['ПЛАНУВАЛЬНИК','Півгодинні графіки, контроль джерела й підготовка змін.'],
  tools:['ІНСТРУМЕНТАРІЙ','Перевірки, імпорт і підготовка даних.'],
  data:['РЕДАКТОР ДАНИХ','Валідація та контрольоване редагування файлів графіків.'],
  security:['ПРАВА ДОСТУПУ','Користувачі адмінпанелі, авторизація та права на операції.'],
  backup:['АРХІВ','Резервні копії та можливості відновлення.'],
  revisions:['ІСТОРІЯ ЗМІН','Перевірка попередніх редакцій і виконаних операцій.'],
  audit:['ЖУРНАЛ ПОДІЙ','Службові записи дій адміністрації.']
 };
 const shortcuts={
  overview:[['officeDeskReload','Оновити робочий стіл']],
  registry:[['workNew','Нове доручення']],
  corrections:[['corrNew','Нове уточнення']],
  operations:[['opsNewNotice','Нове повідомлення'],['opsNoticesExport','Експорт переліку']],
  social:[['socialAdd','Новий канал']],
  feedback:[['refreshTickets','Оновити звернення'],['ticketExport','Експорт реєстру']],
  push:[['refreshPush','Оновити підписки']],
  features:[['featuresSearch','Знайти функцію']],
  planner:[['plannerStage','Підготувати зміни']],
  data:[['validate','Перевірити дані']],
  audit:[['auditRefresh','Оновити журнал']]
 };
 const open=id=>navigation.querySelector('[data-admin-tab="'+id+'"]')?.click();
 const contextByTab=new Map();
 for(const [id,first] of Object.entries(Object.groupBy?Object.groupBy(panels,p=>p.dataset.adminPanel):panels.reduce((o,p)=>{(o[p.dataset.adminPanel]||=[]).push(p);return o},{}))){
  const host=first[0];if(!host)continue;
  const meta=groups[id]||['РОБОЧА ОБЛАСТЬ','Керування модулем сервісу.'];
  const header=node('div',undefined,'office-context');
  header.dataset.context=id;
  const lead=node('div',undefined,'office-context-lead');
  lead.append(node('span',meta[0],'office-context-kicker'),node('strong',names[id]||id,'office-context-title'),node('p',meta[1],'office-context-caption'));
  const actions=node('div',undefined,'office-context-actions');
  for(const [control,label] of shortcuts[id]||[]){
   const target=document.getElementById(control);if(!target)continue;
   const btn=node('button',label,'office-context-action');
   btn.type='button';
   btn.addEventListener('click',()=>{if(!target.disabled){if(/^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName)){target.focus();target.scrollIntoView({block:'center',behavior:'smooth'})}else target.click()}});
   actions.append(btn);
  }
  if(id!=='overview'){
   const back=node('button','Робочий стіл','office-context-back');back.type='button';back.onclick=()=>open('overview');actions.append(back);
  }
  header.append(lead,actions);
  host.prepend(header);contextByTab.set(id,header);
  const refreshIds={overview:'monitorRefresh',registry:'adminRegisterReload',corrections:'corrReload',
   insights:'controlInsightsReload',quality:'controlRunChecks',operations:'opsMetricsRefresh',push:'refreshPush',
   media:'controlMediaReload',feedback:'refreshTickets',live:'liveReload',features:'',
   sources:'sourceRefresh',planner:'',security:'securityReload',audit:'auditRefresh',
   revisions:'opsHistoryRefresh'};
  const strip=node('div',undefined,'office-modulebar');strip.dataset.module=id;
  const identity=node('div',undefined,'office-modulebar-id');
  const index=String(tabs.findIndex(b=>b.dataset.adminTab===id)+1).padStart(2,'0');
  identity.append(node('span','МОДУЛЬ '+index,'office-modulecode'),node('strong',names[id]||id,'office-module-label'));
  const tools=node('div',undefined,'office-module-actions');
  const reloadTarget=document.getElementById(refreshIds[id]||'');
  const existsInHeader=(shortcuts[id]||[]).some(([control])=>control===refreshIds[id]);
  if(reloadTarget&&!existsInHeader){
   const text=reloadTarget.textContent?.trim()||'Виконати дію';
   const title=id==='operations'?'Оновити статистику':id==='quality'?'Запустити перевірку':text;
   const reload=node('button',title,'office-module-refresh');reload.type='button';
   reload.setAttribute('aria-label','Оновити дані розділу '+(names[id]||id));
   reload.onclick=()=>{if(!reloadTarget.disabled)reloadTarget.click()};
   tools.append(reload);
  }
  const quickSearch=host.querySelector('input[type="search"]');
  if(quickSearch){
   const button=node('button','Пошук у реєстрі','office-module-search');button.type='button';
   button.onclick=()=>quickSearch.focus({preventScroll:false});tools.append(button);
  }
  strip.append(identity,tools);header.after(strip);
 }
 const toolbar=dashboard.querySelector(':scope > .office-toolbar');
 const recent=node('details',undefined,'office-recent');
 const summary=node('summary','Нещодавні');
 const recentList=node('div',undefined,'office-recent-list');
 recent.append(summary,recentList);
 toolbar?.append(recent);
 const density=node('button','Компактний режим','office-density');
 density.type='button';density.setAttribute('aria-pressed','false');
 density.setAttribute('title','Щільність реєстрів та форм');
 function applyDensity(compact){
  document.body.dataset.officeDensity=compact?'compact':'normal';
  density.setAttribute('aria-pressed',String(compact));
  density.textContent=compact?'Звичайний режим':'Компактний режим';
 }
 let compact=false;
 try{compact=sessionStorage.getItem('svitlo-office-density')==='compact'}catch{}
 applyDensity(compact);
 density.onclick=()=>{
  compact=!compact;applyDensity(compact);
  try{sessionStorage.setItem('svitlo-office-density',compact?'compact':'normal')}catch{}
 };
 toolbar?.append(density);
 const workStatus=node('div',undefined,'office-work-status');
 const statusSection=node('span','Робочий стіл','office-status-module');
 const roleStatus=node('span','Захищений сеанс','office-status-role');
 workStatus.append(statusSection,roleStatus,node('span','Ctrl + K: пошук команд','office-status-help'));
 dashboard.append(workStatus);
 document.addEventListener('svitlo:admin-ready',()=>{
  const roles={owner:'Власник',editor:'Редактор',operator:'Оператор',viewer:'Перегляд'};
  roleStatus.textContent='Роль: '+(roles[document.body.dataset.adminRole]||'Користувач');
 });
 document.addEventListener('svitlo:admin-logout',()=>{roleStatus.textContent='Сеанс завершено'});
 let history=[];
 try{const initial=JSON.parse(sessionStorage.getItem('svitlo-office-recent-tabs')||'[]');if(Array.isArray(initial))history=initial.filter(x=>names[x]).slice(0,5)}catch{}
 const active=()=>tabs.find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.adminTab||'overview';
 function repaintRecent(){
  recentList.replaceChildren();
  if(!history.length){recentList.append(node('span','Відкрийте розділ','office-recent-empty'));return}
  for(const id of history){
   const button=node('button',names[id]||id);button.type='button';
   button.onclick=()=>{recent.open=false;open(id)};recentList.append(button);
  }
 }
 let last='';
 function sync(){
  const id=active();
  if(last===id)return;
  last=id;
  history=[id,...history.filter(v=>v!==id)].slice(0,5);
  try{sessionStorage.setItem('svitlo-office-recent-tabs',JSON.stringify(history))}catch{}
  repaintRecent();
  const current=contextByTab.get(id);
  if(current)current.dataset.active='true';
  document.documentElement.dataset.officeWorkspace=id;
  statusSection.textContent=names[id]||'Робочий стіл';
  dashboard.dataset.officeActive=id;
 }
 for(const button of tabs)new MutationObserver(sync).observe(button,{attributes:true,attributeFilter:['aria-pressed']});
 document.addEventListener('svitlo:admin-logout',()=>{recent.open=false});
 document.addEventListener('click',e=>{if(recent.open&&!recent.contains(e.target))recent.open=false});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')recent.open=false});
 sync();
})();
