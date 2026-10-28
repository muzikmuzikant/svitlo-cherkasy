/* Private Web Push subscriptions for administrators. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createAdminPushStore({directory,webpush,publicKey,privateKey,contact}){
 const file=path.join(directory,'admin-push-subscriptions.json');
 let entries={};
 try{const parsed=JSON.parse(fs.readFileSync(file,'utf8'));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))entries=parsed}catch(e){if(e.code!=='ENOENT')console.warn('Admin push store could not be read:',e.message)}
 const persist=()=>{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(entries));fs.renameSync(tmp,file)};
 if(publicKey&&privateKey&&contact){try{webpush.setVapidDetails(contact,publicKey,privateKey)}catch(e){console.warn('Admin push VAPID setup failed:',e.message)}}
 const valid=s=>s&&typeof s==='object'&&typeof s.endpoint==='string'&&s.endpoint.startsWith('https://')&&s.keys&&typeof s.keys.p256dh==='string'&&typeof s.keys.auth==='string';
 return {
  publicKey,
  subscribe(subscription,username){
   if(!valid(subscription))throw Object.assign(new Error('Некоректна push-підписка'),{statusCode:400});
   const id=crypto.createHash('sha256').update(subscription.endpoint).digest('hex');
   entries[id]={subscription,username:String(username||'admin').slice(0,80),updatedAt:new Date().toISOString()};
   persist();return {ok:true,subscribed:true};
  },
  unsubscribe(endpoint){
   if(typeof endpoint!=='string'||!endpoint.startsWith('https://'))throw Object.assign(new Error('Некоректна push-підписка'),{statusCode:400});
   const id=crypto.createHash('sha256').update(endpoint).digest('hex');
   if(entries[id]){delete entries[id];persist()}return {ok:true,subscribed:false};
  },
  async notify(ticket){
   const payload=JSON.stringify({title:'Світло Черкаси · нове звернення',body:'Надійшло нове звернення до служби підтримки. Відкрийте «Світло Адмін».',tag:'svitlo-admin-ticket-'+String(ticket?.id||Date.now()),url:'./admin.html'});
   const results=await Promise.allSettled(Object.entries(entries).map(async([id,item])=>{
    try{await webpush.sendNotification(item.subscription,payload,{TTL:120,urgency:'high'});return true}
    catch(e){if(e.statusCode===404||e.statusCode===410){delete entries[id];persist()}throw e}
   }));
   const delivered=results.filter(x=>x.status==='fulfilled').length;
   const failed=results.length-delivered;
   if(failed)console.warn('[admin-push] delivery incomplete delivered='+delivered+' failed='+failed);
   console.info('[admin-push] new-ticket push delivered='+delivered+' failed='+failed+' subscriptions='+results.length);
   return {delivered,failed,subscriptions:results.length};
  },
  count:()=>Object.keys(entries).length
 };
}
