/* Main-app address catalogue and reviewed address corrections.
 * Catalog rows are read-only references. Saving creates a reversible correction
 * instead of modifying imported official data. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 if(!$('corrList'))return;
 const api=(route,opts)=>window.svitloAdminApi(route,opts);
 const create=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node};
 const role=()=>document.body.dataset.adminRole;
 const canEdit=()=>['owner','editor'].includes(role());
 const owner=()=>role()==='owner';
 let catalogue=null,items=[],addresses=[],chosen='',baseSelection=null,busy=false,limit=90,renderTimer=null;
 const identity=(town,street,house)=>town+'|'+street+'|'+house;
 const allQueues=()=>Array.from({length:6},(_,i)=>[1,2].map(n=>(i+1)+'.'+n)).flat();
 function readQueues(){return Array.from($('corrQueues')?.querySelectorAll('input:checked')||[]).map(x=>x.value)}
 function writeQueues(values=[]){const root=$('corrQueues');if(!root)return;root.replaceChildren();for(const q of allQueues()){const label=create('label',undefined,'corr-queue-option');const input=create('input');input.type='checkbox';input.value=q;input.checked=values.includes(q);label.append(input,create('span',q));root.append(label)}}
 function addStreet(){const name=prompt('Назва нової вулиці');if(!name?.trim())return;const clean=name.trim();const prefix=/^(вулиця|провулок|проспект|бульвар|узвіз|алея|площа|майдан|шосе|набережна|тупик|проїзд)\\s+/i.test(clean)?clean:'Вулиця '+clean;const kind=(prefix.match(/^(вулиця|провулок|проспект|бульвар|узвіз|алея|площа|майдан|шосе|набережна|тупик|проїзд)/i)||['вулиця'])[0].toLocaleLowerCase('uk-UA');const key=kind+'|'+prefix.slice(kind.length).trim().toLocaleLowerCase('uk-UA').replace(/\\s+/g,'-');const option=new Option(prefix,key);$('corrStreet').add(option);$('corrStreet').value=key;}
 function addTown(){const name=prompt('Назва нового населеного пункту');if(!name?.trim())return;const label=name.trim(),key=label.toLocaleLowerCase('uk-UA').replace(/\\s+/g,'-');const option=new Option(label,key);$('corrTown').add(option);$('corrBrowseTown').add(new Option(label,key));catalogue.localities??={};catalogue.localities[key]={label,streets:{},keys:{},streetQueues:{}};$('corrTown').value=key;$('corrBrowseTown').value=key;streets();}
 const record=()=>items.find(row=>row.id===chosen);
 const indexFor=town=>town==='черкаси'?catalogue:catalogue?.localities?.[town];
 function announce(message,isError=false){
  if(!$('corrMessage'))return;
  $('corrMessage').textContent=message;$('corrMessage').dataset.error=String(isError);
 }
 function placeChoices(){
  const towns=[['черкаси','Черкаси'],...Object.entries(catalogue?.localities||{})
    .filter(([,v])=>!!v)
    .map(([key,v])=>[key,v.label||key])];
  towns.sort((a,b)=>a[1].localeCompare(b[1],'uk-UA'));
  for(const id of ['corrTown','corrBrowseTown']){
   const select=$(id);if(!select)continue;
   const before=select.value;select.replaceChildren();
   for(const [key,label] of towns)select.add(new Option(label,key));
   select.value=towns.some(([key])=>key===before)?before:'черкаси';
  }
 }
 function streets(wanted=''){
  const town=$('corrTown').value,idx=indexFor(town),select=$('corrStreet');
  select.replaceChildren(new Option('Оберіть вулицю',''));
  for(const [key,name] of Object.entries(idx?.streets||{}).sort((a,b)=>a[1].localeCompare(b[1],'uk-UA')))
   select.add(new Option(name,key));
  if(wanted&&!Array.from(select.options).some(option=>option.value===wanted))
   select.add(new Option(wanted.replace('|',' '),wanted));
  select.value=wanted||'';
 }
 function buildCatalog(){
  addresses=[];
  const towns=[['черкаси',catalogue],...Object.entries(catalogue?.localities||{})];
  for(const [town,idx] of towns){
   if(!idx?.streets)continue;
   for(const [key,queues] of Object.entries(idx.keys||{})){
    const cut=key.lastIndexOf('|');if(cut<0)continue;
    const street=key.slice(0,cut),house=key.slice(cut+1);
    if(!street||!house||!Array.isArray(queues)||!queues.length)continue;
    addresses.push({town,street,house,queues,streetLabel:idx.streets[street]||street.replace('|',' '),catalog:true});
   }
   for(const [street,name] of Object.entries(idx.streets||{})){
    // Every street is selectable without a house even if the catalog has house-level records.
    // On split streets, a street-wide published correction must not change exact house data.
    addresses.push({town,street,house:'',queues:idx.streetQueues?.[street]||[],streetLabel:name,catalog:true});
   }
  }
 }
 function selectItem(item=null,base=null){
  chosen=item?.id||'';baseSelection=base;
  const town=item?.settlementKey||base?.town||$('corrBrowseTown')?.value||'черкаси';
  const street=item?.streetKey||base?.street||'',house=item?.house||base?.house||'';
  const current=base?.queues||[];
  const hasDetailedHouses= !house && addresses.some(a=>a.town===town&&a.street===street&&a.house);
  $('corrHeading').textContent=item?'Уточнення '+item.id:base?'Адреса з довідника':'Нове адресне уточнення';
  $('corrRevision').textContent=item?'Редакція '+item.revision:
   base?'Довідник · '+(current.length?'Поточна підчерга: '+current.join(', '):'Підчерга не підтверджена')+' · Зміни спочатку зберігаються як чернетка':
   'Нове уточнення · Чернетка';
  if(!house && hasDetailedHouses)$('corrRevision').textContent+=' · Є окремі підчерги будинків: загальне уточнення їх не змінить';
  $('corrTown').value=town;streets(street);
  $('corrHouse').value=house;
  writeQueues(item?.queues|| (item?.queue?[item.queue]:current));
  $('corrSource').value=item?.source||catalogue?.source||'';
  $('corrComment').value=item?.comment||'';
  $('corrDeleted').checked=item?.deleted===true;
  $('corrPublish').checked=item?.status==='published';
  $('corrProof').checked=false;
  $('corrProofRow').hidden=!item||!owner()||!$('corrPublish').checked;
  $('corrPublishRow').hidden=!item||!owner();
  $('corrDelete').hidden=!item||!owner();
  for(const field of $('corrForm').querySelectorAll('input,select,textarea,button'))
   field.disabled=!canEdit()||(field.id==='corrPublish'&&!owner())||(field.id==='corrProof'&&!owner());
  $('corrDelete').disabled=!owner();
 }
 function linkedCorrection(base,lookup){
  return lookup.get(identity(base.town,base.street,base.house));
 }
 function draw(){
  if(!catalogue)return;
  const town=$('corrBrowseTown')?.value||'черкаси',query=$('corrSearch').value.toLocaleLowerCase('uk-UA').trim();
  const status=$('corrFilter').value,lookup=new Map(items.map(item=>[identity(item.settlementKey,item.streetKey,item.house),item]));
  const matches=[],seen=new Set();
  for(const base of addresses){
   if(base.town!==town)continue;
   const item=linkedCorrection(base,lookup);
   if(status==='draft'&&item?.status!=='draft'||status==='published'&&item?.status!=='published'||status==='catalog'&&item)continue;
   const line=base.streetLabel+' '+base.house+' '+base.queues.join(' ')+' '+(item?.queues||[item?.queue||'']).join(' ');
   if(query&&!line.toLocaleLowerCase('uk-UA').includes(query))continue;
   matches.push({base,item});if(item)seen.add(item.id);
  }
  for(const item of items){
   if(seen.has(item.id)||item.settlementKey!==town)continue;
   if(status==='draft'&&item.status!=='draft'||status==='published'&&item.status!=='published'||status==='catalog')continue;
   const line=item.streetKey+' '+item.house+' '+(item.queues||[item.queue]).join(' ');
   if(query&&!line.toLocaleLowerCase('uk-UA').includes(query))continue;
   const idx=indexFor(town),base={town,street:item.streetKey,house:item.house,streetLabel:idx?.streets?.[item.streetKey]||item.streetKey.replace('|',' '),queues:item.queues||[item.queue],catalog:false};
   matches.unshift({base,item});
  }
  matches.sort((a,b)=>Number(!!b.item)-Number(!!a.item)||a.base.streetLabel.localeCompare(b.base.streetLabel,'uk-UA')||
   a.base.house.localeCompare(b.base.house,'uk-UA',{numeric:true}));
  const list=$('corrList');list.replaceChildren();
  for(const {base,item} of matches.slice(0,limit)){
   const highlighted=item?item.id===chosen:!chosen&&baseSelection&&identity(base.town,base.street,base.house)===identity(baseSelection.town,baseSelection.street,baseSelection.house);
   const button=create('button',undefined,'corr-row'+(highlighted?' selected':''));
   button.type='button';
   button.append(create('strong',base.streetLabel+(base.house?' · '+base.house:'')),
    create('span',item?(item.deleted?'Адресу буде видалено':('Підчерги: '+(item.queues||[item.queue]).join(', '))):'У довіднику: '+(base.queues.join(', ')||'підчергу уточнити')),
    create('small',item?(item.status==='published'?'Опубліковано':'Чернетка'):base.house?'Адреса з каталогу':'Уся вулиця · номер будинку необов’язковий'));
   button.onclick=()=>{selectItem(item||null,base);draw()};
   list.append(button);
  }
  if(matches.length>limit){
   const more=create('button','Показати ще '+Math.min(90,matches.length-limit)+' з '+matches.length,'corr-more');
   more.type='button';more.onclick=()=>{limit+=90;draw()};list.append(more);
  }
  if(!matches.length)list.append(create('p','За цим запитом адрес немає. Спробуйте іншу назву або населений пункт.','hint'));
  $('corrCount').textContent=matches.length.toLocaleString('uk-UA')+' адрес · '+items.filter(x=>x.status==='published').length+' опубліковано · '+items.filter(x=>x.status==='draft').length+' чернеток';
 }
 function scheduleDraw(){limit=90;clearTimeout(renderTimer);renderTimer=setTimeout(draw,90)}
 async function refresh(){
  announce('Синхронізуємо адресні уточнення…');
  try{
   const data=await api('address-corrections');
   items=Array.isArray(data.items)?data.items:[];
   for(const item of items){
    const town=item.settlementKey;
    if(town!=='черкаси')catalogue.localities??={};
    if(town!=='черкаси')catalogue.localities[town]??={label:town.split('-').map(x=>x.charAt(0).toLocaleUpperCase('uk-UA')+x.slice(1)).join(' '),streets:{},keys:{},streetQueues:{}};
    const idx=town==='черкаси'?catalogue:catalogue.localities[town];
    idx.streets??={};idx.keys??={};idx.streetQueues??={};
    if(!idx.streets[item.streetKey]){
     const parts=item.streetKey.split('|'),kind=parts.shift(),slug=parts.join(' ').replace(/-/g,' ');
     idx.streets[item.streetKey]=({вулиця:'Вулиця',провулок:'Провулок',проспект:'Проспект',бульвар:'Бульвар',узвіз:'Узвіз',алея:'Алея',площа:'Площа',майдан:'Майдан',шосе:'Шосе',набережна:'Набережна',тупик:'Тупик',проїзд:'Проїзд'}[kind]||'Вулиця')+' '+slug;
    }
    if(item.house)idx.keys[item.streetKey+'|'+item.house]=item.queues||[];
    else if(!item.deleted)idx.streetQueues[item.streetKey]=item.queues||[];
   }
   placeChoices();buildCatalog();
   if(chosen&&!items.some(x=>x.id===chosen))chosen='';
   if(chosen)selectItem(record(),baseSelection);
   draw();announce('Каталог та адресні уточнення оновлено.');
  }catch(error){announce('Не вдалося завантажити уточнення: '+error.message,true)}
 }
 async function loadCatalog(){
  try{
   const response=await fetch('./data/addresses.json',{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   catalogue=await response.json();
   placeChoices();buildCatalog();selectItem(null);draw();
  }catch(error){announce('Не вдалося завантажити довідник: '+error.message,true)}
 }
 $('corrTown').addEventListener('change',()=>streets());
 $('corrAddTown')?.addEventListener('click',addTown);$('corrAddStreet')?.addEventListener('click',addStreet);
 $('corrBrowseTown').addEventListener('change',()=>{limit=90;draw()});
 $('corrNew').onclick=()=>{selectItem(null);draw()};
 $('corrReload').onclick=()=>refresh();
 $('corrSearch').addEventListener('input',scheduleDraw);
 $('corrFilter').addEventListener('change',()=>{limit=90;draw()});
 $('corrPublish').onchange=()=>{$('corrProofRow').hidden=!owner()||!$('corrPublish').checked};
 $('corrSave').onclick=()=>{$('corrForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))};
 $('corrForm').onsubmit=async event=>{
  event.preventDefault();
  if(!canEdit()||busy)return;
  if(!$('corrStreet').value){announce('Оберіть вулицю.',true);return}
  if(!readQueues().length&&!$('corrDeleted').checked){announce('Оберіть хоча б одну підчергу або позначте видалення адреси.',true);return}
  const item=record(),payload={
   settlementKey:$('corrTown').value,streetKey:$('corrStreet').value,
   house:$('corrHouse').value.trim(),queues:readQueues(),deleted:$('corrDeleted').checked,
   source:$('corrSource').value.trim(),comment:$('corrComment').value.trim()
  };
  if(item){
   payload.expectedRevision=item.revision;
   payload.status=$('corrPublish').checked?'published':'draft';
   const changed=['settlementKey','streetKey','house','source','deleted'].some(key=>payload[key]!==item[key])||JSON.stringify(payload.queues)!==JSON.stringify(item.queues||[item.queue]);
   if(payload.status==='published'&&(item.status!=='published'||changed)){
    if(!owner()||!$('corrProof').checked){announce('Підтвердьте перевірку адреси за офіційним джерелом.',true);return}
    payload.confirmSourceReviewed=true;
    const subject=payload.house?'будинку '+payload.house:'вулиці без номера будинку';
    if(!confirm('Опублікувати підчерги '+payload.queues.join(', ')+' для '+subject+'?'))return;
   }
  }
  busy=true;$('corrSave').disabled=true;
  try{
   const saved=await api(item?'address-corrections/'+encodeURIComponent(item.id):'address-corrections',
    {method:item?'PATCH':'POST',body:JSON.stringify(payload)});
   chosen=saved.id;baseSelection=null;
   await refresh();
   announce(item?'Зміни збережено. Публікація оновлює адресний довідник без GitHub.':
    'Адресу додано до уточнень як чернетку. Для публікації власник має підтвердити джерело.');
  }catch(error){announce('Не збережено: '+error.message,true)}
  finally{busy=false;$('corrSave').disabled=!canEdit()}
 };
 $('corrDelete').onclick=async()=>{
  const item=record();if(!item||!owner())return;
  if(!confirm('Видалити уточнення? Адреса повернеться до довідника після синхронізації.'))return;
  try{await api('address-corrections/'+encodeURIComponent(item.id),
   {method:'DELETE',body:JSON.stringify({expectedRevision:item.revision})});
   chosen='';baseSelection=null;selectItem(null);await refresh();announce('Уточнення видалено, адреса залишилася в каталозі.')
  }catch(error){announce('Помилка видалення: '+error.message,true)}
 };
 document.addEventListener('svitlo:admin-ready',async()=>{await loadCatalog();await refresh()});
 document.querySelector('[data-admin-tab="corrections"]')?.addEventListener('click',()=>{if(catalogue)refresh()});
 document.addEventListener('svitlo:admin-logout',()=>{chosen='';baseSelection=null;items=[];catalogue=null;addresses=[];$('corrList').replaceChildren();announce('Увійдіть до адмінки.')});
})();