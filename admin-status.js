(()=>{'use strict';
 const $=id=>document.getElementById(id),root=$('statusAdminPanel');if(!root)return;
 let snapshot=null,busy=false;
 const fmt=value=>{if(!value)return 'Не завершено';const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('uk-UA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d):'—'};
 const localValue=value=>{const d=value?new Date(value):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
 const api=(route,opts)=>window.svitloAdminApi(route,opts||{});
 const levelName=v=>({red:'Критичний',yellow:'Часткові проблеми',green:'Працює нормально'}[v]||'Невідомо');
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
 const duration=(a,b)=>{const ms=Math.max(0,(b?Date.parse(b):Date.now())-Date.parse(a));if(!Number.isFinite(ms))return '—';const mins=Math.floor(ms/60000),days=Math.floor(mins/1440),hours=Math.floor((mins%1440)/60),m=mins%60;return days?days+' д '+hours+' год':hours?hours+' год '+m+' хв':m+' хв'};
 function render(){
  if(!snapshot)return;
  const overview=$('statusAdminOverview');overview.replaceChildren();
  const badge=el('div','status-current status-'+snapshot.level);
  badge.append(el('span','status-current-dot'),el('div','',levelName(snapshot.level)),el('small','',snapshot.summary||'Статус без додаткового опису'));
  overview.append(badge);
  $('statusLevel').value=snapshot.level;$('statusSummary').value=snapshot.summary||'';
  const items=snapshot.incidents||[],now=Date.now(),active=items.filter(x=>!x.endedAt),recent=items.filter(x=>Date.parse(x.startedAt)>now-30*86400000);
  $('statusMetricActive').textContent=active.length;$('statusMetricRecent').textContent=recent.length;$('statusMetricTotal').textContent=items.length;
  const query=$('statusIncidentSearch').value.trim().toLocaleLowerCase('uk-UA'),filter=$('statusIncidentFilter').value,sort=$('statusIncidentSort').value;
  let shown=items.filter(x=>(filter==='all'||(filter==='active'?!x.endedAt:!!x.endedAt))&&(!query||(x.title+' '+(x.description||'')).toLocaleLowerCase('uk-UA').includes(query)));
  shown.sort((a,b)=>sort==='newest'?Date.parse(b.startedAt)-Date.parse(a.startedAt):Date.parse(a.startedAt)-Date.parse(b.startedAt));
  $('statusIncidentCount').textContent='Показано '+shown.length+' із '+items.length+' записів';
  const list=$('statusIncidentList');list.replaceChildren();
  if(!shown.length){const empty=el('div','status-journal-empty');empty.append(el('strong','',items.length?'Нічого не знайдено':'Журнал поки порожній'),el('p','',items.length?'Спробуйте змінити пошуковий запит або фільтр.':'Коли виникне проблема, створіть перший запис — тут зберігатиметься вся історія.'));list.append(empty);return}
  for(const item of shown){
   const active=!item.endedAt,card=el('article','status-incident-card status-'+item.level+(active?' is-active':''));
   const rail=el('div','status-incident-rail');rail.append(el('i',''));card.append(rail);
   const body=el('div','status-incident-body'),top=el('div','status-incident-card-top');
   const tag=el('span','status-incident-severity severity-'+item.level,levelName(item.level));
   top.append(tag,el('span','status-incident-state '+(active?'active':'resolved'),active?'● Активний':'✓ Завершений'));
   body.append(top,el('h4','',item.title||'Інцидент без назви'));
   if(item.description)body.append(el('p','status-incident-description',item.description));
   const meta=el('div','status-incident-meta');meta.append(el('span','', '◷ '+fmt(item.startedAt)),el('span','', 'Тривалість: '+duration(item.startedAt,item.endedAt)),el('span','',item.endedAt?'Завершено: '+fmt(item.endedAt):'Очікує завершення'));body.append(meta);
   const actions=el('div','status-incident-actions');
   const edit=el('button','secondary','Редагувати');edit.type='button';edit.addEventListener('click',()=>editor(item));actions.append(edit);
   if(active){const close=el('button','status-action-resolve','Завершити інцидент');close.type='button';close.addEventListener('click',()=>finishItem(item));actions.append(close)}
   const del=el('button','status-action-delete','Видалити');del.type='button';del.addEventListener('click',()=>deleteItem(item));actions.append(del);
   body.append(actions);card.append(body);list.append(card);
  }
 }
 async function load(){if(busy)return;busy=true;$('statusAdminMessage').textContent='Синхронізація…';try{snapshot=await api('status');render();$('statusAdminMessage').textContent='Остання синхронізація: '+fmt(snapshot.updatedAt)}catch(e){$('statusAdminMessage').textContent='Не вдалося завантажити: '+e.message}finally{busy=false}}
 function editor(item){
  $('statusIncidentEditor').hidden=false;$('statusIncidentId').value=item?.id||'';$('statusIncidentRevision').value=item?.revision||'';
  $('statusIncidentEditorTitle').textContent=item?'Редагувати інцидент':'Новий інцидент';
  $('statusIncidentName').value=item?.title||'';$('statusIncidentStart').value=localValue(item?.startedAt);$('statusIncidentEnd').value=item?.endedAt?localValue(item.endedAt):'';
  $('statusIncidentDescription').value=item?.description||'';
  const radio=document.querySelector('input[name="statusSeverity"][value="'+(item?.level||'yellow')+'"]');if(radio)radio.checked=true;
  $('statusIncidentEditor').scrollIntoView({behavior:'smooth',block:'center'});
 }
 function closeEditor(){$('statusIncidentEditor').hidden=true}
 async function finishItem(item){try{snapshot=await api('status/incidents/'+encodeURIComponent(item.id),{method:'PATCH',body:JSON.stringify({expectedRevision:item.revision,endedAt:new Date().toISOString()})});render();$('statusAdminMessage').textContent='Інцидент позначено як завершений.'}catch(e){$('statusAdminMessage').textContent='Не вдалося завершити: '+e.message}}
 async function deleteItem(item){if(!confirm('Видалити запис «'+item.title+'»? Цю дію не можна скасувати.'))return;try{snapshot=await api('status/incidents/'+encodeURIComponent(item.id),{method:'DELETE',body:JSON.stringify({expectedRevision:item.revision})});render();$('statusAdminMessage').textContent='Запис видалено.'}catch(e){$('statusAdminMessage').textContent='Не вдалося видалити: '+e.message}}
 $('statusSaveLevel').addEventListener('click',async()=>{try{snapshot=await api('status/level',{method:'PUT',body:JSON.stringify({level:$('statusLevel').value,summary:$('statusSummary').value})});render();$('statusAdminMessage').textContent='Поточний статус збережено.'}catch(e){$('statusAdminMessage').textContent='Помилка: '+e.message}});
 $('statusNewIncident').addEventListener('click',()=>editor(null));$('statusIncidentCancel').addEventListener('click',closeEditor);$('statusIncidentCancelBottom').addEventListener('click',closeEditor);
 $('statusIncidentEditor').addEventListener('click',e=>{if(e.target===$('statusIncidentEditor'))closeEditor()});
 ['statusIncidentSearch','statusIncidentFilter','statusIncidentSort'].forEach(id=>$(id).addEventListener(id==='statusIncidentSearch'?'input':'change',render));
 $('statusIncidentSave').addEventListener('click',async()=>{
  const id=$('statusIncidentId').value,start=$('statusIncidentStart').value,end=$('statusIncidentEnd').value;
  if(!$('statusIncidentName').value.trim()){$('statusAdminMessage').textContent='Вкажіть назву інциденту.';return}
  if(!start||!Number.isFinite(Date.parse(start))){$('statusAdminMessage').textContent='Вкажіть коректний час початку.';return}
  if(end&&(!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(start))){$('statusAdminMessage').textContent='Час завершення не може бути раніше початку.';return}
  const payload={title:$('statusIncidentName').value.trim(),level:document.querySelector('input[name="statusSeverity"]:checked')?.value||'yellow',startedAt:new Date(start).toISOString(),endedAt:end?new Date(end).toISOString():null,description:$('statusIncidentDescription').value.trim()};
  try{snapshot=await api(id?'status/incidents/'+encodeURIComponent(id):'status/incidents',{method:id?'PATCH':'POST',body:JSON.stringify(id?{...payload,expectedRevision:Number($('statusIncidentRevision').value)}:payload)});closeEditor();render();$('statusAdminMessage').textContent='Інцидент успішно збережено.'}catch(e){$('statusAdminMessage').textContent='Помилка збереження: '+e.message}
 });
 document.addEventListener('svitlo:admin-ready',load);document.querySelector('[data-admin-tab="status"]')?.addEventListener('click',load);
})();