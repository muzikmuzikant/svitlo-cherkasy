/* Svitlo Office / social channels register. Only owner may publish global links.
 * Uses the existing authenticated Railway app-config, preserving all other tabs. */
(()=>{'use strict';
 const panel=document.querySelector('[data-admin-panel="social"]');
 if(!panel)return;
 const $=id=>document.getElementById(id);
 const apiCall=()=>window.svitloAdminApi;
 const PLATFORMS={telegram:'Telegram',instagram:'Instagram',facebook:'Facebook',
  tiktok:'TikTok',youtube:'YouTube',threads:'Threads',website:'Сайт',other:'Інше'};
 const DEFAULT={enabled:true,showInApp:true,showInFooter:true,
  links:[{id:'telegram_official',platform:'telegram',label:'Telegram',url:'https://t.me/svitlo_cherkasy_of',enabled:true}]};
 const copy=x=>JSON.parse(JSON.stringify(x));
 const fallback=raw=>raw&&typeof raw==='object'?copy(raw):copy(DEFAULT);
 let state=fallback(null),baseline='',saving=false,loaded=false,dirty=false,sequence=0;
 const owner=()=>document.body.dataset.adminRole==='owner';
 const text=(name,content,cls)=>{const n=document.createElement(name);if(content!==undefined)n.textContent=content;if(cls)n.className=cls;return n};
 const controls=['socialEnabled','socialShowInApp','socialShowInFooter'];
 function notify(msg,error=false){
  const el=$('socialStatus');el.textContent=msg;el.classList.toggle('social-error',error);
 }
 function snapshot(){return JSON.stringify(state)}
 function touch(){dirty=loaded&&snapshot()!==baseline;
  if(!saving)notify(dirty?'Є незбережені зміни.':'Усі зміни збережено.');
  preview();
 }
 function collect(){
  state.enabled=$('socialEnabled').checked;
  state.showInApp=$('socialShowInApp').checked;
  state.showInFooter=$('socialShowInFooter').checked;
  touch();
 }
 function formField(title,kind,value,max){
  const wrap=text('label',undefined,'social-admin-field');
  const caption=text('span',title);wrap.append(caption);
  const input=document.createElement('input');
  input.type=kind;input.value=value;input.maxLength=max;
  input.autocomplete='off';input.disabled=!owner()||!loaded||saving;wrap.append(input);
  return {wrap,input};
 }
 function preview(){
  const container=$('socialPreview');container.replaceChildren();
  if(!state.enabled||!state.links?.some(x=>x.enabled&&x.url.trim()&&x.label.trim())){
   container.append(text('p','Наразі жоден канал не опублікований.','social-admin-empty'));return;
  }
  const heading=text('span','Слідкуйте за оновленнями','social-admin-preview-title');
  container.append(heading);
  const row=text('div',undefined,'social-admin-preview-links');
  for(const link of state.links){
   if(!link.enabled||!link.url.trim()||!link.label.trim())continue;
   const a=text('span',undefined,'social-admin-preview-link');
   a.append(text('span',PLATFORMS[link.platform]?.slice(0,2)||'↗','social-admin-mini-icon'),
    text('span',link.label));row.append(a);
  }
  container.append(row);
 }
 function render(){
  controls.forEach((id,i)=>{$(id).checked=state[['enabled','showInApp','showInFooter'][i]]!==false;
   $(id).disabled=!owner()||saving});
  const target=$('socialEntries');target.replaceChildren();
  state.links.forEach((link,index)=>{
   const card=text('article',undefined,'social-admin-row');
   card.dataset.linkId=link.id;
   const head=text('div',undefined,'social-admin-row-head');
   head.append(text('strong','Канал '+String(index+1).padStart(2,'0')),
    text('small',link.id));
   const show=text('label',undefined,'social-admin-published');
   const active=document.createElement('input');active.type='checkbox';active.checked=link.enabled!==false;active.disabled=!owner()||!loaded||saving;
   active.onchange=()=>{link.enabled=active.checked;touch()};
   show.append(active,text('span','Показувати'));head.append(show);card.append(head);
   const grid=text('div',undefined,'social-admin-row-grid');
   const kind=text('label',undefined,'social-admin-field');
   kind.append(text('span','Платформа'));
   const select=document.createElement('select');select.disabled=!owner()||!loaded||saving;
   for(const [value,title] of Object.entries(PLATFORMS)){
    const option=new Option(title,value);select.append(option);
   }
   select.value=link.platform||'other';
   select.onchange=()=>{link.platform=select.value;touch()};
   kind.append(select);
   const label=formField('Назва для користувача','text',link.label||'',48);
   label.input.oninput=()=>{link.label=label.input.value;touch()};
   const url=formField('HTTPS-посилання','url',link.url||'',500);
   url.input.placeholder='https://t.me/назва_каналу';
   url.input.oninput=()=>{link.url=url.input.value;touch()};
   grid.append(kind,label.wrap,url.wrap);card.append(grid);
   const actions=text('div',undefined,'social-admin-row-actions');
   for(const [title,step] of [['Вище',-1],['Нижче',1]]){
    const b=text('button',title,'secondary');b.type='button';
    b.disabled=!owner()||saving||index+step<0||index+step>=state.links.length;
    b.onclick=()=>{const [row]=state.links.splice(index,1);state.links.splice(index+step,0,row);render();touch()};
    actions.append(b);
   }
   const del=text('button','Видалити','danger');del.type='button';del.disabled=!owner()||saving;
   del.onclick=()=>{state.links.splice(index,1);render();touch()};
   actions.append(del);card.append(actions);target.append(card);
  });
  $('socialAdd').disabled=!owner()||saving||!loaded||state.links.length>=12;
  $('socialSave').disabled=!owner()||saving||!loaded;
  $('socialReload').disabled=saving||!loaded;
  preview();
 }
 async function load({discard=false}={}){
  if(saving||typeof remote!=='undefined'&&!remote)return;
  if(dirty&&!discard&&!confirm('Відхилити незбережені зміни соцмереж?'))return;
  saving=true;$('socialReload').disabled=true;notify('Отримуємо канали із захищеного сервера…');
  try{
   const cfg=await apiCall()('app-config');
   const social=fallback(cfg.site?.social);
   state=social;baseline=snapshot();loaded=true;dirty=false;
   render();
   notify(owner()?'Реєстр завантажено. Зміни ще не опубліковано.':
    'Режим перегляду. Змінювати глобальні канали може лише власник.');
  }catch(error){notify('Не вдалося завантажити: '+error.message,true)}
  finally{saving=false;render()}
 }
 function validated(){
  if(!Array.isArray(state.links)||state.links.length>12)throw Error('Не більше 12 каналів');
  const ids=new Set();
  for(const row of state.links){
   if(!row.label.trim()||row.label.trim().length>48)throw Error('Перевірте назву в каналі');
   if(ids.has(row.id))throw Error('Дублікат каналу');ids.add(row.id);
   let uri;try{uri=new URL(row.url.trim())}catch{throw Error('Укажіть коректне HTTPS-посилання')}
   if(uri.protocol!=='https:'||uri.username||uri.password||!uri.hostname.includes('.')||
    /[\s<>]/.test(row.url))throw Error('Потрібне безпечне HTTPS-посилання');
  }
 }
 async function save(){
  if(saving||!loaded||!owner())return;
  try{validated()}catch(e){notify(e.message,true);return}
  saving=true;render();notify('Публікуємо канали…');
  try{
   const latest=await apiCall()('app-config');
   const latestSocial=fallback(latest.site?.social);
   if(JSON.stringify(latestSocial)!==baseline)
    throw Error('Налаштування змінилися в іншому сеансі. Оновіть реєстр і повторіть зміни.');
   const updated={...latest,site:{...latest.site,
    social:{...state,links:state.links.map(x=>({...x,label:x.label.trim(),url:x.url.trim()}))}}};
   const result=await apiCall()('app-config',{method:'PUT',body:JSON.stringify(updated)});
   if(!result?.site?.social||JSON.stringify(result.site.social.links?.map(x=>x.id))!==
    JSON.stringify(state.links.map(x=>x.id)))
    throw Error('Сервер не підтвердив публікацію соцмереж. Перевірте оновлення Railway.');
   state=fallback(result.site.social);baseline=snapshot();dirty=false;render();
   notify('Опубліковано. Посилання оновляться в застосунку та на сторінках.');
   try{const channel=new BroadcastChannel('svitlo-content-v1');
    channel.postMessage({type:'REFRESH_APP_CONFIG',at:Date.now()});channel.close()}catch{}
  }catch(e){notify('Не опубліковано: '+e.message,true)}
  finally{saving=false;render()}
 }
 controls.forEach(id=>$(id).addEventListener('change',collect));
 $('socialAdd').addEventListener('click',()=>{
  if(state.links.length>=12||!owner())return;
  const id='channel_'+(++sequence)+'_'+Date.now().toString(36);
  state.links.push({id,platform:'telegram',label:'Новий канал',url:'',enabled:false});
  render();touch();
  const last=$('socialEntries').lastElementChild;
  last?.querySelector('input[type="url"]')?.focus();
 });
 $('socialReload').onclick=()=>load();
 $('socialSave').onclick=()=>void save();
 document.querySelector('[data-admin-tab="social"]')?.addEventListener('click',()=>{
  if(!loaded&&typeof remote!=='undefined'&&remote)void load({discard:true});
 });
 document.addEventListener('svitlo:admin-ready',()=>{if(!panel.hidden)void load({discard:true})});
 document.addEventListener('svitlo:admin-logout',()=>{
  loaded=false;dirty=false;state=fallback(null);baseline='';
  notify('Сеанс завершено. Увійдіть до системи.');render();
 });
 render();
})();
