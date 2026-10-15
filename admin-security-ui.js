/* Privileged session controls. No passwords or tokens are stored. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),host=$('securityOverview');if(!host)return;
 const make=(tag,txt,cls='')=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=String(txt);if(cls)n.className=cls;return n};
 const pass=$('password'),toggle=$('togglePassword');
 toggle?.addEventListener('click',()=>{
  const visible=pass.type!=='password';pass.type=visible?'password':'text';
  toggle.textContent=visible?'Показати':'Сховати';toggle.setAttribute('aria-pressed',String(!visible));
 });
 let busy=false;
 const notify=(msg,err=false)=>{$('securityMessage').textContent=msg;$('securityMessage').classList.toggle('is-error',err)};
 async function refresh(){
  if(busy||typeof remote==='undefined'||!remote)return;busy=true;
  try{
   const info=await api('security');host.replaceChildren();
   const entries=[
    ['Поточна роль',({owner:'Власник',editor:'Редактор',operator:'Оператор',viewer:'Перегляд'})[info.role]||info.role,'Права перевіряє сервер'],
    ['Активні сеанси',String(info.activeSessions),'Кількість авторизованих сеансів'],
    ['Двофакторний захист',info.secondFactorEnabled?'Увімкнено':'Не ввімкнено','Опція ADMIN_TOTP_SECRET у Railway'],
    ['Бездіяльність',info.idleMinutes+' хв','Після цього потрібен новий вхід']
   ];
   for(const [name,value,desc] of entries){
    const card=make('div',undefined,'security-overview-card');card.append(make('small',name),make('strong',value),make('span',desc));host.append(card);
   }
   const isOwner=info.role==='owner';
   $('securityRevoke').disabled=!isOwner;
   $('securityRevokePassword').disabled=!isOwner;
   const warnings=[];
   if(isOwner&&!info.secondFactorEnabled)warnings.push('Для посиленого захисту налаштуйте ADMIN_TOTP_SECRET у Variables Railway. Секрет не треба розміщувати в GitHub.');
   if(info.passwordNeedsUpgrade)warnings.push('Пароль власника коротший за 12 символів. Замініть його в змінних Railway.');
   notify(warnings.join(' ')||'Перевірка прав і сесій успішна.');
  }catch(e){notify('Не вдалося перевірити сеанс: '+e.message,true)}
  finally{busy=false}
 }
 $('securityReload').addEventListener('click',refresh);
 document.querySelector('[data-admin-tab="security"]')?.addEventListener('click',refresh);
 document.addEventListener('svitlo:admin-ready',refresh);
 document.addEventListener('svitlo:admin-logout',()=>{host.replaceChildren();$('securityRevokePassword').value=''});
 $('securityRevoke').addEventListener('click',async()=>{
  if(typeof adminRole==='undefined'||adminRole!=='owner')return;
  const password=$('securityRevokePassword').value;
  if(!password){notify('Уведіть пароль для підтвердження.',true);return}
  if(!confirm('Завершити всі інші активні сеанси адмінпанелі?'))return;
  $('securityRevoke').disabled=true;
  try{const data=await api('security/revoke-others',{method:'POST',body:JSON.stringify({password,confirm:true})});
   notify('Завершено інших сеансів: '+data.removed);await refresh();
  }catch(e){notify('Не вдалося завершити сеанси: '+e.message,true)}
  finally{$('securityRevokePassword').value='';$('securityRevoke').disabled=false}
 });
})();
