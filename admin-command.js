/* Svitlo admin Command Center. Only real Railway/admin API data; never fake user metrics. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),nav=[...document.querySelectorAll('[data-admin-tab]')];
 if(!$('controlSearch'))return;
 const make=(tag,text,cls='')=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
 const when=at=>at&&Number.isFinite(Date.parse(at))?new Date(at).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'medium',timeStyle:'short'}):'Немає даних';
 const number=v=>typeof v==='number'&&Number.isFinite(v)?String(v):'Немає даних';
 const ensure=()=>typeof remote!=='undefined'&&remote===true;
 const featureButtons=nav.filter(b=>b.dataset.adminTab);
 let refreshBusy=false,designBusy=false,insightsBusy=false;
 const navCount=$('controlNavigationCount');if(navCount)navCount.textContent=featureButtons.length+' розділів';
 function status(text,bad=false){const el=$('controlServerState');el.textContent=text;el.classList.toggle('is-error',bad)}
 function tabName(tab){const btn=featureButtons.find(b=>b.dataset.adminTab===tab);return btn?.innerText?.trim()||btn?.textContent?.trim()||tab}
 function locate(tab){if(!ensure()||window.SvitloAdminAccess?.canTab(tab)===false)return;const btn=featureButtons.find(x=>x.dataset.adminTab===tab);if(!btn)return;btn.click();try{sessionStorage.setItem('svitlo-admin-last-tab',tab)}catch{}
  if(window.matchMedia('(max-width:979px)').matches)document.querySelector('[data-admin-panel="'+tab+'"]')?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function navSearch(){
  const query=$('controlSearch').value.toLocaleLowerCase('uk-UA').trim();let count=0;
  for(const button of featureButtons){
   const label=button.textContent.toLocaleLowerCase('uk-UA');
   button.hidden=window.SvitloAdminAccess?.canTab(button.dataset.adminTab)===false||!!query&&!label.includes(query);
   if(!button.hidden)count++;
  }
  document.querySelectorAll('.control-nav-group').forEach(group=>{
   group.hidden=![...group.querySelectorAll('[data-admin-tab]')].some(x=>!x.hidden);
  });
  const label=query?count+' знайдено':count+' доступних розділів';
  if(navCount.textContent!==label)navCount.textContent=label;
 }
 document.addEventListener('svitlo:admin-ready',navSearch);
 $('controlSearch').addEventListener('input',navSearch);
 $('controlSearch').addEventListener('keydown',e=>{
  if(e.key==='Enter'){const result=featureButtons.find(x=>!x.hidden);if(result){e.preventDefault();locate(result.dataset.adminTab);$('controlSearch').blur()}}
  if(e.key==='Escape'){$('controlSearch').value='';navSearch();$('controlSearch').blur()}
 });
 document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&ensure()){e.preventDefault();$('controlSearch').focus();$('controlSearch').select()}
 });
 function tiles(id,items){
  const root=$(id);if(!root)return;root.replaceChildren();
  for(const [label,value,detail] of items){
   const el=make('div',null,'control-metric'),num=make('strong',value),text=make('span',label);
   el.append(num,text);if(detail)el.append(make('small',detail));root.append(el);
  }
 }
 function list(id,items,empty='Даних поки немає'){
  const root=$(id);if(!root)return;root.replaceChildren();
  if(!items.length){root.append(make('p',empty,'hint'));return}
  for(const [label,value,detail] of items){
   const el=make('div',null,'control-data-row'),left=make('span',label),right=make('strong',value);
   el.append(left,right);if(detail)el.append(make('small',detail));root.append(el);
  }
 }
 function announceCheck(rows,ok,label,detail){
  rows.push({ok,label,detail});
 }
 async function queryAdmin(){
  if(!ensure())throw Error('Спершу авторизуйтесь');
  const results=await Promise.allSettled([api('monitor'),api('audit'),api('app-config')]);
  return Object.fromEntries(['monitor','audit','config'].map((key,i)=>[key,results[i].status==='fulfilled'?results[i].value:null]));
 }
 async function insights(){
  if(insightsBusy||!ensure())return;
  insightsBusy=true;$('controlInsightsMessage').textContent='Отримуємо свіжі показники…';
  try{
   const {config,monitor,audit}=await queryAdmin();
   if(!config&&!monitor)throw Error('Немає відповіді адміністративного API');
   const announcements=config?.announcements||[],stats=monitor?.server||{},tickets=monitor?.feedback||{},
    sources=monitor?.sources||{},events=Array.isArray(audit?.events)?audit.events:[];
   tiles('controlInsightsMetrics',[
    ['Push-підписок',number(stats.pushSubscribers),'На сервері Railway'],
    ['Опублікованих повідомлень',config?announcements.filter(x=>x.active).length:'Н/Д','Без чернеток'],
    ['Чернеток',config?announcements.filter(x=>!x.active).length:'Н/Д','Не видно користувачам'],
    ['Нових звернень',number(tickets.new),'Очікують відповіді'],
    ['Подій журналу',audit?events.length:'Н/Д','Із доступного журналу'],
    ['Днів графіка',Array.isArray(sources.schedules?.days)?sources.schedules.days.length:'Н/Д','З підтвердженого джерела']
   ]);
   const byType=new Map();for(const item of announcements){
    const key=item.kind||'info';byType.set(key,(byType.get(key)||0)+1)
   }
   list('controlNoticeStats',[...byType].map(([key,val])=>[key,val]));
   const days=new Map();for(const ev of events){
    const d=String(ev.at||'').slice(0,10);if(d)days.set(d,(days.get(d)||0)+1);
   }
   list('controlAuditStats',[...days].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,8).map(([d,n])=>[d,n]));
   list('controlPushStats',[
    ['Зареєстровані пристрої',number(stats.pushSubscribers)],
    ['Остання Push-перевірка',when(stats.lastPushCheck)],
    ['Помилка Push',stats.pushCheckError||'Не повідомлено']
   ]);
   list('controlFreshnessStats',[
    ['Графіки',when(sources.schedules?.lastChecked)],
    ['Аварійні повідомлення',when(sources.emergency?.lastChecked)],
    ['Оновлення контенту',when(config?.updatedAt)]
   ]);
   $('controlInsightsMessage').textContent='Дані з Railway, час перевірки: '+new Date().toLocaleTimeString('uk-UA')+'.';
   status('● Сервер відповідає');
  }catch(e){$('controlInsightsMessage').textContent='Аналітика недоступна: '+e.message;status('● Сервер потребує уваги',true)}
  finally{insightsBusy=false}
 }
 async function quality(){
  if(refreshBusy||!ensure())return;refreshBusy=true;
  const root=$('controlChecks');root.replaceChildren(make('p','Перевіряємо справжні відповіді сервісів…','hint'));
  const rows=[];
  try{
   const {monitor,config,audit}=await queryAdmin();
   announceCheck(rows,!!monitor,'Railway / адміністрування',monitor?'Авторизований API відповідає':'Сервер не відповідає');
   announceCheck(rows,!!config,'Налаштування застосунку',config?'Конфігурація прочитана':'Не вдалося отримати конфігурацію');
   announceCheck(rows,!!audit,'Адміністративний журнал',audit?'Журнал доступний':'Журнал недоступний');
   if(config){
    const notices=config.announcements||[],ids=new Set(),dupes=[],invalid=[];
    for(const n of notices){
     if(ids.has(n.id))dupes.push(n.id);ids.add(n.id);
     if(n.active&&(!n.title?.trim()||!n.body?.trim()))invalid.push(n.id);
    }
    announceCheck(rows,!dupes.length,'Повторювані ID повідомлень',dupes.length?'Знайдено: '+dupes.join(', '):'Повторів немає');
    announceCheck(rows,!invalid.length,'Текст опублікованих повідомлень',invalid.length?'Порожні поля: '+invalid.join(', '):'Усі мають заголовок і текст');
    const now=Date.now(),stale=notices.filter(n=>n.active&&n.expiresAt&&Date.parse(n.expiresAt)<now);
    announceCheck(rows,!stale.length,'Прострочені публікації',stale.length+' активних повідомлень із минулим терміном');
    const m=config.maintenance||{};
    announceCheck(rows,!(m.enabled&&m.startsAt&&m.until&&Date.parse(m.startsAt)>=Date.parse(m.until)),
     'Час технічних робіт',m.enabled?'Режим увімкнено · перевірено межі':'Техроботи вимкнено');
    const links=Object.values(config.site?.links||{}),unsafe=links.filter(x=>x&&!(x.startsWith('./')||/^https:\/\//.test(x)));
    announceCheck(rows,!unsafe.length,'Користувацькі посилання',unsafe.length+' незахищених адрес');
    const imgs=notices.flatMap(n=>n.images||[]),badImg=imgs.filter(x=>!/^https:\/\//.test(x));
    announceCheck(rows,!badImg.length,'Зображення оголошень',badImg.length+' не-HTTPS зображень');
   }
   const data=monitor?.sources||{};
   for(const [key,label] of [['schedules','Офіційні графіки'],['review','Перевірка публікацій'],['emergency','Екстрені повідомлення']]){
    const value=data[key];announceCheck(rows,!!value&&!value.error,label,value?.error|| (value?'Джерело відповідає':'Джерело не перевірене'));
   }
  }catch(e){announceCheck(rows,false,'Перевірка сервера',e.message)}
  root.replaceChildren();
  rows.forEach(item=>{const card=make('div',null,'control-check '+(item.ok?'is-ok':'is-bad'));
   card.append(make('span',item.ok?'✅':'⚠️','control-check-icon'));
   const copy=make('div');copy.append(make('strong',item.label),make('small',item.detail));card.append(copy);root.append(card)});
  $('controlCheckSummary').textContent=rows.filter(x=>x.ok).length+'/'+rows.length+' перевірок без зауважень';
  refreshBusy=false;
 }
 async function media(){
  if(!ensure())return;
  const grid=$('controlMediaGrid'),term=$('controlMediaSearch').value.toLowerCase().trim();
  grid.replaceChildren(make('p','Завантажуємо медіатеку Railway…','hint'));
  try{
   const [config,library]=await Promise.all([api('app-config'),api('media')]);
   const labels=new Map(),all=new Map();
   for(const n of config.announcements||[])for(const url of n.images||[]){
    if(!url)continue;labels.set(url,{label:n.title||'Чернетка',active:n.active});
    all.set(url,{url,...labels.get(url)});
   }
   if(config.maintenance?.imageUrl){
    const url=config.maintenance.imageUrl;
    labels.set(url,{label:'Технічні роботи',active:config.maintenance.enabled});
    all.set(url,{url,...labels.get(url)});
   }
   for(const file of library.items||[]){
    if(!/^[a-f0-9]{30}\.(?:png|jpg|webp)$/.test(file.id))continue;
    const url=server.replace(/\/$/,'')+'/api/media/'+file.id;
    all.set(url,{url,label:labels.get(url)?.label||'Файл медіатеки',
     active:labels.get(url)?.active??false,size:file.size,uploadedAt:file.uploadedAt});
   }
   grid.replaceChildren();let count=0;
   for(const item of all.values()){
    if(term&&!((item.label+' '+item.url).toLowerCase().includes(term)))continue;
    const card=make('article',null,'control-media-card'),image=document.createElement('img');
    image.src=item.url;image.loading='lazy';image.alt=item.label;
    const heading=make('strong',item.label),state=make('small',
     item.active?'Використовується у публікації':(item.size?'Завантажено · '+Math.ceil(item.size/1024)+' КБ':'Чернетка / неактивне'));
    const btn=make('button','Копіювати URL','secondary');btn.type='button';
    btn.onclick=()=>navigator.clipboard.writeText(item.url).then(()=>{btn.textContent='Скопійовано'}).catch(()=>{btn.textContent='Помилка копіювання'});
    card.append(image,heading,state,btn);grid.append(card);count++;
   }
   $('controlMediaStatus').textContent=count+' зображень із '+all.size+' доступних у медіатеці Railway.';
   if(!count)grid.append(make('p','Зображень не знайдено. Додайте фото або змініть пошук.','hint'));
  }catch(e){grid.replaceChildren(make('p','Медіатека недоступна: '+e.message,'hint'))}
 }
 async function uploadMedia(){
  if(!ensure())return;
  const files=Array.from($('controlMediaFiles').files||[]).slice(0,8);
  if(!files.length){$('controlMediaUploadStatus').textContent='Оберіть зображення.';return}
  $('controlMediaUpload').disabled=true;
  try{
   for(const [i,file] of files.entries()){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3000000||file.size<20)
     throw Error('Дозволені PNG/JPG/WebP до 3 МБ');
    $('controlMediaUploadStatus').textContent='Завантажено '+i+' із '+files.length+'…';
    const data=await new Promise((resolve,reject)=>{
     const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
     reader.onerror=()=>reject(Error('Помилка читання файлу'));reader.readAsDataURL(file);
    });
    await api('media',{method:'POST',body:JSON.stringify({mime:file.type,data})});
   }
   $('controlMediaFiles').value='';
   $('controlMediaUploadStatus').textContent='Фото завантажені. Скопіюйте їхні URL, щоб додати до повідомлень.';
   await media();
  }catch(e){$('controlMediaUploadStatus').textContent='Завантаження зупинено: '+e.message}
  finally{$('controlMediaUpload').disabled=false}
 }
 let actionsLoading=false;
 async function refreshActions(){
  if(actionsLoading||!ensure())return;actionsLoading=true;
  const root=$('controlActionsList');root.replaceChildren(make('p','Отримуємо фактичні запуски…','hint'));
  $('controlActionsRefresh').disabled=true;
  try{
   const url='https://api.github.com/repos/muzikmuzikant/svitlo-cherkasy/actions/runs?per_page=12';
   const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
   if(!response.ok)throw Error('GitHub API: HTTP '+response.status);
   const json=await response.json();
   const workflows=Array.isArray(json.workflow_runs)?json.workflow_runs:[];
   root.replaceChildren();
   if(!workflows.length){root.append(make('p','Немає доступних запусків.','hint'));return}
   for(const run of workflows){
    const row=make('article',null,'control-action-row'),
     state=run.status==='completed'?(run.conclusion==='success'?'Успішно':run.conclusion==='failure'?'Помилка':run.conclusion||'Завершено'):'Виконується';
    row.classList.add(run.conclusion==='failure'?'is-failed':run.conclusion==='success'?'is-success':'is-pending');
    const left=make('div',null,'control-action-description'),
     title=make('strong',run.name||'Автоматична перевірка'),
     meta=make('span',when(run.created_at)+' · '+state);
    left.append(title,meta);
    const id=Number(run.id);
    const link=document.createElement('a');link.textContent='Переглянути 🔗';
    link.href=Number.isSafeInteger(id)&&id>0?'https://github.com/muzikmuzikant/svitlo-cherkasy/actions/runs/'+id:
     'https://github.com/muzikmuzikant/svitlo-cherkasy/actions';
    link.target='_blank';link.rel='noopener noreferrer';
    row.append(left,link);root.append(row);
   }
  }catch(e){root.replaceChildren(make('p','GitHub API тимчасово недоступний: '+e.message+'. Спробуйте відкрити запуски на GitHub.','hint'))}
  finally{actionsLoading=false;$('controlActionsRefresh').disabled=false}
 }
 function access(){
  const roles={owner:'Власник',editor:'Редактор',operator:'Оператор',viewer:'Перегляд'},role=typeof adminRole==='string'?adminRole:'viewer';
  tiles('controlAccessCards',[['Поточна роль',roles[role]||role],['Підключення',ensure()?'Активне':'Відсутнє'],['Публікація файлів',typeof canPublish!=='undefined'&&canPublish?'Дозволена':'Обмежена']]);
  list('controlRoles',[
   ['Власник','Усі налаштування, публікації, Push та доступ'],
   ['Редактор','Контент і довідка, без масових Push і редагування офіційних файлів'],
   ['Оператор','Опрацювання звернень, читання даних'],
   ['Перегляд','Читання адміністративних розділів']
  ],'Ролі недоступні');
 }
 function drawDesign(){
  const preview=$('controlDesignPreview');if(!preview)return;
  preview.style.setProperty('--preview-accent',$('designAccent').value);
  preview.style.setProperty('--preview-bg',$('designBackground').value);
  preview.style.setProperty('--preview-surface',$('designSurface').value);
  preview.dataset.density=$('designDensity').value;
  preview.dataset.rounded=String($('designRounded').checked);
 }
 async function loadDesign(){
  if(!ensure())return;
  try{
   const conf=await api('app-config'),a=conf.site?.appearance||{};
   $('designAccent').value=a.accent||'#377dff';
   $('designBackground').value=a.background||'#f6f8fc';
   $('designSurface').value=a.surface||'#ffffff';
   $('designDensity').value=a.density||'comfortable';
   $('designRounded').checked=a.rounded!==false;drawDesign();
   $('controlDesignStatus').textContent='Поточні налаштування завантажені з Railway.';
  }catch(e){$('controlDesignStatus').textContent='Не вдалося завантажити: '+e.message}
 }
 async function saveDesign(){
  if(designBusy||!ensure())return;designBusy=true;$('designSave').disabled=true;
  try{
   const cfg=await api('app-config');
   cfg.site={...cfg.site,appearance:{accent:$('designAccent').value,
    background:$('designBackground').value,surface:$('designSurface').value,
    density:$('designDensity').value,rounded:$('designRounded').checked}};
   await api('app-config',{method:'PUT',body:JSON.stringify(cfg)});
   $('controlDesignStatus').textContent='Оформлення збережено. Застосунок оновиться без перезаходу.';
   try{const channel=new BroadcastChannel('svitlo-content-v1');channel.postMessage({type:'REFRESH_APP_CONFIG'});channel.close()}catch{}
  }catch(e){$('controlDesignStatus').textContent='Помилка збереження: '+e.message}
  finally{designBusy=false;$('designSave').disabled=false}
 }
 ['designAccent','designBackground','designSurface','designDensity','designRounded'].forEach(id=>$(id)?.addEventListener('input',drawDesign));
 $('designReset').onclick=()=>{
  $('designAccent').value='#377dff';$('designBackground').value='#f6f8fc';$('designSurface').value='#ffffff';
  $('designDensity').value='comfortable';$('designRounded').checked=true;drawDesign();
  $('controlDesignStatus').textContent='Стандартні значення вибрано, натисніть «Зберегти».';
 };
 $('designSave').onclick=saveDesign;
 $('controlRunChecks').onclick=quality;
 $('controlInsightsReload').onclick=insights;
 $('controlMediaReload').onclick=media;
 $('controlActionsRefresh').onclick=refreshActions;
 $('controlMediaUpload').onclick=uploadMedia;
 $('controlMediaSearch').addEventListener('input',()=>{media().catch(console.warn)});
 // Recovery is intentionally explicit: never send a campaign or enable
 // full maintenance as a side effect of restoring an old JSON snapshot.
 let recovery=null;
 const backupStatus=(msg,bad=false)=>{$('controlBackupStatus').textContent=msg;
  $('controlBackupStatus').classList.toggle('is-error',bad)};
 const download=(name,contents)=>{
  const blob=new Blob([JSON.stringify(contents,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 async function exportBackup(){
  if(!ensure())return;
  $('controlBackupExport').disabled=true;
  try{
   const [config,help]=await Promise.all([api('app-config'),api('help')]);
   // Secrets, password hashes, sessions, tickets and subscribers are never included.
   const saved={format:'svitlo-cherkasy-admin-backup',version:1,
    exportedAt:new Date().toISOString(),config,help,
    note:'Зображення зберігаються як URL. Файли медіа з Railway не копіюються.'};
   download('svitlo-cherkasy-backup-'+saved.exportedAt.slice(0,10)+'.json',saved);
   backupStatus('Копію створено. Захищайте цей файл, оскільки він містить чернетки повідомлень.');
  }catch(e){backupStatus('Не вдалося створити копію: '+e.message,true)}
  finally{$('controlBackupExport').disabled=false}
 }
 $('controlBackupExport').onclick=exportBackup;
 $('controlBackupFile').addEventListener('change',async()=>{
  recovery=null;$('controlBackupRestore').disabled=true;
  const file=$('controlBackupFile').files?.[0];
  if(!file){$('controlBackupPreview').textContent='Оберіть файл JSON.';return}
  if(file.size>1500000){backupStatus('Завеликий файл. Максимум 1.5 МБ.',true);return}
  try{
   const value=JSON.parse(await file.text());
   if(value.format!=='svitlo-cherkasy-admin-backup'||value.version!==1||
      !value.config||!Array.isArray(value.config.announcements)||
      !value.help||!Array.isArray(value.help.articles))throw Error('Невідомий формат або пошкоджений файл');
   recovery=value;
   $('controlBackupPreview').textContent='Створена: '+when(value.exportedAt)+' · '+
    value.config.announcements.length+' повідомлень · '+value.help.articles.length+' статей довідки. '+
    'Відновлення НЕ запустить Push і НЕ увімкне техроботи.';
   $('controlBackupRestore').disabled=false;backupStatus('Файл перевірено. Для відновлення потрібне підтвердження.');
  }catch(e){backupStatus('Не вдалося відкрити копію: '+e.message,true)}
 });
 $('controlBackupRestore').onclick=async()=>{
  if(!recovery||!ensure())return;
  if(typeof adminRole!=='undefined'&&adminRole!=='owner'){backupStatus('Відновлення доступне лише власнику.',true);return}
  if(!confirm('Замінити поточні повідомлення, налаштування і довідку даними з резервної копії? Це вплине на всіх користувачів. Масові Push НЕ надсилатимуться, техроботи будуть вимкнені.'))return;
  $('controlBackupRestore').disabled=true;
  try{
   const live=await api('app-config'),oldHelp=await api('help'),stamp=new Date().toISOString();
   const restored={
    ...live,
    site:recovery.config.site||live.site,
    maintenance:{...live.maintenance,...recovery.config.maintenance,enabled:false},
    announcements:recovery.config.announcements.map(n=>({
     ...n,pushSentAt:(n.active&&['both','push'].includes(n.delivery))?stamp:n.pushSentAt
    }))
   };
   // Save current content first locally for emergency rollback by the owner.
   download('svitlo-before-restore-'+stamp.slice(0,10)+'.json',
    {format:'svitlo-cherkasy-admin-backup',version:1,exportedAt:stamp,config:live,help:oldHelp});
   await api('app-config',{method:'PUT',body:JSON.stringify(restored)});
   try{await api('help',{method:'PUT',body:JSON.stringify(recovery.help)})}
   catch(e){backupStatus('Налаштування відновлено, але довідку ні: '+e.message+'. Є копія попереднього стану.',true);return}
   backupStatus('Відновлено. Техроботи вимкнені. Push-розсилок не було.');
   try{const channel=new BroadcastChannel('svitlo-content-v1');channel.postMessage({type:'REFRESH_APP_CONFIG'});channel.close()}catch{}
  }catch(e){backupStatus('Відновлення перервано: '+e.message,true)}
  finally{$('controlBackupRestore').disabled=false}
 };
 nav.forEach(button=>button.addEventListener('click',()=>{
  if(!ensure())return;
  const tab=button.dataset.adminTab;
  try{sessionStorage.setItem('svitlo-admin-last-tab',tab)}catch{}
  if(tab==='sources')refreshActions();
  else if(tab==='quality')quality();
  else if(tab==='insights')insights();
  else if(tab==='media')media();
  else if(tab==='design')loadDesign();
  else if(tab==='security')access();
  else if(tab==='backup')backupStatus('Резервні копії не містять паролів та Push-токенів.');
  else if(tab==='overview')status('● Сервер підключено');
 }));
 document.addEventListener('svitlo:admin-logout',()=>{status('Сеанс завершився');$('controlSearch').value='';navSearch()});
 window.SvitloAdminCommand={open:locate,quality,insights,media,access,loadDesign,saveDesign};
})();