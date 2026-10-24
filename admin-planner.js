'use strict';
/* The editor starts from the verified CURRENT Railway publication, not an empty manual JSON.
 * Nothing reaches the public schedule until the owner explicitly stages and publishes.
 */
(()=>{
 const by=id=>document.getElementById(id),model=window.SvitloSchedulePlanner;
 if(!by('plannerGrid')||!model)return;
 const queues=Array.from({length:6},(_,i)=>[String(i+1)+'.1',String(i+1)+'.2']).flat();
 const date=by('plannerDate'),queue=by('plannerQueue'),source=by('plannerSource');
 const summary=by('plannerSummary'),status=by('plannerStatus'),grid=by('plannerGrid');
 const from=by('plannerCopyFrom'),fromDate=by('plannerCopyDate');
 const importButton=by('plannerImport');
 let slots=Array(48).fill(false),dirty=false,knownFrom='00:00';
 let published=null,lastFetch=0,pending=null,selectionId=0,loadedDate='',loadedQueue='';
 const isOfficial=url=>/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//i.test(url||'');
 function announce(value,error=false){status.textContent=value;status.className='push-state'+(error?' error':' good')}
 function draw(){
  grid.replaceChildren();
  const fromIndex=model.indexOf(knownFrom);
  for(let hour=0;hour<24;hour++){
   const line=document.createElement('div');line.className='planner-hour';
   const label=document.createElement('strong');label.textContent=model.at(hour*2);line.append(label);
   for(let half=0;half<2;half++){
    const idx=hour*2+half,btn=document.createElement('button');btn.type='button';
    btn.className='planner-slot'+(slots[idx]?' is-off':'');
    btn.textContent=half?'30–60 хв':'00–30 хв';
    btn.disabled=fromIndex>0&&idx<fromIndex;
    btn.setAttribute('aria-pressed',String(slots[idx]));
    btn.setAttribute('aria-label',model.at(idx)+'–'+model.at(idx+1)+': '+(btn.disabled?'час не підтверджений':slots[idx]?'відключення':'за графіком світло є'));
    btn.onclick=()=>{slots[idx]=!slots[idx];dirty=true;draw()};line.append(btn);
   }grid.append(line);
  }
  const off=slots.filter(Boolean).length/2;
  const parts=model.toIntervals(slots).map(x=>x.join('–'));
  summary.textContent=(knownFrom!=='00:00'?'До '+knownFrom+' дані не підтверджені. ':'')+
   (off===0?'Планових відключень у підтверджений час немає.':'Відключень: '+off.toLocaleString('uk-UA')+' год · '+parts.join(', '));
 }
 function stagedDoc(){
  if(by('kind').value!=='overrides')throw Error('У редакторі оберіть файл «Ручні уточнення».');
  const doc=JSON.parse(by('editor').value);validate('overrides',doc);return doc;
 }
 function findEntry(document,dateText,queueText){
  const day=document?.days?.find(d=>d.date===dateText&&d.verified===true);
  const item=day?.queues?.[queueText];
  if(!item||!Array.isArray(item.off))return null;
  return {off:item.off,knownFrom:item.knownFrom||'00:00',
   source:day.queueSources?.[queueText]||day.source||'',origin:'опублікований графік'};
 }
 function manualEntry(document,dateText,queueText){
  const day=document?.schedules?.days?.find(d=>d.date===dateText);
  const item=day?.queues?.[queueText];
  if(!item||!Array.isArray(item.off))return null;
  return {off:item.off,knownFrom:item.knownFrom||'00:00',
   source:day.source||'',origin:'підготовлене ручне уточнення'};
 }
 async function current(force=false){
  if(!force&&published&&Date.now()-lastFetch<30000)return published;
  if(pending)return pending;
  pending=(async()=>{
   let base='';
   try{
    const configured=by('server')?.value.trim();
    if(configured&&new URL(configured).protocol==='https:')base=new URL(configured).origin;
    else{
     const response=await fetch('./push-config.json',{cache:'no-store'});
     if(!response.ok)throw Error('Налаштування API недоступні');
     base=new URL((await response.json()).apiBase).origin;
    }
    if(!base.startsWith('https://'))throw Error('Потрібен HTTPS');
    const response=await fetch(base+'/api/data/schedules.json?t='+Date.now(),
     {cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Railway HTTP '+response.status);
    const data=await response.json();
    if(!Array.isArray(data.days)||!data.lastChecked)throw Error('Некоректні дані графіка');
    published=data;lastFetch=Date.now();return data;
   }catch(error){
    if(published){announce('Сервер тимчасово недоступний. Показано раніше завантажений графік. '+error.message,true);return published}
    throw Error('Не вдалося отримати актуальні графіки Railway: '+error.message);
   }
  })();
  try{return await pending}finally{pending=null}
 }
 function applyEntry(entry,mode){
  slots=model.fromIntervals(entry.off);
  knownFrom=entry.knownFrom||'00:00';
  if(model.indexOf(knownFrom)<0)throw Error('Чинний графік містить непідтримуваний час початку');
  if(isOfficial(entry.source)&&mode!=='different-day')source.value=entry.source;
  dirty=mode==='copy'||mode==='import';
  draw();
  announce((mode==='copy'?'Скопійовано':mode==='import'?'Завантажено для редагування':'Завантажено')+
   ': '+entry.origin+'. '+(dirty?'Перевірте 48 комірок та офіційне джерело перед публікацією.':'Відредагуйте потрібні комірки перед збереженням.'));
 }
 async function reload(){
  const id=++selectionId,d=date.value,q=queue.value;
  if(!d||!queues.includes(q))return;
  dirty=false;knownFrom='00:00';slots.fill(false);source.value='';draw();
  announce('Отримуємо чинний графік Railway…');
  try{
   const doc=stagedDoc(),manual=manualEntry(doc,d,q);
   const live=await current();
   if(id!==selectionId)return;
   const entry=manual||findEntry(live,d,q);
   if(entry){applyEntry(entry,'load')}
   else announce('Для '+d+' підчерги '+q+' підтвердженого графіка немає. Порожня сітка є лише шаблоном, а не підтвердженням безперебійного світла.',true);
  }catch(e){if(id===selectionId)announce(e.message,true)}
  loadedDate=d;loadedQueue=q;
 }
 function guardSelect(change){
  if(dirty&&!confirm('Скасувати незбережені зміни поточного графіка?')){
   date.value=loadedDate||date.value;queue.value=loadedQueue||queue.value;return;
  }
  if(change==='date')fromDate.value=date.value;
  void reload();
 }
 function stage(){
  if(!dirty)throw Error('Спочатку змініть інтервали, завантажте чинний графік або скористайтеся копіюванням.');
  const doc=stagedDoc(),url=source.value.trim(),d=date.value,q=queue.value;
  if(!/^20\d\d-\d\d-\d\d$/.test(d)||!queues.includes(q))throw Error('Оберіть дату й підчергу');
  if(!isOfficial(url))throw Error('Вкажіть офіційне джерело Черкасиобленерго саме для '+d);
  if(!confirm('Підготувати графік на '+d+' для підчерги '+q+'? Перевірте всі інтервали та офіційне джерело.'))return false;
  const off=model.toIntervals(slots);
  const existing=doc.schedules.days.find(x=>x.date===d);
  const item={knownFrom,off};
  if(existing){existing.queues??={};existing.queues[q]=item;existing.source=url;existing.verified=true;existing.publishedAt=new Date().toISOString()}
  else doc.schedules.days.push({date:d,source:url,publishedAt:new Date().toISOString(),verified:true,queues:{[q]:item}});
  doc.updatedAt=new Date().toISOString();
  by('editor').value=JSON.stringify(doc,null,2);
  dirty=false;
  announce('Зміну підготовлено. Натисніть «Опублікувати графік» для збереження на Railway.');
  return true;
 }
 for(const q of queues){queue.add(new Option('Підчерга '+q,q));from.add(new Option('З підчерги '+q,q))}
 const nowParts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 date.value=nowParts.year+'-'+nowParts.month+'-'+nowParts.day;fromDate.value=date.value;
 date.addEventListener('change',()=>guardSelect('date'));
 queue.addEventListener('change',()=>guardSelect('queue'));
 by('plannerLight').onclick=()=>{knownFrom='00:00';slots.fill(false);dirty=true;draw();announce('Підготовлено порожній графік. Публікуйте його тільки після підтвердження оператора.')};
 importButton.onclick=async()=>{
  const d=date.value,q=queue.value;
  if(dirty&&!confirm('Замінити незбережені зміни актуальним графіком '+q+'?'))return;
  try{
   announce('Завантажуємо актуальний графік…');const entry=findEntry(await current(true),d,q);
   if(!entry)throw Error('Офіційний графік підчерги '+q+' на '+d+' не опубліковано. Не можна копіювати порожній день.');
   if(date.value!==d||queue.value!==q)return;
   applyEntry(entry,'import');
  }catch(e){announce(e.message,true)}
 };
 by('plannerCopy').onclick=async()=>{
  const fromQueue=from.value,copyDay=fromDate.value||date.value,target=date.value,selected=queue.value;
  if(dirty&&!confirm('Перезаписати незбережені зміни графіком '+fromQueue+' на '+copyDay+'?'))return;
  try{
   const doc=stagedDoc(),manual=manualEntry(doc,copyDay,fromQueue);
   const entry=manual||findEntry(await current(true),copyDay,fromQueue);
   if(!entry)throw Error('Немає опублікованого графіка підчерги '+fromQueue+' на '+copyDay+'. Копіювання скасовано.');
   if(!confirm('Копіювати графік '+fromQueue+' за '+copyDay+' для '+selected+' на '+target+'? Це ще не публікація.'))return;
   const crossDay=copyDay!==target;
   applyEntry(entry,crossDay?'different-day':'copy');
   dirty=true;draw();
   if(crossDay){
    const targetEntry=manualEntry(doc,target,selected)||findEntry(await current(),target,selected);
    source.value=isOfficial(targetEntry?.source)?targetEntry.source:'';
    announce('Графік скопійовано з '+copyDay+'. Для публікації додайте офіційне джерело САМЕ за '+target+'.');
   }
  }catch(e){announce(e.message,true)}
 };
 by('plannerReload').onclick=()=>{if(dirty&&!confirm('Скасувати незбережені зміни?'))return;void reload()};
 by('plannerStage').onclick=()=>{try{stage()}catch(e){announce(e.message,true)}};
 by('plannerPublish').onclick=()=>{
  try{if(!remote||!canPublish)throw Error('Потрібен вхід власника до адмінпанелі Railway.');
   if(stage())by('publish').click();
  }catch(e){announce(e.message,true)}
 };
 document.addEventListener('svitlo:admin-ready',()=>{if(by('kind').value==='overrides')void reload()});
 document.addEventListener('svitlo:admin-logout',()=>{published=null;lastFetch=0});
 draw();
})();