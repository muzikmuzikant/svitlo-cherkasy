/* Persistent public polls attached to custom announcements. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const id=()=> 'poll_'+crypto.randomBytes(12).toString('hex');
const cleanText=(v,max)=>String(v??'').trim().slice(0,max);
export function createPollStore({directory,record=()=>{}}){
 const file=path.join(directory,'polls.json');let rows={};
 try{const x=JSON.parse(fs.readFileSync(file,'utf8'));if(x&&typeof x==='object'&&!Array.isArray(x))rows=x}catch(e){if(e.code!=='ENOENT')console.warn('[polls] read:',e.message)}
 const save=()=>{fs.mkdirSync(directory,{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rows));fs.renameSync(tmp,file)};
 const status=p=>p.closedAt||p.endsAt&&Date.parse(p.endsAt)<=Date.now()?'closed':'active';
 const counts=p=>p.options.map(o=>({id:o.id,label:o.label,emoji:o.emoji,count:Object.values(p.votes).filter(v=>v.includes(o.id)).length}));
 const publicPoll=(p,viewer='')=>({id:p.id,question:p.question,description:p.description,options:counts(p),multiple:p.multiple,anonymous:p.anonymous,createdAt:p.createdAt,endsAt:p.endsAt,closedAt:p.closedAt||null,status:status(p),totalVotes:Object.keys(p.votes).length,myVotes:viewer?p.votes[viewer]||[]:[]});
 function get(id){return rows[id]||null}
 return {
  create(input,author){
   const question=cleanText(input.question,180),description=cleanText(input.description,500);
   if(!question)throw Error('Додайте запитання');
   if(!Array.isArray(input.options)||input.options.length<2||input.options.length>10)throw Error('Потрібно від 2 до 10 варіантів');
   const options=input.options.map((x,i)=>({id:'o'+(i+1),label:cleanText(x.label,90),emoji:cleanText(x.emoji,8)}));
   if(options.some(x=>!x.label)||new Set(options.map(x=>x.label.toLocaleLowerCase('uk-UA'))).size!==options.length)throw Error('Варіанти мають бути заповнені та унікальні');
   const endsAt=input.endsAt?new Date(input.endsAt).toISOString():null;
   if(endsAt&&Date.parse(endsAt)<=Date.now()+60_000)throw Error('Кінцева дата має бути щонайменше за хвилину');
   const p={id:id(),question,description,options,multiple:input.multiple===true,anonymous:input.anonymous!==false,endsAt,createdAt:new Date().toISOString(),createdBy:cleanText(author,80),closedAt:null,votes:{}};
   rows[p.id]=p;save();record('poll.create',p.id);return publicPoll(p);
  },
  list(){return Object.values(rows).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(p=>({...publicPoll(p),question:p.question,description:p.description,anonymous:p.anonymous,participants:p.anonymous?null:Object.entries(p.votes).map(([v,ids])=>({voter:v,options:ids}))}))},
  public(id,viewer=''){const p=get(id);if(!p)throw Object.assign(Error('Голосування не знайдене'),{statusCode:404});return publicPoll(p,viewer)},
  vote(id,viewer,selected){
   const p=get(id);if(!p)throw Object.assign(Error('Голосування не знайдене'),{statusCode:404});
   if(status(p)!=='active')throw Object.assign(Error('Голосування вже завершено'),{statusCode:409});
   if(typeof viewer!=='string'||viewer.length<20||viewer.length>160)throw Error('Потрібен ідентифікатор пристрою');
   if(!Array.isArray(selected)||!selected.length||selected.length>(p.multiple?10:1))throw Error('Оберіть допустиму кількість варіантів');
   const valid=new Set(p.options.map(x=>x.id));if(selected.some(x=>!valid.has(x))||new Set(selected).size!==selected.length)throw Error('Невірний варіант відповіді');
   p.votes[viewer]=selected;save();record('poll.vote',p.id);return publicPoll(p,viewer);
  },
  close(id){const p=get(id);if(!p)throw Object.assign(Error('Голосування не знайдене'),{statusCode:404});if(!p.closedAt){p.closedAt=new Date().toISOString();save();record('poll.close',id)}return publicPoll(p)},
  remove(id){if(!get(id))throw Object.assign(Error('Голосування не знайдене'),{statusCode:404});delete rows[id];save();record('poll.delete',id);return {ok:true}},
  expire(){let changed=false;for(const p of Object.values(rows))if(!p.closedAt&&p.endsAt&&Date.parse(p.endsAt)<=Date.now()){p.closedAt=new Date().toISOString();changed=true}if(changed)save()}
 };
}
