'use strict';
/* Owner-controlled schedule publication review. Never infer hours from a
 * malformed source. An explicit confirmation is required for all 12 queues.
 */
(()=>{
 const by=id=>document.getElementById(id);
 const QUEUES=Array.from({length:6},(_,i)=>[1,2].map(j=>String(i+1)+'.'+j)).flat();
 let state=null,issue=null,opened=false,busy=false;
 const msg=(text,ok=false)=>{const out=by('reviewApprovalStatus');out.textContent=text;out.className='push-state'+(ok?' good':'')};
 const owner=()=>document.body.dataset.adminRole==='owner';
 const official=url=>/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\/media\/[A-Za-z0-9/_-]+(?:\?[^#]*)?$/i.test(url||'');
 const dateValid=x=>/^20\d\d-\d\d-\d\d$/.test(x||'');
 function decode(text,q){
  const result=[];let prev=0;
  const stamp=(time,end)=>{
   if(time==='24:00'&&end)return 1440;
   if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Підчерга '+q+': невірний час '+time);
   return Number(time.slice(0,2))*60+Number(time.slice(3));
  };
  for(const part of String(text||'').split(/[,;]/).map(s=>s.trim()).filter(Boolean)){
   const m=/^(\d\d:\d\d)\s*[-–]\s*(\d\d:\d\d)$/.exec(part);
   if(!m)throw Error('Підчерга '+q+': використовуйте 08:00-11:00, 16:00-19:30');
   const start=stamp(m[1],false),end=stamp(m[2],true);
   if(start<prev||start>=end)throw Error('Підчерга '+q+': інтервали перетинаються або не відсортовані');
   prev=end;result.push([m[1],m[2]]);
  }
  return result;
 }
 function showReport(){
  if(!opened||!state)return;
  const panel=by('reviewApprovalPanel');
  const date=by('reviewApprovalDate').value;
  const prior=state.days.find(x=>x.date===date);
  const existing=state.approvals.find(x=>x.date===date);
  by('reviewApprovalNote').textContent=
   (prior?'Попередній підтверджений графік підставлено для порівняння. Перевірте КОЖНУ годину з новиною.':'Раніше підтвердженого графіка на цю дату немає. Порожнє поле означає відсутність оголошених відключень.')+
   (existing?' Є збережене ручне підтвердження від '+new Date(existing.approvedAt).toLocaleString('uk-UA')+'.':'');
  const list=by('reviewApprovalQueues');list.replaceChildren();
  for(const q of QUEUES){
   const field=document.createElement('div');field.className='field';
   const label=document.createElement('label');label.textContent='Підчерга '+q;label.htmlFor='approvalQueue'+q.replace('.','_');
   const input=document.createElement('input');input.id=label.htmlFor;input.dataset.reviewQueue=q;
   input.placeholder='Напр. 08:00-10:00, 17:30-19:00';
   input.value=(prior?.queues?.[q]?.off||[]).map(x=>x.join('-')).join(', ');
   input.disabled=!owner();field.append(label,input);list.append(field);
  }
  by('reviewApprovalConfirmed').checked=false;by('reviewApprovalConfirmed').disabled=!owner();
  by('reviewApprovalSubmit').disabled=!owner();
  by('reviewApprovalCancel').disabled=!owner()||!existing;
  msg('Натисніть «Підтвердити» лише після звірки із сайтом оператора.');
 }
 function open(selected){
  if(!remote){return}
  opened=true;issue=selected;
  const panel=by('reviewApprovalPanel');panel.hidden=false;
  by('reviewApprovalSource').value=issue?.source||'';
  by('reviewApprovalDate').value=issue?.targetDate||issue?.headlineDate||'';
  by('reviewApprovalDate').max=''; // calendar remains available for headline date mistakes
  showReport();panel.scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function load(){
  if(!remote)return;
  try{
   state=await api('schedule/review');
   if(opened&&issue){
    const updated=state.issues.find(x=>x.source===issue.source);
    if(updated)issue=updated;
    showReport();
   }
  }catch(error){msg('Помилка завантаження перевірок: '+error.message)}
 }
 async function approve(){
  if(busy||!owner()||!issue)return;
  if(by('reviewApprovalConfirmed').checked!==true){msg('Спершу підтвердьте звірку всіх 12 підчерг із офіційним джерелом.');return}
  const date=by('reviewApprovalDate').value,source=by('reviewApprovalSource').value;
  if(!dateValid(date)||!official(source)){msg('Вкажіть дату та дійсне офіційне посилання.');return}
  const queues={};
  try{
   for(const input of by('reviewApprovalQueues').querySelectorAll('[data-review-queue]'))queues[input.dataset.reviewQueue]=decode(input.value,input.dataset.reviewQueue);
   if(Object.keys(queues).length!==12)throw Error('Не заповнений перелік підчерг');
  }catch(e){msg(e.message);return}
  busy=true;by('reviewApprovalSubmit').disabled=true;msg('Зберігаємо підтвердження на Railway…');
  try{
   const result=await api('schedule/review/approve',{method:'POST',body:JSON.stringify({
    date,source,sourceHash:issue.sourceHash||undefined,queues,confirmed:true
   })});
   msg('Графік на '+result.date+' підтверджено. Він збережений на сервері й не буде стертий наступною перевіркою.',true);
   opened=false;by('reviewApprovalPanel').hidden=true;
   await refreshMonitor();await load();
  }catch(e){msg('Не вдалося підтвердити графік: '+e.message)}
  finally{busy=false;by('reviewApprovalSubmit').disabled=false}
 }
 async function revoke(){
  if(busy||!owner())return;
  const date=by('reviewApprovalDate').value;
  if(!dateValid(date)||!state?.approvals.some(x=>x.date===date)){msg('Для цієї дати немає підтвердження.');return}
  if(!window.confirm('Скасувати ручне підтвердження на '+date+'? Нерозпізнана офіційна публікація знову буде на перевірці.'))return;
  busy=true;
  try{await api('schedule/review/approval',{method:'DELETE',body:JSON.stringify({date})});
   msg('Ручне підтвердження скасовано.',true);
   opened=false;by('reviewApprovalPanel').hidden=true;
   await refreshMonitor();await load();
  }catch(e){msg('Помилка: '+e.message)}
  finally{busy=false}
 }
 by('reviewApprovalClose').onclick=()=>{opened=false;by('reviewApprovalPanel').hidden=true};
 by('reviewApprovalDate').addEventListener('change',showReport);
 by('reviewApprovalSubmit').onclick=approve;
 by('reviewApprovalCancel').onclick=revoke;
 document.addEventListener('svitlo:admin-ready',load);
 document.addEventListener('svitlo:admin-logout',()=>{state=null;issue=null;opened=false;by('reviewApprovalPanel').hidden=true});
 window.SvitloSourceReview={open,load};
})();
