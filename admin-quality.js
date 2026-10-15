(()=>{'use strict';
 const box=document.getElementById('scheduleQaResults'),button=document.getElementById('scheduleQaRefresh');if(!box||!button)return;
 async function load(){
  button.disabled=true;box.textContent='Перевіряємо опубліковані графіки…';
  try{
   const data=await window.svitloAdminApi('schedule/quality');
   box.replaceChildren();
   const summary=document.createElement('p');summary.textContent='Дат: '+data.days+' · Підчерг: '+data.queues+' · '+(data.ok?'Критичних помилок не знайдено':'Потрібна перевірка');box.append(summary);
   for(const e of data.issues||[]){const row=document.createElement('div');row.className='schedule-qa-item '+e.level;row.textContent=[e.level==='error'?'Помилка':'Увага',e.date,e.queue,e.message].filter(Boolean).join(' · ');box.append(row)}
   if(!data.issues?.length){const empty=document.createElement('p');empty.textContent='За структурними правилами помилок не знайдено. Це не підтверджує правильність офіційного графіка.';box.append(empty)}
  }catch(e){box.textContent='Не вдалося перевірити: '+e.message}
  finally{button.disabled=false}
 }
 button.onclick=load;document.querySelector('[data-admin-tab="sources"]')?.addEventListener('click',load);
})();
