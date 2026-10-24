/* Svitlo Office: one authoritative UI projection of verified Railway account scopes.
 * Hidden tools still require server-side permission checks. */
(()=>{'use strict';
 const dashboard=document.getElementById('adminDashboard');if(!dashboard)return;
 const $=id=>document.getElementById(id);
 const MODULE={
  overview:null,insights:'view',quality:'view',audit:'view',
  registry:'settings',corrections:'schedules',sources:'schedules',planner:'schedules',tools:'schedules',
  operations:'notices',push:'push',media:'media',ads:'ads',
  feedback:'feedback',help:'help',
  social:'owner',live:'owner',features:'owner',design:'owner',maintenance:'owner',
  data:'owner',security:'owner',backup:'owner',revisions:'owner'
 };
 const ROLE={owner:'Власник',editor:'Редактор',operator:'Оператор',viewer:'Перегляд'};
 const legacy={
  editor:new Set(['overview','insights','quality','audit','registry','corrections','sources','planner','tools','operations','media','ads','feedback','help']),
  operator:new Set(['overview','insights','quality','feedback']),
  viewer:new Set(['overview','insights','quality','audit'])
 };
 let identity=null;
 const identityCard=document.createElement('section');
 identityCard.className='office-identity';
 identityCard.setAttribute('aria-label','Поточний обліковий запис');
 const identAvatar=document.createElement('span');identAvatar.className='office-identity-avatar';
 const identText=document.createElement('div');identText.className='office-identity-text';
 const identName=document.createElement('strong'),identRole=document.createElement('small');
 identText.append(identName,identRole);
 identityCard.append(identAvatar,identText);
 const head=dashboard.querySelector('.control-head-actions');
 head?.prepend(identityCard);
 // Identity stays on the home workspace even when overview metrics are restricted.
 const overview=dashboard.querySelector('[data-admin-panel="overview"]');
 const homeCard=document.createElement('div');homeCard.className='office-my-account';
 homeCard.innerHTML='<div class="office-my-account-icon" aria-hidden="true">◈</div><div><span class="office-my-account-label">ПОТОЧНИЙ АКАУНТ</span><strong class="office-my-account-name"></strong><p class="office-my-account-role"></p><small class="office-my-account-rights"></small></div>';
 overview?.querySelector('.office-context')?.after(homeCard);
 if(!homeCard.isConnected)overview?.prepend(homeCard);
 const allowedTab=id=>{
  if(!identity)return false;
  if(identity.role==='owner'&&!identity.managed)return true;
  if(!Object.hasOwn(MODULE,id))return false;
  if(id==='overview')return true;
  if(MODULE[id]==='owner')return false;
  if(Array.isArray(identity.permissions))return identity.permissions.includes(MODULE[id]);
  return legacy[identity.role]?.has(id)===true;
 };
 const canWrite=id=>{
  if(!allowedTab(id))return false;
  if(identity?.role==='owner'&&!identity.managed)return true;
  if(identity?.role==='viewer')return false;
  if(identity?.role==='operator')return id==='feedback';
  return identity?.role==='editor';
 };
 const CHANGE=/^(?:створити|створення|зберегти|опублікувати|видалити|призупинити|відновити|підтвердити|скасувати підтвердження|надіслати|надіслання|розіслати|додати|змінити|застосувати|оновити налаштування|запустити|нова картка|нове|новий)/i;
 function conceal(node,hide){
  if(node.hidden===hide)return;
  node.hidden=hide;
 }
 function project(){
  if(!identity)return;
  const count=[];
  for(const tab of dashboard.querySelectorAll('[data-admin-tab]')){
   const allowed=allowedTab(tab.dataset.adminTab);
   conceal(tab,!allowed);if(allowed)count.push(tab);
  }
  for(const section of dashboard.querySelectorAll('[data-admin-panel]')){
   if(!allowedTab(section.dataset.adminPanel))section.hidden=true;
  }
  for(const group of dashboard.querySelectorAll('.control-nav-group')){
   const tabs=[...group.querySelectorAll('[data-admin-tab]')];
   group.hidden=tabs.length>0&&tabs.every(x=>x.hidden);
  }
  for(const control of dashboard.querySelectorAll('[data-ops-jump],[data-admin-target]')){
   const target=control.dataset.opsJump||control.dataset.adminTarget;
   conceal(control,!allowedTab(target));
  }
  // Never expose generic recents or cross-module shortcuts from an old user.
  for(const box of dashboard.querySelectorAll('.office-recent-list button')){
   const target=box.dataset.adminTarget;
   conceal(box,!target||!allowedTab(target));
  }
  // Ordinary readers can filter/search/refresh. Mutation-projected writing
  // actions disappear from their modules, including late-created ones.
  for(const section of dashboard.querySelectorAll('[data-admin-panel]')){
   const id=section.dataset.adminPanel;
   if(!allowedTab(id)||canWrite(id))continue;
   for(const btn of section.querySelectorAll('button[type="submit"],button')){
    if(btn.closest('.office-context-back'))continue;
    const label=(btn.textContent||btn.getAttribute('aria-label')||'').trim();
    if(btn.type==='submit'||CHANGE.test(label))conceal(btn,true);
   }
  }
  // No metrics or ticket contents without the generic dashboard scope.
  const hasOverviewData=identity.role==='owner'&&!identity.managed ||
   (Array.isArray(identity.permissions)?identity.permissions.includes('view'):legacy[identity.role]?.has('insights'));
  for(const id of ['opsDashboard','monitorMetrics','monitorMessage','monitorRefresh']){
   const el=$(id);if(el)conceal(el,!hasOverviewData);
  }
  const navCount=$('controlNavigationCount');const label=count.length+' доступних розділів';
  if(navCount&&navCount.textContent!==label)navCount.textContent=label;
  const active=dashboard.querySelector('[data-admin-tab][aria-pressed="true"]');
  if(!active||active.hidden){
   dashboard.querySelector('[data-admin-tab="overview"]')?.click();
  }
 }
 function apply(account){
  if(!account?.username||!account.role)return;
  identity={username:String(account.username),role:account.role,
   managed:account.managed===true,permissions:Array.isArray(account.permissions)?[...account.permissions]:null};
  identName.textContent=identity.username;
  identAvatar.textContent=identity.username.slice(0,2).toLocaleUpperCase('uk-UA');
  identRole.textContent=ROLE[identity.role]||'Користувач';
  homeCard.querySelector('.office-my-account-name').textContent=identity.username;
  homeCard.querySelector('.office-my-account-role').textContent='Роль: '+(ROLE[identity.role]||identity.role);
  const rights=identity.managed?identity.permissions?.length?identity.permissions.join(' · '):'Без додаткових прав':
   identity.role==='owner'?'Повний доступ':'Доступ відповідно до ролі';
  homeCard.querySelector('.office-my-account-rights').textContent=rights;
  dashboard.dataset.officeAccountRole=identity.role;
  document.body.classList.toggle('office-readonly',identity.role==='viewer');
  project();
 }
 function reset(){
  identity=null;
  identityCard.classList.remove('is-active');
  homeCard.querySelector('.office-my-account-name').textContent='';
  document.body.classList.remove('office-readonly');
  dashboard.removeAttribute('data-office-account-role');
 }
 document.addEventListener('click',event=>{
  const tab=event.target.closest?.('[data-admin-tab]');
  if(tab&&!allowedTab(tab.dataset.adminTab)){
   event.preventDefault();event.stopImmediatePropagation();
  }
 },true);
 const observer=new MutationObserver(records=>{
  if(!identity)return;
  if(!records.some(r=>r.addedNodes.length))return;
  // Coalesce writes, never react to statistics text updates.
  if(observer.pending)return;
  observer.pending=true;
  queueMicrotask(()=>{observer.pending=false;project()});
 });
 observer.observe(dashboard,{childList:true,subtree:true});
 document.addEventListener('svitlo:admin-ready',()=>{const profile=window.SvitloAdminIdentity?.();if(profile)apply(profile)});
 document.addEventListener('svitlo:admin-logout',reset);
 window.SvitloAdminAccess={apply,reset,canTab:allowedTab,canWrite};
})();
