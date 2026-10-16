/* Compare the staged schedule JSON to the copy actually loaded for editing. */
(()=>{'use strict';
 const button=document.getElementById('scheduleDiffButton'),panel=document.getElementById('scheduleDiffPanel');if(!button||!panel)return;
 const node=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;if(cls)e.className=cls;return e};
 const normalized=data=>Array.isArray(data?.days)?data.days:Array.isArray(data?.schedules?.days)?data.schedules.days:[];
 const effective=(day,queue)=>Array.isArray(day?.queues?.[queue]?.off)?day.queues[queue].off:[];
 const summarize=v=>v.length?v.map(x=>Array.isArray(x)?x.join('–'):String(x)).join(', '):'Запланованих відключень немає';
 button.onclick=()=>{
  panel.hidden=false;panel.replaceChildren();
  const draft=window.svitloAdminDraft?.();
  if(!draft?.original){panel.append(node('p','Спочатку завантажте файл.'));return}
  if(!['schedules','overrides'].includes(draft.kind)){panel.append(node('p','Порівняння доступне для планових графіків і ручних уточнень.'));return}
  let updated;try{updated=JSON.parse(draft.raw)}catch(e){panel.append(node('p','Некоректний JSON: '+e.message));return}
  const older=new Map(normalized(draft.original).map(d=>[d.date,d]));
  const newer=new Map(normalized(updated).map(d=>[d.date,d]));
  const days=new Set([...older.keys(),...newer.keys()]);
  const changed=[];
  for(const day of [...days].sort()){
   const from=older.get(day),to=newer.get(day);
   const queueNames=new Set([...Object.keys(from?.queues||{}),...Object.keys(to?.queues||{})]);
   if(!queueNames.size&&JSON.stringify(from)!==JSON.stringify(to))changed.push({day,queue:'Дата / джерело',before:from?'Запис був':'Не було',after:to?'Запис є':'Видалено'});
   for(const queue of [...queueNames].sort()){
    const prev=effective(from,queue),next=effective(to,queue);
    if(JSON.stringify(prev)!==JSON.stringify(next)){
     changed.push({day,queue,before:from?.queues?.[queue]?summarize(prev):'Не було',after:to?.queues?.[queue]?summarize(next):'Видалено'})
    }
   }
   if(from?.source!==to?.source&&from&&to){changed.push({day,queue:'Джерело',before:from.source||'Не зазначено',after:to.source||'Не зазначено'})}
  }
  panel.append(node('h3','Порівняння з початковою завантаженою редакцією'),node('p',changed.length?'Змінено записів: '+changed.length+'. Перед публікацією перевірте кожен інтервал і першоджерело.':'Змін графіків не виявлено.'));
  for(const record of changed.slice(0,160)){
   const box=node('div',undefined,'schedule-diff-item');
   box.append(node('strong',record.day+' · '+record.queue));
   box.append(node('span','Було: '+record.before),node('span','Стало: '+record.after));
   panel.append(box)
  }
  if(changed.length>160)panel.append(node('p','Показано 160 із '+changed.length+' змін. Експортуйте файл для повної перевірки.'));
 };
 document.getElementById('kind')?.addEventListener('change',()=>{panel.hidden=true;panel.replaceChildren()});
})();
