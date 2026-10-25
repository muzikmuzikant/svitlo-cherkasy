/* Independent iPhone Office menu. The old desktop nav remains the action source. */
(()=>{'use strict';
 const root=document.getElementById('adminDashboard');
 const source=root?.querySelector(':scope > nav.admin-tabs');
 if(!root||!source)return;
 const phone=()=>matchMedia('(max-width:760px)').matches;
 const allowed=id=>window.SvitloAdminAccess?.canTab(id)!==false;
 const current=()=>root.querySelector('[data-admin-tab][aria-pressed="true"]')?.dataset.adminTab||'overview';
 const create=(tag,cls,value)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;
 };
 const paths={
  search:'M11 19a8 8 0 110-16 8 8 0 010 16z M17 17l5 5',
  close:'M6 6l12 12 M18 6L6 18',chevron:'M9 6l6 6-6 6',
  list:'M4 6h16 M4 12h16 M4 18h16'
 };
 function icon(type){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',paths[type]);svg.append(path);return svg;
 }
 const overlay=create('button','phone-menu-overlay');
 overlay.type='button';overlay.tabIndex=-1;overlay.setAttribute('aria-label','Закрити меню');
 const drawer=create('aside','phone-menu-drawer');
 drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');
 drawer.setAttribute('aria-label','Розділи адміністративної системи');
 drawer.setAttribute('aria-hidden','true');drawer.inert=true;
 const title=create('div','phone-menu-head');
 const copy=create('div','phone-menu-head-copy');
 copy.append(create('small',null,'СВІТЛО ЧЕРКАСИ'),create('strong',null,'Розділи'),create('span',null,'Оберіть потрібний інструмент'));
 const close=create('button','phone-menu-close');
 close.type='button';close.setAttribute('aria-label','Закрити розділи');close.append(icon('close'));
 title.append(copy,close);
 const search=create('div','phone-menu-search');
 search.append(icon('search'));
 const input=create('input','phone-menu-input');input.type='search';
 input.placeholder='Пошук розділу';input.autocomplete='off';
 input.setAttribute('aria-label','Пошук по розділах');
 search.append(input);
 const list=create('div','phone-menu-list');
 const footer=create('div','phone-menu-footer');
 const count=create('span','phone-menu-count');
 const logout=create('button','phone-menu-logout','Вийти');
 logout.type='button';footer.append(count,logout);
 drawer.append(title,search,list,footer);
 document.body.append(overlay,drawer);
 const closeMenu=()=>{
  const closeOriginal=source.querySelector('.office-close-nav');
  if(closeOriginal)closeOriginal.click();
  else document.body.classList.remove('office-mobile-nav');
 };
 close.addEventListener('click',closeMenu);
 overlay.addEventListener('click',closeMenu);
 logout.addEventListener('click',()=>{closeMenu();document.getElementById('disconnect')?.click()});
 const groups=[];
 const catalog=()=>[...source.querySelectorAll(':scope > .control-nav-group')];
 for(const original of catalog()){
  const available=[...original.querySelectorAll('[data-admin-tab]')];
  if(!available.length)continue;
  const block=create('section','phone-menu-group');
  const toggle=create('button','phone-menu-toggle');toggle.type='button';
  const label=original.querySelector(':scope > .office-group-toggle')?.textContent.trim()
   ||original.querySelector(':scope > span')?.textContent.trim()||'Інші';
  toggle.append(create('span',null,label),icon('chevron'));
  const contents=create('div','phone-menu-items');
  const entries=[];
  for(const target of available){
   const id=target.dataset.adminTab;
   const name=target.querySelector(':scope > span')?.textContent.trim()||
    target.getAttribute('aria-label')||id;
   const button=create('button','phone-menu-link');button.type='button';
   button.dataset.phoneSection=id;
   const symbol=create('span','phone-menu-link-icon');
   symbol.append(target.querySelector(':scope > svg')?.cloneNode(true)||icon('list'));
   button.append(symbol,create('span','phone-menu-link-text',name));
   button.addEventListener('click',()=>{
    if(!allowed(id)||target.hidden||root.hidden)return;
    target.click();closeMenu();window.scrollTo(0,0);
   });
   contents.append(button);
   entries.push({id,name,button,target});
  }
  const group={block,toggle,contents,entries,expanded:groups.length===0};
  toggle.addEventListener('click',()=>{group.expanded=!group.expanded;render()});
  block.append(toggle,contents);list.append(block);groups.push(group);
 }
 function render(){
  const query=input.value.trim().toLocaleLowerCase('uk-UA');
  let total=0;
  for(const group of groups){
   let visible=0;
   for(const {id,name,button,target} of group.entries){
    const show=allowed(id)&&!target.hidden&&(!query||name.toLocaleLowerCase('uk-UA').includes(query));
    button.hidden=!show;
    button.setAttribute('aria-current',current()===id?'page':'false');
    if(show)visible++;
   }
   total+=visible;group.block.hidden=!visible;
   const expanded=!!query||group.expanded;
   group.contents.hidden=!expanded;
   group.toggle.setAttribute('aria-expanded',String(expanded));
  }
  count.textContent=total+' доступних розділів';
 }
 input.addEventListener('input',render);
 const tracked=new MutationObserver(render);
 for(const tab of source.querySelectorAll('[data-admin-tab]'))
  tracked.observe(tab,{attributes:true,attributeFilter:['hidden','aria-pressed']});
 let open=false;
 function sync(){
  const next=phone()&&!root.hidden&&document.body.classList.contains('office-mobile-nav');
  if(next===open){if(next)render();return}
  open=next;
  drawer.classList.toggle('is-open',open);overlay.classList.toggle('is-open',open);
  drawer.inert=!open;drawer.setAttribute('aria-hidden',String(!open));
  if(open){
   input.value='';
   for(const group of groups)if(group.entries.some(r=>r.id===current()))group.expanded=true;
   render();input.focus({preventScroll:true});
  }else if(phone())root.querySelector('.office-menu-button')?.focus({preventScroll:true});
 }
 const state=new MutationObserver(sync);
 state.observe(document.body,{attributes:true,attributeFilter:['class']});
 state.observe(root,{attributes:true,attributeFilter:['hidden']});
 let gesture=null;
 drawer.addEventListener('touchstart',e=>{
  if(!open||e.touches.length!==1)return;
  gesture={x:e.touches[0].clientX,y:e.touches[0].clientY};
 },{passive:true});
 drawer.addEventListener('touchend',e=>{
  if(!gesture||e.changedTouches.length!==1)return;
  const dx=e.changedTouches[0].clientX-gesture.x,dy=e.changedTouches[0].clientY-gesture.y;
  if(dx<-75&&Math.abs(dx)>Math.abs(dy)*1.6)closeMenu();
  gesture=null;
 },{passive:true});
 drawer.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeMenu();return}
  if(e.key!=='Tab')return;
  const focusable=[...drawer.querySelectorAll('input,button:not([hidden])')]
   .filter(el=>!el.closest('[hidden]')&&el.getClientRects().length);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 });
 document.addEventListener('svitlo:admin-ready',()=>{render();sync()});
 document.addEventListener('svitlo:admin-logout',()=>{closeMenu();render();sync()});
 window.addEventListener('resize',()=>{
  if(!phone()&&open)closeMenu();
  sync();
 },{passive:true});
 render();sync();
})();
