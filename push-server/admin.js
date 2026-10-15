/* Private admin-to-GitHub proxy. NEVER put ADMIN_PASSWORD or GITHUB_TOKEN in GitHub Pages.
 * HTTPS reverse proxy is mandatory in production. Login creates a short-lived session.
 */
import crypto from 'node:crypto';
import {originPolicy} from './origins.js';
import {validateAppConfig} from './app-config.js';
const PATHS={
 overrides:'data/manual_overrides.json',
 schedules:'data/schedules.json',
 addresses:'data/addresses.json',
 streets:'data/published_street_fallback.json',
 emergency:'data/emergency.json'
};
const ATTEMPTS=new Map();
const SESSIONS=new Map();
const SESSION_TTL=12*60*60*1000;
const MAX_SESSIONS=100;
const now=()=>Date.now();
function expireSessions(){for(const [token,session] of SESSIONS)if(session.expires<=now())SESSIONS.delete(token)}
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const GH_TOKEN=process.env.GITHUB_TOKEN||'';
const REPO=process.env.GITHUB_REPOSITORY||'';
const BRANCH=process.env.GITHUB_BRANCH||'main';
const origin=process.env.APP_ORIGIN||'';
function send(res,status,body){const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};if(res._allowedAppOrigin)headers['access-control-allow-origin']=res._allowedAppOrigin;res.writeHead(status,headers);res.end(JSON.stringify(body))}
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
export async function adminRouter(req,res,manualPush,feedback,extras,monitor,siteControls,mediaStore){
 if(!req.url?.startsWith('/api/admin/'))return false;
 if(!originPolicy.isAllowed(req.headers.origin)){send(res,403,{error:'Запит не з дозволеного сайту'});return true}
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/admin/login'&&req.method==='POST'){
   // A login uses the password ONCE. Other admin API requests use the session token.
   // Limit failed attempts; never include secrets in logs or responses.
   const ip=String(req.socket.remoteAddress||'unknown').slice(0,120);
   let track=ATTEMPTS.get(ip)||{count:0,until:0};
   if(now()>track.until)track={count:0,until:now()+60_000};
   if(track.count>=8){send(res,429,{error:'Забагато спроб входу. Спробуйте за хвилину.'});return true}
   if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<7){send(res,503,{error:'У Railway не задано ADMIN_PASSWORD (мінімум 7 символів).'});return true}
   try{
     const body=await readJson(req,1024);
     const role=authCompare(String(body.password||''));
     if(!role){
       track.count++;ATTEMPTS.set(ip,track);
       send(res,401,{error:'Неправильний пароль'});return true;
     }
     ATTEMPTS.delete(ip);expireSessions();extras?.record('auth.login');
     if(SESSIONS.size>=MAX_SESSIONS){
       const oldest=SESSIONS.keys().next().value;
       if(oldest)SESSIONS.delete(oldest);
     }
     const token=crypto.randomBytes(32).toString('base64url');
     SESSIONS.set(crypto.createHash('sha256').update(token).digest('hex'),{expires:now()+SESSION_TTL,role});
     send(res,200,{ok:true,token,role,expiresIn:SESSION_TTL/1000});return true;
   }catch(e){send(res,e.statusCode||400,{error:'Некоректний запит входу'});return true}
 }
 const bearer=/^Bearer ([A-Za-z0-9_-]+)$/.exec(String(req.headers.authorization||''));
 const tokenHash=bearer?crypto.createHash('sha256').update(bearer[1]).digest('hex'):'';
 const session=SESSIONS.get(tokenHash)||null;
 if(!session||session.expires<=now()){
   if(session)SESSIONS.delete(tokenHash);
   send(res,401,{error:'Сеанс завершився. Увійдіть знову.'});return true;
 }
 const role=session.role;
 if(url.pathname==='/api/admin/logout'&&req.method==='POST'){
   SESSIONS.delete(tokenHash);extras?.record('auth.logout');send(res,200,{ok:true});return true;
 }
 // Every privileged route is checked server-side. Hiding UI controls alone is not security.
 const pathName=url.pathname,method=req.method;
 const allowed=role==='owner'
  ||role==='viewer'&&method==='GET'
  ||role==='operator'&&(
   method==='GET'&&(/\/api\/admin\/(?:monitor|audit|status|feedback|help)$/.test(pathName)
    ||pathName==='/api/admin/push/status')
   ||method==='PATCH'&&pathName.startsWith('/api/admin/feedback/'))
  ||role==='editor'&&!(pathName==='/api/admin/push/send'
   ||pathName==='/api/admin/notices/send'||pathName==='/api/admin/push/test'
   ||(pathName==='/api/admin/file'&&method!=='GET')
   ||(pathName.startsWith('/api/admin/feedback/')&&method==='DELETE'));
 if(!allowed){send(res,403,{error:'Недостатньо прав для цієї дії'});return true}
 try{
   if(url.pathname==='/api/admin/push/status'&&req.method==='GET'){send(res,200,manualPush.stats());return true}
   if(url.pathname==='/api/admin/push/test'&&req.method==='POST'){const output=await manualPush.test(await readJson(req));extras?.record('push.test','test notification');send(res,200,output);return true}
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
   if(url.pathname==='/api/admin/feedback'&&req.method==='GET'){send(res,200,feedback.list());return true}
   if(url.pathname.startsWith('/api/admin/feedback/')&&['PATCH','DELETE'].includes(req.method)){
     const id=decodeURIComponent(url.pathname.slice('/api/admin/feedback/'.length));
     if(!/^SC-[0-9A-F]{10}$/.test(id)){send(res,400,{error:'Неправильний номер звернення'});return true}
     const result=req.method==='DELETE'?feedback.remove(id):feedback.change(id,await readJson(req,6000));
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
       notificationId:'notice:'+entry.id,inbox:entry.delivery!=='push',settlement:entry.settlement||'',confirmSend:true});
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
