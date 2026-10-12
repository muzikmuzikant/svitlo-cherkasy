/* Per-device message center shared with the Service Worker using IndexedDB.
 * Only public notices, subscribed queue and message text are stored on this device.
 */
(function(root){
 'use strict';
 const NAME='svitlo-inbox-v1', STORE='messages', FALLBACK='svitlo-inbox-fallback-v1';
 const MAX=160;
 function normalize(item){
  if(!item||typeof item!=='object')return null;
  const id=String(item.id||'').slice(0,150);
  if(!id)return null;
  return {id,title:String(item.title||'Повідомлення').slice(0,100),
   body:String(item.body||'').slice(0,300),kind:['schedule','emergency','announcement','push'].includes(item.kind)?item.kind:'announcement',
   at:Number.isFinite(Date.parse(item.at))?new Date(item.at).toISOString():new Date().toISOString(),
   url:typeof item.url==='string'&&/^https:\/\//.test(item.url)?item.url:'',read:!!item.read};
 }
 function db(){
  return new Promise((resolve,reject)=>{
   if(!root.indexedDB){reject(Error('IndexedDB unavailable'));return}
   const request=root.indexedDB.open(NAME,1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'})};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||Error('IDB open failed'));
  });
 }
 const fallback=()=>{
  try{const x=JSON.parse(localStorage.getItem(FALLBACK)||'[]');return Array.isArray(x)?x:[]}
  catch{return []}
 };
 const saveFallback=list=>{try{localStorage.setItem(FALLBACK,JSON.stringify(list.slice(0,MAX)))}catch{}};
 function transaction(database,mode,fn){
  return new Promise((resolve,reject)=>{
   const tx=database.transaction(STORE,mode),store=tx.objectStore(STORE);
   let result;
   try{result=fn(store)}catch(error){tx.abort();reject(error);return}
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(tx.error||Error('IDB transaction failed'));
   tx.onabort=()=>reject(tx.error||Error('IDB transaction aborted'));
  });
 }
 async function all(){
  try{
   const database=await db();
   return await new Promise((resolve,reject)=>{
    const tx=database.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>String(b.at).localeCompare(String(a.at))));
    req.onerror=()=>reject(req.error);
   });
  }catch{return fallback().sort((a,b)=>String(b.at).localeCompare(String(a.at)))}
 }
 async function add(items){
  const incoming=(Array.isArray(items)?items:[items]).map(normalize).filter(Boolean);
  if(!incoming.length)return all();
  try{
   const database=await db();
   await transaction(database,'readwrite',store=>{
    incoming.forEach(item=>{const request=store.get(item.id);request.onsuccess=()=>{
      if(!request.result)store.put(item);
    }});
   });
   const rows=await all();
   if(rows.length>MAX)await transaction(database,'readwrite',store=>rows.slice(MAX).forEach(item=>store.delete(item.id)));
  }catch{
   const previous=fallback(),keys=new Set(previous.map(x=>x.id));
   incoming.forEach(item=>{if(!keys.has(item.id)){previous.unshift(item);keys.add(item.id)}});
   saveFallback(previous.sort((a,b)=>b.at.localeCompare(a.at)));
  }
  return all();
 }
 async function mark(ids){
  const selected=new Set(ids);
  try{
   const database=await db();
   await transaction(database,'readwrite',store=>{ids.forEach(id=>{const request=store.get(id);request.onsuccess=()=>{if(request.result)store.put({...request.result,read:true})}})});
  }catch{saveFallback(fallback().map(x=>selected.has(x.id)?{...x,read:true}:x))}
 }
 async function clearRead(){
  try{
   const database=await db();
   const rows=await all();await transaction(database,'readwrite',store=>rows.filter(x=>x.read).forEach(x=>store.delete(x.id)));
  }catch{saveFallback(fallback().filter(x=>!x.read))}
 }
 root.SvitloInbox={add,all,mark,clearRead,normalize};
})(typeof window!=='undefined'?window:globalThis);
