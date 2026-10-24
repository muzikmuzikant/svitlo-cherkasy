/* Optional new-ticket notifications through Telegram Bot API.
 * Only the ticket reference and topic are sent. Never forward message text,
 * photos, email, IP, private access token, diagnostics, or attachment IDs.
 */
const TOPICS={bug:'Помилка застосунку',address:'Адреса або підчерга',
 schedule:'Графік відключень',push:'Сповіщення',idea:'Пропозиція',other:'Інше'};
export function createSupportTicketNotifier({
 token=process.env.SUPPORT_TELEGRAM_BOT_TOKEN||'',
 chatIds=process.env.SUPPORT_TELEGRAM_CHAT_IDS||'',
 fetchImpl=fetch
}={}){
 const key=String(token||'').trim();
 const targets=[...new Set(String(chatIds||'').split(',').map(x=>x.trim())
  .filter(x=>/^-?[0-9]{5,18}$/.test(x)))].slice(0,6);
 const enabled=/^[0-9]{5,12}:[A-Za-z0-9_-]{30,}$/.test(key)&&targets.length>0;
 const recent=new Set();
 async function notify(ticket){
  if(!enabled||!/^SC-[A-F0-9]{10}$/.test(String(ticket?.id||'')))return {enabled,delivered:0};
  const id=ticket.id;
  if(recent.has(id))return {enabled,delivered:0,duplicate:true};
  recent.add(id);
  if(recent.size>400)recent.delete(recent.values().next().value);
  const topic=Object.hasOwn(TOPICS,ticket.topic)?TOPICS[ticket.topic]:'Нове звернення';
  const text='📨 Нове звернення у «Світло Черкаси»\n'+
   'Номер: '+id+'\nКатегорія: '+topic+
   '\nВідкрийте адмінпанель, щоб переглянути звернення.';
  const requests=await Promise.allSettled(targets.map(async chat_id=>{
   const response=await fetchImpl('https://api.telegram.org/bot'+key+'/sendMessage',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id,text,disable_web_page_preview:true}),
    signal:AbortSignal.timeout(8000)
   });
   if(!response.ok)throw Error('Telegram HTTP '+response.status);
   return true;
  }));
  const delivered=requests.filter(x=>x.status==='fulfilled').length;
  if(delivered!==targets.length)console.warn('Support alert delivery incomplete: '+delivered+'/'+targets.length);
  return {enabled,delivered};
 }
 return {enabled,notify};
}
