/* Svitlo Control Center v7.4. All writes go through authenticated Railway API. */
(()=>{'use strict';
 const section=document.querySelector('[data-admin-panel="operations"]');
 if(!section||!document.getElementById('opsNoticeContent'))return;
 const $=id=>document.getElementById(id);
 let state=null,selectedId='',busy=false,photos=[];
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
  return {id:id(),title:'',body:'',content:'',kind:'info',priority:'normal',queue:'all',delivery:'inbox',
   icon:'',images:[],active:false,pinned:false,publishedAt:now(),updatedAt:null,scheduledAt:null,expiresAt:null,pushSentAt:null};
 }
 function capture(){
  const n=target();if(!n)return;
  const before=JSON.stringify({title:n.title,body:n.body,content:n.content,kind:n.kind,priority:n.priority,
   queue:n.queue,delivery:n.delivery,icon:n.icon,pinned:n.pinned,active:n.active,scheduledAt:n.scheduledAt,
   expiresAt:n.expiresAt,images:n.images});
  Object.assign(n,{title:read('opsNoticeTitle'),body:read('opsNoticeBody'),content:read('opsNoticeContent'),
   kind:read('opsNoticeKind'),priority:read('opsNoticePriority'),queue:read('opsNoticeQueue'),
   delivery:read('opsNoticeDelivery'),icon:read('opsNoticeIcon'),pinned:$('opsNoticePinned').checked,
   active:$('opsNoticeActive').checked,scheduledAt:fromLocal($('opsNoticeSchedule').value),
   expiresAt:fromLocal($('opsNoticeExpires').value),images:[...photos]});
  const after=JSON.stringify({title:n.title,body:n.body,content:n.content,kind:n.kind,priority:n.priority,
   queue:n.queue,delivery:n.delivery,icon:n.icon,pinned:n.pinned,active:n.active,scheduledAt:n.scheduledAt,
   expiresAt:n.expiresAt,images:n.images});
  if(before!==after)n.updatedAt=now();
 }
 function fill(){
  const n=target();
  $('opsEditorStatus').textContent=n?(n.active?'Опубліковане повідомлення':'Чернетка'):'Створіть або виберіть повідомлення';
  for(const field of ['opsNoticeTitle','opsNoticeBody','opsNoticeContent','opsNoticeIcon'])options(field,n?.[field.replace('opsNotice','').toLowerCase()]||'');
  options('opsNoticeKind',n?.kind||'info');options('opsNoticePriority',n?.priority||'normal');
  options('opsNoticeQueue',n?.queue||'all');options('opsNoticeDelivery',n?.delivery||'inbox');
  options('opsNoticeSchedule',local(n?.scheduledAt));options('opsNoticeExpires',local(n?.expiresAt));
  check('opsNoticeActive',n?.active);check('opsNoticePinned',n?.pinned);
  photos=[...(n?.images||[])];drawPhotos();previewMessage();
 }
 function drawList(){
  const list=$('opsNoticeList');list.replaceChildren();
  $('opsNoticeCount').textContent=String(state?.announcements?.length||0);
  const query=read('opsNoticeSearch').toLowerCase();
  for(const n of state?.announcements||[]){
   if(query&&!((n.title+' '+n.body).toLowerCase().includes(query)))continue;
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
 function previewMessage(){
  $('opsEditorPreviewTitle').textContent=read('opsNoticeTitle')||'Заголовок повідомлення';
  $('opsEditorPreviewBody').textContent=read('opsNoticeBody')||'Короткий текст для користувачів';
 }
 function previewMaintenance(){
  $('opsPreviewTitle').textContent=read('opsTitle')||'Технічні роботи';
  $('opsPreviewMessage').textContent=read('opsMessage')||'Незабаром повернемося';
  const graphic=$('opsPreviewIcon'),url=read('opsImageUrl');graphic.replaceChildren();
  if(/^https:\/\//.test(url)){const img=document.createElement('img');img.src=url;img.alt='Ілюстрація техробіт';graphic.append(img)}
  else graphic.textContent=read('opsIcon')||'✨';
  $('opsPreview').dataset.theme=read('opsTheme')||'blue';
  $('opsStatusPill').textContent=$('opsMaintenance').checked?'Зміни до техробіт':'Режим неактивний';
 }
 function fillMaintenance(m){
  check('opsMaintenance',m.enabled);options('opsTitle',m.title);options('opsMessage',m.message);
  options('opsStartsAt',local(m.startsAt));options('opsUntil',local(m.until));
  options('opsMode',m.mode||'full');options('opsTheme',m.theme||'blue');options('opsIcon',m.icon||'✨');
  options('opsImageUrl',m.imageUrl||'');previewMaintenance();
 }
 async function reload(){
  if(!remote)return;
  try{const incoming=await api('app-config');state=incoming;selectedId=state.announcements.find(x=>x.id===selectedId)?.id||state.announcements[0]?.id||'';
   fillMaintenance(state.maintenance);fill();drawList();status('Дані завантажено. Можна редагувати.');
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
 $('opsDeleteNotice').onclick=()=>{if(!target()||!confirm('Видалити повідомлення зі списку? Після збереження воно зникне у нових користувачів.'))return;
  state.announcements=state.announcements.filter(x=>x.id!==selectedId);selectedId=state.announcements[0]?.id||'';fill();drawList();status('Позначено до видалення. Натисніть «Зберегти».')};
 $('opsNoticeSearch').oninput=drawList;
 for(const id of ['opsNoticeTitle','opsNoticeBody','opsNoticeContent','opsNoticeKind','opsNoticePriority','opsNoticeIcon','opsNoticeQueue','opsNoticeDelivery','opsNoticeActive','opsNoticePinned','opsNoticeSchedule','opsNoticeExpires']){
  $(id).addEventListener('input',()=>{capture();previewMessage();drawList()});
 }
 for(const id of ['opsTitle','opsMessage','opsStartsAt','opsUntil','opsMode','opsTheme','opsIcon','opsImageUrl','opsMaintenance'])$(id).addEventListener('input',previewMaintenance);
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
  options('opsNoticeKind',t.kind);options('opsNoticeIcon',t.icon);capture();previewMessage()
 };
 $('opsReload').onclick=reload;
 $('opsSave').onclick=async()=>{
  if(!state||busy)return;capture();
  const old=state.maintenance.enabled,newOn=$('opsMaintenance').checked;
  if(newOn&&!old&&!confirm('Увімкнути технічні роботи? Головний екран може бути недоступний для користувачів.'))return;
  const toPush=state.announcements.filter(x=>x.active&&x.delivery==='both'&&!x.pushSentAt&&(!x.scheduledAt||Date.parse(x.scheduledAt)<=Date.now()));
  if(toPush.length&&!confirm('Опублікувати '+toPush.length+' повідомлень одночасно у «Вхідних» і Push?'))return;
  const next={...state,maintenance:{enabled:newOn,title:read('opsTitle'),message:read('opsMessage'),mode:read('opsMode'),theme:read('opsTheme'),icon:read('opsIcon'),
   imageUrl:read('opsImageUrl'),startsAt:fromLocal($('opsStartsAt').value),until:fromLocal($('opsUntil').value)}};
  busy=true;$('opsSave').disabled=true;try{state=await api('app-config',{method:'PUT',body:JSON.stringify(next)});
   fill();drawList();previewMaintenance();status('Збережено. Повідомлення та техроботи синхронізуються автоматично.');
   try{new BroadcastChannel('svitlo-content-v1').postMessage({type:'REFRESH_APP_CONFIG',at:Date.now()})}catch{}
  }catch(e){status('Не збережено: '+e.message,true)}
  finally{busy=false;$('opsSave').disabled=false}
 };
 document.querySelector('[data-admin-tab="operations"]')?.addEventListener('click',reload);
 document.addEventListener('svitlo:admin-logout',()=>{state=null;status('Для керування потрібен вхід.')});
})();
