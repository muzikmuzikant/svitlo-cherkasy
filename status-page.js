(()=>{'use strict';
 const $=id=>document.getElementById(id);const names={green:'Усе працює нормально',yellow:'Є часткові проблеми',red:'Критичні проблеми'};
 const date=v=>{if(!v)return 'Ще триває';const d=new Date(v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('uk-UA',{dateStyle:'long',timeStyle:'short'}).format(d):'—'};
 const node=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
 async function load(){const root=$('publicStatus');try{
  const cfg=await fetch('./push-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('config');return r.json()});
  const response=await fetch(cfg.apiBase.replace(/\/$/,'')+'/api/status',{cache:'no-store'});if(!response.ok)throw Error('api');
  const data=await response.json();root.className='public-status status-'+data.level;root.replaceChildren();
  const icon=node('span','public-status-icon',data.level==='green'?'✓':data.level==='yellow'?'!':'×');
  const copy=node('div','public-status-copy');copy.append(node('span','public-status-label','ПОТОЧНИЙ СТАН'),node('strong','',names[data.level]||'Стан невідомий'),node('p','',data.summary||'Інформація про стан сервісу відсутня.'));
  root.append(icon,copy,node('small','public-status-time','Оновлено '+date(data.updatedAt)));
  const list=$('publicIncidents');list.replaceChildren();const items=data.incidents||[];
  if(!items.length)list.append(node('div','status-empty','Зафіксованих інцидентів поки немає. Якщо виникнуть проблеми, інформація з’явиться тут.'));
  for(const item of items){const card=node('article','public-incident status-'+item.level);const top=node('div','public-incident-top');top.append(node('span','public-incident-dot'),node('span','public-incident-state',item.endedAt?'ВИРІШЕНО':'В РОБОТІ'));card.append(top,node('h3','',item.title),node('p','',item.description));const times=node('div','public-incident-times');times.append(node('span','','Початок · '+date(item.startedAt)),node('span','','Завершення · '+date(item.endedAt)));card.append(times);list.append(card)}
  $('statusUpdated').textContent='Оновлено '+date(data.updatedAt);$('statusFooterUpdated').textContent=date(data.updatedAt);
 }catch(e){root.className='public-status status-unavailable';root.replaceChildren(node('span','public-status-icon','?'),node('div','public-status-copy','Не вдалося завантажити актуальний статус. Спробуйте оновити сторінку пізніше.'));$('publicIncidents').replaceChildren(node('div','status-empty','Журнал тимчасово недоступний.'));}}
 load();setInterval(load,60000);
})();