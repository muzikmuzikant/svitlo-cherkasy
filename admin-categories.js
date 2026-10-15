/* Configure support categories and their extra text/select/checkbox fields. */
(()=>{'use strict';const root=document.getElementById('adminSupportCategories');if(!root)return;
 const e=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n};
 const api=(method='GET',body)=>window.svitloAdminApi('feedback/categories',{method,body:body===undefined?undefined:JSON.stringify(body)});
 let categories=null,dirty=false;
 const changed=()=>{dirty=true;const status=document.getElementById('supportCategoriesStatus');if(status)status.textContent='Незбережені зміни'};
 const input=(host,label,obj,key,type='text')=>{const row=e('label',undefined,'support-category-field');row.append(e('span',label));
  const field=e(type==='long'?'textarea':'input');if(type!=='long')field.type=type==='toggle'?'checkbox':type;
  if(type==='toggle')field.checked=obj[key]===true;else field.value=obj[key]??'';
  const write=()=>{obj[key]=type==='toggle'?field.checked:field.value;changed()};field.addEventListener('input',write);field.addEventListener('change',write);
  row.append(field);host.append(row);return field
 };
 const btn=(host,label,click)=>{const b=e('button',label);b.type='button';b.onclick=click;host.append(b);return b};
 function render(){
  root.replaceChildren();
  root.append(e('p','Налаштування застосовуються до нових звернень. Існуючі звернення зберігають попередню тему та дані.','hint'));
  for(const [index,c] of categories.entries()){
   const card=e('details',undefined,'support-category-card');card.open=!c.title;
   card.append(e('summary',c.title||'Нова категорія'));
   const form=e('div',undefined,'support-category-fields');
   input(form,'Код категорії латиницею',c,'id');
   input(form,'Назва для користувача',c,'title');
   input(form,'Підказка до звернення',c,'hint','long');
   input(form,'Показувати категорію',c,'enabled','toggle');
   const priorityLabel=e('label',undefined,'support-category-field');priorityLabel.append(e('span','Пріоритет нових звернень цієї категорії'));
   const priority=e('select');for(const [id,label] of [['normal','Звичайний'],['high','Високий']]){const option=e('option',label);option.value=id;priority.append(option)}
   priority.value=c.priority||'normal';priority.onchange=()=>{c.priority=priority.value;changed()};priorityLabel.append(priority);form.append(priorityLabel);
   const fields=e('div',undefined,'support-extra-edit');fields.append(e('h4','Додаткові поля'));
   for(const [j,field] of (c.fields||[]).entries()){
    const row=e('div',undefined,'support-category-extra');const inner=e('div',undefined,'support-category-fields');
    input(inner,'Код поля латиницею',field,'id');
    input(inner,'Назва поля',field,'label');
    const selectWrap=e('label',undefined,'support-category-field');selectWrap.append(e('span','Тип поля'));
    const type=e('select');for(const [value,label] of [['text','Текст'],['select','Вибір'],['checkbox','Перемикач']]){const opt=e('option',label);opt.value=value;type.append(opt)}type.value=field.type;
    type.onchange=()=>{field.type=type.value;changed()};selectWrap.append(type);inner.append(selectWrap);
    const options=e('label',undefined,'support-category-field');options.append(e('span','Варіанти для вибору, через кому'));
    const text=e('input');text.value=(field.options||[]).join(', ');
    text.onchange=()=>{field.options=text.value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12);changed()};
    options.append(text);inner.append(options);
    input(inner,'Обов’язкове поле',field,'required','toggle');
    row.append(inner);btn(row,'Видалити поле',()=>{c.fields.splice(j,1);changed();render()});fields.append(row)
   }
   btn(fields,'➕ Нове поле',()=>{c.fields.push({id:'field_'+(c.fields.length+1),label:'Нове поле',type:'text',required:false,options:[]});changed();render()});
   form.append(fields);
   btn(form,'Видалити категорію',()=>{if(confirm('Видалити категорію зі списку для нових звернень?')){categories.splice(index,1);changed();render()}});
   card.append(form);root.append(card)
  }
  const toolbar=e('div',undefined,'support-category-actions');
  btn(toolbar,'➕ Нова категорія',()=>{categories.push({id:'new_'+Date.now().toString(36).slice(-6),title:'Нова категорія',hint:'',enabled:false,fields:[]});changed();render()});
  const save=btn(toolbar,'Зберегти категорії',async()=>{
   if(!dirty)return;save.disabled=true;const status=document.getElementById('supportCategoriesStatus');
   try{const result=await api('PUT',{categories});categories=result.categories;dirty=false;render();const s=document.getElementById('supportCategoriesStatus');if(s)s.textContent='Збережено на сервері'}
   catch(error){if(status)status.textContent=error.message;save.disabled=false}
  });save.className='support-category-save';
  const status=e('span',dirty?'Незбережені зміни':'Налаштування завантажено','hint');status.id='supportCategoriesStatus';
  toolbar.append(status);root.append(toolbar)
 }
 async function load(){root.textContent='Завантажуємо конфігурацію…';try{const result=await api();categories=result.categories||[];dirty=false;render()}catch(e){root.textContent='Помилка: '+e.message}}
 document.querySelector('[data-admin-tab="feedback"]')?.addEventListener('click',()=>{if(!categories)load()});
 document.addEventListener('svitlo:admin-ready',()=>load());
 document.addEventListener('svitlo:admin-logout',()=>{categories=null;root.replaceChildren()});
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue=''}});
})();