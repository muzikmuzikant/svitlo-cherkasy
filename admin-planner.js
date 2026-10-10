'use strict';
// Accessible visual editor. Only authorized GitHub proxy can publish changes.
(() => {
 const core=window.SvitloSchedulePlanner;
 const by=id=>document.getElementById(id);
 const slots=new Map(),dirty=new Set(); let day='',queue='1.1',publicDays=[],ready=false,suggestedSource='';
 const status=(text,bad=false)=>{const n=by('plannerStatus');n.textContent=text;n.className='push-state'+(bad?' error':' good')};
 const dateToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const key=(d,q)=>d+'|'+q;
 const selected=()=>{if(!day||!core.QUEUES.includes(queue))throw Error('Оберіть дату та підчергу');return key(day,queue)};
 function currentSlots(){const k=selected();if(!slots.has(k))slots.set(k,startingSlots(day,queue));return slots.get(k)}
 function startingSlots(d,q){
   const manual=readManual(d,q);const official=publicDays.find(x=>x.date===d)?.queues?.[q];
   try{return core.slotsFromOff((manual||official)?.off||[])}catch{return Array(48).fill(false)}
 }
 function readManual(d,q){
  try{const src=JSON.parse(by('editor').value);return src.schedules?.days?.filter(x=>x.date===d&&x.verified).reverse().find(x=>x.queues?.[q])?.queues[q]||null}catch{return null}
 }
 function paint(index,val){const arr=currentSlots();dirty.add(selected());arr[index]=val;document.querySelectorAll('#plannerGrid [data-index]').forEach(n=>{if(+n.dataset.index!==index)return;n.classList.toggle('is-off',val);n.setAttribute('aria-pressed',String(val));n.title=core.tick(index)+'–'+core.tick(index+1)+' · '+(val?'відключення':'за графіком світло')});renderSummary()}
 function renderSummary(){const spans=core.intervals(currentSlots());const hours=spans.reduce((sum,pair)=>sum+(core.mins(pair[1])-core.mins(pair[0]))/60,0);by('plannerSummary').textContent=spans.length?`Підчерга ${queue} · ${hours.toLocaleString('uk-UA')} год без світла · ${spans.map(pair=>pair.join('–')).join(', ')}`:`Підчерга ${queue} · За графіком відключень немає (0 годин).`}
 function syncSource(){const input=by('plannerSource'),official=publicDays.find(x=>x.date===day)?.source||'';if(!input.value.trim()||input.value.trim()===suggestedSource){input.value=official;suggestedSource=official}}
 function renderGrid(){const grid=by('plannerGrid');grid.replaceChildren();for(let h=0;h<24;h++){
   const row=document.createElement('div');row.className='planner-hour';const label=document.createElement('strong');label.textContent=String(h).padStart(2,'0')+':00';row.append(label);
   for(let p=0;p<2;p++){const i=h*2+p,b=document.createElement('button');b.type='button';b.className='planner-slot'+(currentSlots()[i]?' is-off':'');b.dataset.index=String(i);b.textContent=core.tick(i)+'–'+core.tick(i+1);b.title='Натисніть, щоб змінити';b.setAttribute('aria-pressed',String(currentSlots()[i]));b.setAttribute('aria-label',b.textContent+' · '+(currentSlots()[i]?'за графіком немає світла':'за графіком світло'));b.addEventListener('click',()=>paint(i,!currentSlots()[i]));row.append(b)}grid.append(row)}renderSummary();}
 async function getData(){try{const r=await fetch('./data/schedules.json?nocache='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);publicDays=(await r.json()).days||[];for(const k of slots.keys())if(!dirty.has(k))slots.delete(k);syncSource();status('Графіки завантажені. Натискайте півгодини, щоб указати відключення.')}catch(e){status('Не вдалося завантажити публічний графік: '+e.message,true)}renderGrid()}
 async function stage(){
   if(!remote)throw Error('Увійдіть до адмінпанелі.');
   const date=by('plannerDate').value,source=by('plannerSource').value.trim();
   if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))throw Error('Укажіть дату');
   if(!/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(source))throw Error('Потрібне посилання на відповідну офіційну публікацію');
   if(by('kind').value!=='overrides'){by('kind').value='overrides';await load()}
   const obj=staging();const changed=[...slots].filter(([k])=>k.startsWith(date+'|'));
   if(!changed.length)throw Error('Спочатку оберіть та відредагуйте підчергу');
   if(!confirm('Підтверджуєте, що всі вибрані інтервали звірено з офіційною публікацією на '+date+'?'))return false;
   let entry=obj.schedules.days.find(x=>x.date===date&&x.source===source);
   if(!entry){entry={date,source,publishedAt:new Date().toISOString(),verified:true,queues:{}};obj.schedules.days.push(entry)}
   for(const [k,value] of changed){const q=k.split('|')[1];entry.queues[q]={knownFrom:'00:00',off:core.intervals(value)}}
   obj.updatedAt=new Date().toISOString();staged(obj,'Підготовлено '+changed.length+' підчерг на '+date+'.');status('Підготовлено '+changed.length+' підчерг. Для публікації потрібен доступ Railway до GitHub.');return true;
 }
 const today=dateToday();by('plannerDate').value=today;day=today;
 core.QUEUES.forEach(q=>{by('plannerQueue').add(new Option('Підчерга '+q,q));by('plannerCopyFrom').add(new Option('З підчерги '+q,q))});by('plannerQueue').value=queue;
 by('plannerDate').addEventListener('change',e=>{day=e.target.value;syncSource();renderGrid();if(!publicDays.some(x=>x.date===day&&x.verified===true))status('На цю дату немає підтвердженого імпортованого графіка. Перш ніж публікувати, звірте його з оператором.',true)});
 by('plannerQueue').addEventListener('change',e=>{queue=e.target.value;renderGrid()});
 by('plannerLight').addEventListener('click',()=>{dirty.add(selected());slots.set(selected(),Array(48).fill(false));renderGrid()});
 by('plannerCopy').addEventListener('click',()=>{const from=by('plannerCopyFrom').value;if(!from)return;dirty.add(selected());slots.set(selected(),[...(slots.get(key(day,from))||startingSlots(day,from))]);renderGrid();status('Скопійовано з '+from+'. Перевірте офіційне джерело перед публікацією.')});
 by('plannerReload').addEventListener('click',()=>{if(!confirm('Скасувати незбережені зміни для цієї підчерги?'))return;dirty.delete(selected());slots.delete(selected());renderGrid()});
 by('plannerStage').addEventListener('click',async()=>{try{await stage()}catch(e){status(e.message,true)}});
 by('plannerPublish').addEventListener('click',async()=>{try{if(!canPublish)throw Error('Для прямої публікації у Railway потрібно задати GITHUB_TOKEN та GITHUB_REPOSITORY. Можна підготувати JSON і завантажити його вручну.');if(await stage())by('publish').click()}catch(e){status(e.message,true)}});
 document.addEventListener('svitlo:admin-ready',()=>{ready=true;getData()});
 document.addEventListener('svitlo:admin-logout',()=>{ready=false;slots.clear();dirty.clear();status('Увійдіть, щоб редагувати графіки.')});
 renderGrid();
})();
