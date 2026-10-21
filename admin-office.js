/* Svitlo Office 2: document-workflow style administration. All data comes from protected Railway API. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),dashboard=$('adminDashboard'),sidebar=dashboard?.querySelector('.admin-tabs');
 if(!dashboard||!sidebar)return;
 document.body.classList.add('svitlo-office');
 const sections=[...sidebar.querySelectorAll('[data-admin-tab]')];
 const names=Object.fromEntries(sections.map(el=>[el.dataset.adminTab,el.querySelector('span')?.textContent.trim()||el.textContent.trim()]));
 const icons={
 overview:'home',registry:'file',corrections:'pin',insights:'chart',quality:'activity',
 operations:'mail',push:'bell',media:'image',ads:'layers',feedback:'inbox',help:'help',
 live:'sliders',features:'grid',design:'palette',maintenance:'tool',
 sources:'database',planner:'calendar',tools:'zap',data:'code',
 security:'shield',backup:'archive',revisions:'history',audit:'clock'
 };
 const paths={
 home:'M3 10.5 12 3l9 7.5V21H3V10.5z M9 21v-8h6v8',
 file:'M5 3h10l4 4v14H5z M15 3v5h4 M8 12h8 M8 16h8',
 pin:'M12 21v-7 M6 8l6-5 6 5v6H6z', chart:'M4 20V10 M10 20V4 M16 20v-8 M22 20V7',
 activity:'M3 12h4l3-8 4 16 3-8h4',mail:'M3 5h18v14H3z M3 6l9 7 9-7',
 bell:'M5 17h14l-2-3V9a5 5 0 00-10 0v5z M10 21h4',
 image:'M3 4h18v16H3z M7 9h.01 M4 18l6-7 4 4 3-3 4 5',
 layers:'M12 3l10 6-10 6L2 9z M2 14l10 6 10-6',inbox:'M3 4h18v16H3z M3 14h6l2 3h2l2-3h6',
 help:'M9 9a3 3 0 016 0c0 2-3 2-3 5 M12 18h.01 M12 3a9 9 0 100 18 9 9 0 000-18',
 sliders:'M4 6h16 M4 12h16 M4 18h16 M9 3v6 M15 9v6 M9 15v6',
 grid:'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z',
 palette:'M12 3a9 9 0 000 18h2a2 2 0 000-4h-1a2 2 0 010-4h6a3 3 0 003-3c0-4-4-7-10-7z',
 tool:'M4 20l9-9 M12 5a6 6 0 007 7l3-3-5-5-3 3z',
 database:'M3 6c0-4 18-4 18 0s-18 4-18 0z M3 6v12c0 4 18 4 18 0V6 M3 12c0 4 18 4 18 0',
 calendar:'M3 5h18v16H3z M7 3v5 M17 3v5 M3 10h18',
 zap:'M13 2L5 13h7l-1 9 8-12h-7z',
 code:'M8 6l-5 6 5 6 M16 6l5 6-5 6',
 shield:'M12 2l8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6z M9 12l2 2 4-4',
 archive:'M3 4h18v5H3z M5 9v12h14V9 M10 13h4',
 history:'M4 6v5h5 M5 11a8 8 0 118 9 M12 7v5l3 2',
 clock:'M12 3a9 9 0 100 18 9 9 0 000-18 M12 7v5l4 2'
 };
 const icon=(name,size=18)=>{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width',size);svg.setAttribute('height',size);
  svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');
  svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
  svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',paths[name]||paths.file);svg.append(path);return svg;
 };
 const el=(tag,content,cls)=>{
  const e=document.createElement(tag);
  if(content!==undefined&&content!==null)e.textContent=content;
  if(cls)e.className=cls;return e;
 };
 const activate=id=>{const target=sections.find(x=>x.dataset.adminTab===id);if(target)target.click()};
 for(const b of sections){
  const label=b.querySelector('span');if(!label)continue;
  for(const child of [...b.childNodes])if(child.nodeType===Node.TEXT_NODE)child.textContent='';
  b.prepend(icon(icons[b.dataset.adminTab]));
  b.setAttribute('title',names[b.dataset.adminTab]);
  b.setAttribute('aria-label',names[b.dataset.adminTab]);
  b.classList.add('office-nav-link');
 }
 for(const group of sidebar.querySelectorAll('.control-nav-group')){
  const heading=group.querySelector(':scope > span');if(!heading)continue;
  heading.classList.add('office-group-label');
  const groupId='svitlo-office-fold-'+[...sidebar.querySelectorAll('.control-nav-group')].indexOf(group);
  const toggle=el('button',heading.textContent.trim(),'office-group-toggle');
  toggle.type='button';toggle.setAttribute('aria-expanded','true');
  toggle.addEventListener('click',()=>{
   group.classList.toggle('office-folded');
   toggle.setAttribute('aria-expanded',String(!group.classList.contains('office-folded')));
   try{sessionStorage.setItem(groupId,group.classList.contains('office-folded')?'1':'0')}catch{}
  });
  heading.replaceWith(toggle);
  try{if(sessionStorage.getItem(groupId)==='1'){group.classList.add('office-folded');toggle.setAttribute('aria-expanded','false')}}catch{}
 }
 const head=dashboard.querySelector(':scope > .auth-head');
 const headBrand=head?.querySelector('.control-brand');
 if(headBrand){
  const title=headBrand.querySelector('h1');if(title)title.textContent='Керування сервісом';
  const kicker=headBrand.querySelector('.control-kicker');if(kicker)kicker.textContent='SVITLO OFFICE / РОБОЧЕ СЕРЕДОВИЩЕ';
 }
 const toolbar=el('div',null,'office-toolbar');
 const toggleNav=el('button',null,'office-menu-button');
 toggleNav.type='button';toggleNav.setAttribute('aria-label','Відкрити або сховати навігацію');
 toggleNav.append(icon('grid',19));
 const crumbs=el('div',null,'office-crumbs');
 crumbs.append(el('span','Система /','office-crumb-parent'),el('strong','Робочий стіл','office-current-title'));
 const search=el('button',null,'office-search-open');
 search.type='button';search.append(icon('file',17),el('span','Знайти розділ, команду або реєстр'),el('kbd','⌘ K'));
 search.onclick=()=>showPalette();
 const action=el('button',null,'office-create');
 action.type='button';action.setAttribute('aria-label','Створити документ, повідомлення або доручення');action.append(icon('zap',17),el('span','Створити'));
 action.onclick=()=>showCreate();
 const state=el('span','Не перевірено','office-top-state');state.id='officeTopState';
 const closeNav=el('button','×','office-close-nav');closeNav.type='button';closeNav.setAttribute('aria-label','Закрити меню');
 closeNav.onclick=()=>setNav(false);sidebar.prepend(closeNav);
 const navScrim=el('button',null,'office-nav-scrim');navScrim.type='button';navScrim.setAttribute('aria-label','Закрити навігацію');
 const setNav=open=>{
  if(window.matchMedia('(max-width:1050px)').matches){document.body.classList.toggle('office-mobile-nav',open)}
  else document.body.classList.toggle('office-nav-collapsed',!open);
  toggleNav.setAttribute('aria-expanded',String(open));
 };
 navScrim.addEventListener('click',()=>setNav(false));
 toggleNav.onclick=()=>setNav(!document.body.classList.contains(
  window.matchMedia('(max-width:1050px)').matches?'office-mobile-nav':'office-nav-collapsed'));
 toolbar.append(toggleNav,crumbs,search,state,action);head.after(toolbar);sidebar.after(navScrim);
 sidebar.addEventListener('click',e=>{if(e.target.closest('[data-admin-tab]')&&window.matchMedia('(max-width:1050px)').matches)setNav(false)});
 const modal=el('div',null,'office-modal');modal.id='officeModal';modal.hidden=true;
 const modalMask=el('div',null,'office-modal-mask');const modalPanel=el('div',null,'office-modal-panel');
 modalPanel.setAttribute('role','dialog');modalPanel.setAttribute('aria-modal','true');
 modalPanel.setAttribute('aria-label','Швидкий пошук та створення');
 const modalHead=el('div',null,'office-modal-head');
 const modalInput=el('input',null,'office-modal-search');
 modalInput.type='search';modalInput.placeholder='Напишіть назву розділу чи команди…';
 modalInput.setAttribute('aria-label','Пошук команди');
 const modalClose=el('button','Esc','office-modal-close');modalClose.type='button';modalClose.onclick=hideModal;
 modalHead.append(icon('file',19),modalInput,modalClose);
 const modalList=el('div',null,'office-modal-list');modalList.id='officeModalList';
 const modalHelp=el('div','↑ ↓ для вибору · Enter щоб відкрити · Esc щоб закрити','office-modal-help');
 modalPanel.append(modalHead,modalList,modalHelp);modal.append(modalMask,modalPanel);document.body.append(modal);
 modalMask.onclick=hideModal;
 let mode='search',selected=0,options=[],modalFocus=null;
 function hideModal(){modal.hidden=true;modalInput.value='';modalFocus?.focus?.();modalFocus=null}
 function showPalette(){if(dashboard.hidden)return;mode='search';openModal()}
 function showCreate(){if(dashboard.hidden)return;mode='create';openModal()}
 function openModal(){
  modalFocus=document.activeElement;modal.hidden=false;modalInput.value='';
  modalInput.placeholder=mode==='create'?'Що потрібно створити?':'Пошук по розділах та інструментах…';
  paint();modalInput.focus();
 }
 const createActions=[
  {label:'Нова картка доручення',hint:'Картотека робіт',tab:'registry',onOpen:()=>window.dispatchEvent(new CustomEvent('svitlo:open-work',{detail:{}}))},
  {label:'Адресне уточнення',hint:'Чернетка для конкретного будинку',tab:'corrections',onOpen:()=>$('corrNew')?.click()},
  {label:'Повідомлення користувачам',hint:'Чернетка та попередній перегляд',tab:'operations',onOpen:()=>$('opsNewNotice')?.click()},
  {label:'Оперативне налаштування',hint:'Банер, посилання, функції',tab:'live'},
  {label:'Опрацювати звернення',hint:'Реєстр заявок підтримки',tab:'feedback'},
  {label:'Погодити графік',hint:'Тільки після офіційної перевірки',tab:'sources'}
 ];
 function paint(){
  const query=modalInput.value.toLocaleLowerCase('uk-UA').trim();
  options=(mode==='create'?createActions:sections.map(s=>({tab:s.dataset.adminTab,label:names[s.dataset.adminTab],hint:'Відкрити розділ'})))
   .filter(x=>(x.label+' '+x.hint).toLocaleLowerCase('uk-UA').includes(query));
  selected=0;renderOptions();
 }
 function renderOptions(){
  modalList.replaceChildren();
  options.forEach((entry,i)=>{
   const b=el('button',null,'office-option'+(i===selected?' is-selected':''));
   b.type='button';b.append(icon(icons[entry.tab]||'file'),el('span',entry.label),el('small',entry.hint));
   b.onmouseover=()=>{selected=i;modalList.querySelectorAll('.office-option').forEach((x,j)=>x.classList.toggle('is-selected',j===i))};
   b.onclick=()=>runOption(entry);modalList.append(b);
  });
  if(!options.length)modalList.append(el('p','Нічого не знайдено.','office-empty'));
 }
 function runOption(entry){
  hideModal();activate(entry.tab);
  if(entry.onOpen)entry.onOpen();
 }
 modalInput.oninput=paint;
 modalInput.onkeydown=e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();selected=Math.max(0,Math.min(options.length-1,selected+(e.key==='ArrowDown'?1:-1)));renderOptions()}
  if(e.key==='Enter'&&options[selected]){e.preventDefault();runOption(options[selected])}
  if(e.key==='Escape'){e.preventDefault();hideModal()}
 };
 document.addEventListener('keydown',e=>{
  if(!dashboard.hidden&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
   e.preventDefault();e.stopImmediatePropagation();showPalette();
  }else if(!dashboard.hidden&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){
   e.preventDefault();e.stopImmediatePropagation();showCreate();
  }else if(e.key==='Escape'){
   if(!modal.hidden){e.preventDefault();hideModal()}
   setNav(false);
  }
 },true);
 const currently=()=>sections.find(el=>el.getAttribute('aria-pressed')==='true')?.dataset.adminTab||'overview';
 const updateTitle=()=>{
  const id=currently(),name=names[id]||'Робочий стіл';
  const title=crumbs.querySelector('.office-current-title');title.textContent=name;
  document.title=name+' · Svitlo Office';
  document.body.dataset.officeSection=id;
  for(const group of sidebar.querySelectorAll('.control-nav-group')){
   if(group.querySelector('[data-admin-tab="'+id+'"]')){
    group.classList.remove('office-folded');
    group.querySelector('.office-group-toggle')?.setAttribute('aria-expanded','true');
   }
  }
 };
 const observer=new MutationObserver(updateTitle);
 for(const btn of sections)observer.observe(btn,{attributes:true,attributeFilter:['aria-pressed']});
 updateTitle();
 const desk=el('div',null,'office-desk');
 desk.id='officeDesk';
 desk.innerHTML=`<div class="office-desk-title"><div><div class="office-overline">РОБОЧИЙ СТІЛ · СИТУАЦІЙНИЙ ЦЕНТР</div><h2>На контролі сьогодні</h2><p>Ваші відкриті доручення, звернення та публікації з реальних даних Railway.</p></div><button type="button" id="officeDeskReload" class="secondary">Оновити дані</button></div>
 <div class="office-stat-grid" id="officeStats" aria-live="polite"></div>
 <div class="office-desk-grid"><section class="office-desk-block"><div class="office-desk-block-head"><h3>Доручення на виконанні</h3><button type="button" data-office-go="registry">Відкрити картотеку ↗</button></div><div id="officeWorkItems"></div></section>
 <section class="office-desk-block"><div class="office-desk-block-head"><h3>Нові звернення користувачів</h3><button type="button" data-office-go="feedback">Усі звернення ↗</button></div><div id="officeFeedback"></div></section></div>
 <div class="office-desk-footer" id="officeDeskStatus" role="status">Після входу завантажаться поточні дані.</div>`;
 const panel=dashboard.querySelector('[data-admin-panel="overview"]');
 panel?.prepend(desk);
 desk.addEventListener('click',e=>{const btn=e.target.closest('[data-office-go]');if(btn)activate(btn.dataset.officeGo)});
 const renderText=(root,message)=>{root.replaceChildren(el('p',message,'office-empty'))};
 const stats=(items)=>{
  const root=$('officeStats');root.replaceChildren();
  for(const entry of items){
   const button=el('button',null,'office-stat');
   button.type='button';button.append(icon(icons[entry.tab]),el('span',entry.name),el('strong',entry.value),el('small',entry.caption));
   button.onclick=()=>activate(entry.tab);root.append(button);
  }
 };
 const api=async route=>{
  if(typeof window.svitloAdminApi!=='function')throw Error('Адмін API недоступне');
  return window.svitloAdminApi(route);
 };
 let deskBusy=false;
 async function refreshDesk(){
  if(dashboard.hidden||deskBusy)return;
  deskBusy=true;$('officeDeskStatus').textContent='Отримуємо актуальні дані…';
  const [work,tickets,monitor,corrections]=await Promise.allSettled([
   api('work-items'),api('feedback'),api('monitor'),api('address-corrections')
  ]);
  const values=[work,tickets,monitor,corrections].map(x=>x.status==='fulfilled'?x.value:null);
  const [tasks,feedback,health,addresses]=values,items=tasks?.items||[],msgs=feedback?.items||[];
  const active=items.filter(x=>!['done','cancelled'].includes(x.status));
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Kyiv'});
  const overdue=active.filter(x=>x.dueDate&&x.dueDate<today);
  const pending=(health?.sources?.review?.items||[]).length;
  stats([
   {name:'На виконанні',value:tasks?active.length:'—',caption:'Відкриті доручення',tab:'registry'},
   {name:'Прострочено',value:tasks?overdue.length:'—',caption:'Потрібне рішення',tab:'registry'},
   {name:'Нові звернення',value:feedback?msgs.filter(x=>x.status==='new').length:'—',caption:'Чекають опрацювання',tab:'feedback'},
   {name:'Графіки на перевірці',value:health?pending:'—',caption:'Потрібна звірка джерела',tab:'sources'},
   {name:'Уточнення адрес',value:addresses?addresses.items?.filter(x=>x.status==='draft').length:'—',caption:'Чернетки на погодженні',tab:'corrections'}
  ]);
  const workRoot=$('officeWorkItems');workRoot.replaceChildren();
  const prioritized=[...active].sort((a,b)=>{
   const score=x=>(x.dueDate&&x.dueDate<today?4:0)+(x.priority==='urgent'?3:x.priority==='high'?2:0)+(x.status==='review'?1:0);
   return score(b)-score(a)||String(b.updatedAt).localeCompare(String(a.updatedAt));
  }).slice(0,7);
  for(const entry of prioritized){
   const b=el('button',null,'office-work-entry');b.type='button';
   b.append(el('small',entry.id),el('strong',entry.title),el('span',entry.dueDate&&entry.dueDate<today?'Прострочено · '+entry.dueDate:
    entry.status==='review'?'На перевірці':entry.assignee?'Виконавець: '+entry.assignee:'На виконанні'));
   b.onclick=()=>{activate('registry');window.dispatchEvent(new CustomEvent('svitlo:select-work',{detail:{id:entry.id}}))};workRoot.append(b);
  }
  if(!prioritized.length)renderText(workRoot,tasks?'Активних доручень немає.':'Реєстр доручень недоступний.');
  const feedbackRoot=$('officeFeedback');feedbackRoot.replaceChildren();
  const newest=msgs.filter(x=>x.status==='new').slice(0,5);
  for(const ticket of newest){
   const row=el('div',null,'office-ticket-entry'),left=el('div');
   const subject=ticket.subject||ticket.message?.slice(0,95)||'Звернення користувача';
   left.append(el('small',ticket.id),el('strong',subject));
   const b=el('button','У доручення','secondary');b.type='button';
   b.onclick=()=>{
    activate('registry');
    window.dispatchEvent(new CustomEvent('svitlo:open-work',{detail:{
     title:('Опрацювати звернення '+ticket.id).slice(0,120),reference:ticket.id,
     details:(ticket.subject?ticket.subject+'\n':'')+(ticket.message||'').slice(0,1500)
    }}));
   };row.append(left,b);feedbackRoot.append(row);
  }
  if(!newest.length)renderText(feedbackRoot,feedback?'Нових звернень немає.':'Звернення недоступні.');
  const missing=['картотека робіт','звернення','моніторинг','адреси'].filter((_,i)=>!values[i]);
  $('officeDeskStatus').textContent=missing.length?'Не вдалося завантажити: '+missing.join(', ')+'. Інші відомості показано.':
    'Дані з Railway · Оновлено о '+new Date().toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'})+'.';
  state.textContent=missing.length?'Частина даних недоступна':'З’єднання активне';
  state.classList.toggle('is-error',missing.length>0);
  deskBusy=false;
 }
 $('officeDeskReload').onclick=refreshDesk;
 document.querySelector('[data-admin-tab="overview"]')?.addEventListener('click',refreshDesk);
 document.addEventListener('svitlo:admin-ready',()=>{
  document.body.classList.add('office-ready');refreshDesk();updateTitle();
 });
 document.addEventListener('svitlo:admin-logout',()=>{
  hideModal();setNav(false);document.body.classList.remove('office-ready');
  state.textContent='Сеанс завершено';$('officeDeskStatus').textContent='Для перегляду потрібен вхід.';
  $('officeStats').replaceChildren();$('officeWorkItems').replaceChildren();$('officeFeedback').replaceChildren();
 });
 document.addEventListener('svitlo:work-updated',()=>{if(currently()==='overview')refreshDesk()});
})();
