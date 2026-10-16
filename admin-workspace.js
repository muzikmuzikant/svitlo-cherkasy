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
  for(const id of favorites){const t=tabFor(id);if(!t)continue;
   const b=node('button',name(t));b.type='button';b.onclick=()=>open(id);pinned.append(b)}
 };
 const icons=node('div',undefined,'admin-favorite-edit');
 for(const tab of tabs){
  const id=tab.dataset.adminTab;if(!id)continue;
  const toggle=node('button',favorites.includes(id)?'📌':'📍','admin-fav-star');
  toggle.type='button';toggle.title='Закріпити розділ «'+name(tab)+'»';
  toggle.setAttribute('aria-label',toggle.title);
  toggle.onclick=e=>{e.preventDefault();e.stopPropagation();favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];toggle.textContent=favorites.includes(id)?'📌':'📍';store();renderFavorites()};
  tab.insertAdjacentElement('afterend',toggle);
 }
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
 renderFavorites();
})();
