/* Workspace improvements: global field search and favorite admin sections. */
(()=>{'use strict';
 const tabs=[...document.querySelectorAll('[data-admin-tab]')],panels=[...document.querySelectorAll('[data-admin-panel]')];
 const input=document.getElementById('controlSearch');if(!input||!tabs.length)return;
 const FAVORITES='svitlo-admin-favorites-v798';
 let favorites=[];try{favorites=JSON.parse(localStorage.getItem(FAVORITES)||'[]');if(!Array.isArray(favorites))favorites=[]}catch{}
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el};
 const nav=input.closest('.control-nav-search')||input.parentElement;
 const results=node('div',undefined,'admin-search-results');results.hidden=true;nav.append(results);
 const pinned=node('div',undefined,'admin-favorites');nav.after(pinned);
 const name=tab=>(tab.querySelector('span')?.textContent||tab.textContent||'').trim();
 const tabFor=id=>tabs.find(t=>t.dataset.adminTab===id);
 const store=()=>{try{localStorage.setItem(FAVORITES,JSON.stringify(favorites))}catch{}};
 const open=id=>{const tab=tabFor(id);if(tab){tab.click();input.blur()}};
 const renderFavorites=()=>{
  pinned.replaceChildren();
  if(!favorites.length)return;
  pinned.append(node('div','ОБРАНЕ','admin-favorites-kicker'));
  for(const id of favorites){const t=tabFor(id);if(!t||t.hidden||window.SvitloAdminAccess?.canTab(id)===false)continue;
   const b=node('button',name(t));b.type='button';b.onclick=()=>open(id);pinned.append(b)}
 };
 // Favorite controls belong in their own layout, never inserted as negative-margin
 // siblings of nav buttons. The old per-row pin buttons caused 31px overlaps.
 const manager=node('details',undefined,'admin-favorite-manager');
 const managerLabel=node('summary','Налаштувати обране');
 const managerContent=node('div',undefined,'admin-favorite-options');
 manager.append(managerLabel,managerContent);
 pinned.after(manager);
 function renderManager(){
  managerContent.replaceChildren();
  let count=0;
  for(const tab of tabs){
   const id=tab.dataset.adminTab;
   if(!id||tab.hidden||window.SvitloAdminAccess?.canTab(id)===false)continue;
   count++;
   const line=node('label',undefined,'admin-favorite-option');
   const check=node('input');check.type='checkbox';check.checked=favorites.includes(id);
   check.setAttribute('aria-label','Додати до обраного: '+name(tab));
   check.addEventListener('change',()=>{
    favorites=check.checked?[...new Set([...favorites,id])]:favorites.filter(x=>x!==id);
    store();renderFavorites();
   });
   line.append(check,node('span',name(tab)));managerContent.append(line);
  }
  manager.hidden=!count;
 }
 document.addEventListener('svitlo:admin-ready',()=>{renderFavorites();renderManager()});
 document.addEventListener('svitlo:admin-logout',()=>{pinned.replaceChildren();managerContent.replaceChildren();manager.hidden=true});
 function searchable(){
  const found=[];
  for(const panel of panels){
   const id=panel.dataset.adminPanel,tab=tabFor(id);
   if(!tab)continue;
   for(const item of panel.querySelectorAll('h2,h3,h4,label,summary')){
    const str=(item.textContent||'').trim().replace(/\s+/g,' ').slice(0,140);
    if(str.length>=4)found.push({id,item,text:str,section:name(tab)});
   }
  }
  return found
 }
 const entries=searchable();
 const oldPlaceholder=input.placeholder;
 input.placeholder='Пошук розділів і налаштувань…';
 input.addEventListener('input',()=>{
  const q=input.value.trim().toLocaleLowerCase('uk-UA');results.replaceChildren();
  if(q.length<2){results.hidden=true;return}
  const matching=entries.filter(x=>x.text.toLocaleLowerCase('uk-UA').includes(q)).slice(0,16);
  if(!matching.length){results.append(node('p','Нічого не знайдено'));results.hidden=false;return}
  for(const x of matching){
   const b=node('button',undefined,'admin-search-result');b.type='button';
   b.append(node('strong',x.text),node('small',x.section));
   b.onclick=()=>{input.value='';results.hidden=true;open(x.id);setTimeout(()=>{x.item.scrollIntoView({behavior:'smooth',block:'center'})},170)};
   results.append(b)
  }results.hidden=false;
 });
 document.addEventListener('click',event=>{if(!nav.contains(event.target))results.hidden=true});
 input.addEventListener('keydown',e=>{if(e.key==='Escape'){input.value='';results.hidden=true}});
 renderFavorites();renderManager();
})();
