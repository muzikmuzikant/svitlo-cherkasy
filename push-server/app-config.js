/** Persist site operations settings on Railway's existing encrypted/private data volume.
 * Public endpoint returns only public copy; no secrets or user records.
 */
import fs from 'node:fs';
import path from 'node:path';
const defaults=()=>({schemaVersion:1,updatedAt:null,maintenance:{enabled:false,title:'Ми покращуємо застосунок',message:'Незабаром усе знову працюватиме. Актуальні графіки можна перевірити на сайті оператора.',until:null},announcements:[]});
const text=(value,max)=>String(value??'').trim().slice(0,max+1);
const kinds=new Set(['info','important','update']);
export function validateAppConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Некоректні налаштування');
 const m=input.maintenance||{},title=text(m.title,90),message=text(m.message,320);
 if(title.length<5||title.length>90||message.length<12||message.length>320)throw Error('Перевірте заголовок та опис технічних робіт');
 const until=m.until==null||m.until===''?null:String(m.until);
 if(until&&(!/^20\d{2}-\d\d-\d\dT\d\d:\d\d/.test(until)||!Number.isFinite(Date.parse(until))))throw Error('Неправильна дата завершення техробіт');
 if(!Array.isArray(input.announcements)||input.announcements.length>30)throw Error('Забагато оголошень');
 const ids=new Set(),announcements=input.announcements.map(item=>{
  const id=String(item?.id||'');if(!/^[a-zA-Z0-9_-]{6,64}$/.test(id)||ids.has(id))throw Error('Невірний ID оголошення');ids.add(id);
  const headline=text(item.title,90),body=text(item.body,320);
  if(headline.length<5||headline.length>90||body.length<10||body.length>320)throw Error('Перевірте текст оголошення');
  if(!kinds.has(item.kind))throw Error('Невідомий тип оголошення');
  const expiresAt=item.expiresAt?String(item.expiresAt):null;
  if(expiresAt&&!Number.isFinite(Date.parse(expiresAt)))throw Error('Невірний термін дії');
  return {id,title:headline,body,kind:item.kind,publishedAt:typeof item.publishedAt==='string'&&Number.isFinite(Date.parse(item.publishedAt))?item.publishedAt:new Date().toISOString(),expiresAt,active:item.active===true};
 });
 return {schemaVersion:1,updatedAt:new Date().toISOString(),maintenance:{enabled:m.enabled===true,title,message,until},announcements};
}
export function createAppConfig({directory,record=()=>{}}){
 const file=path.join(directory,'app-config.json');
 let state=defaults();
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved&&saved.schemaVersion===1)state=validateAppConfig(saved)}
 catch(e){if(e.code!=='ENOENT')console.warn('App config read problem:',e.message)}
 const publicState=()=>({schemaVersion:1,updatedAt:state.updatedAt,maintenance:{...state.maintenance},announcements:state.announcements.filter(x=>x.active&&(!x.expiresAt||Date.parse(x.expiresAt)>Date.now()))});
 const update=value=>{
  const next=validateAppConfig(value);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);
  state=next;record('app.settings',next.maintenance.enabled?'maintenance:on':'maintenance:off');return state;
 };
 return {get:()=>({ ...state,maintenance:{...state.maintenance},announcements:state.announcements.map(x=>({...x}))}),publicState,update};
}
