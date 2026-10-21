/* ASKOD-inspired administration: private work cards and live settings.
 * Existing editors, permissions, publications and data sources remain untouched. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 if(!$('adminRegisterList')||!window.svitloAdminApi)return;
 const api=(route,opts)=>window.svitloAdminApi(route,opts);
 const node=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x};
 const esc=key=>$(key)?.value?.trim()||'';
 let entries=[],selectedId='',canEdit=false,config=null,busy=false;
 function message(id,value,error=false){const x=$(id);if(!x)return;x.textContent=value;x.dataset.error=String(error)}
 const current=()=>entries.find(x=>x.id===selectedId)||null;
 const names={feedback:'Звернення',addresses:'Адреси й підчерги',schedules:'Графіки',content:'Публікації',system:'Система',design:'Інтерфейс',other:'Інше'};
 const stateNames={new:'Нове',in_progress:'У роботі',review:'На перевірці',done:'Виконано',cancelled:'Скасовано'};
 const priorityNames={normal:'Звичайний',high:'Високий',urgent:'Терміновий'};
 const when=value=>{try{return value?new Date(value).toLocaleDateString('uk-UA'):'—'}catch{return '—'}};
 function fill(item){
  selectedId=item?.id||'';
  for(const key of ['title','details','assignee','reference','dueDate'])$('work'+key[0].toUpperCase()+key.slice(1)).value=item?.[key]||'';
  $('workKind').value=item?.kind||'other';
  $('workPriority').value=item?.priority||'normal';
  $('workStatus').value=item?.status||'new';
  $('workEditTitle').textContent=item?'Картка '+item.id:'Нова картка';
  $('workRevision').textContent=item?'Редакція '+item.revision+' · створено '+when(item.createdAt):'Ще не зареєстровано';
  $('workRemove').hidden=!item||document.body.dataset.adminRole!=='owner';
  $('workEvents').replaceChildren();
  (item?.events||[]).forEach(log=>{
   const el=node('div',undefined,'register-event');
   el.append(node('strong',log.action),node('small',when(log.at)+' · '+log.actor));$('workEvents').append(el);
  });
  for(const el of $('workForm').querySelectorAll('input,select,textarea,button'))el.disabled=!canEdit;
  $('workRemove').disabled=!canEdit;
 }
 function render(){
  const query=esc('adminRegisterSearch').toLocaleLowerCase('uk-UA');
  const status=esc('adminRegisterFilter');
  const list=entries.filter(item=>(!status||item.status===status)&&(!query||
   (item.id+' '+item.title+' '+item.details+' '+item.reference+' '+item.assignee).toLocaleLowerCase('uk-UA').includes(query)));
  const root=$('adminRegisterList');root.replaceChildren();
  for(const item of list){
   const row=node('button',undefined,'registry-row'+(item.id===selectedId?' is-active':''));
   row.type='button';
   row.append(node('strong',item.id,'registry-id'),node('span',item.title,'registry-title'),
    node('span',names[item.kind]||item.kind,'registry-type'),
    node('span',stateNames[item.status]||item.status,'registry-state state-'+item.status),
    node('span',priorityNames[item.priority]||item.priority,'registry-priority'));
   row.addEventListener('click',()=>{fill(item);render()});root.append(row);
  }
  if(!list.length)root.append(node('p','Записів за цими умовами немає.','registry-empty'));
  const active=entries.filter(x=>x.status==='new'||x.status==='in_progress'||x.status==='review');
  $('adminRegisterCounter').textContent=active.length+' активних із '+entries.length;
  $('adminRegisterPending').textContent=entries.filter(x=>x.status==='review').length+' на перевірці';
 }
 async function loadRegister(){
  message('adminRegisterMessage','Оновлюємо картотеку…');
  try{
   const result=await api('work-items');
   entries=Array.isArray(result.items)?result.items:[];
   fill(entries.find(x=>x.id===selectedId)||null);render();
   message('adminRegisterMessage','Реєстр синхронізовано з Railway.');
  }catch(e){message('adminRegisterMessage','Не вдалося завантажити реєстр: '+e.message,true)}
 }
 function payload(){return {
  title:esc('workTitle'),details:esc('workDetails'),kind:esc('workKind'),priority:esc('workPriority'),
  status:esc('workStatus'),reference:esc('workReference'),assignee:esc('workAssignee'),
  dueDate:esc('workDueDate')||null
 }}
 $('workForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!canEdit)return;
  const item=current(),body={...payload(),...(item?{expectedRevision:item.revision}:{})};
  busy=true;$('workSave').disabled=true;
  try{
   const result=await api(item?'work-items/'+encodeURIComponent(item.id):'work-items',
    {method:item?'PATCH':'POST',body:JSON.stringify(body)});
   selectedId=result.id;await loadRegister();message('adminRegisterMessage','Картку збережено у захищеному реєстрі.');
  }catch(error){message('adminRegisterMessage',error.message,true)}
  finally{busy=false;$('workSave').disabled=!canEdit}
 });
 $('workNew').addEventListener('click',()=>{fill(null);render();$('workTitle').focus()});
 $('workRemove').addEventListener('click',async()=>{
  const item=current();if(!item||document.body.dataset.adminRole!=='owner'||!confirm('Видалити картку '+item.id+' без можливості повернення?'))return;
  try{await api('work-items/'+encodeURIComponent(item.id),{method:'DELETE',body:JSON.stringify({expectedRevision:item.revision})});
   selectedId='';await loadRegister();message('adminRegisterMessage','Картку видалено.')}
  catch(e){message('adminRegisterMessage',e.message,true)}
 });
 $('adminRegisterReload').addEventListener('click',loadRegister);
 $('adminRegisterSearch').addEventListener('input',render);
 $('adminRegisterFilter').addEventListener('change',render);
 document.querySelector('[data-admin-tab="registry"]')?.addEventListener('click',loadRegister);
 const form=$('liveConfigForm');
 const set=(id,value)=>{const el=$(id);if(el.type==='checkbox')el.checked=value===true;else el.value=value??''};
 const fkeys=['inbox','sharing','help','feedback','copySchedule','addressSearch','pushPrompt','manualRefresh'];
 function fillLive(){
  if(!config)return;
  const b=config.site?.banner||{},links=config.site?.links||{},flags=config.site?.flags||{};
  for(const [id,value] of [['liveBannerEnabled',b.enabled],['liveBannerTitle',b.title],['liveBannerBody',b.body],
   ['liveBannerButton',b.button],['liveBannerUrl',b.url],['liveOfficialLink',links.official],
   ['liveHelpLink',links.help],['liveFeedbackLink',links.feedback]])set(id,value);
  for(const key of fkeys)set('liveFlag'+key[0].toUpperCase()+key.slice(1),flags[key]);
  $('liveRevision').textContent=config.updatedAt?'Змінено: '+when(config.updatedAt):'Змін ще не було';
  form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled!==undefined&&(el.disabled=document.body.dataset.adminRole!=='owner'));
  preview();
 }
 function preview(){
  $('livePreviewTitle').textContent=esc('liveBannerTitle')||'Заголовок банера';
  $('livePreviewBody').textContent=esc('liveBannerBody')||'Текст майбутнього оголошення.';
  $('livePreview').hidden=!$('liveBannerEnabled').checked;
 }
 for(const id of ['liveBannerTitle','liveBannerBody','liveBannerEnabled'])$(id).addEventListener('input',preview);
 async function loadLive(){
  message('liveConfigMessage','Завантажуємо діючі налаштування…');
  try{
   config=await api('site-quick-settings');
   fillLive();
   message('liveConfigMessage','Показано налаштування, що діють на сервері.');
  }catch(e){message('liveConfigMessage',e.message,true)}
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!config||busy||document.body.dataset.adminRole!=='owner')return;
  const banner={enabled:$('liveBannerEnabled').checked,title:esc('liveBannerTitle'),body:esc('liveBannerBody'),
   button:esc('liveBannerButton'),url:esc('liveBannerUrl')};
  const links={official:esc('liveOfficialLink'),help:esc('liveHelpLink'),feedback:esc('liveFeedbackLink')};
  const flags=Object.fromEntries(fkeys.map(k=>[k,$('liveFlag'+k[0].toUpperCase()+k.slice(1)).checked]));
  if(!confirm('Опублікувати налаштування для користувачів зараз? Зміни не потребують GitHub.'))return;
  busy=true;$('liveSave').disabled=true;
  try{
   config=await api('site-quick-settings',{method:'PUT',body:JSON.stringify({
     expectedUpdatedAt:config.updatedAt??null,banner,links,flags
   })});fillLive();
   message('liveConfigMessage','Опубліковано через Railway. Налаштування доступні застосунку після синхронізації.');
   document.dispatchEvent(new Event('svitlo:admin-live-config-updated'));
  }catch(error){message('liveConfigMessage','Не збережено: '+error.message,true)}
  finally{busy=false;$('liveSave').disabled=false}
 });
 $('liveReload').addEventListener('click',loadLive);
 document.querySelector('[data-admin-tab="live"]')?.addEventListener('click',loadLive);
 const isLoggedIn=()=>!$('adminDashboard').hidden;
 function ready(){if(!isLoggedIn())return;document.body.classList.add('askod-workspace');canEdit=['owner','editor'].includes(document.body.dataset.adminRole);loadRegister()}
 document.addEventListener('svitlo:admin-ready',ready);
 document.addEventListener('svitlo:admin-logout',()=>{
  document.body.classList.remove('askod-workspace');
  selectedId='';entries=[];config=null;canEdit=false;fill(null);render();
  message('adminRegisterMessage','Для роботи потрібен вхід.');
 });
 // Quick open by number of the case; respects normal role and API checks.
 window.addEventListener('svitlo:open-work',e=>{
  document.querySelector('[data-admin-tab="registry"]')?.click();
  if(e.detail?.title&&canEdit){fill(null);$('workTitle').value=String(e.detail.title).slice(0,120);
   $('workDetails').value=String(e.detail.details||'').slice(0,1800);
   $('workReference').value=String(e.detail.reference||'').slice(0,100);}
 });
})();