(()=>{'use strict';
 const $=id=>document.getElementById(id);const root=$('statusAdminPanel');if(!root)return;
 let snapshot=null,busy=false;
 const fmt=value=>{if(!value)return 'Не завершено';const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('uk-UA',{dateStyle:'medium',timeStyle:'short'}).format(d):'—'};
 const localValue=value=>{const d=value?new Date(value):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
 const api=(route,opts)=>window.svitloAdminApi(route,opts||{});
 const levelName=v=>({red:'Критичний',yellow:'Часткові проблеми',green:'Працює нормально'}[v]||'Невідомо');
 const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
 function render(){
  if(!snapshot)return;
  const overview=$('statusAdminOverview');overview.replaceChildren();
  const badge=el('div','status-current status-'+snapshot.level);
  badge.append(el('span','status-current-dot'),el('div','',levelName(snapshot.level)),el('small','',snapshot.summary||''));
  overview.append(badge);
  $('statusLevel').value=snapshot.level;$('statusSummary').value=snapshot.summary||'';
  const list=$('statusIncidentList');list.replaceChildren();
  const items=snapshot.incidents||[];
  if(!items.length){list.append(el('div','status-empty','Поки що інцидентів немає. Тут з’являтимуться всі зафіксовані проблеми.'));return}
  for(const item of items){
   const card=el('article','status-incident status-'+item.level);
   const head=el('div','status-incident-head');head.append(el('span','status-incident-mark'),el('div','status-incident-title',item.title),el('span','status-incident-state',item.endedAt?'Завершено':'Триває'));
   card.append(head,el('p','status-incident-description',item.description));
   const times=el('div','status-incident-times');times.append(el('span','', 'Початок: '+fmt(item.startedAt)),el('span','', 'Завершення: '+fmt(item.endedAt)));card.append(times);
   const actions=el('div','status-incident-actions');
   const edit=el('button','secondary','Редагувати');edit.type='button';edit.addEventListener('click',()=>editItem(item));
   actions.append(edit);
   if(!item.endedAt){const close=el('button','secondary','Позначити завершеним');close.type='button';close.addEventListener('click',()=>finishItem(item));actions.append(close)}
   const del=el('button','danger','Видалити');del.type='button';del.addEventListener('click',()=>deleteItem(item));actions.append(del);
   card.append(actions);list.append(card);
  }
 }
 async function load(){if(busy)return;busy=true;$('statusAdminMessage').textContent='Оновлюємо…';try{snapshot=await api('status');render();$('statusAdminMessage').textContent='Оновлено '+fmt(snapshot.updatedAt)}catch(e){$('statusAdminMessage').textContent='Помилка: '+e.message}finally{busy=false}}
 function editor(item){
  $('statusIncidentEditor').hidden=false;$('statusIncidentId').value=item?.id||'';$('statusIncidentRevision').value=item?.revision||'';
  $('statusIncidentEditorTitle').textContent=item?'Редагування інциденту':'Новий інцидент';
  $('statusIncidentName').value=item?.title||'';$('statusIncidentLevel').value=item?.level||'yellow';
  $('statusIncidentStart').value=localValue(item?.startedAt);$('statusIncidentEnd').value=item?.endedAt?localValue(item.endedAt):'';
  $('statusIncidentDescription').value=item?.description||'';
  $('statusIncidentEditor').scrollIntoView({behavior:'smooth',block:'center'});
 }
 function editItem(item){editor(item)}
 async function finishItem(item){
  try{const end=new Date().toISOString();snapshot=await api('status/incidents/'+encodeURIComponent(item.id),{method:'PATCH',body:JSON.stringify({expectedRevision:item.revision,endedAt:end})});render()}catch(e){$('statusAdminMessage').textContent='Не вдалося завершити: '+e.message}
 }
 async function deleteItem(item){
  if(!confirm('Видалити запис «'+item.title+'»?'))return;
  try{snapshot=await api('status/incidents/'+encodeURIComponent(item.id),{method:'DELETE',body:JSON.stringify({expectedRevision:item.revision})});render()}catch(e){$('statusAdminMessage').textContent='Не вдалося видалити: '+e.message}
 }
 $('statusSaveLevel').addEventListener('click',async()=>{try{snapshot=await api('status/level',{method:'PUT',body:JSON.stringify({level:$('statusLevel').value,summary:$('statusSummary').value})});render();$('statusAdminMessage').textContent='Поточний статус збережено.'}catch(e){$('statusAdminMessage').textContent='Помилка: '+e.message}});
 $('statusNewIncident').addEventListener('click',()=>editor(null));
 $('statusIncidentCancel').addEventListener('click',()=>{$('statusIncidentEditor').hidden=true});
 $('statusIncidentSave').addEventListener('click',async()=>{
  const id=$('statusIncidentId').value;
  const start=$('statusIncidentStart').value,end=$('statusIncidentEnd').value;
  if(!start||!Number.isFinite(Date.parse(start))){$('statusAdminMessage').textContent='Вкажіть коректний час початку.';return}
  if(end&&(!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(start))){$('statusAdminMessage').textContent='Перевірте час завершення.';return}
  const payload={title:$('statusIncidentName').value,level:$('statusIncidentLevel').value,startedAt:new Date(start).toISOString(),endedAt:end?new Date(end).toISOString():null,description:$('statusIncidentDescription').value};
  try{snapshot=await api(id?'status/incidents/'+encodeURIComponent(id):'status/incidents',{method:id?'PATCH':'POST',body:JSON.stringify(id?{...payload,expectedRevision:Number($('statusIncidentRevision').value)}:payload)});$('statusIncidentEditor').hidden=true;render();$('statusAdminMessage').textContent='Запис збережено.'}catch(e){$('statusAdminMessage').textContent='Помилка: '+e.message}
 });
 document.addEventListener('svitlo:admin-ready',load);
 document.querySelector('[data-admin-tab="status"]')?.addEventListener('click',load);
})();
