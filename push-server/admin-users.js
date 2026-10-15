/* Owner-managed Beta admin accounts. Passwords are never retrievable. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ADMIN_PERMISSIONS=['view','notices','push','feedback','help','ads','schedules','settings','media'];
const ROLES=['viewer','operator','editor'];
const idValid=v=>typeof v==='string'&&/^[a-z][a-z0-9_.-]{2,31}$/.test(v);
const hashPassword=password=>{
 const salt=crypto.randomBytes(24).toString('hex');
 const key=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
 return {salt,key};
};
const safe=u=>({username:u.username,role:u.role,permissions:u.permissions,active:u.active,createdAt:u.createdAt,updatedAt:u.updatedAt});
export function createAdminUserStore({directory}){
 const file=path.join(directory,'beta-admin-users.json');
 let data={schemaVersion:1,users:[]};
 try{data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.schemaVersion!==1||!Array.isArray(data.users))throw Error('Invalid admin users store')}catch(e){if(e.code!=='ENOENT')throw e}
 const save=()=>{
  fs.mkdirSync(directory,{recursive:true});
  const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,file)
 };
 const find=username=>data.users.find(u=>u.username===String(username||'').toLowerCase())||null;
 const list=()=>data.users.map(safe);
 const login=(username,password)=>{
  const u=find(username);
  // A dummy hash prevents a straightforward timing oracle for nonexistent users.
  const sample=u||{salt:'000000000000000000000000000000000000000000000000',key:'0'.repeat(128)};
  const h=crypto.scryptSync(String(password||''),sample.salt,64,{N:16384,r:8,p:1});
  const match=crypto.timingSafeEqual(h,Buffer.from(sample.key,'hex'));
  return match&&u?.active?safe(u):null
 };
 const get=username=>{const u=find(username);return u?{...safe(u),revision:u.revision}:null};
 const create=value=>{
  const username=String(value?.username||'').toLowerCase().trim(),password=String(value?.password||'');
  if(!idValid(username)||['owner','admin','root','system','editor','operator','viewer'].includes(username))throw Error('Логін: від 3 до 32 символів, латинські літери, цифри, _ . -; заборонені системні імена.');
  if(find(username))throw Error('Користувач з таким логіном існує');
  if(password.length<12||password.length>128)throw Error('Пароль повинен містити 12–128 символів');
  if(!ROLES.includes(value?.role))throw Error('Невідома роль');
  const permissions=[...new Set((Array.isArray(value.permissions)?value.permissions:[]).filter(x=>ADMIN_PERMISSIONS.includes(x)))];
  const t=new Date().toISOString();
  const u={username,role:value.role,permissions,active:true,createdAt:t,updatedAt:t,revision:1,...hashPassword(password)};
  if(data.users.length>=40)throw Error('Максимум 40 адміністраторів');
  data.users.push(u);save();return safe(u)
 };
 const patch=(username,value)=>{
  const u=find(username);if(!u)throw Error('Акаунт не знайдено');
  if(value&&Object.hasOwn(value,'role')){
   if(!ROLES.includes(value.role))throw Error('Невідома роль');u.role=value.role
  }
  if(value&&Object.hasOwn(value,'permissions')){
   if(!Array.isArray(value.permissions)||value.permissions.some(x=>!ADMIN_PERMISSIONS.includes(x)))throw Error('Невідоме право доступу');
   u.permissions=[...new Set(value.permissions)]
  }
  if(value&&Object.hasOwn(value,'active'))u.active=value.active===true;
  if(value&&Object.hasOwn(value,'password')){
   if(typeof value.password!=='string'||value.password.length<12||value.password.length>128)throw Error('Новий пароль: 12–128 символів');
   Object.assign(u,hashPassword(value.password))
  }
  if(value&&Object.hasOwn(value,'username')){
   const n=String(value.username).trim().toLowerCase();
   if(!idValid(n)||['owner','admin','root','system','editor','operator','viewer'].includes(n)||n!==u.username&&find(n))throw Error('Логін недопустимий або вже зайнятий');
   u.username=n
  }
  u.revision=(u.revision||0)+1;u.updatedAt=new Date().toISOString();save();return safe(u)
 };
 const remove=username=>{const u=find(username);if(!u)throw Error('Акаунт не знайдено');data.users=data.users.filter(v=>v!==u);save();return {ok:true}};
 return {list,login,get,create,patch,remove};
}