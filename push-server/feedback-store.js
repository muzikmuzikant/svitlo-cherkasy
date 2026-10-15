/* Private support inbox. Persist on the Railway volume, never publish tickets to GitHub Pages. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export const TOPICS=['bug','address','schedule','push','idea','other'];
export const STATUSES=['new','in_progress','resolved'];
export const PRIORITIES=['low','normal','high'];
const KEEP_MS=90*24*3600*1000,MAX_ITEMS=750,MAX_BODY=24000;
function bad(message,statusCode=400){const error=new Error(message);error.statusCode=statusCode;return error}
const tidy=(value,max)=>String(value??'').trim().slice(0,max+1);
export function validateFeedback(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw bad('Заповніть форму звернення.');
 const topic=String(value.topic||''),message=tidy(value.message,2000),email=tidy(value.email,254);
 if(!TOPICS.includes(topic))throw bad('Оберіть тему звернення.');
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
  const platform=String(d.platform||''),os=String(d.os||''),browser=String(d.browser||''),appVersion=String(d.appVersion||'');
  if(!['iPhone','iPad','Android','Windows','macOS','Linux','Інше'].includes(platform)
   ||!/^(?:iOS|iPadOS|Android|Windows|macOS|Linux|Інше)(?: [0-9]{1,2})?$/.test(os)
   ||!['Safari','Chrome','Firefox','Edge','Samsung Internet','Інше'].includes(browser)
   ||(appVersion&&!/^[0-9]{1,3}\.[0-9]{1,3}\\.[0-9]{1,3}$/.test(appVersion)))throw bad('Некоректні технічні параметри.');
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
 let items=[];
 try{const raw=JSON.parse(fs.readFileSync(filePath,'utf8'));if(Array.isArray(raw.items))items=raw.items.filter(x=>x&&typeof x==='object')}catch(e){if(e.code!=='ENOENT')throw Error('Cannot load feedback store: '+e.message)}
 const salt=crypto.randomBytes(16).toString('hex'),attempts=new Map(),replyAttempts=new Map();
 const key=(value)=>crypto.createHash('sha256').update(salt+String(value||'unknown')).digest('hex');
 const hash=(value)=>crypto.createHash('sha256').update(String(value)).digest('hex');
 function cleanup(){const t=clock(),count=items.length;items=items.filter(x=>typeof x.id==='string'&&Number.isFinite(Date.parse(x.createdAt))&&Date.parse(x.createdAt)>t-KEEP_MS);return items.length!==count}
 function save(){
  cleanup();fs.mkdirSync(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp';fs.writeFileSync(tmp,JSON.stringify({items},null,2),{mode:0o600});fs.renameSync(tmp,filePath);
 }
 function find(id){const item=items.find(x=>x.id===id);if(!item)throw bad('Звернення не знайдено.',404);return item}
 function validateToken(item,token){
  if(!item.accessHash||typeof token!=='string'||!(/^[A-Za-z0-9_-]{32,80}$/.test(token)))throw bad('Потрібен код доступу до звернення.',403);
  const wanted=Buffer.from(item.accessHash,'hex'),actual=Buffer.from(hash(token),'hex');
  if(wanted.length!==actual.length||!crypto.timingSafeEqual(wanted,actual))throw bad('Неправильний код доступу.',403);
 }
 function submit(value,ip){
  const data=validateFeedback(value),t=clock(),k=key(ip),interval=15*60*1000;
  for(const [old,v] of attempts)if(v.expire<t)attempts.delete(old);
  const entry=attempts.get(k)||{times:[],expire:t+interval};
  entry.times=entry.times.filter(time=>t-time<interval);
  if(entry.times.length>=3)throw bad('Забагато звернень. Спробуйте через 15 хвилин.',429);
  cleanup();if(items.length>=MAX_ITEMS)throw bad('Наразі не можемо прийняти звернення. Спробуйте пізніше.',503);
  const token=crypto.randomBytes(24).toString('base64url');
  const newItem={id:'SC-'+crypto.randomBytes(5).toString('hex').toUpperCase(),...data,status:'new',priority:'normal',internalNote:'',messages:[],accessHash:hash(token),createdAt:new Date(t).toISOString(),updatedAt:new Date(t).toISOString()};
  items.push(newItem);
  try{save()}catch{items.pop();throw bad('Не вдалося зберегти звернення. Спробуйте пізніше.',503)}
  entry.times.push(t);entry.expire=t+interval;attempts.set(k,entry);
  return {ok:true,id:newItem.id,token};
 }
 function list(){if(cleanup())save();return {items:items.slice().reverse().map(({accessHash,...item})=>item),count:items.length}}
 function change(id,patch){
  const found=find(id),data=typeof patch==='string'?{status:patch}:patch;
  if(!data||typeof data!=='object'||Array.isArray(data))throw bad('Некоректні зміни звернення.');
  const allow=['status','priority','internalNote','reply'];
  if(Object.keys(data).some(k=>!allow.includes(k)))throw bad('Непідтримуване поле звернення.');
  const update={...found,messages:Array.isArray(found.messages)?found.messages.slice():[]};
  if('status' in data){if(!STATUSES.includes(data.status))throw bad('Невідомий статус.');update.status=data.status}
  if('priority' in data){if(!PRIORITIES.includes(data.priority))throw bad('Невідомий пріоритет.');update.priority=data.priority}
  if('internalNote' in data){const note=tidy(data.internalNote,1600);if(note.length>1600)throw bad('Внутрішня нотатка завелика.');update.internalNote=note}
  if('reply' in data){
   const reply=tidy(data.reply,1600);
   if(reply.length<2||reply.length>1600)throw bad('Відповідь має містити від 2 до 1600 символів.');
   if(update.messages.length>=50)throw bad('Ліміт відповідей у зверненні вичерпано.');
   update.messages.push({id:crypto.randomBytes(6).toString('hex'),from:'admin',text:reply,at:new Date(clock()).toISOString()});
   if(!('status' in data)&&update.status==='new')update.status='in_progress';
  }
  update.updatedAt=new Date(clock()).toISOString();
  const index=items.indexOf(found);items[index]=update;
  try{save()}catch{items[index]=found;throw bad('Помилка збереження.',503)}
  return {ok:true};
 }
 function getStatus(id,token){
  const found=find(id);
  const basic={id:found.id,status:found.status,createdAt:found.createdAt,updatedAt:found.updatedAt};
  if(token===undefined||token===null||token==='')return basic; // Old receipts remain status-only.
  validateToken(found,token);
  return {...basic,topic:found.topic,subject:found.subject||'',queue:found.queue||'',message:found.message,messages:(found.messages||[]).filter(x=>x.from==='admin'||x.from==='user').map(({id,from,text,at})=>({id,from,text,at})),canReply:true};
 }
 function reply(id,token,value,ip){
  const found=find(id);validateToken(found,token);
  const text=tidy(value,1200);
  if(text.length<3||text.length>1200)throw bad('Повідомлення має містити від 3 до 1200 символів.');
  const messages=Array.isArray(found.messages)?found.messages:[];
  if(messages.length>=50)throw bad('Ліміт повідомлень у зверненні вичерпано.');
  const t=clock(),k=key(id+'|'+ip),interval=15*60*1000;
  for(const [old,v] of replyAttempts)if(v.expire<t)replyAttempts.delete(old);
  const attempt=replyAttempts.get(k)||{times:[],expire:t+interval};
  attempt.times=attempt.times.filter(time=>t-time<interval);
  if(attempt.times.length>=4)throw bad('Забагато відповідей. Спробуйте пізніше.',429);
  const saved={...found,messages:messages.concat({id:crypto.randomBytes(6).toString('hex'),from:'user',text,at:new Date(t).toISOString()}),status:'in_progress',updatedAt:new Date(t).toISOString()};
  const index=items.indexOf(found);items[index]=saved;
  try{save()}catch{items[index]=found;throw bad('Помилка збереження.',503)}
  attempt.times.push(t);attempt.expire=t+interval;replyAttempts.set(k,attempt);
  return {ok:true,id};
 }
 function remove(id){
  const index=items.findIndex(x=>x.id===id);if(index===-1)throw bad('Звернення не знайдено.',404);
  const item=items.splice(index,1)[0];try{save()}catch{items.splice(index,0,item);throw bad('Помилка збереження.',503)}
  return {ok:true};
 }
 if(cleanup())save();
 const timer=setInterval(()=>{try{if(cleanup())save()}catch(e){console.warn('Feedback cleanup failed:',e.message)}},24*60*60*1000);
 timer.unref?.();
 return {submit,list,change,remove,getStatus,reply};
}
