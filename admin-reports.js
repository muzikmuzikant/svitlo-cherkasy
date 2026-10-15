/* Render aggregate daily reports, including a local CSV export. */
(()=>{'use strict';
 const root=document.getElementById('dailyReportsContent'),refresh=document.getElementById('dailyReportsRefresh'),exportButton=document.getElementById('dailyReportsExport');
 if(!root||!refresh||!exportButton)return;
 let items=[];
 const cell=(tr,value,header=false)=>{const e=document.createElement(header?'th':'td');e.textContent=value===null||value===undefined?'Н/Д':String(value);tr.append(e)};
 const format=n=>typeof n==='number'?n.toLocaleString('uk-UA'):'Н/Д';
 async function load(){
  refresh.disabled=true;root.textContent='Отримуємо звіти…';
  try{
   const result=await window.svitloAdminApi('reports');items=result.items||[];
   root.replaceChildren();if(!items.length){root.textContent='Перший звіт з’явиться після запуску щогодинного збору.';return}
   const container=document.createElement('div');container.className='reports-table-wrap';
   const table=document.createElement('table');table.className='reports-table';
   const headings=['Дата','Push-підписки','Звернення','У роботі','Активні PWA (24 год)','Покази реклами*','Структурні помилки'];
   const thead=document.createElement('thead'),tr=document.createElement('tr');
   headings.forEach(h=>cell(tr,h,true));thead.append(tr);table.append(thead);
   const body=document.createElement('tbody');
   for(const x of items.slice(0,21)){const row=document.createElement('tr');[
    x.date,x.subscriptions,x.feedback?.total,x.feedback?.inProgress,x.pwa?.active24h,x.advertising?.impressions,x.schedules?.structuralErrors
   ].forEach(v=>cell(row,format(v)));body.append(row)}
   table.append(body);container.append(table);root.append(container);
   const note=document.createElement('p');note.className='hint';note.textContent='* Рекламні покази накопичені за весь період. ' + (result.note||'');root.append(note)
  }catch(e){root.textContent='Звіти недоступні: '+e.message}
  finally{refresh.disabled=false}
 }
 refresh.onclick=load;
 exportButton.onclick=()=>{
  if(!items.length)return;
  const header=['date','subscribers','tickets','pending','resolved','activePwa24h','adImpressionsTotal','adClicksTotal','structuralErrors','technicalErrors45d'];
  const data=items.map(x=>[x.date,x.subscriptions,x.feedback?.total,x.feedback?.inProgress,x.feedback?.resolved,x.pwa?.active24h,x.advertising?.impressions,x.advertising?.clicks,x.schedules?.structuralErrors,x.diagnostics?.errors45d]);
  const rows=[header,...data].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','));
  const url=URL.createObjectURL(new Blob([String.fromCharCode(0xFEFF)+rows.join('\n')+'\n'],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='svitlo-beta-reports.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)
 };
 document.querySelector('[data-admin-tab="insights"]')?.addEventListener('click',load);
 document.addEventListener('svitlo:admin-ready',load);
})();
