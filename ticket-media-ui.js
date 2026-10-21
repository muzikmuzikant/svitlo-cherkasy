/* Shared private support attachments. No public or persistent URLs. */
(()=>{'use strict';
 const TYPES={'image/jpeg':2*1048576,'image/png':2*1048576,'image/webp':2*1048576,
  'video/mp4':8*1048576,'video/quicktime':8*1048576,'video/webm':8*1048576};
 const LIMIT=9*1048576,MAX=3;
 const isVideo=mime=>mime.startsWith('video/');
 const size=bytes=>(bytes/1048576).toLocaleString('uk-UA',{maximumFractionDigits:1})+' МБ';
 function error(message){throw new Error(message)}
 function validate(files){
  const selected=Array.from(files||[]);
  if(selected.length>MAX)error('Не більше трьох фото або відео на одне повідомлення.');
  let total=0;
  for(const file of selected){
   if(!TYPES[file.type])error('Формати: JPG, PNG, WebP, MP4, MOV або WebM.');
   if(!file.size||file.size>TYPES[file.type])
    error(isVideo(file.type)?'Відео повинне бути до 8 МБ.':'Фото повинне бути до 2 МБ.');
   total+=file.size;
  }
  if(total>LIMIT)error('Загальний розмір вкладень до 9 МБ.');
  return selected;
 }
 function read(file){
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onerror=()=>reject(Error('Не вдалося прочитати файл'));
   reader.onload=()=>{
    const value=String(reader.result||'');
    const comma=value.indexOf(',');
    if(comma<0)return reject(Error('Помилка зчитування файлу'));
    resolve({name:file.name.slice(0,90),mime:file.type,data:value.slice(comma+1)});
   };
   reader.readAsDataURL(file);
  });
 }
 function picker(input,output,status){
  let selected=[],previews=[];
  const notice=text=>{if(status)status.textContent=text};
  function clear(){
   for(const uri of previews)URL.revokeObjectURL(uri);
   previews=[];selected=[];input.value='';output.replaceChildren();notice('');
  }
  function draw(){
   for(const uri of previews)URL.revokeObjectURL(uri);
   previews=[];output.replaceChildren();
   for(const [index,file] of selected.entries()){
    const row=document.createElement('div');row.className='ticket-upload-item';
    if(file.type.startsWith('image/')){
     const uri=URL.createObjectURL(file);previews.push(uri);
     const img=document.createElement('img');img.src=uri;img.alt='Попередній вигляд: '+file.name;img.loading='lazy';row.append(img);
    }else{
     const icon=document.createElement('span');icon.className='ticket-upload-video';icon.textContent='▶';row.append(icon);
    }
    const label=document.createElement('span');label.className='ticket-upload-name';
    const title=document.createElement('strong');title.textContent=file.name;
    const meta=document.createElement('small');meta.textContent=size(file.size);
    label.append(title,meta);row.append(label);
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';
    remove.title='Прибрати '+file.name;remove.setAttribute('aria-label',remove.title);
    remove.onclick=()=>{selected.splice(index,1);draw()};
    row.append(remove);output.append(row);
   }
   notice(selected.length?'Вкладено: '+selected.length+' із 3':'');
  }
  input.addEventListener('change',()=>{
   try{
    const incoming=Array.from(input.files||[]);
    selected=validate([...selected,...incoming]);
    draw();
   }catch(e){notice(e.message)}
   input.value='';
  });
  return {clear,async collect(){return Promise.all(validate(selected).map(read))},count:()=>selected.length};
 }
 function decode(data){
  const bin=atob(data),buffer=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)buffer[i]=bin.charCodeAt(i);
  return buffer;
 }
 let activeMediaRequest=0;
 function viewer(){
  let dialog=document.getElementById('privateTicketViewer');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='privateTicketViewer';dialog.className='ticket-media-dialog';
  const head=document.createElement('div');head.className='ticket-media-head';
  const title=document.createElement('strong');title.className='ticket-media-title';
  const close=document.createElement('button');close.type='button';close.textContent='Закрити ×';close.onclick=()=>dialog.close();
  head.append(title,close);
  const content=document.createElement('div');content.className='ticket-media-content';
  dialog.append(head,content);document.body.append(dialog);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  dialog.addEventListener('close',()=>{
   const media=content.querySelector('video');media?.pause();
   content.replaceChildren();
   if(dialog.dataset.objectUrl){URL.revokeObjectURL(dialog.dataset.objectUrl);delete dialog.dataset.objectUrl}
  });
  return dialog;
 }
 async function openFile(info,fetcher){
  const request=++activeMediaRequest;
  if(!info?.id||!['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'].includes(info.mime))return;
  const dialog=viewer(),content=dialog.querySelector('.ticket-media-content');
  if(dialog.open)dialog.close();
  dialog.querySelector('.ticket-media-title').textContent=info.name||'Вкладення';
  content.textContent='Завантажуємо захищений файл…';dialog.showModal();
  try{
   const payload=await fetcher(info.id);
   if(!dialog.open||request!==activeMediaRequest)return;
   if(payload.mime!==info.mime)throw Error('Формат файлу не збігається');
   const bytes=decode(payload.data),url=URL.createObjectURL(new Blob([bytes],{type:payload.mime}));
   dialog.dataset.objectUrl=url;content.replaceChildren();
   const el=document.createElement(isVideo(payload.mime)?'video':'img');
   el.src=url;if(isVideo(payload.mime)){el.controls=true;el.playsInline=true;el.preload='metadata'}
   else el.alt=info.name||'Додане фото';
   content.append(el);
   // MOV codecs are not supported in every desktop browser: keep a secure
   // download action as a fallback for authorized operators.
   const download=document.createElement('a');
   download.className='ticket-media-download';download.href=url;
   download.download=String(payload.name||info.name||'support-file').slice(0,90);
   download.textContent='Зберегти файл для перегляду';
   content.append(download);
  }catch(e){if(dialog.open&&request===activeMediaRequest)content.textContent='Не вдалося відкрити вкладення: '+e.message}
 }
 function render(list,fetcher){
  if(!Array.isArray(list)||!list.length)return null;
  const container=document.createElement('div');container.className='ticket-media-list';
  for(const meta of list){
   if(!meta||typeof meta.id!=='string')continue;
   const button=document.createElement('button');button.type='button';button.className='ticket-media-link';
   const icon=document.createElement('span');icon.textContent=isVideo(meta.mime||'')?'▶':'▧';
   const label=document.createElement('span');label.textContent=String(meta.name||'Вкладення').slice(0,90);
   const detail=document.createElement('small');detail.textContent=size(Number(meta.size)||0);
   button.append(icon,label,detail);button.onclick=()=>void openFile(meta,fetcher);
   container.append(button);
  }
  return container;
 }
 window.SvitloTicketMedia={picker,render,validate};
})();
