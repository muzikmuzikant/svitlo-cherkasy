'use strict';
/* v7 admin enhancements. Reuses the authenticated api() and session state in admin.js. */
const extraGet=id=>document.getElementById(id);
const extraText=(tag,value,className='')=>{const el=document.createElement(tag);el.textContent=String(value??'—');if(className)el.className=className;return el};
const extraDate=stamp=>{const n=Date.parse(stamp||'');return Number.isFinite(n)?new Date(n).toLocaleString('uk-UA',{dateStyle:'medium',timeStyle:'short'}):'немає даних'};
let helpDraft=null,selectedHelpId='',monitorBusy=false;
function setTab(tab){
 if(!remote)return;
 document.querySelectorAll('[data-admin-tab]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.adminTab===tab)));
 document.querySelectorAll('[data-admin-panel]').forEach(el=>{el.hidden=el.dataset.adminPanel!==tab});
 if(tab==='overview'||tab==='sources')refreshMonitor();
 if(tab==='feedback')refreshTickets();
 if(tab==='push')refreshPushStatus();
 if(tab==='help')refreshHelp();
 if(tab==='audit')refreshAudit();
}
document.querySelectorAll('[data-admin-tab]').forEach(btn=>btn.addEventListener('click',()=>setTab(btn.dataset.adminTab)));
async function refreshMonitor(){
 if(!remote||monitorBusy)return;monitorBusy=true;
 const status=extraGet('monitorMessage');status.className='push-state';status.textContent='Перевіряємо сервер та офіційні дані…';
 try{
  const j=await api('monitor'),source=j.sources||{},sched=source.schedules||{},review=source.review||{},emergency=source.emergency||{},push=j.server||{},tickets=j.feedback||{};
  const cards=[
    ['Push-підписки',push.pushSubscribers??'—'],
    ['Нові звернення',tickets.new??'—'],
    ['Опубліковані дні',sched.days?.length??'—'],
    ['Підозрілі публікації',review.rejectedCount??'—'],
    ['Остання перевірка джерела',sched.lastChecked?extraDate(sched.lastChecked):'Немає даних'],
    ['Остання перевірка Push',push.lastPushCheck?extraDate(push.lastPushCheck):'Немає даних']
  ];
  const grid=extraGet('monitorMetrics');grid.replaceChildren();cards.forEach(([label,value])=>{const tile=document.createElement('div');tile.className='metric';tile.append(extraText('strong',value),extraText('span',label));grid.append(tile)});
  const failures=Object.entries(source).filter(([,item])=>item.error).map(([name,item])=>name+': '+item.error);
  const stale=sched.lastChecked&&Date.now()-Date.parse(sched.lastChecked)>2*3600_000;
  status.className='push-state'+(failures.length||push.pushCheckError?' error':' good');
  status.textContent=[failures.length?'Деякі джерела недоступні: '+failures.join('; '):'Джерела відповідають.',stale?'Увага: перевірка графіка була понад 2 години тому.':'',push.pushCheckError?'Push: '+push.pushCheckError:''].filter(Boolean).join('\n');
  const overview=extraGet('sourceOverview');overview.className='push-state'+(review.rejectedCount?' error':' good');
  overview.textContent=`Графіки: ${sched.days?.length??'—'} днів · Перевірено: ${extraDate(sched.lastChecked)}\n`+
   `Екстрені бюлетені: ${emergency.count??'—'} · Перевірено: ${extraDate(emergency.lastChecked)}\n`+
   `Відхилено підозрілих публікацій: ${review.rejectedCount??'—'} · Оновлено: ${extraDate(review.lastChecked)}`;
  const issues=extraGet('sourceIssues');issues.replaceChildren();
  if(!Array.isArray(review.items)||!review.items.length){issues.append(extraText('p',review.error?'Не вдалося отримати журнал перевірок: '+review.error:'Підозрілих дат під час останньої перевірки не виявлено.','hint'))}
  else review.items.forEach(item=>{
   const card=document.createElement('article');card.className='review-item';
   card.append(extraText('strong','Потрібна перевірка: '+(item.headlineDate||'дата невідома')));
   card.append(extraText('p','Опубліковано: '+extraDate(item.publishedAt)));
   card.append(extraText('p',item.reason));
   if(/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(item.source||'')){
    const a=document.createElement('a');a.href=item.source;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Відкрити оригінал на сайті оператора ↗';card.append(a)
   }issues.append(card)
  });
 }catch(e){status.className='push-state error';status.textContent='Не вдалося перевірити систему: '+e.message}
 finally{monitorBusy=false}
}
extraGet('monitorRefresh').addEventListener('click',refreshMonitor);
extraGet('sourceRefresh').addEventListener('click',refreshMonitor);

function drawHelpPicker(){
 const picker=extraGet('helpArticlePicker');picker.replaceChildren();
 (helpDraft?.articles||[]).forEach(item=>picker.add(new Option(item.question,item.id)));
 if(selectedHelpId&&helpDraft.articles.some(x=>x.id===selectedHelpId))picker.value=selectedHelpId;
 else selectedHelpId=helpDraft.articles[0]?.id||'';
 picker.value=selectedHelpId;
 fillHelp();
}
function fillHelp(){
 const item=helpDraft?.articles.find(x=>x.id===selectedHelpId);
 extraGet('helpCategory').value=item?.category||'';
 extraGet('helpQuestion').value=item?.question||'';
 extraGet('helpAnswer').value=item?.answer||'';
}
function applyHelp(){
 if(!helpDraft)throw Error('Спочатку завантажте статті');
 const category=extraGet('helpCategory').value.trim(),question=extraGet('helpQuestion').value.trim(),answer=extraGet('helpAnswer').value.trim();
 if(category.length<3||question.length<8||answer.length<20)throw Error('Заповніть категорію (3+), запитання (8+) та відповідь (20+)');
 const pos=helpDraft.articles.findIndex(x=>x.id===selectedHelpId);
 if(pos<0){selectedHelpId='article-'+Date.now().toString(36);helpDraft.articles.push({id:selectedHelpId,category,question,answer})}
 else helpDraft.articles[pos]={...helpDraft.articles[pos],category,question,answer};
 drawHelpPicker();extraGet('helpState').textContent='Зміни готові — натисніть «Зберегти Центр допомоги».';
}
async function refreshHelp(){
 if(!remote)return;
 try{
  const result=await api('help');
  helpDraft={articles:result.articles.map(x=>({...x})),banner:{...result.banner}};
  selectedHelpId=helpDraft.articles[0]?.id||'';drawHelpPicker();
  extraGet('noticeTitle').value=helpDraft.banner.title||'';extraGet('noticeBody').value=helpDraft.banner.message||'';
  extraGet('noticeEnabled').checked=!!helpDraft.banner.enabled;
  extraGet('helpState').textContent='Завантажено '+helpDraft.articles.length+' статей.';
 }catch(e){extraGet('helpState').textContent='Помилка завантаження: '+e.message}
}
extraGet('helpArticlePicker').addEventListener('change',ev=>{selectedHelpId=ev.target.value;fillHelp()});
extraGet('helpNew').addEventListener('click',()=>{selectedHelpId='';fillHelp();extraGet('helpQuestion').focus();extraGet('helpState').textContent='Нова стаття. Заповніть поля і натисніть «Застосувати у списку».'});
extraGet('helpApply').addEventListener('click',()=>{try{applyHelp()}catch(e){extraGet('helpState').textContent=e.message}});
extraGet('helpDelete').addEventListener('click',()=>{
 if(!helpDraft||!selectedHelpId)return;
 if(!confirm('Видалити вибрану статтю? Зміна набере чинності після збереження.'))return;
 helpDraft.articles=helpDraft.articles.filter(x=>x.id!==selectedHelpId);selectedHelpId='';drawHelpPicker();extraGet('helpState').textContent='Статтю вилучено зі списку. Збережіть зміни.';
});
extraGet('helpPublish').addEventListener('click',async()=>{
 if(!remote||!helpDraft)return;
 const btn=extraGet('helpPublish');btn.disabled=true;
 try{
  // Save the visible form even when the administrator forgets to click Apply.
  const current=helpDraft.articles.find(x=>x.id===selectedHelpId);
  const next={category:extraGet('helpCategory').value.trim(),question:extraGet('helpQuestion').value.trim(),answer:extraGet('helpAnswer').value.trim()};
  if((current&&Object.keys(next).some(k=>next[k]!==current[k]))||(!selectedHelpId&&Object.values(next).some(Boolean)))applyHelp();
  helpDraft.banner={enabled:extraGet('noticeEnabled').checked,title:extraGet('noticeTitle').value.trim(),message:extraGet('noticeBody').value.trim()};
  const saved=await api('help',{method:'PUT',body:JSON.stringify(helpDraft)});
  extraGet('helpState').textContent='Збережено '+saved.articles.length+' статей. Зміни вже доступні через Railway.';
  await refreshAudit();
 }catch(e){extraGet('helpState').textContent='Не вдалося зберегти: '+e.message}finally{btn.disabled=false}
});
async function refreshAudit(){
 if(!remote)return;const list=extraGet('auditList');list.replaceChildren(extraText('p','Отримуємо журнал…'));
 try{
  const result=await api('audit');list.replaceChildren();
  if(!result.events.length){list.append(extraText('p','Поки немає записів.','hint'));return}
  result.events.forEach(e=>{
   const card=document.createElement('div');card.className='review-item';card.append(extraText('strong',e.action),extraText('small',extraDate(e.at)));
   if(e.details)card.append(extraText('p',e.details));list.append(card)
  });
 }catch(e){list.replaceChildren(extraText('p','Не вдалося прочитати журнал: '+e.message))}
}
extraGet('auditRefresh').addEventListener('click',refreshAudit);
function filterTickets(){
 const q=extraGet('ticketSearch').value.toLocaleLowerCase('uk-UA').trim(),status=extraGet('ticketFilter').value;
 document.querySelectorAll('#ticketsList .ticket').forEach(card=>{card.hidden=!!q&&!card.textContent.toLocaleLowerCase('uk-UA').includes(q)||(status!=='all'&&card.querySelector('select')?.value!==status)})
}
extraGet('ticketSearch').addEventListener('input',filterTickets);extraGet('ticketFilter').addEventListener('change',filterTickets);
document.addEventListener('svitlo:tickets-loaded',filterTickets);
extraGet('ticketExport').addEventListener('click',async()=>{
 try{
  const result=await api('feedback');if(!confirm('Завантажити '+result.count+' звернень, зокрема email (якщо вказані), у приватний JSON-файл? Не публікуйте його.'))return;
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),items:result.items},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='svitlo-feedback-private-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)
 }catch(e){alert('Експорт не вдався: '+e.message)}
});
document.addEventListener('svitlo:admin-ready',()=>setTab('overview'));
document.addEventListener('svitlo:admin-logout',()=>{helpDraft=null;selectedHelpId=''});
