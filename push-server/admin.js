/* Private admin-to-GitHub proxy. NEVER put ADMIN_PASSWORD or GITHUB_TOKEN in GitHub Pages.
 * HTTPS reverse proxy is mandatory in production. Login creates a short-lived session.
 */
import crypto from 'node:crypto';
import {originPolicy} from './origins.js';
import {validateAppConfig} from './app-config.js';
import {verifyTotp} from './auth-security.js';
const PATHS={
 overrides:'data/manual_overrides.json',
 schedules:'data/schedules.json',
 addresses:'data/addresses.json',
 streets:'data/published_street_fallback.json',
 emergency:'data/emergency.json'
};
const ATTEMPTS=new Map();
const SESSIONS=new Map();
const SESSION_TTL=8*60*60*1000;
const IDLE_TTL=30*60*1000;
const ADMIN_TOTP_SECRET=process.env.ADMIN_TOTP_SECRET||'';
const MAX_SESSIONS=100;
const now=()=>Date.now();
const agentHash=req=>crypto.createHash('sha256').update(String(req.headers['user-agent']||'')).digest('hex');
function expireSessions(){for(const [token,session] of SESSIONS)if(session.expires<=now()||session.idleUntil<=now())SESSIONS.delete(token)}
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const GH_TOKEN=process.env.GITHUB_TOKEN||'';
const REPO=process.env.GITHUB_REPOSITORY||(process.env.RAILWAY_ENVIRONMENT_NAME==='staging'?'muzikmuzikant/svitlo-cherkasy':'');
const BRANCH=process.env.RAILWAY_ENVIRONMENT_NAME==='staging'?'staging':(process.env.GITHUB_BRANCH||'main');
const origin=process.env.APP_ORIGIN||'';
function send(res,status,body){const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};if(res._allowedAppOrigin)headers['access-control-allow-origin']=res._allowedAppOrigin;res.writeHead(status,headers);res.end(JSON.stringify(body))}
function authCompare(received){
 const a=crypto.createHash('sha256').update(received).digest();
 const passwords=[['owner',ADMIN_PASSWORD],['editor',process.env.EDITOR_PASSWORD],
  ['operator',process.env.OPERATOR_PASSWORD],['viewer',process.env.VIEWER_PASSWORD]];
 for(const [role,password] of passwords){
  if(typeof password!=='string'||password.length<(role==='owner'?7:12))continue;
  const b=crypto.createHash('sha256').update(password).digest();
  if(crypto.timingSafeEqual(a,b))return role;
 }
 return null;
}
const repoValid=()=>/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPO);
const isOfficial=url=>typeof url==='string'&&/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(url);
const ALL=new Set(Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat());
function validate(kind,obj){
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('Очікується JSON-об’єкт');
 if(kind==='overrides'){
  if(obj.schemaVersion!==1||!Array.isArray(obj.schedules?.days)||typeof obj.addresses!=='object'||!Array.isArray(obj.emergency?.events))throw Error('Невірна структура manual_overrides');
  if(obj.schedules.days.some(x=>!/^20\d\d-\d\d-\d\d$/.test(x.date||'')||!isOfficial(x.source)||x.verified!==true))throw Error('Кожне ручне уточнення графіка потребує дати та офіційного джерела');
  if(obj.schedules.days.some(x=>Object.keys(x.queues||{}).some(q=>!ALL.has(q))))throw Error('Невідома підчерга');
  if(obj.emergency.events.some(e=>!isOfficial(e.source)||!e.title||!['active','notice','ended'].includes(e.status)||!Number.isFinite(new Date(e.publishedAt).getTime())||new Date(e.publishedAt).getTime()>Date.now()+5*60_000))throw Error('Невірне аварійне повідомлення або час публікації');
 }
 if(kind==='schedules'&&(!Array.isArray(obj.days)||obj.days.some(x=>!x.date||!isOfficial(x.source)||!x.verified)))throw Error('Графіки повинні мати дату і підтверджене офіційне джерело');
 if(kind==='addresses'&&(!obj.keys||!obj.streets))throw Error('Немає keys або streets');
 if(kind==='streets'&&(!obj.localities||!obj.source))throw Error('Немає localities або джерела');
 if(kind==='emergency'&&(!Array.isArray(obj.events)||obj.events.some(e=>!isOfficial(e.source)||!e.publishedAt||!['active','ended','notice'].includes(e.status))))throw Error('Для кожного аварійного повідомлення потрібні дата, статус та офіційне посилання');
 if(JSON.stringify(obj).length>1_800_000)throw Error('Файл завеликий');
 return true;
}
async function github(path,method='GET',payload){
 const url=`https://api.github.com/repos/${REPO}/contents/${path}${method==='GET'?`?ref=${encodeURIComponent(BRANCH)}`:''}`;
 const response=await fetch(url,{method,headers:{'accept':'application/vnd.github+json','authorization':`Bearer ${GH_TOKEN}`,'x-github-api-version':'2022-11-28','content-type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20_000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error('GitHub API: '+response.status+' '+String(data.message||'Помилка').slice(0,150));
 return data;
}
async function readJson(req,limit=4096){let raw='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>limit){const e=Error('Завеликий запит');e.statusCode=413;throw e}raw+=chunk.toString('utf8')}return JSON.parse(raw)}
export async function adminRouter(req,res,manualPush,feedback,extras,monitor,siteControls,mediaStore,analytics,ads,adminUsers,legal,auditSchedules,errorCounts,dailyReports,noticeMetrics,scheduleReview,officialSchedules,workRegistry,addressCorrections){
 if(!req.url?.startsWith('/api/admin/'))return false;
 if(!originPolicy.isAllowed(req.headers.origin)){send(res,403,{error:'Запит не з дозволеного сайту'});return true}
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/admin/login'&&req.method==='POST'){
   // A login uses the password ONCE. Other admin API requests use the session token.
   // Limit failed attempts; never include secrets in logs or responses.
   const ip=String(req.socket.remoteAddress||'unknown').slice(0,120);
   if(ATTEMPTS.size>4000)for(const [key,value] of ATTEMPTS)if(value.until<now())ATTEMPTS.delete(key);
   let track=ATTEMPTS.get(ip)||{count:0,until:0};
   if(now()>track.until)track={count:0,until:now()+60_000};
   if(track.count>=8){send(res,429,{error:'Забагато спроб входу. Спробуйте за хвилину.'});return true}
   if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<7){send(res,503,{error:'У Railway не задано ADMIN_PASSWORD (мінімум 7 символів).'});return true}
   try{
     const body=await readJson(req,1024);
     const username=String(body.username||'owner').trim().toLowerCase();
     const account=adminUsers?.login(username,String(body.password||''))||null;
     const legacy=['owner','editor','operator','viewer'].includes(username)?authCompare(String(body.password||'')):null;
     const role=account?account.role:(legacy===username?legacy:null);
     const otpRequired=role==='owner'&&!!ADMIN_TOTP_SECRET;
     if(!role||(otpRequired&&!verifyTotp(ADMIN_TOTP_SECRET,body.code,now()))){
       track.count++;ATTEMPTS.set(ip,track);
       send(res,401,{error:'Невірні дані входу. Перевірте пароль і, якщо ввімкнено, код автентифікатора.'});return true;
     }
     ATTEMPTS.delete(ip);expireSessions();extras?.record('auth.login');
     if(SESSIONS.size>=MAX_SESSIONS){
       const oldest=SESSIONS.keys().next().value;
       if(oldest)SESSIONS.delete(oldest);
     }
     const token=crypto.randomBytes(32).toString('base64url');
     SESSIONS.set(crypto.createHash('sha256').update(token).digest('hex'),{
      expires:now()+SESSION_TTL,idleUntil:now()+IDLE_TTL,ua:agentHash(req),role,
      username:account?.username||username,managed:!!account,revision:account?adminUsers.get(account.username)?.revision:0,
      permissions:account?.permissions||null
     });
     send(res,200,{ok:true,token,role,username:account?.username||username,permissions:account?.permissions||null,expiresIn:SESSION_TTL/1000});return true;
   }catch(e){send(res,e.statusCode||400,{error:'Некоректний запит входу'});return true}
 }
 const bearer=/^Bearer ([A-Za-z0-9_-]+)$/.exec(String(req.headers.authorization||''));
 const tokenHash=bearer?crypto.createHash('sha256').update(bearer[1]).digest('hex'):'';
 const session=SESSIONS.get(tokenHash)||null;
 if(!session||session.expires<=now()||session.idleUntil<=now()||session.ua!==agentHash(req)){
   if(session)SESSIONS.delete(tokenHash);
   send(res,401,{error:'Сеанс завершився. Увійдіть знову.'});return true;
 }
 if(session.managed){const current=adminUsers?.get(session.username);
  if(!current||!current.active||current.revision!==session.revision){
   SESSIONS.delete(tokenHash);send(res,401,{error:'Доступ змінено. Увійдіть повторно.'});return true
  }
 }
 session.idleUntil=now()+IDLE_TTL;
 const role=session.role;
 if(url.pathname==='/api/admin/logout'&&req.method==='POST'){
   SESSIONS.delete(tokenHash);extras?.record('auth.logout');send(res,200,{ok:true});return true;
 }
 // Every privileged route is checked server-side. Hiding UI controls alone is not security.
 const pathName=url.pathname,method=req.method;
 const custom=session.managed;
 const permission=pathName.startsWith('/api/admin/address-corrections')?'schedules':
  pathName.startsWith('/api/admin/work-items')?'settings':
  pathName.startsWith('/api/admin/feedback')?'feedback':
  pathName.startsWith('/api/admin/help')?'help':
  pathName.startsWith('/api/admin/ads')?'ads':
  pathName.startsWith('/api/admin/push')?'push':
  pathName.startsWith('/api/admin/notices')?'notices':
  pathName.startsWith('/api/admin/file')||pathName.startsWith('/api/admin/schedule')?'schedules':
  pathName.startsWith('/api/admin/media')?'media':'settings';
 const allowed=custom?(method==='GET'?(pathName==='/api/admin/status'||pathName==='/api/admin/security'||session.permissions.includes('view')||session.permissions.includes(permission)):session.permissions.includes(permission))
  :role==='owner'
  ||role==='viewer'&&method==='GET'
  ||role==='operator'&&(
   method==='GET'&&(pathName.startsWith('/api/admin/feedback/attachment/')||/\/api\/admin\/(?:monitor|audit|status|feedback|help|analytics|ads|security|work-items)$/.test(pathName)
    ||pathName==='/api/admin/push/status')
   ||method==='PATCH'&&pathName.startsWith('/api/admin/feedback/'))
  ||role==='editor'&&!(pathName==='/api/admin/push/send'
   ||pathName==='/api/admin/notices/send'||pathName==='/api/admin/push/test'
   ||(pathName==='/api/admin/file'&&method!=='GET')
   ||(pathName.startsWith('/api/admin/feedback/')&&method==='DELETE'));
 if(!allowed){send(res,403,{error:'Недостатньо прав для цієї дії'});return true}
 try{
   if(pathName==='/api/admin/address-corrections'&&method==='GET'){
    send(res,200,addressCorrections.list());return true;
   }
   if(pathName==='/api/admin/address-corrections'&&method==='POST'){
    if(!['owner','editor'].includes(role)){send(res,403,{error:'Потрібні права редактора'});return true}
    send(res,201,addressCorrections.create(await readJson(req,2300),session.username));return true;
   }
   if(pathName.startsWith('/api/admin/address-corrections/')&&['PATCH','DELETE'].includes(method)){
    const id=decodeURIComponent(pathName.slice('/api/admin/address-corrections/'.length));
    if(!/^AC-[A-F0-9]{12}$/.test(id)){send(res,400,{error:'Некоректний номер картки'});return true}
    const body=await readJson(req,2300);
    if(method==='PATCH'){
     if(!['owner','editor'].includes(role)){send(res,403,{error:'Потрібні права редактора'});return true}
     send(res,200,addressCorrections.edit(id,body,session.username,role==='owner'&&!session.managed));return true;
    }
    if(role!=='owner'||session.managed){send(res,403,{error:'Видаляти картки може лише власник'});return true}
    send(res,200,addressCorrections.remove(id,body.expectedRevision));return true;
   }
   // Private task registry and safe runtime configuration, persisted on Railway.
   if(pathName==='/api/admin/work-items'&&method==='GET'){send(res,200,workRegistry.list());return true}
   if(pathName==='/api/admin/work-items'&&method==='POST'){
    if(!['owner','editor'].includes(role)){send(res,403,{error:'Дію дозволено редактору або власнику'});return true}
    send(res,201,workRegistry.create(await readJson(req,4500),session.username));return true
   }
   if(/^\/api\/admin\/work-items\/WR-[A-F0-9]{12}\/notes$/.test(pathName)&&method==='POST'){
    if(!['owner','editor'].includes(role)){send(res,403,{error:'Редагування доручень недоступне'});return true}
    const id=pathName.split('/')[4];
    send(res,200,workRegistry.addNote(id,await readJson(req,1400),session.username));return true;
   }
   if(pathName.startsWith('/api/admin/work-items/')&&['PATCH','DELETE'].includes(method)){
    const id=decodeURIComponent(pathName.slice('/api/admin/work-items/'.length));
    if(!/^WR-[A-F0-9]{12}$/.test(id)){send(res,400,{error:'Некоректний номер картки'});return true}
    if(method==='PATCH'&&!['owner','editor'].includes(role)){send(res,403,{error:'Недостатньо прав'});return true}
    if(method==='DELETE'&&(role!=='owner'||session.managed)){send(res,403,{error:'Лише власник може видаляти картки'});return true}
    const body=await readJson(req,4500);
    send(res,200,method==='PATCH'?workRegistry.patch(id,body,session.username):workRegistry.remove(id,body.expectedRevision,session.username));
    return true;
   }
   if(pathName==='/api/admin/site-quick-settings'&&method==='GET'){
    send(res,200,siteControls.get());return true
   }
   if(pathName==='/api/admin/site-quick-settings'&&method==='PUT'){
    if(role!=='owner'||session.managed){send(res,403,{error:'Публікація доступна власнику'});return true}
    const body=await readJson(req,6500),current=siteControls.get();
    if(!Object.hasOwn(body,'expectedUpdatedAt')||body.expectedUpdatedAt!==(current.updatedAt??null)){
     send(res,409,{error:'Налаштування змінилися. Оновіть їх перед збереженням.'});return true
    }
    if(!body.banner||!body.links||!body.flags||
     typeof body.banner!=='object'||typeof body.links!=='object'||typeof body.flags!=='object'){
     send(res,400,{error:'Неповні налаштування'});return true
    }
    const next={...current,site:{...current.site,
     banner:{...current.site.banner},links:{...current.site.links},flags:{...current.site.flags}}};
    for(const key of ['enabled','title','body','button','url'])
     if(Object.hasOwn(body.banner,key))next.site.banner[key]=body.banner[key];
    for(const key of ['help','feedback','official'])
     if(Object.hasOwn(body.links,key))next.site.links[key]=body.links[key];
    for(const key of ['inbox','sharing','help','feedback','copySchedule','addressSearch','pushPrompt','manualRefresh'])
     if(Object.hasOwn(body.flags,key))next.site.flags[key]=body.flags[key];
    const saved=siteControls.update(next);
    extras?.record('site.quick-settings.publish','banner='+saved.site.banner.enabled);
    send(res,200,saved);return true;
   }
   if(pathName==='/api/admin/reports'&&method==='GET'){
    send(res,200,dailyReports.list());return true
   }
    if(pathName==='/api/admin/diagnostics'&&method==='GET'){
    send(res,200,errorCounts.report());return true
   }
    if(pathName==='/api/admin/schedule/quality'&&method==='GET'){send(res,200,auditSchedules());return true}
    if(pathName==='/api/admin/schedule/review'&&method==='GET'){
     send(res,200,scheduleReview.list(officialSchedules.rawSchedule(),officialSchedules.rawReview()));return true;
    }
    if(pathName==='/api/admin/schedule/review/approve'&&method==='POST'){
     if(role!=='owner'){send(res,403,{error:'Тільки власник може підтверджувати офіційні графіки'});return true}
     const input=await readJson(req,5000);
     const result=scheduleReview.approve(input,officialSchedules.rawSchedule(),officialSchedules.rawReview());
     extras?.record('schedule.review.approve',result.date);
     send(res,200,{...result,status:officialSchedules.status()});return true;
    }
    if(pathName==='/api/admin/schedule/review/approval'&&method==='DELETE'){
     if(role!=='owner'){send(res,403,{error:'Тільки власник може скасовувати підтвердження'});return true}
     const input=await readJson(req,350);
     const result=scheduleReview.revoke(input?.date);
     extras?.record('schedule.review.revoke',result.date);
     send(res,200,{...result,status:officialSchedules.status()});return true;
    }
    if(pathName==='/api/admin/legal'&&method==='GET'){send(res,200,legal.publicState());return true}
   if(pathName==='/api/admin/legal'&&method==='PUT'){
    if(role!=='owner'||session.managed){send(res,403,{error:'Лише власник може публікувати нову редакцію'});return true}
    const result=legal.update(await readJson(req,7000));extras?.record('legal.revision',result.termsVersion+' '+result.privacyVersion);
    send(res,200,result);return true
   }
   if(pathName==='/api/admin/users'&&method==='GET'){
    if(role!=='owner'||session.managed){send(res,403,{error:'Лише для власника'});return true}
    send(res,200,{users:adminUsers.list()});return true
   }
   if(pathName==='/api/admin/users'&&method==='POST'){
    if(role!=='owner'||session.managed){send(res,403,{error:'Лише для власника'});return true}
    const result=adminUsers.create(await readJson(req,6000));extras?.record('auth.user.create',result.username);
    send(res,201,result);return true
   }
   if(pathName.startsWith('/api/admin/users/')&&(method==='PATCH'||method==='DELETE')){
    if(role!=='owner'||session.managed){send(res,403,{error:'Лише для власника'});return true}
    const username=decodeURIComponent(pathName.slice('/api/admin/users/'.length));
    const result=method==='DELETE'?adminUsers.remove(username):adminUsers.patch(username,await readJson(req,6000));
    for(const [key,token] of SESSIONS)if(token.managed&&token.username===username)SESSIONS.delete(key);
    extras?.record('auth.user.'+(method==='DELETE'?'delete':'update'),username);
    send(res,200,result);return true
   }
   if(url.pathname==='/api/admin/ads'&&req.method==='GET'){send(res,200,ads.dashboard());return true}
   if(url.pathname==='/api/admin/ads'&&req.method==='PUT'){if(role!=='owner'&&!(session.managed&&session.permissions.includes('ads'))){send(res,403,{error:'Недостатньо прав на рекламу'});return true}send(res,200,ads.update(await readJson(req,140000)));return true}
   if(url.pathname==='/api/admin/analytics'&&req.method==='GET'){
     if(!analytics){send(res,503,{error:'Аналітика поки недоступна'});return true}
     send(res,200,{...analytics.report(),betaPwa:ads.dashboard().pwa,betaAdvertising:{stats:ads.dashboard().stats,daily:ads.dashboard().daily}});return true;
   }
   if(url.pathname==='/api/admin/security'&&req.method==='GET'){
     expireSessions();send(res,200,{role,activeSessions:SESSIONS.size,secondFactorEnabled:!!ADMIN_TOTP_SECRET,
       passwordNeedsUpgrade:role==='owner'&&ADMIN_PASSWORD.length<12,idleMinutes:IDLE_TTL/60000,
       maximumHours:SESSION_TTL/3600000,sessionExpiresAt:new Date(session.expires).toISOString()});return true;
   }
   if(url.pathname==='/api/admin/security/revoke-others'&&req.method==='POST'){
     if(role!=='owner'){send(res,403,{error:'Доступно лише власнику'});return true}
     const body=await readJson(req,700);
     if(body?.confirm!==true||authCompare(String(body.password||''))!=='owner'){
       send(res,403,{error:'Підтвердьте дію паролем власника'});return true;
     }
     let removed=0;for(const key of SESSIONS.keys())if(key!==tokenHash){SESSIONS.delete(key);removed++}
     extras?.record('auth.revokeOthers','count='+removed);send(res,200,{ok:true,removed});return true;
   }
   if(url.pathname==='/api/admin/push/status'&&req.method==='GET'){send(res,200,manualPush.stats());return true}
   if(url.pathname==='/api/admin/push/test'&&req.method==='POST'){const output=await manualPush.test(await readJson(req));extras?.record('push.test','test notification');send(res,200,output);return true}
   if(url.pathname==='/api/admin/notices/metrics'&&req.method==='GET'){
     const ids=siteControls.get().announcements.map(x=>x.id);
     send(res,200,noticeMetrics.report(ids));return true;
   }
   if(url.pathname==='/api/admin/notices/test'&&req.method==='POST'){
     const result=await manualPush.preview(await readJson(req,1200));
     extras?.record('push.preview','test to current device');send(res,200,result);return true;
   }
   if(url.pathname==='/api/admin/push/send'&&req.method==='POST'){
     const body=await readJson(req);
     if(body.confirmSend!==true)throw Error('Підтвердіть розсилку');
     // The legacy Push editor now publishes an Inbox item too.
     let noticeId=null;
     if(siteControls){
      const config=siteControls.get();
      if(config.announcements.length>=50)throw Error('Архів оголошень переповнений. Приберіть старі повідомлення.');
      noticeId='n_'+crypto.randomBytes(9).toString('hex');
      config.announcements.unshift({id:noticeId,title:body.title,body:body.body,content:body.body,
       kind:'important',queue:body.queue||'all',priority:'important',delivery:'both',
       active:true,pinned:false,images:[],publishedAt:new Date().toISOString()});
      siteControls.update(config);
     }
     const output=await manualPush.broadcast({...body,notificationId:noticeId?'notice:'+noticeId:undefined});
     if(noticeId&&output.accepted>0)siteControls.markPushed(noticeId);
     extras?.record('push.broadcast',String(body.queue||'all'));send(res,200,output);return true;
   }
   if(url.pathname==='/api/admin/feedback/categories'&&req.method==='GET'){
    send(res,200,{categories:feedback.getCategories()});return true
   }
   if(url.pathname==='/api/admin/feedback/categories'&&req.method==='PUT'){
    const result=feedback.setCategories((await readJson(req,45000)).categories);extras?.record('feedback.categories.update');
    send(res,200,result);return true
   }
    if(url.pathname==='/api/admin/feedback/templates'&&req.method==='GET'){send(res,200,{templates:feedback.getTemplates()});return true}
   if(url.pathname==='/api/admin/feedback/templates'&&req.method==='PUT'){
    const data=await readJson(req,50000);const result=feedback.setTemplates(data.templates);
    extras?.record('feedback.templates.update');send(res,200,result);return true
   }
    if(url.pathname.startsWith('/api/admin/feedback/attachment/')&&req.method==='GET'){
      const tail=url.pathname.slice('/api/admin/feedback/attachment/'.length).split('/');
      if(tail.length!==2||!/^SC-[A-F0-9]{10}$/.test(tail[0])||
         !/^[a-f0-9]{36}$/.test(tail[1])){send(res,400,{error:'Некоректне вкладення'});return true}
      send(res,200,feedback.getAttachment(tail[0],tail[1],null,true));return true;
    }
    if(url.pathname==='/api/admin/feedback'&&req.method==='GET'){send(res,200,feedback.list());return true}
   if(url.pathname.startsWith('/api/admin/feedback/')&&['PATCH','DELETE'].includes(req.method)){
     const id=decodeURIComponent(url.pathname.slice('/api/admin/feedback/'.length));
     if(!/^SC-[0-9A-F]{10}$/.test(id)){send(res,400,{error:'Неправильний номер звернення'});return true}
     const result=req.method==='DELETE'?feedback.remove(id):feedback.change(id,await readJson(req,6000),session.username||'admin');
     extras?.record('feedback.'+(req.method==='DELETE'?'delete':'update'),id);send(res,200,result);return true;
   }
   if(url.pathname==='/api/admin/monitor'&&req.method==='GET'){send(res,200,await monitor());return true}
   if(url.pathname==='/api/admin/audit'&&req.method==='GET'){send(res,200,{events:extras.getAudit()});return true}
   if(url.pathname==='/api/admin/media'&&req.method==='GET'){
     if(!mediaStore)throw Error('Медіатека недоступна');
     send(res,200,{items:mediaStore.list()});return true;
   }
   if(url.pathname==='/api/admin/media'&&req.method==='POST'){
     if(!mediaStore)throw Error('Завантаження фото недоступне');
     const result=mediaStore.save(await readJson(req,4200000));
     extras?.record('media.upload',result.id);send(res,201,result);return true;
   }
   if(url.pathname==='/api/admin/notices/send'&&req.method==='POST'){
     if(!siteControls)throw Error('Керування повідомленнями недоступне');
     const input=await readJson(req,2000),entry=siteControls.get().announcements.find(x=>x.id===input.id);
     if(!entry||!entry.active)throw Error('Спочатку опублікуйте повідомлення');
     if(entry.scheduledAt&&Date.parse(entry.scheduledAt)>Date.now())throw Error('Повідомлення заплановане на майбутнє');
     if(entry.pushSentAt)throw Error('Push для цього повідомлення вже надсилався');
     if(input.confirmSend!==true)throw Error('Підтвердіть масове надсилання');
     const outcome=await manualPush.broadcast({title:entry.title,body:entry.body,queue:entry.queue,
       notificationId:'notice:'+entry.id,inbox:entry.delivery!=='push',settlement:entry.settlement||'',emergencyOnly:entry.kind==='emergency',confirmSend:true});
     if(outcome.accepted>0)siteControls.markPushed(entry.id);
     extras?.record('push.notice',entry.id);send(res,200,outcome);return true;
   }
   if(url.pathname==='/api/admin/app-config/history/restore'&&req.method==='POST'){
     if(role!=='owner'){send(res,403,{error:'Відновлення доступне лише власнику'});return true}
     if(!siteControls){send(res,503,{error:'Історія недоступна'});return true}
     const body=await readJson(req,1100);
     if(body.confirmRestore!==true){send(res,400,{error:'Потрібне явне підтвердження відновлення'});return true}
     const result=siteControls.restoreHistory(body.id,body.expectedUpdatedAt);
     send(res,200,result);return true;
   }
   if(url.pathname==='/api/admin/app-config/history'&&req.method==='GET'){
     send(res,200,{items:siteControls?.historyView?.()||[]});return true;
   }
   if(url.pathname==='/api/admin/app-config'&&req.method==='GET'){
     if(!siteControls){send(res,503,{error:'Керування застосунком недоступне'});return true}
     send(res,200,siteControls.get());return true;
   }
   if(url.pathname==='/api/admin/app-config'&&req.method==='PUT'){
     if(!siteControls){send(res,503,{error:'Керування застосунком недоступне'});return true}
     const body=await readJson(req,750000);
     if(role!=='owner'){
      const old=siteControls.get(),candidate=validateAppConfig(body),current=validateAppConfig(old);
      if(JSON.stringify(candidate.maintenance)!==JSON.stringify(current.maintenance)||
        JSON.stringify(candidate.site)!==JSON.stringify(current.site))
       throw Error('Лише власник може змінювати техроботи та загальні налаштування');
      for(const item of candidate.announcements){
       if(item.active&&item.delivery==='both'&&!item.pushSentAt)
        throw Error('Лише власник може запускати Push-розсилку');
      }
     }
     const value=siteControls.update(body);send(res,200,value);return true;
   }
   if(url.pathname==='/api/admin/help'&&req.method==='GET'){send(res,200,extras.getHelp());return true}
   if(url.pathname==='/api/admin/help'&&req.method==='PUT'){const result=extras.updateHelp(await readJson(req,70000));send(res,200,result);return true}
   const ghReady=!!GH_TOKEN&&repoValid();
   if(url.pathname==='/api/admin/status'&&req.method==='GET'){
     if(!ghReady){send(res,200,{ok:true,repository:null,branch:BRANCH,editingEnabled:false,publicOrigin:origin});return true}
     send(res,200,{ok:true,repository:REPO,branch:BRANCH,editingEnabled:true,editable:Object.keys(PATHS),publicOrigin:origin});return true;
   }
   if(!ghReady){send(res,503,{error:'Для редагування файлів потрібно задати GITHUB_TOKEN і GITHUB_REPOSITORY. Push-повідомлення вже доступні.'});return true}
   if(url.pathname==='/api/admin/file'&&req.method==='GET'){
     const kind=url.searchParams.get('kind');const path=PATHS[kind];if(!path)throw Error('Невідомий файл');
     const entry=await github(path);
     const contents=JSON.parse(Buffer.from(entry.content.replace(/\s/g,''),'base64').toString('utf8'));
     send(res,200,{kind,contents,sha:entry.sha});return true;
   }
   if(url.pathname==='/api/admin/file'&&req.method==='PUT'){
     const kind=url.searchParams.get('kind'),path=PATHS[kind];if(!path)throw Error('Невідомий файл');
     let raw='',bytes=0;
     for await(const chunk of req){bytes+=chunk.length;if(bytes>2_000_000)throw Error('Завеликий запит');raw+=chunk.toString('utf8')}
     const body=JSON.parse(raw),value=body.contents;
     validate(kind,value);
     const current=await github(path);
     if(body.sha!==current.sha){send(res,409,{error:'Файл змінився на GitHub. Оновіть дані перед публікацією.'});return true}
     const payload={message:`Admin: update ${kind} via Svitlo Cherkasy`,content:Buffer.from(JSON.stringify(value,null,2)+'\n').toString('base64'),sha:current.sha,branch:BRANCH};
     const r=await github(path,'PUT',payload);
     extras?.record('github.publish',kind);send(res,200,{ok:true,commit:r.commit?.sha,url:r.content?.html_url});return true;
   }
   send(res,404,{error:'Неіснуючий метод'});return true;
 }catch(e){send(res,e.statusCode||400,{error:String(e.message).slice(0,240)});return true}
}
