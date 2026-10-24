/* Exact-building corrections with mandatory owner review and reversible publication. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);if(!$('corrList'))return;
 const api=(route,opts)=>window.svitloAdminApi(route,opts);
 let catalogue=null,items=[],chosen='',busy=false;
 const make=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
 const role=()=>document.body.dataset.adminRole;
 const canEdit=()=>['owner','editor'].includes(role());
 const owner=()=>role()==='owner';
 function alert(text,bad=false){$('corrMessage').textContent=text;$('corrMessage').dataset.error=String(bad)}
 const record=()=>items.find(x=>x.id===chosen);
 function places(){
  const sel=$('corrTown');sel.replaceChildren(new Option('Черкаси','черкаси'));
  for(const [key,val] of Object.entries(catalogue?.localities||{})){
   if(!val?.streets||!Object.keys(val.streets).length)continue;
   sel.add(new Option(val.label||key,key));
  }
 }
 function streets(chosenKey=''){
  const select=$('corrStreet'),idx=$('corrTown').value==='черкаси'?catalogue:catalogue?.localities?.[$('corrTown').value];
  select.replaceChildren(new Option('Оберіть вулицю',''));
  const names=Object.entries(idx?.streets||{}).sort((a,b)=>a[1].localeCompare(b[1],'uk-UA'));
  for(const [key,name] of names)select.add(new Option(name,key));
  select.value=chosenKey;if(select.value!==chosenKey)select.value='';
 }
 function selectItem(item){
  chosen=item?.id||'';
  $('corrHeading').textContent=item?'Уточнення '+item.id:'Нове адресне уточнення';
  $('corrRevision').textContent=item?'Редакція '+item.revision:'Чернетка не збережена';
  $('corrTown').value=item?.settlementKey||'черкаси';
  streets(item?.streetKey||'');
  $('corrHouse').value=item?.house||'';
  $('corrQueue').value=item?.queue||'';
  $('corrSource').value=item?.source||'';
  $('corrComment').value=item?.comment||'';
  $('corrPublish').checked=item?.status==='published';
  $('corrProof').checked=false;
  $('corrProofRow').hidden=!item||!owner();
  $('corrPublishRow').hidden=!item||!owner();
  $('corrDelete').hidden=!item||!owner();
  const disable=!canEdit();
  for(const element of $('corrForm').querySelectorAll('input,select,textarea,button')){
   element.disabled=disable||(element.id==='corrPublish'&&!owner())||(element.id==='corrProof'&&!owner());
  }
  $('corrDelete').disabled=!owner();
 }
 function draw(){
  const list=$('corrList'),query=$('corrSearch').value.toLocaleLowerCase('uk-UA'),status=$('corrFilter').value;
  list.replaceChildren();
  for(const item of items){
   if(status&&item.status!==status)continue;
   const label=item.id+' '+item.settlementKey+' '+item.streetKey+' '+item.house+' '+item.queue;
   if(query&&!label.toLocaleLowerCase('uk-UA').includes(query))continue;
   const row=make('button',undefined,'corr-row'+(chosen===item.id?' selected':''));
   row.type='button';
   row.append(make('strong',item.streetKey.split('|')[1]+' '+item.house),
    make('span',item.settlementKey+' · '+item.queue),
    make('small',item.status==='published'?'Опубліковано':'Чернетка'));
   row.onclick=()=>{selectItem(item);draw()};list.append(row);
  }
  if(!list.children.length)list.append(make('p','Уточнень за цим запитом немає.','hint'));
  $('corrCount').textContent=items.filter(x=>x.status==='published').length+' опубліковано, '+items.filter(x=>x.status==='draft').length+' чернеток';
 }
 async function refresh(){
  alert('Завантажуємо картотеку…');
  try{
   const r=await api('address-corrections');
   items=Array.isArray(r.items)?r.items:[];
   selectItem(items.find(x=>x.id===chosen)||null);
   draw();alert('Адресні уточнення синхронізовано з Railway.');
  }catch(e){alert('Не вдалося завантажити: '+e.message,true)}
 }
 async function loadCatalog(){
  try{
   const r=await fetch('./data/addresses.json',{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   catalogue=await r.json();
   places();streets();
  }catch(e){alert('Не вдалося завантажити адресний довідник: '+e.message,true)}
 }
 $('corrTown').onchange=()=>streets();
 $('corrNew').onclick=()=>{selectItem(null);draw()};
 $('corrReload').onclick=refresh;
 $('corrSearch').oninput=draw;
 $('corrFilter').onchange=draw;
 $('corrPublish').onchange=()=>{
  $('corrProofRow').hidden=!owner()||$('corrPublish').checked===false;
 };
 $('corrForm').onsubmit=async(event)=>{
  event.preventDefault();if(!canEdit()||busy)return;
  if(!$('corrStreet').value){alert('Спочатку оберіть вулицю з каталогу.',true);return}
  const item=record(),payload={
   settlementKey:$('corrTown').value,streetKey:$('corrStreet').value,
   house:$('corrHouse').value.trim(),queue:$('corrQueue').value,
   source:$('corrSource').value.trim(),comment:$('corrComment').value.trim()
  };
  if(item){
   payload.expectedRevision=item.revision;
   payload.status=$('corrPublish').checked?'published':'draft';
   const changed=['settlementKey','streetKey','house','queue','source'].some(key=>payload[key]!==item[key]);
   if(payload.status==='published'&&(item.status!=='published'||changed)){
    if(!owner()||!$('corrProof').checked){alert('Підтвердьте перевірку номера будинку за офіційним джерелом.',true);return}
    payload.confirmSourceReviewed=true;
    if(!confirm('Опублікувати підчергу '+payload.queue+' для будинку '+payload.house+'? Ця зміна вплине на всіх користувачів за адресою.'))return;
   }
  }
  busy=true;$('corrSave').disabled=true;
  try{
   const saved=await api(item?'address-corrections/'+encodeURIComponent(item.id):'address-corrections',{
    method:item?'PATCH':'POST',body:JSON.stringify(payload)});
   chosen=saved.id;await refresh();
   alert(item?'Адресу збережено. Опубліковані зміни надходять без GitHub.':'Чернетку створено. Щоб вплинути на застосунок, її має підтвердити власник.');
  }catch(e){alert('Не збережено: '+e.message,true)}
  finally{busy=false;$('corrSave').disabled=!canEdit()}
 };
 $('corrDelete').onclick=async()=>{
  const item=record();if(!item||!owner())return;
  if(!confirm('Видалити це уточнення? Якщо воно опубліковане, застосунок повернеться до офіційного довідника після синхронізації.'))return;
  try{await api('address-corrections/'+encodeURIComponent(item.id),{
   method:'DELETE',body:JSON.stringify({expectedRevision:item.revision})});chosen='';await refresh();
   alert('Адресне уточнення видалено.');
  }catch(e){alert('Помилка видалення: '+e.message,true)}
 };
 document.addEventListener('svitlo:admin-ready',async()=>{
  await loadCatalog();refresh();
 });
 document.querySelector('[data-admin-tab="corrections"]')?.addEventListener('click',refresh);
 document.addEventListener('svitlo:admin-logout',()=>{chosen='';items=[];catalogue=null;draw();alert('Увійдіть до адмінки.')});
})();
