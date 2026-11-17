import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const STATES = new Set(['red','yellow','green']);
const MAX_ITEMS = 500;
const clean = (v,n)=>String(v??'').trim().slice(0,n);
function fail(message,statusCode=400){const e=new Error(message);e.statusCode=statusCode;return e}
export function createStatusStore({directory}={}){
 if(!directory)throw Error('Status store directory is required');
 const file=path.join(directory,'status-board.json');
 let state={level:'green',summary:'Усі системи працюють у штатному режимі.',updatedAt:null,incidents:[]};
 try{const raw=JSON.parse(fs.readFileSync(file,'utf8'));if(raw&&STATES.has(raw.level)&&Array.isArray(raw.incidents))state={...state,...raw,incidents:raw.incidents.slice(0,MAX_ITEMS)}}catch(e){if(e.code!=='ENOENT')throw Error('Cannot load status board: '+e.message)}
 function save(){fs.mkdirSync(directory,{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,file)}
 function snapshot(){return JSON.parse(JSON.stringify(state))}
 function updateLevel(input){
  if(!STATES.has(input?.level))throw fail('Оберіть коректний загальний статус.');
  const summary=clean(input.summary,240);
  if(!summary)throw fail('Додайте короткий опис поточного стану.');
  state={...state,level:input.level,summary,updatedAt:new Date().toISOString()};
  save();return snapshot();
 }
 function create(input,actor){
  const title=clean(input?.title,120),description=clean(input?.description,3000);
  if(title.length<3)throw fail('Назва проблеми має містити щонайменше 3 символи.');
  if(description.length<5)throw fail('Додайте опис проблеми.');
  if(!STATES.has(input.level))throw fail('Некоректний статус проблеми.');
  const startedAt=new Date(input.startedAt||Date.now()).toISOString();
  const endedAt=input.endedAt?new Date(input.endedAt).toISOString():null;
  if(endedAt&&Date.parse(endedAt)<Date.parse(startedAt))throw fail('Час завершення не може бути раніше початку.');
  const item={id:'INC-'+crypto.randomBytes(6).toString('hex').toUpperCase(),title,description,level:input.level,startedAt,endedAt,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),createdBy:clean(actor,48),revision:1};
  state.incidents.unshift(item);state.incidents=state.incidents.slice(0,MAX_ITEMS);state.updatedAt=new Date().toISOString();save();return snapshot();
 }
 function edit(id,input,actor){
  const i=state.incidents.findIndex(x=>x.id===id);if(i<0)throw fail('Запис не знайдено.',404);
  const old=state.incidents[i];
  if(input.expectedRevision!==old.revision)throw fail('Запис уже змінено. Оновіть сторінку.',409);
  const title=clean(input.title??old.title,120),description=clean(input.description??old.description,3000);
  const level=input.level??old.level;
  const startedAt=new Date(input.startedAt??old.startedAt).toISOString();
  const endedAt=(input.endedAt===undefined?old.endedAt:input.endedAt)?new Date(input.endedAt??old.endedAt).toISOString():null;
  if(title.length<3||description.length<5||!STATES.has(level))throw fail('Перевірте назву, опис і статус.');
  if(endedAt&&Date.parse(endedAt)<Date.parse(startedAt))throw fail('Час завершення не може бути раніше початку.');
  state.incidents[i]={...old,title,description,level,startedAt,endedAt,updatedAt:new Date().toISOString(),updatedBy:clean(actor,48),revision:old.revision+1};
  state.updatedAt=new Date().toISOString();save();return snapshot();
 }
 function remove(id,revision){
  const i=state.incidents.findIndex(x=>x.id===id);if(i<0)throw fail('Запис не знайдено.',404);
  if(revision!==state.incidents[i].revision)throw fail('Запис уже змінено. Оновіть сторінку.',409);
  state.incidents.splice(i,1);state.updatedAt=new Date().toISOString();save();return snapshot();
 }
 return {snapshot,updateLevel,create,edit,remove};
}
