/* ASKOD-inspired administration: private work cards and live settings.
 * Existing editors, permissions, publications and data sources remain untouched. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 if(!$('adminRegisterList')||!window.svitloAdminApi)return;
 const api=(route,opts)=>window.svitloAdminApi(route,opts);
 const node=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x};
 const esc=key=>$(key)?.value?.trim()||'';
 let entries=[],selectedId='',editingRevision=null,canEdit=false,config=null,busy=false;
 function message(id,value,error=false){const x=$(id);if(!x)return;x.textContent=value;x.dataset.error=String(error)}
 const current=()=>entries.find(x=>x.id===selectedId)||null;
 // Contextual search, control dates and export for the desk registry.
 const bar=$('adminRegisterSearch')?.closest('.registry-toolbar');
 const dueSelect=node('select');dueSelect.id='workDueFilter';dueSelect.setAttribute('aria-label','Контрольний термін');
 for(const [v,label] of [['','Усі терміни'],['overdue','Прострочені'],['today','Сьогодні'],['soon','Наступні 7 днів'],['none','Без терміну']])
  dueSelect.add(new Option(label,v));
 const prioritySelect=node('select');prioritySelect.id='workPriorityFilter';
 prioritySelect.setAttribute('aria-label','Фільтр пріоритету');
 for(const [value,label] of [['','Усі пріоритети'],['urgent','Термінові'],['high','Високі'],['normal','Звичайні']])
  prioritySelect.add(new Option(label,value));
 const onlyMine=node('label',null,'office-my-only'),mine=node('input');
 mine.id='workMineOnly';mine.type='checkbox';onlyMine.append(mine,node('span','Мої доручення'));
 const exportCSV=node('button','Експорт CSV','secondary');exportCSV.id='workExport';exportCSV.type='button';
 bar?.append(dueSelect,prioritySelect,onlyMine,exportCSV);
 const notes=node('section',null,'office-note');
 const noteInput=node('textarea');noteInput.id='workNote';noteInput.maxLength=900;noteInput.rows=3;
 noteInput.placeholder='Висновок, резолюція або проміжний результат';
 const noteSend=node('button','Додати резолюцію','secondary');noteSend.id='workNoteSend';noteSend.type='button';
 const noteHint=node('small','Внутрішня службова історія');
 // Status changes are real server writes, not decorative local-only labels.
 const quickActions=node('div',undefined,'work-quick-actions');
 const quickLabel=node('strong','Наступна дія','work-quick-label');
 const quickButtons=node('div',undefined,'work-quick-buttons');
 const linkedTicket=node('button','Відкрити пов’язане звернення','work-linked-ticket');
 linkedTicket.type='button';
 quickActions.append(quickLabel,quickButtons,linkedTicket);
 $('workForm').before(quickActions);
 notes.append(node('h4','Резолюції та примітки'),noteInput,noteSend,noteHint);
 $('workEvents').before(notes);
 const todayKyiv=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Kyiv'});
 const myUsername=()=>String($('adminUsername')?.value||'').trim().toLocaleLowerCase('uk-UA');
 function filtered(){
  const query=esc('adminRegisterSearch').toLocaleLowerCase('uk-UA'),status=esc('adminRegisterFilter');
  const today=todayKyiv(),next=new Date(today+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+7);
  const priority=prioritySelect.value;
  const until=next.toISOString().slice(0,10),due=dueSelect.value;
  return entries.filter(item=>(!status||item.status===status)&&(!priority||item.priority===priority)&&
   (!query||(item.id+' '+item.title+' '+item.details+' '+item.reference+' '+item.assignee).toLocaleLowerCase('uk-UA').includes(query))&&
   (!mine.checked||String(item.assignee||'').toLocaleLowerCase('uk-UA')===myUsername())&&
   (!due||(due==='none'?!item.dueDate:due==='overdue'?Boolean(item.dueDate&&item.dueDate<today&&!['done','cancelled'].includes(item.status)):
     due==='today'?item.dueDate===today:Boolean(item.dueDate&&item.dueDate>=today&&item.dueDate<=until))))
   .sort((a,b)=>{
    const rank=item=>{
     if(['done','cancelled'].includes(item.status))return -10;
     return (item.dueDate&&item.dueDate<today?100:0)+
      (item.priority==='urgent'?50:item.priority==='high'?12:0)+
      (item.dueDate===today?25:0)+(item.status==='review'?10:0);
    };
    return rank(b)-rank(a)||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||
     String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
   });
 }
 dueSelect.onchange=()=>render();prioritySelect.onchange=()=>render();mine.onchange=()=>render();
 exportCSV.onclick=()=>{
  const safe=value=>{
   let text=String(value??'').replace(/[\r\n]+/g,' ').replace(/"/g,'""');
   if(/^[=+@-]/.test(text))text="'"+text;
   return '"'+text+'"';
  };
  const columns=['id','title','kind','status','priority','assignee','reference','dueDate','createdAt','updatedAt'];
  const csv=['sep=;',columns.map(safe).join(';'),
   ...filtered().map(item=>columns.map(k=>safe(item[k])).join(';'))].join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download='svitlo-work-register.csv';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),600);
 };
 noteSend.onclick=async()=>{
  const item=current(),memo=noteInput.value.trim();
  if(!canEdit||!item)return;
  if(isDirty()){noteHint.textContent='Спочатку збережіть зміни у картці, щоб не втратити їх.';return}
  if(memo.length<3){noteHint.textContent='Додайте хоча б 3 символи.';return}
  noteSend.disabled=true;noteHint.textContent='Зберігаємо…';
  try{
   const updated=await api('work-items/'+encodeURIComponent(item.id)+'/notes',
    {method:'POST',body:JSON.stringify({expectedRevision:item.revision,message:memo})});
   entries=entries.map(x=>x.id===updated.id?updated:x);fill(updated);render();noteInput.value='';
   document.dispatchEvent(new CustomEvent('svitlo:work-list',{detail:{items:[...entries]}}));
   noteHint.textContent='Резолюцію збережено.';document.dispatchEvent(new Event('svitlo:work-updated'));
  }catch(error){noteHint.textContent='Помилка: '+error.message}
  finally{noteSend.disabled=!canEdit}
 };
 const names={feedback:'Звернення',addresses:'Адреси й підчерги',schedules:'Графіки',content:'Публікації',system:'Система',design:'Інтерфейс',other:'Інше'};
 const stateNames={new:'Нове',in_progress:'У роботі',review:'На перевірці',done:'Виконано',cancelled:'Скасовано'};
 const priorityNames={normal:'Звичайний',high:'Високий',urgent:'Терміновий'};
 const when=value=>{try{return value?new Date(value).toLocaleDateString('uk-UA'):'—'}catch{return '—'}};
 function fill(item){
  selectedId=item?.id||'';
  editingRevision=item?.revision??null;
  if(noteInput)noteInput.value='';
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
   const label=log.action==='note'?'Резолюція':log.action==='created'?'Зареєстровано':
    log.action==='updated'?'Оновлено картку':log.action.includes('->')?'Змінено статус: '+log.action:log.action;
   el.append(node('strong',label),node('small',when(log.at)+' · '+log.actor));
   if(log.message)el.append(node('p',log.message,'office-note-text'));
   $('workEvents').append(el);
  });
  for(const el of $('workForm').querySelectorAll('input,select,textarea,button'))el.disabled=!canEdit;
  $('workRemove').disabled=!canEdit;
  noteInput.disabled=!canEdit||!item;noteSend.disabled=!canEdit||!item;notes.hidden=!item;
  paintQuickActions(item);
 }
 function isDirty(){
  const item=current(),values=payload();
  if(!item)return Boolean(values.title||values.details||values.assignee||values.reference||values.dueDate);
  return Object.entries(values).some(([key,value])=>(value??null)!==(item[key]??null));
 }
 function paintQuickActions(item){
  quickActions.hidden=!item;
  if(!item)return;
  quickButtons.replaceChildren();
  const options=item.status==='new'?[['in_progress','Взяти в роботу']]:
   item.status==='in_progress'?[['review','Передати на перевірку'],['done','Завершити']]:
   item.status==='review'?[['done','Підтвердити виконання'],['in_progress','Повернути на доопрацювання']]:
   item.status==='done'?[['in_progress','Відкрити повторно']]:
   [['new','Повернути до нових']];
  for(const [status,label] of options){
   const button=node('button',label,'work-quick-button'+(status==='done'?' is-complete':''));
   button.type='button';button.disabled=!canEdit||busy;
   button.addEventListener('click',()=>quickTransition(status,label));
   quickButtons.append(button);
  }
  const reference=String(item.reference||'').trim();
  const caseId=/^SC-[A-Za-z0-9_-]{5,48}$/.test(reference)?reference:'';
  linkedTicket.hidden=!caseId;
  linkedTicket.disabled=!caseId;
  linkedTicket.onclick=()=>window.dispatchEvent(new CustomEvent('svitlo:open-linked-ticket',{detail:{id:caseId}}));
 }
 async function quickTransition(status,label){
  const item=current();
  if(!item||!canEdit||busy)return;
  if(isDirty()){
   message('adminRegisterMessage','Спочатку збережіть зміни в полях картки. Статус не змінено.',true);
   return;
  }
  if(status==='done'&&!confirm('Підтвердити виконання доручення '+item.id+'?'))return;
  busy=true;for(const button of quickButtons.querySelectorAll('button'))button.disabled=true;
  try{
   const updated=await api('work-items/'+encodeURIComponent(item.id),{
    method:'PATCH',body:JSON.stringify({expectedRevision:editingRevision,status})
   });
   entries=entries.map(x=>x.id===updated.id?updated:x);
   fill(updated);render();
   message('adminRegisterMessage','Доручення: '+label+'. Зміни збережені на сервері.');
   document.dispatchEvent(new CustomEvent('svitlo:work-list',{detail:{items:[...entries]}}));
   document.dispatchEvent(new Event('svitlo:work-updated'));
  }catch(error){
   message('adminRegisterMessage','Не вдалося змінити статус: '+error.message,true);
  }finally{busy=false;paintQuickActions(current())}
 }
 function render(){
  const list=filtered();
  const root=$('adminRegisterList');root.replaceChildren();
  for(const item of list){
   const row=node('button',undefined,'registry-row'+(item.id===selectedId?' is-active':''));
   row.type='button';
   row.append(node('strong',item.id,'registry-id'),node('span',item.title,'registry-title'),
    node('span',names[item.kind]||item.kind,'registry-type'),
    node('span',stateNames[item.status]||item.status,'registry-state state-'+item.status),
    node('span',priorityNames[item.priority]||item.priority,'registry-priority'));
   const now=todayKyiv(),open=!['done','cancelled'].includes(item.status);
   row.classList.toggle('is-overdue',Boolean(open&&item.dueDate&&item.dueDate<now));
   row.classList.toggle('is-urgent',Boolean(open&&item.priority==='urgent'));
   row.setAttribute('aria-label',[item.id,item.title,stateNames[item.status],
     item.priority==='urgent'?'Термінове':'',open&&item.dueDate&&item.dueDate<now?'Прострочено':''].filter(Boolean).join('. '));
   row.addEventListener('click',()=>{
    if(isDirty()&&!confirm('У картці є незбережені зміни. Відкрити інше доручення без збереження?'))return;
    fill(item);render();
    if(window.matchMedia('(max-width:900px)').matches)$('workForm').scrollIntoView({block:'start',behavior:'smooth'});
   });root.append(row);
  }
  if(!list.length)root.append(node('p','Записів за цими умовами немає.','registry-empty'));
  const active=entries.filter(x=>x.status==='new'||x.status==='in_progress'||x.status==='review');
  $('adminRegisterCounter').textContent=active.length+' активних із '+entries.length;
  const open=entries.filter(x=>!['done','cancelled'].includes(x.status));
  const today=todayKyiv();
  const overdue=open.filter(x=>x.dueDate&&x.dueDate<today).length;
  const urgent=open.filter(x=>x.priority==='urgent').length;
  $('adminRegisterPending').textContent=(overdue?'Прострочено: '+overdue+' · ':'')+
   (urgent?'Термінові: '+urgent+' · ':'')+
   entries.filter(x=>x.status==='review').length+' на перевірці';
  $('adminRegisterPending').classList.toggle('requires-attention',Boolean(overdue||urgent));
 }
 async function loadRegister(){
  message('adminRegisterMessage','Оновлюємо картотеку…');
  try{
   const result=await api('work-items');
   const preserveDraft=isDirty();
   entries=Array.isArray(result.items)?result.items:[];
   if(!preserveDraft)fill(entries.find(x=>x.id===selectedId)||null);
   render();
   document.dispatchEvent(new CustomEvent('svitlo:work-list',{detail:{items:[...entries]}}));
   message('adminRegisterMessage',preserveDraft
    ?'Список оновлено. Незбережений текст залишився у формі. Перевірте дані перед збереженням.'
    :'Реєстр синхронізовано з Railway.');
  }catch(e){message('adminRegisterMessage','Не вдалося завантажити реєстр: '+e.message,true)}
 }
 function payload(){return {
  title:esc('workTitle'),details:esc('workDetails'),kind:esc('workKind'),priority:esc('workPriority'),
  status:esc('workStatus'),reference:esc('workReference'),assignee:esc('workAssignee'),
  dueDate:esc('workDueDate')||null
 }}
 $('workForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!canEdit)return;
  const item=current(),body={...payload(),...(item?{expectedRevision:editingRevision}:{})};
  busy=true;$('workSave').disabled=true;
  try{
   const result=await api(item?'work-items/'+encodeURIComponent(item.id):'work-items',
    {method:item?'PATCH':'POST',body:JSON.stringify(body)});
   entries=entries.filter(x=>x.id!==result.id).concat(result);fill(result);
   await loadRegister();message('adminRegisterMessage','Картку збережено у захищеному реєстрі.');document.dispatchEvent(new Event('svitlo:work-updated'));
  }catch(error){message('adminRegisterMessage',error.message,true)}
  finally{busy=false;$('workSave').disabled=!canEdit}
 });
 $('workNew').addEventListener('click',()=>{
  if(!canEdit)return;
  if(isDirty()&&!confirm('Поточна картка містить незбережені зміни. Створити нову?'))return;
  fill(null);render();$('workForm').scrollIntoView({block:'nearest',behavior:'smooth'});$('workTitle').focus();
 });
 $('workRemove').addEventListener('click',async()=>{
  const item=current();if(!item||document.body.dataset.adminRole!=='owner'||!confirm('Видалити картку '+item.id+' без можливості повернення?'))return;
  try{await api('work-items/'+encodeURIComponent(item.id),{method:'DELETE',body:JSON.stringify({expectedRevision:item.revision})});
   selectedId='';await loadRegister();message('adminRegisterMessage','Картку видалено.');document.dispatchEvent(new Event('svitlo:work-updated'))}
  catch(e){message('adminRegisterMessage',e.message,true)}
 });
 $('adminRegisterReload').addEventListener('click',loadRegister);
 $('adminRegisterSearch').addEventListener('input',render);
 $('adminRegisterFilter').addEventListener('change',render);
 document.querySelector('[data-admin-tab="registry"]')?.addEventListener('click',loadRegister);
 window.SvitloWorkRegister={refresh:loadRegister};
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
  document.dispatchEvent(new CustomEvent('svitlo:work-list',{detail:{items:[],signedOut:true}}));
  message('adminRegisterMessage','Для роботи потрібен вхід.');
 });
 // Quick open by number of the case; respects normal role and API checks.
 window.addEventListener('svitlo:select-work',async e=>{
  const wanted=String(e.detail?.id||'');if(!wanted)return;
  if(!entries.some(item=>item.id===wanted))await loadRegister();
  const item=entries.find(x=>x.id===wanted);
  if(item){
   if(isDirty()&&!confirm('Є незбережені зміни у картці. Перейти до іншого доручення?'))return;
   fill(item);render();
   if(window.matchMedia('(max-width:900px)').matches)$('workForm').scrollIntoView({block:'start',behavior:'smooth'});
  }else message('adminRegisterMessage','Картку не знайдено або немає доступу.',true);
 });
 window.addEventListener('svitlo:open-work',async e=>{
  document.querySelector('[data-admin-tab="registry"]')?.click();
  await loadRegister();
  if(canEdit){fill(null);$('workTitle').value=String(e.detail?.title||'').slice(0,120);
   $('workDetails').value=String(e.detail?.details||'').slice(0,1800);
   $('workReference').value=String(e.detail?.reference||'').slice(0,100);
   $('workForm').scrollIntoView({block:'nearest',behavior:'smooth'});$('workTitle').focus();}
 });
})();