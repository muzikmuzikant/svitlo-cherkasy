/* A safe, non-HTML PWA homepage builder. Only text and whitelisted layouts. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 if(!$('homeBuilderSave'))return;
 let previous=null,busy=false;
 const ids=['Eyebrow','Headline','Subtitle','Layout'];
 const announce=s=>{$('homeBuilderStatus').textContent=s};
 const values=()=>({
  eyebrow:$('homeBuilderEyebrow').value.trim(),
  headline:$('homeBuilderHeadline').value.trim(),
  subtitle:$('homeBuilderSubtitle').value.trim(),
  layout:$('homeBuilderLayout').value
 });
 function preview(){
  const v=values();
  $('homeBuilderPreviewEyebrow').textContent=v.eyebrow||'ВСЕ ПРО СВІТЛО';
  $('homeBuilderPreviewHeadline').textContent=v.headline||'Все під контролем.';
  $('homeBuilderPreviewSubtitle').textContent=v.subtitle||'Оберіть адресу. Решту зробимо ми.';
  $('homeBuilderPreview').dataset.layout=v.layout;
 }
 async function refresh(){
  if(busy)return;
  busy=true;
  try{
   previous=await api('app-config');
   const home=previous.site?.home||{};
   for(const [suffix,key,fallback] of [['Eyebrow','eyebrow','ВСЕ ПРО СВІТЛО'],['Headline','headline','Все під контролем.'],['Subtitle','subtitle','Оберіть адресу. Решту зробимо ми.'],['Layout','layout','classic']])
    $('homeBuilder'+suffix).value=home[key]||fallback;
   $('homeBuilderSave').disabled=document.body.dataset.adminRole!=='owner';
   preview();announce('Завантажено поточне оформлення.');
  }catch(e){announce('Не вдалося завантажити: '+e.message)}
  finally{busy=false}
 }
 async function save(){
  if(busy||document.body.dataset.adminRole!=='owner'||!previous)return;
  const home=values();
  if(!home.eyebrow||!home.headline||!home.subtitle){announce('Заповніть усі три текстові поля.');return}
  if(!confirm('Опублікувати новий заголовок і компонування головної сторінки для всіх користувачів?'))return;
  busy=true;$('homeBuilderSave').disabled=true;
  try{
   const updated=await api('home',{method:'PUT',body:JSON.stringify({home,expectedUpdatedAt:previous.updatedAt})});
   previous=updated;preview();announce('Оформлення збережено. Застосунок застосує його при оновленні налаштувань.');
   try{const channel=new BroadcastChannel('svitlo-content-v1');channel.postMessage({type:'REFRESH_APP_CONFIG'});channel.close()}catch{}
  }catch(e){announce('Не опубліковано: '+e.message)}
  finally{busy=false;$('homeBuilderSave').disabled=document.body.dataset.adminRole!=='owner'}
 }
 for(const suffix of ids){
  $('homeBuilder'+suffix).addEventListener('input',preview);
  $('homeBuilder'+suffix).addEventListener('change',preview);
 }
 $('homeBuilderReload').onclick=refresh;
 $('homeBuilderSave').onclick=save;
 document.querySelector('[data-admin-tab="design"]')?.addEventListener('click',refresh);
 document.addEventListener('svitlo:admin-logout',()=>{previous=null;announce('Сеанс завершено.')});
})();
