/* Svitlo Control Center v7.4. All writes go through authenticated Railway API. */
(()=>{'use strict';
 const section=document.querySelector('[data-admin-panel="operations"]');
 if(!section||!document.getElementById('opsNoticeContent'))return;
 const $=id=>document.getElementById(id);
 let state=null,serverState=null,selectedId='',busy=false,photos=[],autoSaveTimer=null;
 const kinds={info:'💬',important:'📣',update:'✨',schedule:'🗓️',emergency:'⚠️'};
 const options=(field,value)=>{if($(field))$(field).value=value==null?'':String(value)};
 const check=(field,value)=>{if($(field))$(field).checked=value===true};
 const read=(field)=>$(field)?.value.trim()||'';
 const fromLocal=value=>value?new Date(value).toISOString():null;
 const local=value=>{if(!value)return '';const d=new Date(value);return Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):''};
 const now=()=>new Date().toISOString();
 const id=()=>('n_'+(crypto.randomUUID?.()||Math.random().toString(36).slice(2)).replaceAll('-',''));
 const target=()=>state?.announcements?.find(n=>n.id===selectedId);
 function status(message,error=false){$('opsMessageStatus').textContent=message;$('opsMessageStatus').className='push-state'+(error?' error':' good')}
 function blank(){
  return {id:id(),title:'',body:'',content:'',kind:'info',priority:'normal',queue:'all',delivery:'inbox',settlement:'',
   icon:'',images:[],active:false,pinned:false,publishedAt:now(),updatedAt:null,scheduledAt:null,expiresAt:null,pushSentAt:null};
 }
 function capture(){
  const n=target();if(!n)return;
  const before=JSON.stringify({title:n.title,body:n.body,content:n.content,kind:n.kind,priority:n.priority,
   queue:n.queue,delivery:n.delivery,settlement:n.settlement,icon:n.icon,pinned:n.pinned,active:n.active,scheduledAt:n.scheduledAt,
   expiresAt:n.expiresAt,images:n.images});
  Object.assign(n,{title:read('opsNoticeTitle'),body:read('opsNoticeBody'),content:read('opsNoticeContent'),
   kind:read('opsNoticeKind'),priority:read('opsNoticePriority'),queue:read('opsNoticeQueue'),
   delivery:read('opsNoticeDelivery'),settlement:read('opsNoticeSettlement'),icon:read('opsNoticeIcon'),pinned:$('opsNoticePinned').checked,
   active:$('opsNoticeActive').checked,scheduledAt:fromLocal($('opsNoticeSchedule').value),
   expiresAt:fromLocal($('opsNoticeExpires').value),images:[...photos]});
  const after=JSON.stringify({title:n.title,body:n.body,content:n.content,kind:n.kind,priority:n.priority,
   queue:n.queue,delivery:n.delivery,settlement:n.settlement,icon:n.icon,pinned:n.pinned,active:n.active,scheduledAt:n.scheduledAt,
   expiresAt:n.expiresAt,images:n.images});
  if(before!==after)n.updatedAt=now();
 }
 function fill(){
  const n=target();
  $('opsEditorStatus').textContent=n?(n.active?'Опубліковане повідомлення':'Чернетка'):'Створіть або виберіть повідомлення';
  for(const field of ['opsNoticeTitle','opsNoticeBody','opsNoticeContent','opsNoticeIcon'])options(field,n?.[field.replace('opsNotice','').toLowerCase()]||'');
  options('opsNoticeKind',n?.kind||'info');options('opsNoticePriority',n?.priority||'normal');
  options('opsNoticeQueue',n?.queue||'all');options('opsNoticeDelivery',n?.delivery||'inbox');options('opsNoticeSettlement',n?.settlement||'');
  options('opsNoticeSchedule',local(n?.scheduledAt));options('opsNoticeExpires',local(n?.expiresAt));
  check('opsNoticeActive',n?.active);check('opsNoticePinned',n?.pinned);
  photos=[...(n?.images||[])];drawPhotos();previewMessage();
  document.dispatchEvent(new CustomEvent('svitlo:cms-loaded'));
 }
 function drawList(){
  const list=$('opsNoticeList');list.replaceChildren();
  $('opsNoticeCount').textContent=String(state?.announcements?.length||0);
  const query=read('opsNoticeSearch').toLowerCase();
  const filter=$('opsNoticeStatusFilter')?.value||'all',sort=$('opsNoticeSort')?.value||'new',time=Date.now();
  let shown=[...(state?.announcements||[])].filter(n=>{
   if(query&&!((n.title+' '+n.body).toLowerCase().includes(query)))return false;
   if(filter==='active')return n.active===true;
   if(filter==='draft')return n.active!==true;
   if(filter==='scheduled')return n.active===true&&n.scheduledAt&&Date.parse(n.scheduledAt)>time;
   if(filter==='expired')return n.active===true&&n.expiresAt&&Date.parse(n.expiresAt)<=time;
   return true;
  });
  shown.sort((x,y)=>sort==='title'?String(x.title||'').localeCompare(String(y.title||''),'uk'):
   (sort==='old'?1:-1)*(Date.parse(x.updatedAt||x.publishedAt||0)-Date.parse(y.updatedAt||y.publishedAt||0)));
  for(const n of shown){
   const button=document.createElement('button');button.type='button';button.className='ops-notice-choice'+(selectedId===n.id?' selected':'');
   const h=document.createElement('strong');h.textContent=(kinds[n.kind]||'💬')+' '+(n.title||'Нова чернетка');
   const sub=document.createElement('small');sub.textContent=(n.active?'Опубліковано':'Чернетка')+' · '+(n.delivery==='both'?'Push + Вхідні':'Вхідні')+(n.pinned?' · 📌':'');
   button.append(h,sub);button.onclick=()=>{capture();selectedId=n.id;fill();drawList()};
   list.append(button);
  }
  if(!list.children.length){const p=document.createElement('p');p.className='hint';p.textContent='Нічого не знайдено.';list.append(p)}
 }
 function drawPhotos(){
  const gallery=$('opsPhotoGallery');gallery.replaceChildren();
  photos.forEach((url,i)=>{
   const box=document.createElement('div');box.className='ops-photo';
   const img=document.createElement('img');img.src=url;img.alt='Зображення '+(i+1);img.loading='lazy';
   const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Прибрати зображення');
   remove.onclick=()=>{photos.splice(i,1);drawPhotos();capture()};
   box.append(img,remove);gallery.append(box);
  });
 }

 function fillSite(site={}){
  options('opsLinkHelp',site.links?.help||'./help.html');
  options('opsLinkFeedback',site.links?.feedback||'./feedback.html');
  options('opsLinkOfficial',site.links?.official||'https://www.cherkasyoblenergo.com/news');
  check('opsFlagInbox',site.flags?.inbox!==false);
  check('opsFlagSharing',site.flags?.sharing!==false);
  check('opsFlagHelp',site.flags?.help!==false);
  check('opsBannerActive',site.banner?.enabled===true);
  options('opsBannerTitle',site.banner?.title||'Нові можливості');
  options('opsBannerBody',site.banner?.body||'Оновлення застосунку доступне.');
  options('opsBannerButton',site.banner?.button||'Детальніше');
  options('opsBannerUrl',site.banner?.url||'');
 }
 function getSite(){return {links:{help:read('opsLinkHelp'),feedback:read('opsLinkFeedback'),official:read('opsLinkOfficial')},
  flags:{inbox:$('opsFlagInbox').checked,sharing:$('opsFlagSharing').checked,help:$('opsFlagHelp').checked},
  banner:{enabled:$('opsBannerActive').checked,title:read('opsBannerTitle'),body:read('opsBannerBody'),
   button:read('opsBannerButton'),url:read('opsBannerUrl')}}}
 function fillVisual(m){
  options('opsColorBackground',m.colors?.background||'#143463');
  options('opsColorForeground',m.colors?.foreground||'#ffffff');
  options('opsColorAccent',m.colors?.accent||'#78aaff');
  check('opsMaintenanceWarn',m.noticeBefore!==false);
  check('opsDisableInbox',m.disabledModules?.includes('inbox'));
  check('opsDisableSearch',m.disabledModules?.includes('address-search'));
  check('opsDisableHelp',m.disabledModules?.includes('help'));
  for(const [id,module] of [['opsDisableSharing','sharing'],['opsDisablePushSettings','push-settings'],
   ['opsDisableQuickAddresses','quick-addresses'],['opsDisableManualRefresh','manual-refresh'],
   ['opsDisableFeedback','feedback'],['opsDisableCopySchedule','copy-schedule']])
   check(id,m.disabledModules?.includes(module));
 }
 function getVisual(){
  const disabledModules=[['inbox','opsDisableInbox'],['address-search','opsDisableSearch'],['help','opsDisableHelp'],['sharing','opsDisableSharing'],['push-settings','opsDisablePushSettings'],['quick-addresses','opsDisableQuickAddresses'],['manual-refresh','opsDisableManualRefresh'],['feedback','opsDisableFeedback'],['copy-schedule','opsDisableCopySchedule']]
   .filter(([,id])=>$(id).checked).map(([name])=>name);
  return {colors:{background:read('opsColorBackground'),foreground:read('opsColorForeground'),
   accent:read('opsColorAccent')},noticeBefore:$('opsMaintenanceWarn').checked,disabledModules};
 }
 function renderFormatted(target,text){
  target.replaceChildren();
  for(const line of String(text||'').split('\n').slice(0,70)){
   const trimmed=line.trim(),heading=/^#{1,3}\s+/.test(trimmed),bullet=/^[-*]\s+/.test(trimmed);
   const p=document.createElement(heading?'h3':'p');
   if(bullet)p.append(document.createTextNode('• '));
   const body=trimmed.replace(/^#{1,3}\s+|^[-*]\s+/,'');
   for(const piece of body.split(/(\*\*[^*]{1,160}\*\*)/g)){
    if(piece.startsWith('**')&&piece.endsWith('**')){
     const strong=document.createElement('strong');strong.textContent=piece.slice(2,-2);p.append(strong);
    }else p.append(document.createTextNode(piece));
   }
   target.append(p);
  }
 }
 const fullPreview=document.createElement('dialog');fullPreview.className='ops-full-message-preview';
 fullPreview.id='opsFullMessagePreview';document.body.append(fullPreview);
 $('opsPreviewFull').onclick=()=>{
  const title=document.createElement('h2');title.textContent=read('opsNoticeTitle')||'Нове повідомлення';
  const body=document.createElement('p');body.textContent=read('opsNoticeBody');
  const rich=document.createElement('div');renderFormatted(rich,read('opsNoticeContent'));
  const images=document.createElement('div');images.className='ops-preview-images';
  photos.forEach(url=>{const img=document.createElement('img');img.src=url;img.alt='Фото до повідомлення';images.append(img)});
  const close=document.createElement('button');close.type='button';close.textContent='Закрити';
  close.onclick=()=>fullPreview.close();
  fullPreview.replaceChildren(close,title,body,images,rich);fullPreview.showModal();
 };
 $('opsTestNotice').onclick=async()=>{
  const title=read('opsNoticeTitle'),body=read('opsNoticeBody');
  if(!title||!body)return status('Заповніть заголовок і короткий текст для тесту.',true);
  try{
   if(!('serviceWorker'in navigator))throw Error('Потрібен встановлений застосунок із Push');
   const subscription=await (await navigator.serviceWorker.ready).pushManager.getSubscription();
   if(!subscription?.endpoint)throw Error('На цьому пристрої немає активної Push-підписки');
   const outcome=await api('notices/test',{method:'POST',body:JSON.stringify({title,body,endpoint:subscription.endpoint})});
   status(outcome.accepted?'Тестовий Push надіслано цьому пристрою.':'Не вдалося надіслати: '+(outcome.error||'невідома помилка'),!outcome.accepted);
  }catch(e){status('Тест Push: '+e.message,true)}
 };

 function previewMessage(){
  $('opsEditorPreviewTitle').textContent=read('opsNoticeTitle')||'Заголовок повідомлення';
  $('opsEditorPreviewBody').textContent=read('opsNoticeBody')||'Короткий текст для користувачів';
  $('opsPreviewPushTitle').textContent=read('opsNoticeTitle')||'Назва сповіщення';
  $('opsPreviewPushBody').textContent=read('opsNoticeBody')||'Текст Push';
  renderFormatted($('opsRichContentPreview'),read('opsNoticeContent'));
 }
 function previewMaintenance(){
  $('opsPreviewTitle').textContent=read('opsTitle')||'Технічні роботи';
  $('opsPreviewMessage').textContent=read('opsMessage')||'Незабаром повернемося';
  const graphic=$('opsPreviewIcon'),url=read('opsImageUrl');graphic.replaceChildren();
  if(/^https:\/\//.test(url)){const img=document.createElement('img');img.src=url;img.alt='Ілюстрація техробіт';graphic.append(img)}
  else graphic.textContent=read('opsIcon')||'✨';
  $('opsPreview').dataset.theme=read('opsTheme')||'blue';
  $('opsPreview').dataset.layout=read('opsLayout')||'centered';
  $('opsPreview').style.backgroundColor=read('opsTheme')==='custom'?(read('opsColorBackground')||'#143463'):'';
  $('opsPreview').style.color=read('opsTheme')==='custom'?(read('opsColorForeground')||'#ffffff'):'';
  $('opsStatusPill').textContent=$('opsMaintenance').checked?'Зміни до техробіт':'Режим неактивний';
 }
 function fillMaintenance(m){
  check('opsMaintenance',m.enabled);options('opsTitle',m.title);options('opsMessage',m.message);
  options('opsStartsAt',local(m.startsAt));options('opsUntil',local(m.until));
  options('opsMode',m.mode||'full');options('opsTheme',m.theme||'blue');options('opsLayout',m.layout||'centered');options('opsIcon',m.icon||'✨');
  options('opsImageUrl',m.imageUrl||'');fillVisual(m);previewMaintenance();
 }
 let historyBaseline='';
 async function refreshHistory(){
  const host=$('opsHistoryList');if(!host||!remote)return;
  try{
   const [result,latest]=await Promise.all([api('app-config/history'),api('app-config')]);
   historyBaseline=latest.updatedAt||'';
   host.replaceChildren();
   if(!result.items?.length){
    const p=document.createElement('p');p.className='hint';
    p.textContent='Попередніх редакцій ще немає. Історія почне зберігатися після змін.';
    host.append(p);return;
   }
   for(const entry of result.items.slice(0,40)){
    const line=document.createElement('article');line.className='ops-history-item control-revision';
    const left=document.createElement('div');left.className='control-revision-info';
    const at=document.createElement('time');
    at.textContent=new Date(entry.at).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'medium',timeStyle:'short'});
    const stat=document.createElement('strong');
    stat.textContent=entry.active+' активних з '+entry.messages+' повідомлень';
    const tech=document.createElement('small');
    tech.textContent=entry.maintenance?'Техроботи були увімкнені':'Техроботи були вимкнені';
    left.append(at,stat,tech);
    const diff=document.createElement('p');diff.className='control-revision-diff';
    const c=entry.changes||{};
    diff.textContent=[
     c.added?'+'+c.added+' відновлених повідомлень':'',
     c.removed?'−'+c.removed+' прибраних повідомлень':'',
     c.edited?c.edited+' змінених повідомлень':'',
     c.flags?c.flags+' змін перемикачів':'',
     c.maintenance?'техроботи відрізняються':'',
     c.appearance?'оформлення відрізняється':''
    ].filter(Boolean).join(' · ')||'Суттєвих відмінностей немає';
    left.append(diff);line.append(left);
    const button=document.createElement('button');button.type='button';button.className='secondary control-restore-btn';
    button.textContent='Відновити';button.disabled=typeof adminRole==='undefined'||adminRole!=='owner';
    button.title=button.disabled?'Доступно власнику':'Відновити цю редакцію';
    button.onclick=async()=>{
     if(button.disabled||busy)return;
     const description=at.textContent+' · '+stat.textContent;
     if(!confirm('Відновити редакцію '+description+'? Поточна версія збережеться в історії. Техроботи залишаться вимкненими, а попередні Push НЕ будуть надіслані повторно.'))return;
     button.disabled=true;
     const notice=$('opsRestoreStatus');notice.textContent='Відновлюємо серверну редакцію…';
     try{
      const restored=await api('app-config/history/restore',{method:'POST',body:JSON.stringify({
       id:entry.id,expectedUpdatedAt:historyBaseline,confirmRestore:true
      })});
      if(!restored?.updatedAt)throw Error('Сервер не підтвердив відновлення');
      notice.textContent='Редакцію відновлено. Публікації синхронізуються, масові Push не запускалися.';
      selectedId='';await reload();
      try{const bc=new BroadcastChannel('svitlo-content-v1');bc.postMessage({type:'REFRESH_APP_CONFIG'});bc.close()}catch{}
     }catch(error){
      notice.textContent='Не відновлено: '+error.message+' Оновіть історію та спробуйте ще раз.';
      button.disabled=false;
     }
    };
    line.append(button);host.append(line);
   }
  }catch(e){
   const p=document.createElement('p');p.className='hint';p.textContent='Історія недоступна: '+e.message;host.replaceChildren(p);
  }
 }
 $('opsHistoryRefresh').onclick=()=>refreshHistory();
 async function reload(){
  if(!remote)return;
  try{const incoming=await api('app-config');state=incoming;serverState=structuredClone(incoming);selectedId=state.announcements.find(x=>x.id===selectedId)?.id||state.announcements[0]?.id||'';
   fillMaintenance(state.maintenance);fillSite(state.site);fill();drawList();refreshHistory().catch(console.warn);status('Дані завантажено. Можна редагувати.');
  }catch(e){status('Не вдалося завантажити редактор: '+e.message,true)}
 }
 async function uploadPhoto(file){
  if(!file)return '';
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3000000||file.size<20)throw Error('Використайте PNG, JPG або WebP до 3 МБ');
  const base64=await new Promise((resolve,reject)=>{
   const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('Не вдалося прочитати фото'));reader.readAsDataURL(file);
  });
  const result=await api('media',{method:'POST',body:JSON.stringify({mime:file.type,data:base64})});
  return server.replace(/\/$/,'')+'/api/media/'+result.id;
 }
 const queues=$('opsNoticeQueue');for(let i=1;i<=6;i++)for(const suffix of ['1','2'])queues.add(new Option('Підчерга '+i+'.'+suffix,i+'.'+suffix));
 $('opsNewNotice').onclick=()=>{if(!state)return;capture();const n=blank();state.announcements.unshift(n);selectedId=n.id;fill();drawList();status('Чернетка створена. Збережіть її перед виходом.')};
 $('opsDuplicateNotice').onclick=()=>{const n=target();if(!n)return;capture();const copy={...n,id:id(),title:n.title+' (копія)',active:false,pushSentAt:null,publishedAt:now(),images:[...(n.images||[])]};state.announcements.unshift(copy);selectedId=copy.id;fill();drawList()};
 $('opsDeleteNotice').onclick=async()=>{
  if(!target()||!confirm('Видалити повідомлення з сервера та «Вхідних» усіх користувачів?'))return;
  clearTimeout(autoSaveTimer);
  const previous=structuredClone(state),deleted=selectedId;
  capture();
  state.announcements=state.announcements.filter(x=>x.id!==deleted);
  selectedId=state.announcements[0]?.id||'';
  fill();drawList();status('Видаляємо повідомлення на сервері…');
  try{await saveConfig({silent:true});status('Повідомлення видалено на сервері. Воно зникне у «Вхідних» під час синхронізації.')}
  catch(e){state=previous;selectedId=deleted;fill();drawList();status('Видалення НЕ виконано: '+e.message,true)}
 };
 $('opsNoticeSearch').oninput=drawList;
 $('opsNoticeStatusFilter').onchange=drawList;
 $('opsNoticeSort').onchange=drawList;
 $('opsNoticesExport').onclick=()=>{
  if(!state)return;
  capture();
  const blob=new Blob([JSON.stringify({exportedAt:now(),announcements:state.announcements},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='svitlo-announcements-'+now().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  status('Повідомлення експортовано. Зберігайте чернетки приватно.');
 };
 $('opsExpireNotices').onclick=async()=>{
  if(!state||busy)return;
  capture();
  const exp=state.announcements.filter(n=>n.active&&n.expiresAt&&Date.parse(n.expiresAt)<=Date.now());
  if(!exp.length){status('Активних прострочених повідомлень немає.');return}
  if(!confirm('Зняти з публікації '+exp.length+' прострочених повідомлень? Вони зникнуть з «Вхідних» після синхронізації.'))return;
  const backup=structuredClone(state);
  for(const n of exp){n.active=false;n.pinned=false;n.updatedAt=now()}
  fill();drawList();
  try{await saveConfig({scope:'content'});status('Знято з публікації '+exp.length+' прострочених повідомлень.')}
  catch(e){state=backup;fill();drawList();status('Не вдалося зняти повідомлення: '+e.message,true)}
 };
 for(const id of ['opsNoticeTitle','opsNoticeBody','opsNoticeContent','opsNoticeKind','opsNoticePriority','opsNoticeIcon','opsNoticeQueue','opsNoticeDelivery','opsNoticeSettlement','opsNoticeActive','opsNoticePinned','opsNoticeSchedule','opsNoticeExpires']){
  $(id).addEventListener('input',()=>{
   capture();previewMessage();drawList();
   if(['opsNoticeActive','opsNoticePinned'].includes(id)){
    clearTimeout(autoSaveTimer);
    // Publication/visibility changes must not silently remain in local memory.
    autoSaveTimer=setTimeout(()=>saveConfig({silent:true}).catch(()=>{}),150);
   }
  });
 }
 for(const id of ['opsTitle','opsMessage','opsStartsAt','opsUntil','opsMode','opsTheme','opsLayout','opsIcon','opsImageUrl','opsMaintenance','opsColorBackground','opsColorForeground','opsColorAccent'])$(id).addEventListener('input',previewMaintenance);
 $('opsPhotoUpload').onchange=async()=>{
  const files=[...$('opsPhotoUpload').files||[]];$('opsPhotoUpload').value='';
  if(!target())return status('Спочатку створіть повідомлення',true);
  try{status('Завантажуємо фото…');
   for(const file of files.slice(0,6-photos.length)){const url=await uploadPhoto(file);photos.push(url)}
   drawPhotos();capture();status('Фото додані. Натисніть «Зберегти».');
  }catch(e){status('Не вдалося завантажити: '+e.message,true)}
 };
 $('opsMaintenanceFile').onchange=async()=>{const file=$('opsMaintenanceFile').files?.[0];$('opsMaintenanceFile').value='';
  try{status('Завантажуємо ілюстрацію…');options('opsImageUrl',await uploadPhoto(file));previewMaintenance();status('Ілюстрація готова до збереження.')}
  catch(e){status(e.message,true)}
 };
 $('opsAddImageUrl').onclick=()=>{const url=read('opsNoticeImageUrl');if(!target())return status('Спочатку створіть повідомлення',true);
  if(!/^https:\/\//.test(url)||photos.length>=6)return status('Вкажіть HTTPS-адресу. Максимум шість фото.',true);
  photos.push(url);options('opsNoticeImageUrl','');drawPhotos();capture()};
 document.querySelectorAll('[data-ops-format]').forEach(button=>button.addEventListener('click',()=>{
  const textarea=$('opsNoticeContent'),start=textarea.selectionStart,end=textarea.selectionEnd;
  const selection=textarea.value.slice(start,end),kind=button.dataset.opsFormat;
  const value=kind==='bold'?'**'+(selection||'важливий текст')+'**':kind==='heading'?'## '+(selection||'Підзаголовок'):
   kind==='bullet'?'- '+(selection||'Пункт списку'):'['+(selection||'текст посилання')+'](https://)';
  textarea.setRangeText(value,start,end,'select');textarea.focus();capture();
 }));
 const templates={
  schedule:{kind:'schedule',icon:'🗓️',title:'Оновлено графік відключень',body:'Оператор опублікував уточнення графіка. Перегляньте години для своєї підчерги.',content:'## Що змінилося\nПеревірте актуальні години на вкладці «Графік».'},
  emergency:{kind:'emergency',icon:'⚠️',title:'Важлива інформація про електропостачання',body:'Опубліковано важливе повідомлення. Ознайомтеся з деталями.',content:'## Інформація\nДеталі можна дізнатися з офіційного повідомлення оператора.'},
  maintenance:{kind:'important',icon:'🛠️',title:'Планові технічні роботи',body:'У застосунку заплановане короткочасне оновлення.',content:'## Що відбуватиметься\nДеякі функції можуть тимчасово бути недоступними.'},
  update:{kind:'update',icon:'✨',title:'Нова версія «Світло Черкаси»',body:'Додали нові зручні функції та покращили роботу застосунку.',content:'## Що нового\n- Зручніший інтерфейс\n- Покращення продуктивності'}
 };
 $('opsTemplate').onchange=()=>{
  const t=templates[$('opsTemplate').value];if(!t||!target())return;
  if((read('opsNoticeTitle')||read('opsNoticeContent'))&&!confirm('Замінити заголовок і текст вибраним шаблоном?'))return;
  options('opsNoticeTitle',t.title);options('opsNoticeBody',t.body);options('opsNoticeContent',t.content);
  options('opsNoticeKind',t.kind);options('opsNoticeIcon',t.icon);capture();previewMessage();document.dispatchEvent(new CustomEvent('svitlo:cms-loaded'))
 };
 $('opsReload').onclick=reload;
 async function saveConfig({silent=false,scope='content'}={}){
  if(!state||busy)return;
  if(scope==='content')capture();
  // A content save must never silently republish maintenance or overwrite
  // newer feature/appearance settings written in another admin workspace.
  const latest=await api('app-config');
  const noticeChanges=scope==='content'?state.announcements:[...latest.announcements];
  const toPush=noticeChanges.filter(x=>x.active&&['push','both'].includes(x.delivery)&&!x.pushSentAt
   &&(!x.scheduledAt||Date.parse(x.scheduledAt)<=Date.now()));
  if(toPush.length&&scope==='content'&&!confirm('Надіслати Push для '+toPush.length+' повідомлень?'))throw Error('Розсилку не підтверджено');
  let next;
  if(scope==='maintenance'){
   const old=latest.maintenance?.enabled===true,newOn=$('opsMaintenance').checked;
   if(newOn&&!old&&!confirm('Увімкнути технічні роботи для користувачів?'))throw Error('Увімкнення не підтверджено');
   next={...latest,maintenance:{enabled:newOn,title:read('opsTitle'),message:read('opsMessage'),
    mode:read('opsMode'),theme:read('opsTheme'),layout:read('opsLayout'),icon:read('opsIcon'),
    imageUrl:read('opsImageUrl'),startsAt:fromLocal($('opsStartsAt').value),until:fromLocal($('opsUntil').value),...getVisual()}};
  }else next={...latest,announcements:noticeChanges};
  busy=true;
  $('opsSave').disabled=true;
  $('opsMaintenanceSave').disabled=true;
  try{
   const saved=await api('app-config',{method:'PUT',body:JSON.stringify(next)});
   state=saved;serverState=structuredClone(saved);
   fillMaintenance(saved.maintenance);fillSite(saved.site);fill();drawList();previewMaintenance();
   status(silent?'Зміни збережено на сервері.':'Збережено. Зміни опубліковані.');
   refreshHistory().catch(console.warn);
   try{const channel=new BroadcastChannel('svitlo-content-v1');
    channel.postMessage({type:'REFRESH_APP_CONFIG',at:Date.now()});channel.close()}catch{}
   return saved;
  }catch(e){status('Не збережено: '+e.message,true);throw e}
  finally{busy=false;$('opsSave').disabled=false;$('opsMaintenanceSave').disabled=false}
 }
 $('opsSave').onclick=()=>{clearTimeout(autoSaveTimer);saveConfig().catch(console.warn)};
 document.querySelector('[data-admin-tab="operations"]')?.addEventListener('click',reload);
 document.querySelector('[data-admin-tab="maintenance"]')?.addEventListener('click',reload);
 $('opsMaintenanceSave')?.addEventListener('click',()=>saveConfig({scope:'maintenance'}).catch(console.warn));
 document.querySelector('[data-admin-tab="revisions"]')?.addEventListener('click',()=>refreshHistory().catch(console.warn));
 document.addEventListener('svitlo:admin-logout',()=>{state=null;status('Для керування потрібен вхід.')});
})();
