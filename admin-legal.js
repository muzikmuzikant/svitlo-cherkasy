/* Owner-only legal revision metadata editor. Documents themselves remain the published HTML. */
(()=>{'use strict';const root=document.getElementById('adminLegal');if(!root)return;
 const create=(tag,label)=>{const e=document.createElement(tag);if(label!==undefined)e.textContent=label;return e};
 const api=(method='GET',value)=>window.svitloAdminApi('legal',{method,body:value===undefined?undefined:JSON.stringify(value)});
 let current=null;
 const field=(label,value,textarea=false)=>{const l=create('label');l.append(create('span',label));const input=create(textarea?'textarea':'input');input.value=value||'';l.append(input);root.append(l);return input};
 const refresh=async()=>{current=await api();root.replaceChildren(create('h3','Юридичні документи та редакції'),create('p','Публікуйте номер редакції після оновлення текстів terms.html та privacy.html. Нові номери знову викличуть вікно ознайомлення у користувачів.'));
 const terms=field('Редакція умов використання',current.termsVersion),privacy=field('Редакція політики конфіденційності',current.privacyVersion);
 const summary=field('Що змінилося',current.summary,true);
 const agreeLabel=create('label'),agree=create('input');agree.type='checkbox';agree.checked=current.requireAcknowledgement;
 agreeLabel.append(agree,create('span','Показувати кнопку «Погоджуюся» для нової редакції'));root.append(agreeLabel);
 const save=create('button','Опублікувати редакцію');save.type='button';root.append(save);
 const status=create('p','Поточна публікація: '+(current.publishedAt?new Date(current.publishedAt).toLocaleString('uk-UA'):'Ще не змінювалася'));root.append(status);
 save.onclick=async()=>{if(!confirm('Опублікувати нові номери редакцій для користувачів?'))return;save.disabled=true;try{current=await api('PUT',{termsVersion:terms.value,privacyVersion:privacy.value,summary:summary.value,requireAcknowledgement:agree.checked});status.textContent='Редакції опубліковано'}catch(e){status.textContent=e.message}finally{save.disabled=false}};
 };
 document.addEventListener('svitlo:admin-ready',()=>{root.hidden=document.body.dataset.adminRole!=='owner';if(!root.hidden)refresh().catch(e=>root.textContent=e.message)});
 document.addEventListener('svitlo:admin-logout',()=>{root.hidden=true;root.replaceChildren()});
})();
