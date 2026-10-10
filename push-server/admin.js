/* Private admin-to-GitHub proxy. NEVER put ADMIN_PASSWORD or GITHUB_TOKEN in GitHub Pages.
 * HTTPS reverse proxy is mandatory in production. Frontend passwords live only in JS memory.
 */
import crypto from 'node:crypto';
const PATHS={
 overrides:'data/manual_overrides.json',
 schedules:'data/schedules.json',
 addresses:'data/addresses.json',
 streets:'data/published_street_fallback.json',
 emergency:'data/emergency.json'
};
const ATTEMPTS=new Map();
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const GH_TOKEN=process.env.GITHUB_TOKEN||'';
const REPO=process.env.GITHUB_REPOSITORY||'';
const BRANCH=process.env.GITHUB_BRANCH||'main';
const origin=process.env.APP_ORIGIN||'';
function send(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':origin,'vary':'Origin'});res.end(JSON.stringify(body))}
function authCompare(received){
 if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<7)return false;
 const a=crypto.createHash('sha256').update(received).digest();
 const b=crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
 return crypto.timingSafeEqual(a,b);
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
export async function adminRouter(req,res){
 if(!req.url?.startsWith('/api/admin/'))return false;
 if(req.headers.origin!==origin){send(res,403,{error:'Запит не з дозволеного сайту'});return true}
 const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').slice(0,120);
 let track=ATTEMPTS.get(ip)||{count:0,until:0};
 if(Date.now()>track.until)track={count:0,until:Date.now()+60_000};
 if(track.count>=8){send(res,429,{error:'Забагато спроб. Спробуйте пізніше.'});return true}
 const bearer=/^Bearer (.+)$/.exec(String(req.headers.authorization||''));
 if(!bearer||!authCompare(bearer[1])){
   track.count++;ATTEMPTS.set(ip,track);send(res,401,{error:'Неправильний пароль'});return true;
 }
 ATTEMPTS.delete(ip);
 if(!GH_TOKEN||!repoValid()){send(res,503,{error:'На сервері не налаштовані GITHUB_TOKEN та GITHUB_REPOSITORY'});return true}
 try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/admin/status'&&req.method==='GET'){
     const result=await github('data/manual_overrides.json');
     send(res,200,{ok:true,repository:REPO,branch:BRANCH,overridesLastCommit:result.sha,editable:Object.keys(PATHS),publicOrigin:origin});return true;
   }
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
     send(res,200,{ok:true,commit:r.commit?.sha,url:r.content?.html_url});return true;
   }
   send(res,404,{error:'Неіснуючий метод'});return true;
 }catch(e){send(res,400,{error:String(e.message).slice(0,240)});return true}
}
