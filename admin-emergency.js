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

$('emergencyDeskSend').onclick=async()=>{
 const button=$('emergencyDeskSend');
 if(document.body.dataset.adminRole!=='owner')return status('Термінова розсилка доступна лише власнику.',true);
 const source=$('emergencyDeskUrl').value.trim();
 if(!sourceValid(source))return status('Додайте посилання на конкретну новину або допис обленерго.',true);
 const time=Date.parse($('emergencyDeskTime').value),now=Date.now();
 if(!Number.isFinite(time)||time>now+300000||time<now-12*3600000)
  return status('Уточніть час офіційної публікації (не старше 12 годин).',true);
 if(!$('emergencyDeskConfirm').checked)return status('Спочатку підтвердьте звірку з офіційним джерелом.',true);
 const type=$('emergencyDeskStatus').value,msg=messages[type];
 if(!msg)return status('Невідомий статус.',true);
 const key=idFor(type+'|'+source+'|'+minute(time));
 const question='Опублікувати '+msg.title+' у «Вхідних» та розіслати Push усім підписаним пристроям? Перевірте час і джерело.';
 if(!confirm(question))return;
 button.disabled=true;status('Публікуємо повідомлення…');
 try{
  const config=await api('app-config');
  if(config.announcements.some(x=>x.id===key))return status('Таке повідомлення вже створено. Повторну розсилку заблоковано.');
  if(config.announcements.length>=50)throw Error('Архів із 50 повідомлень заповнений. Спочатку звільніть місце.');
  const entry={id:key,title:msg.title,body:msg.body,
   content:msg.content+'\n\nОфіційне джерело: '+source,
   kind:'emergency',priority:'urgent',queue:'all',delivery:'both',settlement:'',
   icon:type==='ended'?'✅':'⚠️',active:true,pinned:type==='active',images:[],
   publishedAt:new Date().toISOString(),updatedAt:null,scheduledAt:null,
   expiresAt:new Date(now+24*3600000).toISOString(),pushSentAt:null};
  const next={...config,announcements:[entry,...config.announcements]};
  await api('app-config',{method:'PUT',body:JSON.stringify(next)});
  status('Повідомлення у «Вхідних». Надсилаємо Push…');
  try{
   const result=await api('notices/send',{method:'POST',body:JSON.stringify({id:key,confirmSend:true})});
   status('Опубліковано. Push прийнято: '+result.accepted+' із '+result.attempted+'. Це не гарантує отримання на кожному телефоні.');
  }catch(e){
   const again=await api('app-config');
   if(again.announcements.some(x=>x.id===key&&x.pushSentAt))
    status('Опубліковано. Сервер уже відзначив відправлення Push, повтор не запускаємо.');
   else status('Опубліковано у «Вхідних», але Push не підтверджено: '+e.message,true);
  }
  $('emergencyDeskConfirm').checked=false;
 }catch(e){status('Нічого не надіслано: '+e.message,true)}
 finally{button.disabled=false}
};
document.addEventListener('svitlo:admin-logout',()=>{
 $('emergencyDeskConfirm').checked=false;status('Для відправлення потрібна авторизація.');
});
repaint();
})();
