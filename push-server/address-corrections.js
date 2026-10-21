/* Privileged, human-reviewed exact-building subqueue corrections.
 * No automated verification is claimed. Only published records reach PWA. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const QUEUES=new Set(Array.from({length:6},(_,i)=>[1,2].map(n=>String(i+1)+'.'+n)).flat());
const STREET=/^(вулиця|провулок|проспект|бульвар|узвіз|алея|площа|майдан|шосе|набережна|тупик|проїзд)\|[\p{L}\p{N}]{2,90}$/u;
const TOWN=/^[\p{L}\p{N}]{3,90}$/u;
const HOUSE=/^[0-9]{1,5}(?:[\p{L}]{1,2})?(?:\/[0-9]{1,5}[\p{L}]?)?$/u;
const SOURCE=/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\/[a-zA-Z0-9%_/?=.&-]+$/;
function fields(data,old={}){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Некоректна картка адреси');
 const settlementKey=String(data.settlementKey??old.settlementKey??'').trim().toLocaleLowerCase('uk-UA');
 const streetKey=String(data.streetKey??old.streetKey??'').trim().toLocaleLowerCase('uk-UA');
 const house=String(data.house??old.house??'').trim().toLocaleLowerCase('uk-UA').replace(/[-\s]/g,'');
 const queue=String(data.queue??old.queue??'');
 const source=String(data.source??old.source??'').trim();
 const comment=String(data.comment??old.comment??'').trim();
 if(!TOWN.test(settlementKey)||!STREET.test(streetKey)||!HOUSE.test(house)||!QUEUES.has(queue)
  ||!SOURCE.test(source)||source.length>350||comment.length>600)throw Error('Вкажіть точну адресу, підчергу й офіційне посилання обленерго');
 return {settlementKey,streetKey,house,queue,source,comment};
}
export function createAddressCorrectionStore({directory,record=()=>{}}){
 const file=path.join(directory,'address-corrections.json');
 let state={schemaVersion:1,updatedAt:null,items:[]};
 const load=()=>{
  try{const next=JSON.parse(fs.readFileSync(file,'utf8'));
   if(next.schemaVersion!==1||!Array.isArray(next.items))throw Error('Некоректна база виправлень');
   state=next;
  }catch(e){if(e.code!=='ENOENT')throw e}
 };
 load();
 const save=()=>{
  fs.mkdirSync(directory,{recursive:true});
  state.updatedAt=new Date().toISOString();
  const temp=file+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);
 };
 const list=()=>{load();return {updatedAt:state.updatedAt,items:state.items.map(x=>({...x})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}};
 const same=(a,b)=>a.settlementKey===b.settlementKey&&a.streetKey===b.streetKey&&a.house===b.house;
 const conflict=(item,id)=>state.items.some(x=>x.id!==id&&same(x,item));
 const create=(input,actor)=>{
  load();if(state.items.length>=600)throw Error('Перевищено ліміт адресних уточнень');
  const values=fields(input);
  if(conflict(values))throw Error('Для цієї точної адреси картка вже існує');
  const stamp=new Date().toISOString(),entry={id:'AC-'+crypto.randomBytes(6).toString('hex').toUpperCase(),
   ...values,status:'draft',revision:1,createdAt:stamp,updatedAt:stamp,createdBy:actor,publishedAt:null};
  state.items.unshift(entry);save();record('address.draft.create',entry.id);return {...entry};
 };
 const edit=(id,input,actor,isOwner=false)=>{
  load();const row=state.items.find(x=>x.id===id);if(!row)throw Error('Картку не знайдено');
  if(input?.expectedRevision!==row.revision){
   const err=Error('Цю адресу змінив інший адміністратор. Оновіть картотеку.');err.statusCode=409;throw err
  }
  const payload=fields(input,row);
  if(conflict(payload,id))throw Error('Існує інше уточнення для цієї адреси');
  const nextStatus=input.status??row.status;
  if(!['draft','published'].includes(nextStatus))throw Error('Невідомий стан публікації');
  if(nextStatus==='published'&&!isOwner)throw Error('Підтвердження доступне лише власнику');
  const proofChanged=['settlementKey','streetKey','house','queue','source'].some(key=>payload[key]!==row[key]);
  if(nextStatus==='published'&&(row.status!=='published'||proofChanged)&&input.confirmSourceReviewed!==true)
   throw Error('Підтвердьте, що власноруч звірили будинок із джерелом');
  const stamp=new Date().toISOString();
  Object.assign(row,payload,{status:nextStatus,revision:row.revision+1,updatedAt:stamp,
   publishedAt:nextStatus==='published'?(row.publishedAt||stamp):null,reviewedBy:nextStatus==='published'?actor:null});
  save();record('address.correction.'+nextStatus,row.id);return {...row};
 };
 const remove=(id,revision)=>{
  load();const k=state.items.findIndex(x=>x.id===id);
  if(k<0)throw Error('Картку не знайдено');
  if(state.items[k].revision!==revision){const err=Error('Картка застаріла');err.statusCode=409;throw err}
  state.items.splice(k,1);save();record('address.correction.remove',id);return {ok:true,id};
 };
 const published=()=>{
  load();
  const corrections={keys:{},localities:{}};
  for(const entry of state.items){
   if(entry.status!=='published')continue;
   const target=entry.settlementKey==='черкаси'?corrections:
    (corrections.localities[entry.settlementKey]??={keys:{}});
   target.keys[entry.streetKey+'|'+entry.house]=[entry.queue];
  }
  return {schemaVersion:1,updatedAt:state.updatedAt,corrections};
 };
 return {list,create,edit,remove,published};
}
