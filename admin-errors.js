(()=>{'use strict';const root=document.getElementById('adminErrorStats'),button=document.getElementById('adminErrorsRefresh');if(!root||!button)return;
 const names={uncaught:'Необроблені помилки',promise:'Помилки асинхронних операцій',resource:'Помилки завантаження ресурсів',other:'Інше'};
 async function load(){button.disabled=true;root.textContent='Отримуємо статистику…';
  try{const d=await window.svitloAdminApi('diagnostics');root.replaceChildren();
   const title=document.createElement('p');title.textContent='За 45 днів: '+(d.total||0)+' зведених подій';root.append(title);
   for(const [kind,count] of Object.entries(d.byKind||{})){const p=document.createElement('p');p.textContent=(names[kind]||kind)+': '+count;root.append(p)}
   const note=document.createElement('small');note.textContent=d.note||'';root.append(note)
  }catch(e){root.textContent='Недоступно: '+e.message}finally{button.disabled=false}
 }
 button.onclick=load;document.querySelector('[data-admin-tab="quality"]')?.addEventListener('click',load);
})();
