export function validPushEndpoint(raw){
 if(typeof raw!=='string'||raw.length>2048)return false;
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
  const h=u.hostname.toLowerCase();
  return h.endsWith('.push.apple.com')||h==='fcm.googleapis.com'||
   h==='updates.push.services.mozilla.com'||h.endsWith('.push.services.mozilla.com')||
   h.endsWith('.googleapis.com')||h==='notify.windows.com'||h.endsWith('.notify.windows.com');
 }catch{return false}
}
