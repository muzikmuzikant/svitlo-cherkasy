/* Compact Svitlo Office mobile navigation */
(()=>{'use strict';
const root=document.getElementById('adminDashboard');if(!root)return;
const bar=document.createElement('nav');bar.className='office-mobile-dock';bar.setAttribute('aria-label','Навігація адмінпанелі');
const tabs=[['overview','⌂','Огляд'],['feedback','▣','Звернення'],['operations','▤','Публікації'],['insights','▥','Аналітика'],['menu','☷','Меню']];
for(const [id,symbol,label] of tabs){
 const btn=document.createElement('button');btn.type='button';btn.dataset.mobileTab=id;
 btn.setAttribute('aria-label',label);
 const icon=document.createElement('span');icon.textContent=symbol;icon.className='office-mobile-tab-icon';
 const caption=document.createElement('span');caption.textContent=label;
 btn.append(icon,caption);
 if(id==='feedback'){
  const unread=document.createElement('span');
  unread.className='office-mobile-ticket-unread';unread.hidden=true;
  unread.setAttribute('aria-label','Нові звернення');
  btn.append(unread);
 }
 bar.append(btn);
 btn.onclick=()=>{
  if(id==='menu'){root.querySelector('.office-menu-button')?.click();return}
  root.querySelector('[data-admin-tab="'+id+'"]')?.click();
  window.scrollTo(0,0);
 };
}
document.body.append(bar);
function render(){
 bar.hidden=root.hidden;
 const id=root.querySelector('[data-admin-tab][aria-pressed="true"]')?.dataset.adminTab||'overview';
 for(const b of bar.querySelectorAll('button')){
  const selected=b.dataset.mobileTab===id||(b.dataset.mobileTab==='menu'&&!tabs.some(t=>t[0]===id));
  b.setAttribute('aria-current',selected?'page':'false');
 }
}
for(const tab of root.querySelectorAll('[data-admin-tab]'))new MutationObserver(render).observe(tab,{attributes:true,attributeFilter:['aria-pressed']});
new MutationObserver(render).observe(root,{attributes:true,attributeFilter:['hidden']});
document.addEventListener('svitlo:admin-ready',render);
document.addEventListener('svitlo:admin-logout',render);
 function updateTicketBadge(){
  const badge=bar.querySelector('.office-mobile-ticket-unread');
  if(!badge)return;
  const tickets=window.SvitloTicketWorkflow?.list?.();
  const count=Array.isArray(tickets)?tickets.filter(t=>t.status==='new').length:0;
  badge.hidden=!count||root.hidden;
  badge.textContent=count>99?'99+':String(count);
 }
 document.addEventListener('svitlo:tickets-loaded',updateTicketBadge);
 document.addEventListener('svitlo:admin-logout',()=>{
  const badge=bar.querySelector('.office-mobile-ticket-unread');
  if(badge){badge.hidden=true;badge.textContent=''}
 });

window.SvitloMobileAdmin={openTicket(){if(window.innerWidth<=760)document.getElementById('ticketDetail')?.scrollIntoView({behavior:'smooth',block:'start'})},decorateTicket(){}};
render();
})();
