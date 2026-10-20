/* Guided no-JSON publication for verified manual corrections. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const load=$('quickLoadCurrent'),publish=$('quickPublishDirect'),status=$('quickPublishStatus');
 if(!load||!publish||!status)return;
 let busy=false;
 const tell=text=>{status.textContent=text};
 const draft=()=>window.svitloAdminDraft?.();
 const connected=()=>document.body.dataset.adminRole==='owner'&&typeof window.svitloAdminApi==='function';
 const get=route=>window.svitloAdminApi(route);
 load.onclick=async()=>{
  if(busy)return;
  if(!connected()){tell('Потрібно увійти як власник. Перевірте підключення GitHub на Railway.');return}
  const old=draft();
  if(old&&old.kind==='overrides'&&old.original){
   try{if(JSON.stringify(JSON.parse(old.raw))!==JSON.stringify(old.original)&&!confirm('Є неопубліковані зміни. Завантажити дані заново?'))return}
   catch{if(!confirm('Є неперевірений чернетковий текст. Замінити його?'))return}
  }
  busy=true;load.disabled=true;
  try{
   $('kind').value='overrides';
   await $('kind').onchange();
   if(draft()?.kind!=='overrides')throw Error('Не вдалося завантажити ручні уточнення');
   tell('Актуальні дані завантажено. Тепер можна підготувати уточнення через форму вище.');
  }catch(e){tell('Помилка: '+e.message)}
  finally{load.disabled=false;busy=false}
 };
 publish.onclick=async()=>{
  if(busy)return;
  if(!connected()){tell('Публікація доступна тільки власнику через захищений сервер.');return}
  const current=draft();
  if(current?.kind!=='overrides'||!current.original){tell('Натисніть «Завантажити актуальні уточнення».');return}
  let candidate;
  try{candidate=JSON.parse(current.raw)}
  catch{tell('Чернетка некоректна. Завантажте дані й повторіть підготовку.');return}
  if(JSON.stringify(candidate)===JSON.stringify(current.original)){tell('Немає нових підготовлених уточнень.');return}
  if(!confirm('Опублікувати підготовлене уточнення на GitHub? Це змінить дані для користувачів після публікації сайту.'))return;
  busy=true;publish.disabled=true;
  try{
   // Re-check latest contents. Never overwrite a change published by another administrator.
   const latest=await get('file?kind=overrides');
   if(JSON.stringify(latest.contents)!==JSON.stringify(current.original))
    throw Error('Відтоді файл змінився. Збережіть свою чернетку та звірте її з новою версією.');
   const response=await window.svitloAdminApi('file?kind=overrides',{method:'PUT',body:JSON.stringify({sha:latest.sha,contents:candidate})});
   await $('kind').onchange();
   tell('Уточнення опубліковано! Коміт: '+response.commit+'. Оновлення сайту може відбутися не одразу.');
  }catch(e){tell('Не опубліковано: '+e.message)}
  finally{busy=false;publish.disabled=false}
 };
 document.addEventListener('svitlo:admin-logout',()=>tell('Увійдіть як власник для публікації.'));
})();
