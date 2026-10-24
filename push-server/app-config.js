/* Persistent app controls. Backward compatible with schemaVersion 1. */
import fs from 'node:fs';
import path from 'node:path';
const QUEUES=new Set(['all',...Array.from({length:6},(_,i)=>[String(i+1)+'.1',String(i+1)+'.2']).flat()]);
const defaultSite=()=>({links:{help:'./help.html',feedback:'./feedback.html',official:'https://www.cherkasyoblenergo.com/news'},
 flags:{inbox:true,inboxFilters:true,inboxHistory:true,sharing:true,sharePreview:true,copySchedule:true,help:true,feedback:true,addressSearch:true,pushPrompt:true,pushSettings:true,tomorrowPreview:true,quickAddresses:true,homePlaces:true,dailyStats:true,overviewTimeline:true,statusCountdown:true,weekNavigation:true,dayStats:true,scheduleLegend:true,offlineStatus:true,scheduleSource:true,manualRefresh:true,homeQuickActions:true,animations:true,quickQueueLookup:true,nextChangeCard:true,dayShortcuts:true,detailSourceLink:true,hourlyLabels:true,inboxMarkAll:true,inboxClearRead:true,appUpdateCheck:true,editAddressFromGraph:true,syncStatus:true,settingsFooter:true,tomorrowOpenShortcut:true,scheduleOpenShortcut:true},
 social:{enabled:true,showInApp:true,showInFooter:true,
  links:[{id:'telegram_official',platform:'telegram',label:'Telegram',url:'https://t.me/svitlo_cherkasy_of',enabled:true}]},
 banner:{enabled:false,title:'Нові можливості',body:'Оновлення застосунку доступне.',url:'',button:'Детальніше'},
 appearance:{accent:'#377dff',background:'#f6f8fc',surface:'#ffffff',density:'comfortable',rounded:true}});
