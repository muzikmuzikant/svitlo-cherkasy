/* Admin-only controls for actual Railway scheduler and source monitoring. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 if(!$('opsOffEnabled')||!$('opsSourceState'))return;
 let config=null,busy=false;
 const isOwner=()=>document.body.dataset.adminRole==='owner';
 const tell=(id,message)=>{const el=$(id);if(el)el.textContent=message};
 const displayTime=v=>v?new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Немає даних';
 const previewText=(text,lead)=>String(text||'').replace(/\{(minutes|queue|time)\}/g,(_,k)=>({minutes:lead,queue:'2.1',time:'18:30'})[k]);
 for(const type of ['Off','On']){
  const select=$('ops'+type+'Lead');
  for(let min=5;min<=45;min+=5)select.add(new Option(min+' хв',String(min)));
 }
 const getPayload=()=>{
  if(!config)throw Error('Налаштування ще не завантажені');
  const clone=JSON.parse(JSON.stringify(config));
  clone.monitoring.warnAfterMinutes=Number($('opsMonitorLimit').value);
  for(const [type,key] of [['Off','off'],['On','on']]){
   clone.reminders[key]={
    enabled:$('ops'+type+'Enabled').checked,
    leadMinutes:Number($('ops'+type+'Lead').value),
    title:$('ops'+type+'Title').value.trim(),
    body:$('ops'+type+'Body').value.trim()
   };
  }
  return clone;
 };
 const fill=()=>{
  if(!config)return;
  $('opsMonitorLimit').value=String(config.monitoring.warnAfterMinutes);
  for(const [type,key] of [['Off','off'],['On','on']]){
   const item=config.reminders[key];
   $('ops'+type+'Enabled').checked=item.enabled;
   $('ops'+type+'Lead').value=String(item.leadMinutes);
   $('ops'+type+'Title').value=item.title;
   $('ops'+type+'Body').value=item.body;
  }
  $('opsPushSave').disabled=!isOwner();
  $('opsSourceSave').disabled=!isOwner();
  renderPreview();
 };
 function renderPreview(){
  const lead=$('opsOffLead').value;
  $('opsPushPreviewTitle').textContent=previewText($('opsOffTitle').value,lead);
  $('opsPushPreviewBody').textContent=previewText($('opsOffBody').value,lead);
 }
 async function loadSettings(){
  if(busy)return;
  busy=true;
  try{config=await api('operations');fill();tell('opsPushMessage','Налаштування завантажено з Railway.');}
  catch(e){tell('opsPushMessage','Не вдалося завантажити: '+e.message)}
  finally{busy=false}
 }
 async function save(segment){
  if(busy||!isOwner())return;
  busy=true;
  const button=$(segment==='monitor'?'opsSourceSave':'opsPushSave');
  button.disabled=true;
  try{
   const controls=getPayload();
   // Do not accidentally write unsaved values from another section.
   if(segment==='monitor')controls.reminders=JSON.parse(JSON.stringify(config.reminders));
   else controls.monitoring=JSON.parse(JSON.stringify(config.monitoring));
   config=await api('operations',{method:'PUT',body:JSON.stringify({expectedRevision:config.revision,controls})});
   fill();tell(segment==='monitor'?'opsSourceMessage':'opsPushMessage','Збережено на Railway. Зміни застосовуються сервером.');
   if(segment==='monitor')await sourceStatus();
   else await loadHistory();
  }catch(e){tell(segment==='monitor'?'opsSourceMessage':'opsPushMessage','Не збережено: '+e.message)}
  finally{busy=false;button.disabled=!isOwner()}
 }
 async function sourceStatus(){
  const pane=$('opsSourceState');
  try{
   const m=await api('monitor'),s=m?.sources?.schedules||{},review=m?.sources?.review||{};
   pane.replaceChildren();
   const items=[
    ['Публікація графіків',s.error?'Помилка: '+s.error:displayTime(s.lastChecked)],
    ['Перевірка джерел',review.error?'Помилка: '+review.error:displayTime(review.lastChecked)],
    ['Опубліковані дні',Array.isArray(s.days)?String(s.days.length):'Невідомо'],
    ['Відхилено джерелом',Number.isSafeInteger(review.rejectedCount)?String(review.rejectedCount):'Невідомо']
   ];
   for(const [name,value] of items){
    const line=document.createElement('p'),label=document.createElement('strong');
    label.textContent=name+': ';line.append(label,document.createTextNode(value));pane.append(line);
   }
   const age=Date.now()-Date.parse(s.lastChecked||'');
   const stale=!s.lastChecked||!Number.isFinite(age)||age>Number(config?.monitoring?.warnAfterMinutes||120)*60000;
   tell('opsSourceMessage',stale?'Увага: джерело старіше встановленого порога. Це лише сигнал моніторингу, графік імпортера не змінено.':'Час останньої публікації в межах порога моніторингу.');
  }catch(e){pane.textContent='Дані недоступні: '+e.message}
 }
 async function loadHistory(){
  try{
   const result=await api('operations/history'),host=$('opsPushHistory');host.replaceChildren();
   if(!result.items?.length){host.textContent='Попередніх редакцій немає.';return}
   for(const row of result.items.slice(0,12)){
    const line=document.createElement('div');line.className='flex';
    const label=document.createElement('span');label.textContent=displayTime(row.updatedAt);
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Відновити';
    button.disabled=!isOwner();
    button.addEventListener('click',async()=>{
     if(!confirm('Відновити попередні правила нагадувань і моніторингу? Зміни діятимуть для нових подій.'))return;
     button.disabled=true;
     try{config=await api('operations/history/restore',{method:'POST',body:JSON.stringify({revision:row.revision,expectedRevision:config.revision,confirm:true})});
      fill();await loadHistory();tell('opsPushMessage','Попередні параметри відновлено, журнал збережено.')}
     catch(e){tell('opsPushMessage','Не вдалося відновити: '+e.message)}
     finally{button.disabled=!isOwner()}
    });line.append(label,button);host.append(line);
   }
  }catch(e){tell('opsPushMessage','Помилка історії: '+e.message)}
 }
 $('opsSourceRefresh').onclick=sourceStatus;
 $('opsSourceSave').onclick=()=>save('monitor');
 $('opsPushSave').onclick=()=>save('push');
 $('opsPushReload').onclick=()=>{loadSettings();loadHistory()};
 for(const type of ['Off','On'])for(const suffix of ['Title','Body','Lead']){
  $( 'ops'+type+suffix).addEventListener('input',renderPreview);
  $( 'ops'+type+suffix).addEventListener('change',renderPreview);
 }
 document.querySelector('[data-admin-tab="sources"]')?.addEventListener('click',()=>{loadSettings();sourceStatus()});
 document.querySelector('[data-admin-tab="push"]')?.addEventListener('click',()=>{loadSettings();loadHistory()});
 document.addEventListener('svitlo:admin-ready',loadSettings);
 document.addEventListener('svitlo:admin-logout',()=>{config=null;tell('opsPushMessage','Для керування потрібен вхід.');tell('opsSourceMessage','Сеанс завершено.');$('opsSourceState').textContent='Увійдіть для моніторингу.'});
})();
