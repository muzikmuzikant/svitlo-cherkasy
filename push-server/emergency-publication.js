/* Verified emergency bulletins published directly to Railway's durable volume. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
function validate(value){
 if(!value||typeof value!=='object'||value.schemaVersion!==1||!stamp(value.lastChecked)||!Array.isArray(value.events))
  throw Error('Invalid emergency bulletin format');
 if(value.events.length>30)throw Error('Too many emergency events');
 const ids=new Set();
 for(const event of value.events){
  if(!event||typeof event!=='object'||typeof event.id!=='string'||!event.id||
     typeof event.title!=='string'||!event.title||!stamp(event.publishedAt)||
     typeof event.source!=='string'||!['active','ended','notice'].includes(event.status)||
     !Array.isArray(event.queues)||event.queues.length>12)
   throw Error('Invalid emergency event');
  if(ids.has(event.id))throw Error('Duplicate emergency event');
  ids.add(event.id);
 }
 if(Buffer.byteLength(JSON.stringify(value),'utf8')>180_000)throw Error('Emergency bulletin too large');
}
export function createEmergencyPublication({directory,token}){
 const file=path.join(directory,'railway-official-emergency.json');
 let current=null;
 try{
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  validate(raw.bulletin);
  current=raw;
 }catch(error){if(error.code!=='ENOENT')console.error('[railway-emergency] Stored data invalid; keeping public fallback:',error.message)}
 const authorized=header=>{
  if(!token||typeof header!=='string'||!header.startsWith('Bearer '))return false;
  const expected=Buffer.from(token),actual=Buffer.from(header.slice(7));
  return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
 };
 const update=bulletin=>{
  validate(bulletin);
  if(current&&stamp(bulletin.lastChecked)<stamp(current.bulletin.lastChecked))
   throw Error('Outdated emergency update refused');
  const snapshot={bulletin,publishedAt:new Date().toISOString()};
  fs.mkdirSync(directory,{recursive:true});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(snapshot));
  fs.renameSync(tmp,file);
  current=snapshot;
  return status();
 };
 const snapshot=()=>current?.bulletin||null;
 const status=()=>({ready:!!current,lastChecked:current?.bulletin.lastChecked||null,
  publishedAt:current?.publishedAt||null,count:current?.bulletin.events?.length||0,source:'railway-worker'});
 return {snapshot,status,update,authorized,file};
}
