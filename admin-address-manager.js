/* Verified address corrections only. Never infer a queue from an unverified street. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 if(!$('addressMgrLoad'))return;
 const queues=Array.from({length:6},(_,i)=>[i+1+'.1',i+1+'.2']).flat();
 for(const q of queues)$('addressMgrQueue').add(new Option('Підчерга '+q,q));
 const norm=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase('uk-UA')
  .replace(/[’ʼ`]/g,"'").replace(/^(?:вулиця|вул\.?|провулок|пров\.?|проспект|бульвар)\s+/,'')
  .replace(/[^\p{L}\p{N}]+/gu,'');
 const locality=s=>({'червонаслобода':'слобода','первомайське':'соснове','іванівка':'яничі'}[norm(s)]||norm(s));
 const isSource=s=>{try{const u=new URL(s);return u.protocol==='https:'&&['cherkasyoblenergo.com','www.cherkasyoblenergo.com'].includes(u.hostname)&&!u.username&&!u.password}catch{return false}};
 const say=s=>{$('addressMgrStatus').textContent=s};
 let manual=null,published=null,busy=false;
 const selection=()=>{
  const town=$('addressMgrTown').value.trim(),raw=$('addressMgrStreet').value.trim();
  if(!town||!raw)throw Error('Заповніть населений пункт і вулицю');
  const t=locality(town),street=norm(raw),type=$('addressMgrType').value,house=norm($('addressMgrHouse').value);
  if(!/^[\p{L}\p{N}]{2,65}$/u.test(t)||!street||street.length>95)throw Error('Некоректна назва населеного пункту або вулиці');
  if(!['вулиця','провулок','проспект','бульвар'].includes(type))throw Error('Невідомий тип вулиці');
  if(house.length>20)throw Error('Номер будинку надто довгий');
  return {town:t,display:type.charAt(0).toUpperCase()+type.slice(1)+' '+raw.replace(/^(вулиця|вул\.?|провулок|пров\.?|проспект|бульвар)\s+/i,''),key:type+'|'+street,house};
 };
 const getLocalities=data=>data?.localities||{};
 function inspect(){
  if(!published||!manual)throw Error('Спочатку оновіть дані');
  const s=selection(),base=getLocalities(published.contents)[s.town]||{};
  const fix=getLocalities(manual.contents.addresses)[s.town]||{};
  const baseQueues=base.streetQueues?.[s.key]||[];
  const fixQueues=fix.streetQueues?.[s.key]||[];
  const baseHouses=Object.keys(base.keys||{}).filter(k=>k.startsWith(s.key+'|'));
  const fixHouses=Object.keys(fix.keys||{}).filter(k=>k.startsWith(s.key+'|'));
  const existing=s.house?fix.keys?.[s.key+'|'+s.house]||base.keys?.[s.key+'|'+s.house]||[]:fixQueues.length?fixQueues:baseQueues;
  const lines=[
   'Вулиця: '+s.display+' · населений пункт: '+s.town,
   'Офіційний довідник (підчерги вулиці): '+(baseQueues.length?baseQueues.join(', '):'Не визначено'),
   'Ручні уточнення (підчерги вулиці): '+(fixQueues.length?fixQueues.join(', '):'Немає'),
   'Будинків із конкретними записами: у довіднику '+baseHouses.length+', у ручних уточненнях '+fixHouses.length,
   'Чинний запис для вибраної адреси: '+(existing.length?existing.join(', '):'Невідомо')
  ];
  const message=lines.join('\n');
  $('addressMgrInspection').textContent=message;
  return {...s,baseQueues,fixQueues,baseHouses,fixHouses,existing};
 }
 function render(){
  const host=$('addressMgrList');host.replaceChildren();
  const places=Object.entries(getLocalities(manual?.contents?.addresses));
  let total=0;
  for(const [town,data] of places) {
   const rows=[
    ...Object.entries(data.streetQueues||{}).map(([key,queues])=>({town,key,house:'',queues})),
    ...Object.entries(data.keys||{}).map(([raw,queues])=>{
     const [type,name,...rest]=raw.split('|');return {town,key:type+'|'+name,house:rest.join('|'),queues};
    })
   ];
   for(const row of rows){
    total++;
    if(total>160){host.append(document.createTextNode('Додаткові уточнення доступні через пошук.'));break}
    const wrapper=document.createElement('div');wrapper.className='control-subcard';
    const label=document.createElement('strong');label.textContent=town+' · '+row.key.replace('|',' ') +(row.house?', буд. '+row.house:'')+' · '+(Array.isArray(row.queues)?row.queues.join(', '):'');
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Скасувати уточнення';button.disabled=document.body.dataset.adminRole!=='owner';
    button.addEventListener('click',()=>removeEntry(row));
    wrapper.append(label,button);host.append(wrapper);
   }
  }
  $('addressMgrCount').textContent=total+' ручних уточнень у вибірці.';
  if(!total)host.textContent='Ручних уточнень немає.';
 }
 async function reload(){
  if(busy)return;busy=true;$('addressMgrLoad').disabled=true;
  try{
   const [m,p]=await Promise.all([api('file?kind=overrides'),api('file?kind=streets')]);
   manual=m;published=p;render();say('Дані завантажені. Офіційне підтвердження підчерги залишається обов’язковим.');
  }catch(e){say('Не вдалося прочитати дані: '+e.message)}
  finally{busy=false;$('addressMgrLoad').disabled=false}
 }
 async function write(change,description){
  if(busy||document.body.dataset.adminRole!=='owner')return;
  busy=true;$('addressMgrPublish').disabled=true;
  try{
   const latest=await api('file?kind=overrides');
   if(latest.sha!==manual.sha)throw Error('Зміни в GitHub уже опублікували з іншого сеансу. Оновіть дані.');
   const updated=structuredClone(latest.contents);
   change(updated);
   updated.updatedAt=new Date().toISOString();
   const answer=await api('file?kind=overrides',{method:'PUT',body:JSON.stringify({sha:latest.sha,contents:updated})});
   say(description+' Опубліковано: '+(answer.commit||'збережено')+'. Зміни з’являться після оновлення GitHub Pages.');
   manual=await api('file?kind=overrides');render();
  }catch(e){say('Не опубліковано: '+e.message)}
  finally{busy=false;$('addressMgrPublish').disabled=false}
 }
 async function removeEntry(row){
  if(!confirm('Скасувати лише це ручне уточнення? Після публікації діятимуть наявні офіційні дані.'))return;
  await write(data=>{
   const town=data.addresses?.localities?.[row.town];if(!town)throw Error('Уточнення не знайдене');
   if(row.house)delete town.keys[row.key+'|'+row.house];
   else delete town.streetQueues[row.key];
  },'Уточнення скасовано.');
 }
 $('addressMgrPublish').onclick=async()=>{
  try{
   const s=inspect(),source=$('addressMgrSource').value.trim(),queue=$('addressMgrQueue').value;
   if(!isSource(source))throw Error('Потрібне HTTPS-посилання саме на офіційне джерело Черкасиобленерго');
   if(!queues.includes(queue))throw Error('Оберіть підтверджену підчергу');
   if(!s.house&&(s.baseHouses.length||s.fixHouses.length||s.baseQueues.length>1||s.fixQueues.length>1))
    throw Error('Виявлено поділ по будинках або декілька підчерг. Укажіть точний номер будинку.');
   const current=s.existing.join(', ')||'невідомо';
   if(!confirm('Публікуємо: '+s.display+' / '+s.town+(s.house?' / буд. '+s.house:' / уся вулиця')+' → '+queue+' (поточне: '+current+').\n\nВи особисто перевірили цю підчергу за офіційним джерелом?'))return;
   await write(data=>{
    data.addresses??={};data.addresses.localities??={};
    const loc=data.addresses.localities[s.town]??={keys:{},streets:{},streetQueues:{}};
    loc.keys??={};loc.streets??={};loc.streetQueues??={};
    loc.streets[s.key]=s.display;
    if(s.house)loc.keys[s.key+'|'+s.house]=[queue];
    else loc.streetQueues[s.key]=[queue];
    data.addressesSource=source;
   },'Адресу уточнено.');
  }catch(e){say(e.message)}
 };
 $('addressMgrLoad').onclick=reload;
 $('addressMgrInspect').onclick=()=>{try{inspect();say('Відображено чинні записи. Підчергу звіряйте з офіційним джерелом, не з припущеннями.')}catch(e){say(e.message)}};
 document.querySelector('[data-admin-tab="addresses"]')?.addEventListener('click',reload);
 document.addEventListener('svitlo:admin-logout',()=>{manual=null;published=null;$('addressMgrList').replaceChildren();say('Увійдіть для редагування адрес.')});
})();
