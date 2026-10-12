/* Persistent app controls. Backward compatible with schemaVersion 1. */
import fs from 'node:fs';
import path from 'node:path';
const QUEUES=new Set(['all',...Array.from({length:6},(_,i)=>[String(i+1)+'.1',String(i+1)+'.2']).flat()]);
const defaults=()=>({schemaVersion:1,updatedAt:null,maintenance:{enabled:false,title:'Ми покращуємо застосунок',message:'Незабаром усе знову працюватиме. Актуальні графіки можна перевірити на сайті оператора.',until:null,startsAt:null,mode:'full',theme:'blue',icon:'✨',imageUrl:''},announcements:[]});
const str=(v,max)=>String(v??'').trim().slice(0,max+1);
function date(v){if(v==null||v==='')return null;if(typeof v!=='string'||v.length>36||!Number.isFinite(Date.parse(v)))throw Error('Неправильна дата');return new Date(v).toISOString()}
function image(v){const url=str(v,900);if(!url)return '';try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||url.length>900)throw Error();return u.href}catch{throw Error('Фото повинне мати HTTPS-посилання')}}
export function validateAppConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Некоректні налаштування');
 const m={...defaults().maintenance,...(input.maintenance||{})},title=str(m.title,90),message=str(m.message,320);
 if(title.length<5||title.length>90||message.length<12||message.length>320)throw Error('Перевірте заголовок та опис техробіт');
 if(!['full','limited','incident'].includes(m.mode)||!['blue','midnight','light','violet'].includes(m.theme))throw Error('Невідомий режим або тема');
 const startsAt=date(m.startsAt),until=date(m.until);
 if(startsAt&&until&&startsAt>=until)throw Error('Час завершення має бути пізніше початку');
 const maintenance={enabled:m.enabled===true,title,message,startsAt,until,mode:m.mode,theme:m.theme,icon:str(m.icon,18)||'✨',imageUrl:image(m.imageUrl)};
 if(!Array.isArray(input.announcements)||input.announcements.length>50)throw Error('Максимум 50 повідомлень');
 const ids=new Set(),announcements=input.announcements.map(a=>{
  const id=String(a?.id||'');if(!/^[A-Za-z0-9_-]{6,64}$/.test(id)||ids.has(id))throw Error('Неправильний або повторний ID');ids.add(id);
  const title=str(a.title,90),body=str(a.body,280),content=str(a.content||body,6000);
  if(title.length<5||title.length>90||body.length<10||body.length>280||content.length>6000)throw Error('Перевірте заголовок або текст повідомлення');
  const kind=a.kind||'info',priority=a.priority||'normal',queue=a.queue||'all',delivery=a.delivery||'inbox';
  if(!['info','important','update','schedule','emergency'].includes(kind)||!['normal','important','urgent'].includes(priority)||!QUEUES.has(queue)||!['inbox','both'].includes(delivery))throw Error('Невірні налаштування доставки');
  const images=a.images??[];if(!Array.isArray(images)||images.length>6)throw Error('Максимум шість зображень');
  const scheduledAt=date(a.scheduledAt),expiresAt=date(a.expiresAt);
  if(scheduledAt&&expiresAt&&scheduledAt>=expiresAt)throw Error('Термін дії раніше публікації');
  return {id,title,body,content,kind,priority,queue,delivery,images:images.map(image).filter(Boolean),
   pinned:a.pinned===true,icon:str(a.icon,18),active:a.active===true,
   publishedAt:date(a.publishedAt)||new Date().toISOString(),updatedAt:date(a.updatedAt),
   scheduledAt,expiresAt,pushSentAt:date(a.pushSentAt)};
 });
 return {schemaVersion:1,updatedAt:new Date().toISOString(),maintenance,announcements};
}
export function createAppConfig({directory,record=()=>{}}){
 const file=path.join(directory,'app-config.json');let state=defaults();
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved?.schemaVersion===1)state=validateAppConfig(saved)}
 catch(e){if(e.code!=='ENOENT')console.warn('App config read:',e.message)}
 const copy=()=>JSON.parse(JSON.stringify(state));
 const persist=value=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);state=value};
 const publicState=()=>{const t=Date.now();return {schemaVersion:1,updatedAt:state.updatedAt,maintenance:{...state.maintenance},announcements:state.announcements.filter(x=>x.active&&(!x.scheduledAt||Date.parse(x.scheduledAt)<=t)&&(!x.expiresAt||Date.parse(x.expiresAt)>t)).map(({pushSentAt,...visible})=>visible)}};
 const update=value=>{const next=validateAppConfig(value);persist(next);record('app.settings',next.maintenance.enabled?'maintenance:on':'maintenance:off');return copy()};
 const duePush=()=>{const t=Date.now();return state.announcements.filter(x=>x.active&&x.delivery==='both'&&!x.pushSentAt&&(!x.scheduledAt||Date.parse(x.scheduledAt)<=t)&&(!x.expiresAt||Date.parse(x.expiresAt)>t)).map(x=>({...x}))};
 const markPushed=id=>{if(!state.announcements.some(x=>x.id===id&&!x.pushSentAt))return false;const next=copy();next.announcements.find(x=>x.id===id).pushSentAt=new Date().toISOString();persist(next);record('push.announcement',id);return true};
 return {get:copy,publicState,update,duePush,markPushed};
}
