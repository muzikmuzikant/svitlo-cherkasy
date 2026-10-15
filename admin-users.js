/* Manage scoped admin logins from the owner's Security tab. */
(()=>{'use strict';
 const root=document.getElementById('adminAccounts');if(!root)return;
 const perms=[['view','Перегляд'],['notices','Оголошення'],['push','Push'],['feedback','Звернення'],['help','Допомога'],['ads','Реклама і підтримка'],['schedules','Графіки'],['settings','Налаштування'],['media','Медіатека']];
 const e=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x};
 const api=(suffix='',method='GET',value)=>window.svitloAdminApi('users'+suffix,{method,body:value===undefined?undefined:JSON.stringify(value)});
 let items=[];
 const input=(host,label,type='text',value='')=>{const l=e('label',undefined,'account-field');l.append(e('span',label));const v=e('input');v.type=type;v.value=value;v.autocomplete=type==='password'?'new-password':'off';l.append(v);host.append(l);return v};
 const role=(host,selected)=>{const l=e('label',undefined,'account-field');l.append(e('span','Роль'));const s=e('select');for(const [id,title] of [['viewer','Перегляд'],['operator','Оператор'],['editor','Редактор']]){const option=e('option',title);option.value=id;s.append(option)}s.value=selected;l.append(s);host.append(l);return s};
 const rights=(host,selected)=>{const group=e('div',undefined,'account-rights'),checks=[];for(const [key,title] of perms){const label=e('label'),check=e('input');check.type='checkbox';check.checked=selected.includes(key);checks.push([key,check]);label.append(check,e('span',title));group.append(label)}host.append(group);return ()=>checks.filter(x=>x[1].checked).map(x=>x[0])};
 const button=(host,title,onClick,cls)=>{const b=e('button',title,cls);b.type='button';b.onclick=onClick;host.append(b);return b};
 async function mutate(fn){try{await fn();await reload();root.prepend(e('p','Зміни збережено. Активні сеанси цього акаунта завершено.','account-info'))}catch(err){root.prepend(e('p',err.message,'account-error'))}}
 function render(){
  root.replaceChildren(e('h3','Акаунти адміністраторів'),e('p','Створювати й редагувати адміністраторів може лише власник. Логіни відображаються, але збережені паролі ніколи не розкриваються.','account-note'));
  const create=e('details',undefined,'account-entry');create.append(e('summary','+ Новий адміністратор'));
  const form=e('form',undefined,'account-grid');const username=input(form,'Логін'),pass=input(form,'Початковий пароль (12+ символів)','password');
  pass.minLength=12;pass.required=true;username.required=true;
  const rl=role(form,'viewer'),get=rights(form,['view']),add=e('button','Створити акаунт','account-primary');add.type='submit';form.append(add);
  form.onsubmit=ev=>{ev.preventDefault();add.disabled=true;mutate(()=>api('','POST',{username:username.value.trim(),password:pass.value,role:rl.value,permissions:get()})).finally(()=>{pass.value='';add.disabled=false})};
  create.append(form);root.append(create);
  for(const item of items){
   const panel=e('details',undefined,'account-entry');
   const title=e('summary',undefined,'account-title');title.append(e('strong',item.username),e('span',item.role),e('span',item.active?'Активний':'Призупинено',item.active?'account-active':'account-paused'));panel.append(title);
   const edit=e('form',undefined,'account-grid');const name=input(edit,'Логін','text',item.username),pass=input(edit,'Змінити пароль (порожньо = без змін)','password');
   const rl=role(edit,item.role),get=rights(edit,item.permissions||[]);
   const actions=e('div',undefined,'account-actions');
   const save=e('button','Зберегти','account-primary');save.type='submit';actions.append(save);
   button(actions,item.active?'Призупинити':'Відновити',()=>mutate(()=>api('/'+encodeURIComponent(item.username),'PATCH',{active:!item.active})));
   button(actions,'Видалити',()=>{if(confirm('Видалити адміністратора «'+item.username+'»?'))mutate(()=>api('/'+encodeURIComponent(item.username),'DELETE'))},'account-danger');
   edit.append(actions);
   edit.onsubmit=ev=>{ev.preventDefault();const data={username:name.value.trim(),role:rl.value,permissions:get()};if(pass.value)data.password=pass.value;save.disabled=true;mutate(()=>api('/'+encodeURIComponent(item.username),'PATCH',data)).finally(()=>{pass.value='';save.disabled=false})};
   panel.append(edit);root.append(panel)
  }
 }
 async function reload(){const data=await api();items=data.users||[];render()}
 document.addEventListener('svitlo:admin-ready',()=>{root.hidden=document.body.dataset.adminRole!=='owner';if(!root.hidden)reload().catch(error=>{root.textContent=error.message})});
 document.addEventListener('svitlo:admin-logout',()=>{root.hidden=true;root.replaceChildren();items=[]});
})();