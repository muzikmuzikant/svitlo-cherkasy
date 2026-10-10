/* Anonymous feedback inbox for the Railway volume. Never serve these records as public files. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export const TOPICS = ['bug','address','idea','other'];
export const STATUSES = ['new','in_progress','resolved'];
const KEEP_MS=90*24*3600*1000;
const MAX_ITEMS=750;
const MAX_BODY=24000;
function bad(message, statusCode=400){const err=new Error(message);err.statusCode=statusCode;return err}
export function validateFeedback(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw bad('Заповніть форму звернення.');
 const topic=String(value.topic||'');
 const message=String(value.message||'').trim();
 const email=String(value.email||'').trim();
 if(!TOPICS.includes(topic))throw bad('Оберіть тему звернення.');
 if(message.length<12||message.length>2000)throw bad('Опис має містити від 12 до 2000 символів.');
 if(email&&(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))throw bad('Перевірте адресу електронної пошти.');
 if(value.website)throw bad('Некоректний запит.');
 return {topic,message,email};
}
export async function readFeedbackBody(req){
 let size=0;const chunks=[];
 for await(const part of req){size+=part.length;if(size>MAX_BODY)throw bad('Звернення завелике.',413);chunks.push(part)}
 let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw bad('Некоректні дані звернення.')}return data;
}
export function createFeedbackStore({filePath,clock=()=>Date.now()}={}){
 if(!filePath)throw Error('Feedback store path is required');
 let items=[];
 try{const raw=JSON.parse(fs.readFileSync(filePath,'utf8'));if(Array.isArray(raw.items))items=raw.items.filter(x=>x&&typeof x==='object')}catch(e){if(e.code!=='ENOENT')throw Error('Cannot load feedback store: '+e.message)}
 const salt=crypto.randomBytes(16).toString('hex');
 const attempts=new Map();
 function key(ip){return crypto.createHash('sha256').update(salt+String(ip||'unknown')).digest('hex')}
 function cleanup(){const t=clock();const count=items.length;items=items.filter(x=>typeof x.id==='string'&&Number.isFinite(Date.parse(x.createdAt))&&Date.parse(x.createdAt)>t-KEEP_MS);return items.length!==count}
 function save(){
  cleanup();fs.mkdirSync(path.dirname(filePath),{recursive:true});
  const tmp=filePath+'.tmp';fs.writeFileSync(tmp,JSON.stringify({items},null,2),{mode:0o600});fs.renameSync(tmp,filePath);
 }
 function submit(value,ip){
  const data=validateFeedback(value);
  const t=clock(); const k=key(ip);const interval=15*60*1000;
  // Railway sits behind a reverse proxy. A per-IP limit is a basic abuse guard, not a CAPTCHA.
  for(const [old,v] of attempts)if(v.expire<t)attempts.delete(old);
  const entry=attempts.get(k)||{times:[],expire:t+interval};
  entry.times=entry.times.filter(time=>t-time<interval);
  if(entry.times.length>=3)throw bad('Забагато звернень. Спробуйте через 15 хвилин.',429);
  cleanup();if(items.length>=MAX_ITEMS)throw bad('Наразі не можемо прийняти звернення. Спробуйте пізніше.',503);
  const newItem={id:'SC-'+crypto.randomBytes(5).toString('hex').toUpperCase(),...data,status:'new',createdAt:new Date(t).toISOString(),updatedAt:new Date(t).toISOString()};
  items.push(newItem);
  try{save()}catch(e){items.pop();throw bad('Не вдалося зберегти звернення. Спробуйте пізніше.',503)}
  entry.times.push(t);entry.expire=t+interval;attempts.set(k,entry);
  return {ok:true,id:newItem.id};
 }
 function list(){if(cleanup())save();return {items:items.slice().reverse(),count:items.length}}
 function change(id,status){if(!STATUSES.includes(status))throw bad('Невідомий статус.');const found=items.find(x=>x.id===id);if(!found)throw bad('Звернення не знайдено.',404);const prev=found.status,updatedAt=found.updatedAt;found.status=status;found.updatedAt=new Date(clock()).toISOString();try{save()}catch{found.status=prev;found.updatedAt=updatedAt;throw bad('Помилка збереження.',503)}return {ok:true}}
 function remove(id){const index=items.findIndex(x=>x.id===id);if(index===-1)throw bad('Звернення не знайдено.',404);const item=items.splice(index,1)[0];try{save()}catch{items.splice(index,0,item);throw bad('Помилка збереження.',503)}return {ok:true}}
 // Rotate expired records even when no one sends new messages.
 if(cleanup())save();
 const cleanupTimer=setInterval(()=>{try{if(cleanup())save()}catch(e){console.warn('Feedback cleanup failed:',e.message)}},24*60*60*1000);
 cleanupTimer.unref?.();
 return {submit,list,change,remove};
}
