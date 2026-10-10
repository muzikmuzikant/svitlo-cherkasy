'use strict';
/* Visual planner feeds the existing authenticated GitHub publishing mechanism. */
(()=>{
 const by=id=>document.getElementById(id),model=window.SvitloSchedulePlanner;
 const queues=Array.from({length:6},(_,i)=>[`${i+1}.1`,`${i+1}.2`]).flat();
 const date=by('plannerDate'),queue=by('plannerQueue'),source=by('plannerSource');
 const summary=by('plannerSummary'),status=by('plannerStatus'),grid=by('plannerGrid');
 let slots=Array(48).fill(false),dirty=false;
 function announce(value,error=false){status.textContent=value;status.className='push-state'+(error?' error':' good')}
 function draw(){
  grid.replaceChildren();
  for(let hour=0;hour<24;hour++){
   const line=document.createElement('div');line.className='planner-hour';
   const heading=document.createElement('strong');heading.textContent=model.at(hour*2);line.append(heading);
   for(let half=0;half<2;half++){
    const idx=hour*2+half,btn=document.createElement('button');btn.type='button';
    btn.className='planner-slot'+(slots[idx]?' is-off':'');
    btn.textContent=half?'30–60 хв':'00–30 хв';
    btn.setAttribute('aria-pressed',String(slots[idx]));
    btn.setAttribute('aria-label',`${model.at(idx)}–${model.at(idx+1)}: ${slots[idx]?'відключення':'за графіком світло є'}`);
    btn.onclick=()=>{slots[idx]=!slots[idx];dirty=true;draw()};line.append(btn);
   }grid.append(line);
  }
  const off=slots.filter(Boolean).length/2;
  const parts=model.toIntervals(slots).map(item=>item.join('–'));
  summary.textContent=off===0?'Планових відключень немає, 24 години без запланованих обмежень.':`Відключень: ${off.toLocaleString('uk-UA')} год · ${parts.join(', ')}`;
 }
 function stagedObj(){
  if(by('kind').value!=='overrides')throw Error('Спочатку оберіть файл «Ручні уточнення» у редакторі нижче.');
  const doc=JSON.parse(by('editor').value);validate('overrides',doc);return doc;
 }
 function currentEntry(){
  const obj=stagedObj(),d=obj.schedules.days.find(x=>x.date===date.value);
  return d?.queues?.[queue.value]||null;
 }
 function reload(){
  try{
   const entry=currentEntry();slots=entry?model.fromIntervals(entry.off||[]):Array(48).fill(false);
   if(!dirty){
    const doc=stagedObj(),d=doc.schedules.days.find(x=>x.date===date.value);
    if(d?.source)source.value=d.source;
   }
   dirty=false;draw();announce(entry?'Завантажено з поточних ручних уточнень.':'Для цієї підчерги ручних уточнень немає. Початковий стан — без планових відключень.');
  }catch(e){announce(e.message,true)}
 }
 function stage(){
  const doc=stagedObj(),url=source.value.trim(),d=date.value,q=queue.value;
  if(!/^20\d\d-\d\d-\d\d$/.test(d)||!queues.includes(q))throw Error('Оберіть дату й підчергу');
  if(!/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(url))throw Error('Для публікації потрібне посилання на офіційне повідомлення оператора');
  if(!confirm(`Підготувати графік на ${d} для підчерги ${q}? Переконайтеся, що звірили всі 48 комірок із офіційною публікацією.`))return false;
  const off=model.toIntervals(slots),existing=doc.schedules.days.find(x=>x.date===d);
  if(existing){existing.queues??={};existing.queues[q]={knownFrom:'00:00',off};existing.source=url;existing.publishedAt=new Date().toISOString();}
  else doc.schedules.days.push({date:d,source:url,publishedAt:new Date().toISOString(),verified:true,queues:{[q]:{knownFrom:'00:00',off}}});
  doc.updatedAt=new Date().toISOString();
  by('editor').value=JSON.stringify(doc,null,2);
  dirty=false;announce('Уточнення підготовлено в редакторі. Для збереження на сайті натисніть «Опублікувати» або експортуйте JSON.');
  return true;
 }
 for(const q of queues){queue.add(new Option('Підчерга '+q,q));by('plannerCopyFrom').add(new Option('Копіювати з '+q,q));}
 const pieces=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 date.value=`${pieces.year}-${pieces.month}-${pieces.day}`;
 date.onchange=reload;queue.onchange=reload;
 by('plannerLight').onclick=()=>{slots.fill(false);dirty=true;draw()};
 by('plannerCopy').onclick=()=>{
  try{const q=by('plannerCopyFrom').value,doc=stagedObj(),d=doc.schedules.days.find(x=>x.date===date.value);
   if(!d?.queues?.[q])throw Error(`Немає підготовленого графіка підчерги ${q} для цієї дати.`);
   if(!confirm(`Копіювати графік підчерги ${q} поверх вибраної ${queue.value}?`))return;
   slots=model.fromIntervals(d.queues[q].off);dirty=true;draw();announce('Графік скопійовано. Перевірте його перед публікацією.');
  }catch(e){announce(e.message,true)}
 };
 by('plannerReload').onclick=()=>{if(dirty&&!confirm('Скасувати непідготовлені зміни для цієї підчерги?'))return;dirty=false;reload()};
 by('plannerStage').onclick=()=>{try{stage()}catch(e){announce(e.message,true)}};
 by('plannerPublish').onclick=()=>{
  try{
   if(!remote||!canPublish)throw Error('Потрібен вхід до адмінпанелі та налаштований GitHub-токен на Railway. Або підготуйте зміни та експортуйте JSON.');
   if(stage())by('publish').click();
  }catch(e){announce(e.message,true)}
 };
 document.addEventListener('svitlo:admin-ready',()=>{if(by('kind').value==='overrides')reload()});
 draw();
})();
