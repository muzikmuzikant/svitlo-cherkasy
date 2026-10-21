/* Server-owned operational controls. No network URLs, secrets, arbitrary code or hidden tracking. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT={
 schemaVersion:1,
 monitoring:{warnAfterMinutes:120},
 reminders:{
  off:{enabled:true,leadMinutes:30,title:'🔴 Відключення через {minutes} хв',body:'Підчерга {queue} · За плановим графіком о {time}.'},
  on:{enabled:true,leadMinutes:15,title:'🟢 Відновлення через {minutes} хв',body:'Підчерга {queue} · За плановим графіком о {time}.'}
 }
};
const clone=x=>JSON.parse(JSON.stringify(x));
const conflict=()=>{const e=Error('Налаштування змінено в іншому сеансі. Перезавантажте дані.');e.statusCode=409;return e};
function validateTemplate(value,max,required){
 if(typeof value!=='string'||!value.trim()||value.length>max||/[<>\x00-\x1f\x7f]/.test(value))throw Error('Некоректний текст шаблону');
 if([...value.matchAll(/\{([^{}]+)\}/g)].some(x=>!['minutes','queue','time'].includes(x[1]))||
    value.replace(/\{(?:minutes|queue|time)\}/g,'').includes('{')||
    value.replace(/\{(?:minutes|queue|time)\}/g,'').includes('}'))throw Error('У шаблоні дозволені лише {minutes}, {queue}, {time}');
 if(required.some(name=>!value.includes('{'+name+'}')))throw Error('Необхідні змінні шаблону: '+required.join(', '));
 return value.trim();
}
export function validateOperations(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Невірний формат керування');
 const monitoring=input.monitoring||{},reminders=input.reminders||{};
 const age=Number(monitoring.warnAfterMinutes??120);
 if(!Number.isInteger(age)||age<30||age>360||age%15!==0)throw Error('Поріг попередження: 30–360 хв, крок 15');
 const result={schemaVersion:1,monitoring:{warnAfterMinutes:age},reminders:{}};
 for(const type of ['off','on']){
  const item=reminders[type]||{},base=DEFAULT.reminders[type];
  const lead=Number(item.leadMinutes??base.leadMinutes);
  if(!Number.isInteger(lead)||lead<5||lead>45||lead%5!==0)throw Error('Нагадування: від 5 до 45 хвилин, крок 5');
  result.reminders[type]={
   enabled:item.enabled!==false,leadMinutes:lead,
   title:validateTemplate(item.title??base.title,75,['minutes']),
   body:validateTemplate(item.body??base.body,205,['queue','time'])
  };
  if(!/плановим|графік/i.test(result.reminders[type].body))
   throw Error('Текст має уточнювати, що це плановий графік, а не фактичний стан світла');
 }
 // Bounds after substitution must fit platform's existing Push payload.
 for(const type of ['off','on']){
  const t=result.reminders[type],demo={minutes:'45',queue:'6.2',time:'23:30'};
  const formatted=v=>v.replace(/\{(minutes|queue|time)\}/g,(_,key)=>demo[key]);
  if(formatted(t.title).length>85||formatted(t.body).length>280)throw Error('Задовгий текст Push після підстановки');
 }
 return result;
}
export function createOperationsStore({directory,record=()=>{}}){
 const filename=path.join(directory,'operations-controls.json'),historyFile=path.join(directory,'operations-controls-history.json');
 let current={...clone(DEFAULT),revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};
 let history=[];
 try{
  const file=JSON.parse(fs.readFileSync(filename,'utf8'));
  const safe=validateOperations(file);
  current={...safe,revision:/^[a-f0-9-]{36}$/.test(file.revision||'')?file.revision:crypto.randomUUID(),
   updatedAt:typeof file.updatedAt==='string'?file.updatedAt:new Date().toISOString()};
 }catch(e){if(e.code!=='ENOENT')console.warn('[operations] Invalid saved controls:',e.message)}
 try{const saved=JSON.parse(fs.readFileSync(historyFile,'utf8'));if(Array.isArray(saved))history=saved.slice(0,20)}
 catch(e){if(e.code!=='ENOENT')console.warn('[operations] History:',e.message)}
 const write=(file,value)=>{
  fs.mkdirSync(directory,{recursive:true});
  const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);
 };
 const get=()=>clone(current);
 const list=()=>history.map(({revision,updatedAt})=>({revision,updatedAt}));
 function update(input,expectedRevision){
  if(typeof expectedRevision!=='string'||expectedRevision!==current.revision)throw conflict();
  const checked=validateOperations(input);
  const next={...checked,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};
  // Write before moving in-memory state, preserving a usable current state on failure.
  write(filename,next);
  try{
   const nextHistory=[current,...history].slice(0,20);
   write(historyFile,nextHistory);history=nextHistory;
  }catch(e){console.error('[operations] Could not persist history:',e.message)}
  current=next;record('operations.update','reminders / monitoring');return get();
 }
 function restore(revision,expectedRevision){
  if(typeof revision!=='string'||!history.some(h=>h.revision===revision))throw Error('Редакцію не знайдено');
  if(expectedRevision!==current.revision)throw conflict();
  const snapshot=history.find(h=>h.revision===revision);
  record('operations.restore','safe controls revision');
  return update(snapshot,expectedRevision);
 }
 return {get,update,list,restore};
}
