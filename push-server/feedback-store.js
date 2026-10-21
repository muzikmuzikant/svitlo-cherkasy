/* Private support inbox. Persist on the Railway volume, never publish tickets to GitHub Pages. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {parseTicketMedia,createTicketMedia} from './ticket-media.js';

export const TOPICS=['bug','address','schedule','push','idea','other'];
export const STATUSES=['new','in_progress','resolved'];
export const PRIORITIES=['low','normal','high'];
const KEEP_MS=90*24*3600*1000,MAX_ITEMS=750,MAX_BODY=13_000_000;
function bad(message,statusCode=400){const error=new Error(message);error.statusCode=statusCode;return error}
const tidy=(value,max)=>String(value??'').trim().slice(0,max+1);
export function validateFeedback(value,availableTopics=TOPICS){
 if(!value||typeof value!=='object'||Array.isArray(value))throw bad('Заповніть форму звернення.');
 const topic=String(value.topic||''),message=tidy(value.message,2000),email=tidy(value.email,254);
 if(!availableTopics.includes(topic))throw bad('Оберіть тему звернення.');
 if(message.length<12||message.length>2000)throw bad('Опис має містити від 12 до 2000 символів.');
 if(email&&(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))throw bad('Перевірте адресу електронної пошти.');
 if(value.website)throw bad('Некоректний запит.');
 const result={topic,message,email};
 if(value.subject!==undefined){
  const subject=tidy(value.subject,110);
  if(subject.length>110)throw bad('Заголовок завеликий.');
  if(subject)result.subject=subject;
 }
 if(value.includeDiagnostics===true){
  const d=value.diagnostics;
  if(!d||typeof d!=='object'||Array.isArray(d))throw bad('Перевірте технічні дані.');
  if(Object.keys(d).some(key=>!['platform','os','browser','appVersion'].includes(key)))throw bad('Зайві технічні дані.');
  const platform=String(d.platform||''),os=String(d.os||''),browser=String(d.browser||''),appVersion=String(d.appVersion||'');
  if(!['iPhone','iPad','Android','Windows','macOS','Linux','Інше'].includes(platform)
   ||!/^(?:iOS|iPadOS|Android|Windows|macOS|Linux|Інше)(?: [0-9]{1,2})?$/.test(os)
   ||!['Safari','Chrome','Firefox','Edge','Samsung Internet','Інше'].includes(browser)
   ||(appVersion&&!/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(appVersion)))throw bad('Некоректні технічні параметри.');
  result.diagnostics={platform,os,browser,appVersion};
 }
  if(value.queue!==undefined&&value.queue!==''){
  if(!/^[1-6]\.[12]$/.test(String(value.queue)))throw bad('Перевірте підчергу.');
  result.queue=String(value.queue);
 }
 return result;
}
export async function readFeedbackBody(req){
 let size=0;const chunks=[];
 for await(const part of req){size+=part.length;if(size>MAX_BODY)throw bad('Звернення завелике.',413);chunks.push(part)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw bad('Некоректні дані звернення.')}
}
export function createFeedbackStore({filePath,clock=()=>Date.now()}={}){
 if(!filePath)throw Error('Feedback store path is required');
 const privateMedia=createTicketMedia(path.dirname(filePath));
 let categories=[
 {id:'bug',title:'Помилка застосунку',hint:'Опишіть, що саме не працює.',enabled:true,priority:'normal',fields:[]},
 {id:'address',title:'Адреса або підчерга',hint:'Укажіть населений пункт і підчергу, якщо її знаєте.',enabled:true,fields:[]},
 {id:'schedule',title:'Графік відключень',hint:'Укажіть дату, підчергу та відхилення.',enabled:true,fields:[]},
 {id:'push',title:'Сповіщення',hint:'Коли очікували сповіщення?',enabled:true,fields:[]},
 {id:'idea',title:'Ідея або побажання',hint:'Розкажіть, що можна покращити.',enabled:true,fields:[]},
 {id:'other',title:'Інше',hint:'Напишіть ваше питання.',enabled:true,fields:[]}
 ];
 let items=[],templates=['Дякуємо! Перевіряємо цю інформацію та повідомимо про результат.','Уточніть, будь ласка, підчергу та дату, коли виникла проблема.','Проблему виправлено. Оновіть застосунок і перевірте ще раз.'];
 try{const raw=JSON.parse(fs.readFileSync(filePath,'utf8'));if(Array.isArray(raw.items))items=raw.items.filter(x=>x&&typeof x==='object');if(Array.isArray(raw.templates))templates=raw.templates;if(Array.isArray(raw.categories))categories=raw.categories}catch(e){if(e.code!=='ENOENT')throw Error('Cannot load feedback store: '+e.message)}
 const salt=crypto.randomBytes(16).toString('hex'),attempts=new Map(),replyAttempts=new Map();
 const key=(value)=>crypto.createHash('sha256').update(salt+String(value||'unknown')).digest('hex');
 const hash=(value)=>crypto.createHash('sha256').update(String(value)).digest('hex');
 function cleanup(){const t=clock(),count=items.length;items=items.filter(x=>typeof x.id==='string'&&Number.isFinite(Date.parse(x.createdAt))&&Date.parse(x.createdAt)>t-KEEP_MS);return items.length!==count}
 function save(){
  cleanup();fs.mkdirSync(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp';fs.writeFileSync(tmp,JSON.stringify({items,templates,categories},null,2),{mode:0o600});fs.renameSync(tmp,filePath);
  const keep=new Set();for(const ticket of items){
   for(const a of ticket.attachments||[])keep.add(a.id);
   for(const m of ticket.messages||[])for(const a of m.attachments||[])keep.add(a.id);
  }
  privateMedia.prune(keep);
 }
 function find(id){const item=items.find(x=>x.id===id);if(!item)throw bad('Звернення не знайдено.',404);return item}
 function validateToken(item,token){
  if(!item.accessHash||typeof token!=='string'||!(/^[A-Za-z0-9_-]{32,80}$/.test(token)))throw bad('Потрібен код доступу до звернення.',403);
  const wanted=Buffer.from(item.accessHash,'hex'),actual=Buffer.from(hash(token),'hex');
  if(wanted.length!==actual.length||!crypto.timingSafeEqual(wanted,actual))throw bad('Неправильний код доступу.',403);
 }
 function submit(value,ip){
  const data=validateFeedback(value,categories.filter(c=>c.enabled).map(c=>c.id)),t=clock(),k=key(ip),interval=15*60*1000;
  for(const [old,v] of attempts)if(v.expire<t)attempts.delete(old);
  const entry=attempts.get(k)||{times:[],expire:t+interval};
  entry.times=entry.times.filter(time=>t-time<interval);
  if(entry.times.length>=3)throw bad('Забагато звернень. Спробуйте через 15 хвилин.',429);
  const category=categories.find(c=>c.id===data.topic);
  const input=value.extra&&typeof value.extra==='object'&&!Array.isArray(value.extra)?value.extra:{};
  const extra={};
  if(Object.keys(input).some(key=>!category?.fields?.some(field=>field.id===key)))throw bad('Невідоме додаткове поле звернення');
  for(const field of category?.fields||[]){
   const v=input[field.id];const str=typeof v==='boolean'?(v?'Так':'Ні'):String(v??'').trim();
   if(field.required&&(field.type==='checkbox'?v!==true:!str))throw bad('Заповніть поле «'+field.label+'»');
   if(str.length>200)throw bad('Занадто довге значення поля «'+field.label+'»');
   if(field.type==='select'&&str&&!field.options.includes(str))throw bad('Невірний варіант поля «'+field.label+'»');
   if(str)extra[field.id]={label:field.label,value:str}
  }
  if(Object.keys(extra).length)data.extra=extra;
  cleanup();if(items.length>=MAX_ITEMS)throw bad('Наразі не можемо прийняти звернення. Спробуйте пізніше.',503);
  const uploads=parseTicketMedia(value.attachments);
  const token=crypto.randomBytes(24).toString('base64url');
  const attachments=privateMedia.write(uploads);
  const newItem={id:'SC-'+crypto.randomBytes(5).toString('hex').toUpperCase(),...data,attachments,status:'new',priority:category?.priority==='high'?'high':'normal',assignedTo:'',dueAt:'',resolution:'',revision:1,activity:[{kind:'created',at:new Date(t).toISOString(),by:'system',label:'Звернення зареєстровано'}],internalNote:'',tags:[],messages:[],accessHash:hash(token),createdAt:new Date(t).toISOString(),updatedAt:new Date(t).toISOString()};
  items.push(newItem);
  try{save()}catch{items.pop();privateMedia.erase(attachments);throw bad('Не вдалося зберегти звернення. Спробуйте пізніше.',503)}
  entry.times.push(t);entry.expire=t+interval;attempts.set(k,entry);
  return {ok:true,id:newItem.id,token,attached:attachments.length};
 }
 function list(){if(cleanup())save();return {items:items.slice().reverse().map(({accessHash,...item})=>item),count:items.length,capabilities:{routing:true,activity:true,optimisticRevision:true}}}
 function change(id,patch,actor='admin'){
  const found=find(id),data=typeof patch==='string'?{status:patch}:patch;
  if(!data||typeof data!=='object'||Array.isArray(data))throw bad('Некоректні зміни звернення.');
  const allow=['status','priority','internalNote','tags','reply','assignedTo','dueAt','resolution','expectedRevision'];
  if(Object.keys(data).some(k=>!allow.includes(k)))throw bad('Непідтримуване поле звернення.');
  const previousRevision=Number.isSafeInteger(found.revision)?found.revision:1;
  if('expectedRevision' in data&&data.expectedRevision!==previousRevision)throw bad('Картку вже змінили в іншому сеансі. Оновіть дані перед збереженням.',409);
  const update={...found,messages:Array.isArray(found.messages)?found.messages.slice():[],activity:Array.isArray(found.activity)?found.activity.slice(-79):[]};
  const changes=[];
  const changed=(field,label)=>{if(update[field]!==found[field])changes.push(label)};
  if('assignedTo' in data){
    if(typeof data.assignedTo!=='string'||data.assignedTo.length>60)throw bad('Некоректний виконавець');
    update.assignedTo=data.assignedTo.trim();changed('assignedTo','Призначення виконавця')
  }
  if('dueAt' in data){
    if(data.dueAt!==''&&data.dueAt!==null&&(typeof data.dueAt!=='string'||!/^20\d{2}-\d{2}-\d{2}T/.test(data.dueAt)||!Number.isFinite(Date.parse(data.dueAt))))throw bad('Некоректний контрольний строк');
    update.dueAt=data.dueAt?new Date(data.dueAt).toISOString():'';changed('dueAt','Контрольний строк')
  }
  if('resolution' in data){
    if(typeof data.resolution!=='string'||data.resolution.length>800)throw bad('Висновок має містити до 800 символів');
    update.resolution=data.resolution.trim();changed('resolution','Висновок')
  }
  if('status' in data){if(!STATUSES.includes(data.status))throw bad('Невідомий статус.');update.status=data.status;changed('status','Зміна статусу');if(found.status!==update.status&&update.status==='resolved')update.resolvedAt=new Date(clock()).toISOString();else if(found.status==='resolved'&&update.status!=='resolved')update.resolvedAt=''}
  if('priority' in data){if(!PRIORITIES.includes(data.priority))throw bad('Невідомий пріоритет.');update.priority=data.priority;changed('priority','Зміна пріоритету')}
  if('internalNote' in data){const note=tidy(data.internalNote,1600);if(note.length>1600)throw bad('Внутрішня нотатка завелика.');update.internalNote=note;changed('internalNote','Внутрішня нотатка')}
  if('tags' in data){
  if(!Array.isArray(data.tags)||data.tags.length>12||data.tags.some(tag=>typeof tag!=='string'||tag.trim().length>25))throw bad('Некоректні теги');
  update.tags=[...new Set(data.tags.map(tag=>tag.trim().toLocaleLowerCase('uk-UA')).filter(Boolean))];if(JSON.stringify(update.tags)!==JSON.stringify(found.tags||[]))changes.push('Теги')
 }
 if('reply' in data){
   const reply=tidy(data.reply,1600);
   if(reply.length<2||reply.length>1600)throw bad('Відповідь має містити від 2 до 1600 символів.');
   if(update.messages.length>=50)throw bad('Ліміт відповідей у зверненні вичерпано.');
   update.messages.push({id:crypto.randomBytes(6).toString('hex'),from:'admin',text:reply,at:new Date(clock()).toISOString()});changes.push('Відповідь користувачу');
   if(!('status' in data)&&update.status==='new')update.status='in_progress';
  }
  update.updatedAt=new Date(clock()).toISOString();
  update.revision=previousRevision+1;
  if(changes.length)update.activity.push({kind:'update',at:update.updatedAt,by:typeof actor==='string'?actor.slice(0,40):'admin',label:changes.join(' · ').slice(0,180)});
  update.activity=update.activity.slice(-80);
  const index=items.indexOf(found);items[index]=update;
  try{save()}catch{items[index]=found;throw bad('Помилка збереження.',503)}
  return {ok:true};
 }
 function getStatus(id,token){
  const found=find(id);
  const basic={id:found.id,status:found.status,createdAt:found.createdAt,updatedAt:found.updatedAt};
  if(token===undefined||token===null||token==='')return basic; // Old receipts remain status-only.
  validateToken(found,token);
  return {...basic,topic:found.topic,subject:found.subject||'',queue:found.queue||'',message:found.message,extra:found.extra||{},attachments:found.attachments||[],messages:(found.messages||[]).filter(x=>x.from==='admin'||x.from==='user').map(({id,from,text,at,attachments})=>({id,from,text,at,attachments:attachments||[]})),rating:found.rating??null,canReply:true};
 }
 function reply(id,token,value,ip){
  const found=find(id);validateToken(found,token);
  const text=tidy(typeof value==='object'&&value!==null?value.message:value,1200);
  const uploads=parseTicketMedia(typeof value==='object'&&value!==null?value.attachments:[]);
  if((text.length<3&&!uploads.length)||text.length>1200)throw bad('Додайте повідомлення або вкладення. Максимум 1200 символів.');
  const messages=Array.isArray(found.messages)?found.messages:[];
  if(messages.length>=50)throw bad('Ліміт повідомлень у зверненні вичерпано.');
  const t=clock(),k=key(id+'|'+ip),interval=15*60*1000;
  for(const [old,v] of replyAttempts)if(v.expire<t)replyAttempts.delete(old);
  const attempt=replyAttempts.get(k)||{times:[],expire:t+interval};
  attempt.times=attempt.times.filter(time=>t-time<interval);
  if(attempt.times.length>=4)throw bad('Забагато відповідей. Спробуйте пізніше.',429);
  const attachments=privateMedia.write(uploads);
  const saved={...found,messages:messages.concat({id:crypto.randomBytes(6).toString('hex'),from:'user',text,attachments,at:new Date(t).toISOString()}),status:'in_progress',updatedAt:new Date(t).toISOString(),
   revision:(Number.isSafeInteger(found.revision)?found.revision:1)+1,
   activity:(Array.isArray(found.activity)?found.activity:[]).concat({kind:'reply',at:new Date(t).toISOString(),by:'користувач',label:'Надійшло уточнення'}).slice(-80)};
  const index=items.indexOf(found);items[index]=saved;
  try{save()}catch{items[index]=found;privateMedia.erase(attachments);throw bad('Помилка збереження.',503)}
  attempt.times.push(t);attempt.expire=t+interval;replyAttempts.set(k,attempt);
  return {ok:true,id,attached:attachments.length};
 }
 function getAttachment(ticketId,attachmentId,token,authorized=false){
  const ticket=find(ticketId);
  if(!authorized)validateToken(ticket,token);
  const all=[...(ticket.attachments||[]),...(ticket.messages||[]).flatMap(m=>m.attachments||[])];
  const meta=all.find(x=>x.id===attachmentId);
  if(!meta)throw bad('Вкладення не знайдено.',404);
  return privateMedia.read(meta);
 }
 function rate(id,token,stars){
  const found=find(id);validateToken(found,token);
  const value=Number(stars);
  if(found.status!=='resolved')throw bad('Оцінювання доступне після закриття звернення.',409);
  if(!Number.isInteger(value)||value<1||value>5)throw bad('Оберіть оцінку від 1 до 5.');
  if(found.rating!=null)throw bad('Оцінку цього звернення вже збережено.',409);
  const updated={...found,rating:value,ratedAt:new Date(clock()).toISOString()},index=items.indexOf(found);items[index]=updated;
  try{save()}catch{items[index]=found;throw bad('Помилка збереження оцінки.',503)}
  return {ok:true,rating:value}
 }
  function remove(id){
  const index=items.findIndex(x=>x.id===id);if(index===-1)throw bad('Звернення не знайдено.',404);
  const item=items.splice(index,1)[0];try{save()}catch{items.splice(index,0,item);throw bad('Помилка збереження.',503)}
  return {ok:true};
 }
 function getCategories(){return categories.map(c=>({...c,fields:c.fields.map(f=>({...f}))}))}
 function setCategories(value){
  if(!Array.isArray(value)||!value.length||value.length>16)throw bad('Кількість категорій: від 1 до 16');
  const norm=value.map(c=>{
   const id=String(c?.id||'').trim().toLowerCase(),title=tidy(c?.title,70),hint=tidy(c?.hint,250);
   if(!/^[a-z][a-z0-9_-]{1,27}$/.test(id)||!title||title.length>70)throw bad('Некоректна категорія звернення');
   if(!Array.isArray(c.fields)||c.fields.length>8)throw bad('Максимум 8 полів для категорії');
   const fields=c.fields.map(f=>{
    const key=String(f.id||'').trim().toLowerCase(),label=tidy(f.label,90),type=String(f.type||'text');
    if(!/^[a-z][a-z0-9_-]{1,27}$/.test(key)||!label||!['text','select','checkbox'].includes(type))throw bad('Некоректне додаткове поле');
    const options=type==='select'?(Array.isArray(f.options)?f.options.slice(0,12).map(x=>tidy(x,70)).filter(Boolean):[]):[];
    if(type==='select'&&!options.length)throw bad('Додайте варіанти вибору');
    return {id:key,label,type,options,required:f.required===true}
   });
   if(new Set(fields.map(f=>f.id)).size!==fields.length)throw bad('Повторення назв полів');
   return {id,title,hint,enabled:c.enabled!==false,priority:c.priority==='high'?'high':'normal',fields}
  });
  if(new Set(norm.map(c=>c.id)).size!==norm.length)throw bad('Дубль категорії');
  if(!norm.some(c=>c.enabled))throw bad('Має залишитися принаймні одна активна категорія');
  categories=norm;save();return {categories:getCategories()}
 }
 function getTemplates(){return [...templates]}
 function setTemplates(value){
  if(!Array.isArray(value)||value.length>30||value.some(x=>typeof x!=='string'||x.trim().length<2||x.length>1600))throw bad('Некоректні шаблони відповідей');
  templates=[...new Set(value.map(x=>x.trim()))];save();return {templates:getTemplates()}
 }
 if(cleanup())save();
 const timer=setInterval(()=>{try{if(cleanup())save()}catch(e){console.warn('Feedback cleanup failed:',e.message)}},24*60*60*1000);
 timer.unref?.();
 return {submit,list,change,remove,getStatus,getAttachment,reply,rate,getTemplates,setTemplates,getCategories,setCategories};
}
