/* Private Railway-backed work registry. Never exposes user submissions to public APIs. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const KINDS=new Set(['feedback','addresses','schedules','content','system','design','other']);
const STATUSES=new Set(['new','in_progress','review','done','cancelled']);
const PRIORITIES=new Set(['normal','high','urgent']);
const text=(v,max)=>String(v??'').trim().slice(0,max+1);
const date=value=>value===null||value===''?null:/^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))?value:null;
function fields(input,base={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Некоректна картка');
 const title=text(input.title??base.title,120),details=text(input.details??base.details,1800);
 const kind=input.kind??base.kind??'other',priority=input.priority??base.priority??'normal';
 const status=input.status??base.status??'new',assignee=text(input.assignee??base.assignee,50);
 const reference=text(input.reference??base.reference,100),dueDate=input.dueDate===undefined?(base.dueDate??null):date(input.dueDate);
 if(title.length<4||title.length>120||details.length>1800||assignee.length>50||reference.length>100||
  !KINDS.has(kind)||!STATUSES.has(status)||!PRIORITIES.has(priority)||
  (input.dueDate!==undefined&&input.dueDate!==null&&input.dueDate!==''&&!dueDate))
  throw Error('Перевірте назву, статус, категорію, термін або обсяг тексту');
 return {title,details,kind,priority,status,assignee,reference,dueDate};
}
export function createWorkRegistry({directory,record=()=>{}}){
 const file=path.join(directory,'admin-work-register.json');
 let state={schemaVersion:1,items:[]};
 try{state=JSON.parse(fs.readFileSync(file,'utf8'));if(state.schemaVersion!==1||!Array.isArray(state.items))throw Error('Некоректний реєстр')}catch(error){if(error.code!=='ENOENT')throw error}
 const reload=()=>{
  try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));
   if(saved.schemaVersion!==1||!Array.isArray(saved.items))throw Error('Некоректний реєстр');
   state=saved;
  }catch(error){if(error.code!=='ENOENT')throw error}
 };
 const persist=()=>{
  fs.mkdirSync(directory,{recursive:true});
  const temp=file+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  fs.renameSync(temp,file);
 };
 const list=()=>{reload();return {items:state.items.map(item=>({...item,events:[...(item.events||[])]})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}};
 const find=id=>state.items.find(item=>item.id===id);
 const create=(input,actor)=>{
  reload();
  if(state.items.length>=700)throw Error('Реєстр заповнений. Закрийте або видаліть старі записи.');
  const values=fields(input),timestamp=new Date().toISOString();
  const item={id:'WR-'+crypto.randomBytes(6).toString('hex').toUpperCase(),...values,
   revision:1,createdAt:timestamp,updatedAt:timestamp,
   closedAt:values.status==='done'?timestamp:null,
   events:[{at:timestamp,action:'created',actor:text(actor,50)||'administrator'}]};
  state.items.push(item);persist();record('work.created',item.id);
  return {...item};
 };
 const patch=(id,input,actor)=>{
  reload();
  const item=find(id);if(!item)throw Error('Картку не знайдено');
  if(!Number.isSafeInteger(input?.expectedRevision)||input.expectedRevision!==item.revision){
   const error=Error('Картку вже змінено. Оновіть її перед збереженням.');error.statusCode=409;throw error;
  }
  const values=fields(input,item),stamp=new Date().toISOString();
  if(Object.keys(values).every(k=>values[k]===item[k]))return {...item};
  const before=item.status;
  Object.assign(item,values);
  item.updatedAt=stamp;item.revision++;
  item.closedAt=item.status==='done'?item.closedAt||stamp:null;
  item.events=[{at:stamp,action:before===item.status?'updated':before+' -> '+item.status,
    actor:text(actor,50)||'administrator'},...(item.events||[])].slice(0,80);
  persist();record('work.updated',id+' '+item.status);
  return {...item};
 };
 const remove=(id,expectedRevision,actor)=>{
  reload();
  const index=state.items.findIndex(item=>item.id===id);
  if(index<0)throw Error('Картку не знайдено');
  if(expectedRevision!==state.items[index].revision){
   const error=Error('Картку вже змінено');error.statusCode=409;throw error;
  }
  state.items.splice(index,1);persist();record('work.deleted',id+' by '+text(actor,50));
  return {ok:true,id};
 };
 return {list,create,patch,remove};
}
