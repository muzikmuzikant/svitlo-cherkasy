/* Persistent, owner-reviewed address catalogue overrides.
 * Supports exact houses, whole streets, multiple queues and reversible tombstones. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const QUEUES=new Set(Array.from({length:6},(_,i)=>[1,2].map(n=>String(i+1)+'.'+n)).flat());
const STREET=/^(вулиця|провулок|проспект|бульвар|узвіз|алея|площа|майдан|шосе|набережна|тупик|проїзд)\|[\p{L}\p{N}-]{2,90}$/u;
const TOWN=/^[\p{L}\p{N}-]{3,90}$/u;
const HOUSE=/^[0-9]{1,5}(?:[\p{L}]{1,2})?(?:\/[0-9]{1,5}[\p{L}]?)?$/u;
const SOURCE=/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\/[a-zA-Z0-9%_/?=.&-]+$/;
function normalize(data,old={}){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Некоректний запис адреси');
 const settlementKey=String(data.settlementKey??old.settlementKey??'').trim().toLocaleLowerCase('uk-UA');
 const streetKey=String(data.streetKey??old.streetKey??'').trim().toLocaleLowerCase('uk-UA');
 const house=String(data.house??old.house??'').trim().toLocaleLowerCase('uk-UA').replace(/[-\s]/g,'');
 const raw=Array.isArray(data.queues)?data.queues:(data.queue?[data.queue]:(old.queues|| (old.queue?[old.queue]:[])));
 const queues=[...new Set(raw.map(String))];
 const source=String(data.source??old.source??'').trim();
 const comment=String(data.comment??old.comment??'').trim();
 const deleted=data.deleted===true;
 if(!TOWN.test(settlementKey)||!STREET.test(streetKey)||(house!==''&&!HOUSE.test(house))||
  queues.length>12||queues.some(q=>!QUEUES.has(q))||(!deleted&&!queues.length)||
  !SOURCE.test(source)||source.length>350||comment.length>1200)
  throw Error('Перевірте населений пункт, вулицю, до 12 підчерг та офіційне посилання');
 return {settlementKey,streetKey,house,queues:queues.sort((a,b)=>Number(a)-Number(b)),source,comment,deleted};
}
export function createAddressCorrectionStore({directory,record=()=>{}}){
 const file=path.join(directory,'address-corrections.json');
 let state={schemaVersion:2,updatedAt:null,items:[]};
 const load=()=>{
  try{const next=JSON.parse(fs.readFileSync(file,'utf8'));
   if(![1,2].includes(next.schemaVersion)||!Array.isArray(next.items))throw Error('Некоректна база адресних уточнень');
   state={schemaVersion:2,updatedAt:next.updatedAt||null,items:next.items.map(x=>{
    const queues=Array.isArray(x.queues)?x.queues:(x.queue?[x.queue]:[]);
    return {...x,queues,deleted:x.deleted===true};
   })};
  }catch(e){if(e.code!=='ENOENT')throw e}
 };
 load();
 const save=()=>{
  fs.mkdirSync(directory,{recursive:true});state.schemaVersion=2;state.updatedAt=new Date().toISOString();
  const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);
 };
 const list=()=>{load();return {schemaVersion:2,updatedAt:state.updatedAt,items:state.items.map(x=>({...x,queues:[...(x.queues||[])]})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}};
 const same=(a,b)=>a.settlementKey===b.settlementKey&&a.streetKey===b.streetKey&&a.house===b.house;
 const conflict=(item,id)=>state.items.some(x=>x.id!==id&&same(x,item));
 const create=(input,actor)=>{
  load();if(state.items.length>=10000)throw Error('Перевищено ліміт адресних записів');
  const values=normalize(input);
  if(conflict(values))throw Error('Для цієї адреси вже є керований запис. Відкрийте його в картотеці.');
  const stamp=new Date().toISOString(),entry={id:'AC-'+crypto.randomBytes(6).toString('hex').toUpperCase(),
   ...values,status:'draft',revision:1,createdAt:stamp,updatedAt:stamp,createdBy:actor,publishedAt:null};
  state.items.unshift(entry);save();record('address.catalog.create',entry.id);return {...entry};
 };
 const edit=(id,input,actor,isOwner=false)=>{
  load();const row=state.items.find(x=>x.id===id);if(!row)throw Error('Запис не знайдено');
  if(input?.expectedRevision!==row.revision){const err=Error('Запис змінив інший адміністратор. Оновіть картотеку.');err.statusCode=409;throw err}
  const payload=normalize(input,row);if(conflict(payload,id))throw Error('Існує інший запис для цієї адреси');
  const nextStatus=input.status??row.status;
  if(!['draft','published'].includes(nextStatus))throw Error('Невідомий стан публікації');
  if(nextStatus==='published'&&!isOwner)throw Error('Публікація доступна лише власнику');
  const proofChanged=['settlementKey','streetKey','house','source','deleted'].some(k=>payload[k]!==row[k])||
   JSON.stringify(payload.queues)!==JSON.stringify(row.queues||[]);
  if(nextStatus==='published'&&(row.status!=='published'||proofChanged)&&input.confirmSourceReviewed!==true)
   throw Error('Підтвердьте перевірку адреси та підчерг за джерелом');
  const stamp=new Date().toISOString();
  Object.assign(row,payload,{queue:payload.queues[0]||'',status:nextStatus,revision:row.revision+1,updatedAt:stamp,
   publishedAt:nextStatus==='published'?(row.publishedAt||stamp):null,reviewedBy:nextStatus==='published'?actor:null});
  save();record('address.catalog.'+(row.deleted?'delete':nextStatus),row.id);return {...row};
 };
 const remove=(id,revision)=>{
  load();const k=state.items.findIndex(x=>x.id===id);if(k<0)throw Error('Запис не знайдено');
  if(state.items[k].revision!==revision){const err=Error('Запис застарів');err.statusCode=409;throw err}
  state.items.splice(k,1);save();record('address.catalog.remove',id);return {ok:true,id};
 };
 const published=()=>{
  load();const corrections={keys:{},localities:{}},deletedKeys=[],deletedStreets=[];
  for(const entry of state.items){
   if(entry.status!=='published')continue;
   const target=entry.settlementKey==='черкаси'?corrections:
    (corrections.localities[entry.settlementKey]??={label:entry.settlementKey.split(/[- ]/).map(x=>x.charAt(0).toLocaleUpperCase('uk-UA')+x.slice(1)).join(' '),keys:{},streets:{},streetQueues:{}});
   target.streets??={};
   const kind=entry.streetKey.split('|')[0],slug=entry.streetKey.split('|').slice(1).join(' ').replace(/-/g,' ');
   target.streets[entry.streetKey]=({вулиця:'Вулиця',провулок:'Провулок',проспект:'Проспект',бульвар:'Бульвар',узвіз:'Узвіз',алея:'Алея',площа:'Площа',майдан:'Майдан',шосе:'Шосе',набережна:'Набережна',тупик:'Тупик',проїзд:'Проїзд'}[kind]||'Вулиця')+' '+slug.split(' ').map(x=>x.charAt(0).toLocaleUpperCase('uk-UA')+x.slice(1)).join(' ');
   const key=entry.streetKey+(entry.house?'|'+entry.house:'');
   if(entry.deleted){(entry.house?deletedKeys:deletedStreets).push({settlementKey:entry.settlementKey,key});continue}
   if(entry.house)target.keys[key]=[...entry.queues];
   else (target.streetQueues??={})[entry.streetKey]=[...entry.queues];
  }
  return {schemaVersion:2,updatedAt:state.updatedAt,corrections,deletedKeys,deletedStreets};
 };
 return {list,create,edit,remove,published};
}