const defaults=()=>({schemaVersion:1,updatedAt:null,maintenance:{enabled:false,title:'Ми покращуємо застосунок',message:'Незабаром усе знову працюватиме. Актуальні графіки можна перевірити на сайті оператора.',until:null,startsAt:null,mode:'full',theme:'blue',layout:'centered',icon:'✨',imageUrl:'',colors:{background:'#143463',foreground:'#ffffff',accent:'#78aaff'},noticeBefore:true,noticeInInbox:true,plannedBanner:{title:'Заплановані технічні роботи',body:'Під час робіт застосунок може тимчасово бути недоступним.',style:'expanded',button:'Офіційні графіки',url:'https://www.cherkasyoblenergo.com/news',showCountdown:true,showEnd:true,showButton:true,background:'#eaf3ff',foreground:'#22496f',accent:'#347af0'},disabledModules:[]},site:defaultSite(),announcements:[]});
const str=(v,max)=>String(v??'').trim().slice(0,max+1);
function date(v){if(v==null||v==='')return null;if(typeof v!=='string'||v.length>36||!Number.isFinite(Date.parse(v)))throw Error('Неправильна дата');return new Date(v).toISOString()}
function image(v){const url=str(v,900);if(!url)return '';try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||url.length>900)throw Error();return u.href}catch{throw Error('Фото повинне мати HTTPS-посилання')}}
const SOCIAL_PLATFORMS=new Set(['telegram','instagram','facebook','tiktok','youtube','threads','website','other']);
function validateSocial(input){
 const raw=input===undefined?defaultSite().social:input;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Некоректні налаштування соцмереж');
 if(!Array.isArray(raw.links)||raw.links.length>12)throw Error('Дозволено не більше 12 посилань');
 const ids=new Set();
 const links=raw.links.map(row=>{
  if(!row||typeof row!=='object')throw Error('Некоректний запис соцмережі');
  const id=String(row.id||'').trim();
  if(!/^[a-zA-Z0-9_-]{3,48}$/.test(id)||ids.has(id))throw Error('Повторний або неправильний код посилання');
  ids.add(id);
  const platform=String(row.platform||'other').trim().toLowerCase();
  if(!SOCIAL_PLATFORMS.has(platform))throw Error('Непідтримувана соцмережа');
  const label=String(row.label||'').trim(),url=String(row.url||'').trim();
  if(!label||label.length>48)throw Error('Назва соцмережі повинна містити 1–48 символів');
  if(!url||url.length>500)throw Error('Некоректне посилання соцмережі');
  let address;
  try{
   address=new URL(url);
   if(address.protocol!=='https:'||address.username||address.password||
    !address.hostname.includes('.')||/[\s<>]/.test(url))throw Error();
  }catch{throw Error('Соцмережі підтримують лише коректні HTTPS-посилання')}
  return {id,platform,label,url:address.href,enabled:row.enabled!==false};
 });
 return {enabled:raw.enabled!==false,showInApp:raw.showInApp!==false,
  showInFooter:raw.showInFooter!==false,links};
}
export function validateAppConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Некоректні налаштування');
 const m={...defaults().maintenance,...(input.maintenance||{})},title=str(m.title,90),message=str(m.message,320);
 if(title.length<5||title.length>90||message.length<12||message.length>320)throw Error('Перевірте заголовок та опис техробіт');
 if(!['full','limited','incident'].includes(m.mode)||!['blue','midnight','light','violet','custom'].includes(m.theme)||!['centered','compact','split'].includes(m.layout))throw Error('Невідомий режим або тема');
 const startsAt=date(m.startsAt),until=date(m.until);
 if(startsAt&&until&&startsAt>=until)throw Error('Час завершення має бути пізніше початку');
 const validColor=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)?v:null;
 const colors={background:validColor(m.colors?.background)||'#143463',foreground:validColor(m.colors?.foreground)||'#ffffff',accent:validColor(m.colors?.accent)||'#78aaff'};
 const modules=new Set(['inbox','address-search','help','sharing','push-settings','quick-addresses','manual-refresh','feedback','copy-schedule']),disabledModules=Array.isArray(m.disabledModules)?m.disabledModules:[];
 if(disabledModules.some(v=>!modules.has(v)))throw Error('Невідомий модуль технічних робіт');
 const maintenance={enabled:m.enabled===true,title,message,startsAt,until,mode:m.mode,theme:m.theme,layout:m.layout,icon:str(m.icon,18)||'✨',imageUrl:image(m.imageUrl),
  colors,noticeBefore:m.noticeBefore!==false,noticeInInbox:m.noticeInInbox!==false,disabledModules:[...new Set(disabledModules)]};
 const rawSite=input.site||{},defaultsSite=defaultSite();
 const safeLink=(value,otherwise)=>{if(value===undefined||value===null)return otherwise;
  const url=str(value,500);if(!url)return '';if(/^\.\/[a-zA-Z0-9/_?&=.-]{1,250}$/.test(url))return url;
  try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||url.length>500)throw Error();return u.href}
  catch{throw Error('Посилання має бути HTTPS або шляхом ./')}}
 const pb={...defaults().maintenance.plannedBanner,...(m.plannedBanner||{})};
  maintenance.plannedBanner={
   title:str(pb.title,90)||'Заплановані технічні роботи',
   body:str(pb.body,280)||'У цей час застосунок може бути тимчасово недоступним.',
   style:['expanded','compact','highlight'].includes(pb.style)?pb.style:'expanded',
   button:str(pb.button,38)||'Офіційні графіки',
   url:safeLink(pb.url??'', ''),
   showCountdown:pb.showCountdown!==false,
   showEnd:pb.showEnd!==false,
    showButton:pb.showButton!==false,
    background:validColor(pb.background)||'#eaf3ff',
    foreground:validColor(pb.foreground)||'#22496f',
    accent:validColor(pb.accent)||'#347af0'
   };
  const links=Object.fromEntries(Object.entries(defaultsSite.links).map(([key,value])=>[key,safeLink(rawSite.links?.[key],value)]));
 const flags=Object.fromEntries(Object.entries(defaultsSite.flags).map(([key,value])=>[key,rawSite.flags?.[key]===undefined?value:rawSite.flags[key]===true]));
 const rawBanner=rawSite.banner||{},banner={enabled:rawBanner.enabled===true,title:str(rawBanner.title??defaultsSite.banner.title,90),
  body:str(rawBanner.body??defaultsSite.banner.body,260),url:safeLink(rawBanner.url??'', ''),
  button:str(rawBanner.button??defaultsSite.banner.button,38)};
 if(banner.enabled&&(!banner.title||!banner.body))throw Error('Заповніть заголовок і текст банера');
 const rawAppearance=rawSite.appearance||{},appearance={
  accent:validColor(rawAppearance.accent)||defaultsSite.appearance.accent,
  background:validColor(rawAppearance.background)||defaultsSite.appearance.background,
  surface:validColor(rawAppearance.surface)||defaultsSite.appearance.surface,
  density:['comfortable','compact'].includes(rawAppearance.density)?rawAppearance.density:'comfortable',
  rounded:rawAppearance.rounded!==false
 };
 const site={links,flags,banner,appearance,social:validateSocial(rawSite.social)};
 if(!Array.isArray(input.announcements)||input.announcements.length>50)throw Error('Максимум 50 повідомлень');
 const ids=new Set(),announcements=input.announcements.map(a=>{
  const id=String(a?.id||'');if(!/^[A-Za-z0-9_-]{6,64}$/.test(id)||ids.has(id))throw Error('Неправильний або повторний ID');ids.add(id);
  const title=str(a.title,90),body=str(a.body,500),content=str(a.content||body,20000);
  // Drafts may be empty. A published notice needs a meaningful body, but emoji are NEVER mandatory.
  if(title.length>90||body.length>500||content.length>20000||(a.active===true&&(title.length<1||body.length<1)))
   throw Error('Додайте заголовок і короткий текст перед публікацією');
  const kind=a.kind||'info',priority=a.priority||'normal',queue=a.queue||'all',delivery=a.delivery||'inbox';
  const settlement=str(a.settlement,70);
  if(settlement.length>70)throw Error('Назва населеного пункту надто довга');
  if(!['info','important','update','schedule','emergency'].includes(kind)||!['normal','important','urgent'].includes(priority)||!QUEUES.has(queue)||!['inbox','both','push'].includes(delivery))throw Error('Невірні налаштування доставки');
  const images=a.images??[];if(!Array.isArray(images)||images.length>6)throw Error('Максимум шість зображень');
  const scheduledAt=date(a.scheduledAt),expiresAt=date(a.expiresAt);
  if(scheduledAt&&expiresAt&&scheduledAt>=expiresAt)throw Error('Термін дії раніше публікації');
  return {id,title,body,content,kind,priority,queue,delivery,settlement,images:images.map(image).filter(Boolean),
   pinned:a.pinned===true,icon:str(a.icon,18),active:a.active===true,
   publishedAt:date(a.publishedAt)||new Date().toISOString(),updatedAt:date(a.updatedAt),
   scheduledAt,expiresAt,pushSentAt:date(a.pushSentAt)};
 });
 return {schemaVersion:1,updatedAt:new Date().toISOString(),maintenance,site,announcements};
}
export function createAppConfig({directory,record=()=>{}}){
 const file=path.join(directory,'app-config.json'),historyFile=path.join(directory,'app-config-history.json');let state=defaults(),history=[];
 try{const saved=JSON.parse(fs.readFileSync(historyFile,'utf8'));if(Array.isArray(saved))history=saved.slice(0,40)}catch(e){if(e.code!=='ENOENT')console.warn('App history:',e.message)}
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved?.schemaVersion===1)state=validateAppConfig(saved)}
 catch(e){if(e.code!=='ENOENT')console.warn('App config read:',e.message)}
 const copy=()=>JSON.parse(JSON.stringify(state));
 const saveHistory=()=>{
  const temp=historyFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(history,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,historyFile);
 };
 const historyView=()=>history.map(x=>{
  const old=x.config||{},savedAnnouncements=old.announcements||[],nowAnnouncements=state.announcements||[],
   savedIds=new Map(savedAnnouncements.map(n=>[n.id,n])),
   nowIds=new Map(nowAnnouncements.map(n=>[n.id,n])),
   changed=[...savedIds].filter(([id,n])=>nowIds.has(id)&&JSON.stringify(n)!==JSON.stringify(nowIds.get(id))).length,
   flags=Object.keys(defaultSite().flags).filter(k=>old.site?.flags?.[k]!==state.site?.flags?.[k]).length;
  return {id:x.id,at:x.at,messages:savedAnnouncements.length,
   active:savedAnnouncements.filter(a=>a.active).length,
   maintenance:old.maintenance?.enabled===true,
   changes:{added:[...savedIds.keys()].filter(id=>!nowIds.has(id)).length,
    removed:[...nowIds.keys()].filter(id=>!savedIds.has(id)).length,
    edited:changed,flags,
    maintenance:JSON.stringify(old.maintenance||{})!==JSON.stringify(state.maintenance||{}),
    appearance:JSON.stringify(old.site?.appearance||{})!==JSON.stringify(state.site?.appearance||{})}};
 });

 const persist=value=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);state=value};
 const publicState=()=>{
   const t=Date.now(),m=state.maintenance||{};
   const announcements=state.announcements.filter(x=>x.active&&x.delivery!=='push'&&(!x.scheduledAt||Date.parse(x.scheduledAt)<=t)&&(!x.expiresAt||Date.parse(x.expiresAt)>t)).map(({pushSentAt,...visible})=>visible);
   const start=Date.parse(m.startsAt||''),end=Date.parse(m.until||'');
   // Keep the automatic announcement during the scheduled window, then retain
   // its completed state for one day so users do not lose it mid-reading.
   const finished=Number.isFinite(end)&&end<=t;
   if(m.enabled&&m.noticeBefore!==false&&m.noticeInInbox!==false&&Number.isFinite(start)
      &&(!finished||t-end<24*60*60*1000)){
    const fmt=v=>new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).format(new Date(v));
    const details='Початок: '+fmt(start)+(Number.isFinite(end)&&end>start?'\nОрієнтовне завершення: '+fmt(end):'');
    const upcoming=start>t;
    const body=finished?'Заплановані технічні роботи завершилися. Доступ до застосунку відновлено.'
     :m.plannedBanner?.body||'У цей час застосунок може тимчасово не працювати.';
    announcements.push({id:'maint_'+m.startsAt.replace(/\D/g,'').slice(0,14),
     title:finished?'Технічні роботи завершено':upcoming?(m.plannedBanner?.title||'Заплановані технічні роботи'):'Технічні роботи тривають',
     body,content:'## '+(finished?'Завершення робіт':upcoming?'Заплановані роботи':'Технічні роботи')+'\n'+body+'\n\n'+details,
     kind:'important',priority:finished?'normal':'important',queue:'all',delivery:'inbox',settlement:'',images:[],
     icon:m.icon||'🛠️',active:true,pinned:!finished,publishedAt:state.updatedAt||new Date().toISOString(),
     updatedAt:null,scheduledAt:null,expiresAt:null});
   }
   return {schemaVersion:1,updatedAt:state.updatedAt,maintenance:{...m},site:state.site||defaultSite(),announcements};
  };
 const update=value=>{
  const next=validateAppConfig(value),previous=copy(),changed=JSON.stringify({...previous,updatedAt:null})!==JSON.stringify({...next,updatedAt:null});
  // Two saves in the same millisecond still need distinct revision tokens.
  if(Date.parse(next.updatedAt)<=Date.parse(previous.updatedAt))
   next.updatedAt=new Date(Date.parse(previous.updatedAt)+1).toISOString();
  persist(next);
  if(changed&&previous.updatedAt){
   try{
    history.unshift({id:String(Date.now())+'-'+Math.random().toString(36).slice(2,9),at:next.updatedAt,config:previous});
    history=history.slice(0,40);saveHistory();
   }catch(e){console.warn('Config history save:',e.message)}
  }
  record('app.settings',next.maintenance.enabled?'maintenance:on':'maintenance:off');return copy();
 };
 const restoreHistory=(id,expectedUpdatedAt)=>{
  if(!/^[0-9]{10,15}-[a-z0-9]{5,15}$/.test(String(id||'')))throw Error('Некоректний ID редакції');
  const match=history.find(x=>x.id===id&&x.config?.schemaVersion===1);
  if(!match)throw Error('Редакцію не знайдено. Оновіть історію.');
  if(!expectedUpdatedAt||expectedUpdatedAt!==state.updatedAt){
   const error=Error('Налаштування змінилися. Оновіть історію перед відновленням.');
   error.statusCode=409;throw error;
  }
  const stamp=new Date().toISOString();
  const snapshot=JSON.parse(JSON.stringify(match.config));
  // Safe rollback: NEVER reactivate a maintenance lock, and NEVER trigger
  // a past campaign just because an unsent message existed in the snapshot.
  snapshot.maintenance={...snapshot.maintenance,enabled:false};
  snapshot.announcements=(snapshot.announcements||[]).map(n=>({
   ...n,pushSentAt:n.active&&['push','both'].includes(n.delivery)&&!n.pushSentAt?stamp:n.pushSentAt
  }));
  const restored=update(snapshot);
  record('app.restore',id+' · '+restored.announcements.length+' messages · push suppressed');
  return restored;
 };
 const duePush=()=>{const t=Date.now();return state.announcements.filter(x=>x.active&&['both','push'].includes(x.delivery)&&!x.pushSentAt&&(!x.scheduledAt||Date.parse(x.scheduledAt)<=t)&&(!x.expiresAt||Date.parse(x.expiresAt)>t)).map(x=>({...x}))};
 const markPushed=id=>{if(!state.announcements.some(x=>x.id===id&&!x.pushSentAt))return false;const next=copy();next.announcements.find(x=>x.id===id).pushSentAt=new Date().toISOString();persist(next);record('push.announcement',id);return true};
 return {get:copy,publicState,update,duePush,markPushed,historyView,restoreHistory};
}
