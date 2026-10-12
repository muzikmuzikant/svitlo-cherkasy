/* Persistent notification center shared by the PWA and iOS Service Worker.
 * Single stable ID deduplicates a public announcement and its Web Push.
 */
(function(root){'use strict';
 const NAME='svitlo-inbox-v1',STORE='messages',FALLBACK='svitlo-inbox-fallback-v1',MAX=180;
 const httpImage=u=>{try{const x=new URL(String(u));return x.protocol==='https:'&&x.href.length<=900?x.href:''}catch{return ''}};
 function normalize(item){
  if(!item||typeof item!=='object')return null;
  const id=String(item.id||'').slice(0,150);if(!id)return null;
  const at=Number.isFinite(Date.parse(item.at))?new Date(item.at).toISOString():new Date().toISOString();
  const images=Array.isArray(item.images)?item.images.slice(0,6).map(httpImage).filter(Boolean):[];
  const kind=['schedule','emergency','announcement','push'].includes(item.kind)?item.kind:'announcement';
  return {id,title:String(item.title||'Повідомлення').slice(0,100),body:String(item.body||'').slice(0,350),
   content:String(item.content||'').slice(0,6000),images,kind,at,
   priority:['normal','important','urgent'].includes(item.priority)?item.priority:'normal',
   pinned:item.pinned===true,icon:String(item.icon||'').slice(0,18),
   updatedAt:typeof item.updatedAt==='string'?item.updatedAt:null,
   url:typeof item.url==='string'&&/^https:\/\//.test(item.url)?item.url:'',
   read:item.read===true,authoritative:item.authoritative===true};
 }
 function merge(previous,incoming){
  if(!previous)return incoming;
  // Public API snapshots are authoritative for edits/unpin/unpublish.
  // A short Push must NOT erase a rich message already saved by the app.
  if(incoming.authoritative)return {...previous,...incoming,read:previous.read||incoming.read};
  return {...previous,...incoming,read:previous.read||incoming.read,
   content:incoming.content||previous.content||'',
   images:incoming.images.length?incoming.images:previous.images||[],
   pinned:previous.pinned||false,updatedAt:incoming.updatedAt||previous.updatedAt||null};
 }
 function db(){return new Promise((resolve,reject)=>{
  if(!root.indexedDB)return reject(Error('No IndexedDB'));
  const req=root.indexedDB.open(NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'})};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Database unavailable'));
 })}
 function fallback(){try{const v=JSON.parse(root.localStorage.getItem(FALLBACK)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
 function saveFallback(v){try{root.localStorage.setItem(FALLBACK,JSON.stringify(v.slice(0,MAX)))}catch{}}
 const sorted=items=>items.sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||String(b.at).localeCompare(String(a.at)));
 async function all(){try{const database=await db();return await new Promise((resolve,reject)=>{
  const request=database.transaction(STORE,'readonly').objectStore(STORE).getAll();
  request.onsuccess=()=>resolve(sorted(request.result||[]));request.onerror=()=>reject(request.error);
 })}catch{return sorted(fallback())}}
 async function add(items){
  const batch=(Array.isArray(items)?items:[items]).map(normalize).filter(Boolean);if(!batch.length)return all();
  try{const database=await db();await new Promise((resolve,reject)=>{
   const tx=database.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
   for(const item of batch){const request=store.get(item.id);
    request.onsuccess=()=>store.put(merge(request.result,item))}
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  const rows=await all();
  if(rows.length>MAX){await new Promise((resolve,reject)=>{
   const tx=database.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
   // Keep unread items preferentially when pruning very old entries.
   const oldest=[...rows].sort((a,b)=>Number(!!a.read)-Number(!!b.read)||String(a.at).localeCompare(String(b.at)));
   oldest.slice(0,rows.length-MAX).forEach(x=>store.delete(x.id));
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  })}
  }catch{
   const entries=new Map(fallback().map(x=>[x.id,x]));
   for(const item of batch)entries.set(item.id,merge(entries.get(item.id),item));
   saveFallback(sorted([...entries.values()]));
  }
  return all();
 }
 async function mutate(predicate,edit){try{const database=await db();const rows=await all();
  await new Promise((resolve,reject)=>{const tx=database.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
   rows.filter(predicate).forEach(x=>{const value=edit(x);if(value)store.put(value);else store.delete(x.id)});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  })
 }catch{saveFallback(fallback().filter(x=>!predicate(x)||edit(x)).map(x=>predicate(x)?edit(x):x).filter(Boolean))}}
 async function mark(ids){const keys=new Set(ids);await mutate(x=>keys.has(x.id),x=>({...x,read:true}))}
 async function clearRead(){await mutate(x=>x.read,()=>null)}
 async function remove(id){await mutate(x=>x.id===id,()=>null)}
 async function reconcileAnnouncements(ids){
  const current=new Set(ids);
  await mutate(x=>x.id.startsWith('notice:')&&!current.has(x.id),()=>null);
 }
 root.SvitloInbox={normalize,all,add,mark,clearRead,remove,reconcileAnnouncements};
})(typeof self!=='undefined'?self:globalThis);
