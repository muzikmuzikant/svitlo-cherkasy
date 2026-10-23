/* Rapid GAV fallback: owner-confirmed official information, no guessed outage times. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const panel=document.querySelector('[data-admin-panel="emergency"]');
if(!panel)return;
const api=(route,options)=>window.svitloAdminApi(route,options);
const messages={
 active:{title:'⚠️ Аварійні відключення застосовано',
 body:'Оператор повідомив про ГАВ. Погодинні графіки залишаються доступними, але фактичні відключення можуть відрізнятися.',
 content:'## Аварійні відключення (ГАВ)\nЗа інформацією оператора, у Черкаській області застосовано аварійні відключення. Точні години за адресами можуть не публікуватися.\n\nПогодинний графік (ГПВ) доступний у застосунку як планова інформація, але через ГАВ фактичні відключення можуть відрізнятися. Це не підтвердження відключення саме у вашому будинку.'},
 ended:{title:'✅ Аварійні відключення скасовано',
 body:'Оператор повідомив про скасування ГАВ. Перевіряйте чинний погодинний графік; відновлення за адресою може зайняти час.',
 content:'## ГАВ скасовано\nОператор оголосив завершення аварійних обмежень. Планові погодинні графіки залишаються доступними. Це не означає, що електропостачання вже відновлено за кожною адресою.'}
};
const status=(t,error=false)=>{const root=$('emergencyDeskResult');root.textContent=t;root.className='push-state'+(error?' error':' good')};
const sourceValid=raw=>{
 try{const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.hash)return false;
  return /^https:\/\/(?:www\.)?cherkasyoblenergo\.com\/media\/[A-Za-z0-9/_-]+(?:\?[^#]*)?$/.test(u.href)||
   /^https:\/\/t\.me\/pat_cherkasyoblenergo\/[0-9]{1,12}$/.test(u.href);
 }catch{return false}
};
const minute=iso=>new Date(iso).toISOString().slice(0,16)+'Z';
const idFor=text=>{
 let a=2166136261,b=2166136261;
 for(const c of text){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^(c.charCodeAt(0)+3),16777619)}
 return 'n_gav_'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
};
function repaint(){
 const x=messages[$('emergencyDeskStatus').value];
 $('emergencyDeskTitle').textContent=x.title;
 $('emergencyDeskBody').textContent=x.body;
}
function localNow(){
 const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
$('emergencyDeskTime').value=localNow();
$('emergencyDeskStatus').addEventListener('change',repaint);
$('emergencyDeskEditor').onclick=()=>document.querySelector('[data-admin-tab="operations"]')?.click();
$('emergencyDeskCheck').onclick=async()=>{
 const output=$('emergencyDeskSource');output.textContent='Звіряємо збережені офіційні дані…';
 try{
  const res=await fetch('./data/emergency.json?ts='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const info=await res.json(),items=(info.events||[]).filter(x=>['active','ended'].includes(x.status));
  output.textContent=items.length?
   'В останньому опублікованому файлі: '+items[0].title+' (час '+items[0].publishedAt+'). Перевірте актуальність джерела.':
   'У публічному файлі немає підтверджених активних або скасованих ГАВ. Це НЕ доводить відсутність події.';
  if(items[0]&&sourceValid(items[0].source)){
   $('emergencyDeskUrl').value=items[0].source;
   const d=new Date(items[0].publishedAt);
   if(Number.isFinite(d.getTime()))$('emergencyDeskTime').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
   $('emergencyDeskStatus').value=items[0].status;repaint();
  }
 }catch(e){output.textContent='Автоматичне джерело недоступне: '+e.message+'. Перевірте офіційну публікацію вручну.'}
};
