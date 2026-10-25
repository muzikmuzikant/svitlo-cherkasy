/* Phone-first Office UX: navigation only, all protected actions keep existing handlers. */
(()=>{'use strict';
const root=document.getElementById('adminDashboard'),nav=root?.querySelector(':scope > nav.admin-tabs');
const dock=document.querySelector('.office-mobile-dock');
if(!root||!nav||!dock)return;
const phone=()=>matchMedia('(max-width:760px)').matches;
const can=id=>window.SvitloAdminAccess?.canTab(id)!==false;
const write=id=>window.SvitloAdminAccess?.canWrite(id)!==false;
const paths={
home:'M3 10.5 12 3l9 7.5V21H3V10.5z M9 21v-8h6v8',
inbox:'M3 4h18v16H3z M3 14h6l2 3h2l2-3h6',
mail:'M3 5h18v14H3z M3 6l9 7 9-7',
calendar:'M3 5h18v16H3z M7 3v5 M17 3v5 M3 10h18',
chart:'M4 20V10 M10 20V4 M16 20v-8 M22 20V7',
menu:'M4 6h16 M4 12h16 M4 18h16',
tools:'M4 20l9-9 M12 5a6 6 0 007 7l3-3-5-5-3 3z',
work:'M5 3h10l4 4v14H5z M15 3v5h4 M8 12h8 M8 16h8',
search:'M11 19a8 8 0 110-16 8 8 0 010 16z M17 17l5 5',
close:'M6 6l12 12 M18 6L6 18'
};
function svg(name){
const el=document.createElementNS('http://www.w3.org/2000/svg','svg');
el.setAttribute('viewBox','0 0 24 24');el.setAttribute('fill','none');
el.setAttribute('stroke','currentColor');el.setAttribute('stroke-width','1.8');
el.setAttribute('stroke-linecap','round');el.setAttribute('stroke-linejoin','round');el.setAttribute('aria-hidden','true');
const path=document.createElementNS('http://www.w3.org/2000/svg','path');
path.setAttribute('d',paths[name]||paths.menu);el.append(path);return el;
}
function make(tag,cls,label){
const node=document.createElement(tag);if(cls)node.className=cls;
if(label!==undefined)node.textContent=label;return node;
}
function go(id,then){
if(root.hidden||!can(id))return;
const tab=root.querySelector('[data-admin-tab="'+id+'"]');
if(!tab||tab.hidden)return;
tab.click();document.activeElement?.blur?.();window.scrollTo(0,0);
if(then&&write(id))document.getElementById(then)?.click();
}
const shortcuts=[
['operations','Нове повідомлення','Написати користувачам','mail','opsNewNotice'],
['feedback','Звернення','Відповіді та статуси','inbox'],
['planner','Графіки','Ручне керування','calendar'],
['maintenance','Техроботи','Режим застосунку','tools'],
['registry','Доручення','Завдання та контроль','work'],
['insights','Аналітика','Статистика сервісу','chart']
];
const start=root.querySelector(':scope > [data-admin-panel="overview"]');
const hub=make('section','phone-quick');
hub.setAttribute('aria-label','Швидкі дії адміністратора');
const header=make('div','phone-quick-head');
const text=make('div');
text.append(make('small',null,'Швидкий доступ'),make('h2',null,'Що потрібно зробити?'));
const finder=make('button','phone-quick-search');
finder.type='button';finder.setAttribute('aria-label','Знайти розділ');
finder.append(svg('search'));finder.onclick=()=>root.querySelector('.office-search-open')?.click();
header.append(text,finder);
const grid=make('div','phone-quick-grid'),buttons=[];
for(const [id,title,subtitle,glyph,create] of shortcuts){
const item=make('button','phone-quick-item');item.type='button';item.dataset.phoneGo=id;
const mark=make('span','phone-quick-icon');mark.append(svg(glyph));
const label=make('span','phone-quick-label');
label.append(make('strong',null,title),make('small',null,subtitle));
item.append(mark,label);item.onclick=()=>go(id,create);grid.append(item);
buttons.push({id,create,item});
}
hub.append(header,grid);start?.prepend(hub);
// Reuse the original authenticated bottom bar, but replace text glyphs with SVG.
const entries=[
{id:'overview',name:'Огляд',glyph:'home'},
{id:'feedback',name:'Звернення',glyph:'inbox'},
{id:'operations',name:'Дописи',glyph:'mail'},
{id:'planner',name:'Графіки',glyph:'calendar'},
{id:'menu',name:'Розділи',glyph:'menu'}
];
const bottom=[...dock.querySelectorAll('[data-mobile-tab]')];
bottom.forEach((btn,i)=>{
const item=entries[i];if(!item)return;
btn.dataset.mobileTab=item.id;btn.setAttribute('aria-label',item.name);
btn.querySelector('.office-mobile-tab-icon')?.replaceChildren(svg(item.glyph));
const caption=btn.querySelector(':scope > span:not(.office-mobile-tab-icon):not(.office-mobile-ticket-unread)');
if(caption)caption.textContent=item.name;
btn.onclick=()=>{
const target=btn.dataset.mobileTab;
if(target==='menu')root.querySelector('.office-menu-button')?.click();
else go(target);
};
});
// A dedicated mobile drawer with meaningful close, search and sign out controls.
const drawer=make('div','phone-drawer-head'),title=make('div','phone-drawer-title');
title.append(make('small',null,'SVITLO OFFICE'),make('strong',null,'Розділи'),make('span',null,'Панель керування'));
const close=make('button','phone-drawer-close');
close.type='button';close.setAttribute('aria-label','Закрити меню');
close.append(svg('close'));close.onclick=()=>nav.querySelector('.office-close-nav')?.click();
drawer.append(title,close);nav.querySelector('.office-close-nav')?.after(drawer);
const exit=make('button','phone-drawer-exit','Вийти з акаунта');exit.type='button';
exit.onclick=()=>{close.click();document.getElementById('disconnect')?.click();};
const foot=make('div','phone-drawer-foot');
foot.append(make('small',null,'Захищена адмінка'),exit);nav.append(foot);
const current=()=>root.querySelector('[data-admin-tab][aria-pressed="true"]')?.dataset.adminTab||'overview';
function render(){
if(!phone())return;
dock.hidden=root.hidden;
const fallback=can('planner')?'planner':can('insights')?'insights':can('quality')?'quality':'';
const choice=bottom[3];
if(choice){
choice.dataset.mobileTab=fallback;choice.hidden=!fallback;
const isPlanner=fallback==='planner',label=isPlanner?'Графіки':fallback==='insights'?'Аналітика':'Діагностика';
choice.setAttribute('aria-label',label);
const text=choice.querySelector(':scope > span:not(.office-mobile-tab-icon):not(.office-mobile-ticket-unread)');
if(text)text.textContent=label;
choice.querySelector('.office-mobile-tab-icon')?.replaceChildren(svg(isPlanner?'calendar':'chart'));
}
bottom.forEach(b=>{
if(b!==choice)b.hidden=b.dataset.mobileTab!=='menu'&&!can(b.dataset.mobileTab);
const selected=b.dataset.mobileTab===current()||(b.dataset.mobileTab==='menu'&&document.body.classList.contains('office-mobile-nav'));
b.setAttribute('aria-current',selected?'page':'false');
});
for(const {id,create,item} of buttons)item.hidden=!can(id)||(!!create&&!write(id));
}
const observe=new MutationObserver(render);
for(const tab of root.querySelectorAll('[data-admin-tab]'))observe.observe(tab,{attributes:true,attributeFilter:['aria-pressed','hidden']});
observe.observe(root,{attributes:true,attributeFilter:['hidden']});
const state=new MutationObserver(()=>{
render();
if(phone()&&document.body.classList.contains('office-mobile-nav'))close.focus({preventScroll:true});
});
state.observe(document.body,{attributes:true,attributeFilter:['class']});
let startX=null;
nav.addEventListener('touchstart',e=>{
if(!phone()||!document.body.classList.contains('office-mobile-nav')||e.touches.length!==1)return;
startX={x:e.touches[0].clientX,y:e.touches[0].clientY};
},{passive:true});
nav.addEventListener('touchend',e=>{
if(!startX||e.changedTouches.length!==1)return;
const dx=e.changedTouches[0].clientX-startX.x,dy=e.changedTouches[0].clientY-startX.y;
if(dx<-75&&Math.abs(dx)>Math.abs(dy)*1.6)close.click();
startX=null;
},{passive:true});
const editing=t=>!!t?.matches?.('input:not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable="true"]');
document.addEventListener('focusin',e=>{if(phone()&&editing(e.target))document.body.classList.add('phone-keyboard')});
document.addEventListener('focusout',()=>setTimeout(()=>{if(!editing(document.activeElement))document.body.classList.remove('phone-keyboard')},40));
document.addEventListener('svitlo:admin-ready',render);
document.addEventListener('svitlo:admin-logout',()=>{
if(document.body.classList.contains('office-mobile-nav'))close.click();
document.body.classList.remove('phone-keyboard');render();
});
window.addEventListener('resize',()=>{document.body.classList.remove('phone-keyboard');render()},{passive:true});
render();
})();
