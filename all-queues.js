/* All 12 subqueues at a glance. No network calls or inferred schedules:
 * every pixel comes from the same app timeline() used for individual queues. */
(()=>{'use strict';
 const math=window.SvitloAllQueuesMath;
 const $=id=>document.getElementById(id);
 const dialog=$('allQueuesDialog');
 if(!dialog||!math)return;
 const dayRow=$('allQueuesDays'),root=$('allQueuesMatrix'),notice=$('allQueuesNotice');
 const status=$('allQueuesInspect'),label=$('allQueuesDate'),exportButton=$('allQueuesExport');
 const sourceLink=$('allQueuesSource'),closeButton=$('allQueuesClose');
 const palette={0:'#c9efd9',1:'#29394f','-1':'#e2e9f2'};
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||
  document.documentElement.classList.contains('feature-off-animations');
 const src=()=>window.SvitloAllQueuesSource;
 const e=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
 const dateString=date=>new Intl.DateTimeFormat('uk-UA',{timeZone:'UTC',day:'numeric',month:'long',weekday:'long'}).format(new Date(date+'T12:00:00Z'));
 const weekday=date=>['Нд','Пн','Вт','Ср','Чт','Пт','Сб'][new Date(date+'T12:00:00Z').getUTCDay()];
 let selected='',closing=false,timer=null,selectedCell=null,busy=false;
 function gradient(parts){
  if(parts.length===1&&parts[0].state===-1)
   return 'repeating-linear-gradient(135deg,#dce4ef,#dce4ef 3px,#eff3f8 3px,#eff3f8 6px)';
  return 'linear-gradient(90deg,'+parts.flatMap(p=>[
   palette[p.state]+' '+(p.start/60*100).toFixed(3)+'%',
   palette[p.state]+' '+(p.end/60*100).toFixed(3)+'%'
  ]).join(',')+')';
 }
 const totalOff=parts=>parts.filter(p=>p.state===1).reduce((n,p)=>n+p.end-p.start,0);
 const intervalText=parts=>parts.filter(p=>p.state===1).map(p=>math.time(p.start)+'–'+math.time(p.end));
 function inspect(queue){
  if(!src())return;
  selectedCell={queue};
  for(const node of root.querySelectorAll('.all-queues-lane.is-selected'))node.classList.remove('is-selected');
  root.querySelector('[data-queue="'+queue+'"]')?.classList.add('is-selected');
  const parts=math.allDaySegments(src().timeline(selected,queue));
  const off=intervalText(parts);
  status.textContent='Підчерга '+queue+' · '+(parts.some(p=>p.state===-1)?'Частина дня без підтверджених даних. ':'')+
   (off.length?'Відключення: '+off.join(', '):parts.every(p=>p.state===0)?'За графіком світло весь день':'Підтверджених відключень немає');
 }
 function render(){
  if(!src()||!dialog.open)return;
  const dates=src().dates();
  if(!dates.includes(selected))selected=dates.includes(src().today())?src().today():dates[0];
  label.textContent=dateString(selected);
  dayRow.replaceChildren();
  for(const date of dates){
   const b=e('button','all-queues-day'+(date===selected?' active':''),weekday(date));
   b.type='button';b.setAttribute('aria-label',dateString(date));
   b.setAttribute('aria-pressed',String(date===selected));
   b.onclick=()=>{selected=date;selectedCell=null;render()};
   dayRow.append(b);
  }
  const day=src().day(selected),confirmed=src().noSchedule(selected),offline=src().offline();
  const source=day?.source||'https://www.cherkasyoblenergo.com/news';
  if(sourceLink)sourceLink.href=/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(source)?source:'https://www.cherkasyoblenergo.com/news';
  notice.textContent=offline?
   'Офлайн: збережені дані могли змінитися. Перевірено: '+(src().lastChecked()||'невідомо'):
   day?'Офіційний графік · '+(day.publishedAt?'опубліковано '+new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).format(new Date(day.publishedAt)):'публікацію підтверджено'):
   confirmed?'За опублікованим графіком планових відключень немає.':
   'Немає підтвердженого графіка. Невідомі години позначено сірим.';
  root.replaceChildren();
  const axis=e('div','all-queues-time-scale');
  for(const t of ['00:00','06:00','12:00','18:00','24:00'])axis.append(e('span','',t));
  root.append(axis);
  for(const queue of math.QUEUES){
   const parts=math.allDaySegments(src().timeline(selected,queue));
   const off=intervalText(parts),unknown=parts.some(p=>p.state===-1);
   const lane=e('button','all-queues-lane'+(selectedCell?.queue===queue?' is-selected':''));lane.type='button';lane.dataset.queue=queue;
   lane.setAttribute('aria-expanded',String(selectedCell?.queue===queue));
   const name=e('span','all-queues-lane-name',queue);
   const content=e('span','all-queues-lane-content');
   const bar=e('span','all-queues-lane-track');
   for(const p of parts){
    const segment=e('span','all-queues-lane-segment state-'+(p.state===0?'on':p.state===1?'off':'unknown'));
    segment.style.width=((p.end-p.start)/1440*100).toFixed(5)+'%';
    bar.append(segment);
   }
   const line=e('span','all-queues-lane-caption',off.length?
     off.slice(0,3).join('  ·  ')+(off.length>3?'  ·  ще '+(off.length-3):''):
     unknown?'Години не підтверджені':'Світло весь день');
   content.append(bar,line);
   const arrow=e('span','all-queues-lane-arrow','›');arrow.setAttribute('aria-hidden','true');
   lane.append(name,content,arrow);
   lane.setAttribute('aria-label','Підчерга '+queue+'. '+(off.length?'Відключення: '+off.join(', '):unknown?'Години не підтверджені':'Світло весь день')+'. Натисніть для деталей');
   lane.onclick=()=>{selectedCell?.queue===queue?selectedCell=null:selectedCell={queue};render()};
   root.append(lane);
   if(selectedCell?.queue===queue){
    const detail=e('div','all-queues-row-detail');
    detail.append(e('strong','','Підчерга '+queue+' · без світла '+(totalOff(parts)/60).toLocaleString('uk-UA',{maximumFractionDigits:1})+' год'));
    if(off.length)for(const interval of off)detail.append(e('span','all-queues-interval',interval));
    else detail.append(e('span','all-queues-interval',unknown?'Не всі години підтверджені':'Відключень не заплановано'));
    if(unknown)detail.append(e('p','','Сірі проміжки не є підтвердженням наявності світла.'));
    root.append(detail);
   }
  }
  const key=$('allQueues24Label');if(key)key.hidden=true;
  if(selectedCell)inspect(selectedCell.queue);
  else status.textContent='Натисніть на будь-яку підчергу, щоб розгорнути точні години відключень.';
 }
 let afterClose=null;
 function dismiss(next){
  if(typeof next==='function')afterClose=next;
  if(!dialog.open||closing)return;
  if(reduced()){dialog.close();return}
  closing=true;dialog.classList.add('is-leaving');
  timer=setTimeout(()=>{timer=null;if(dialog.open)dialog.close()},230);
 }
 dialog.addEventListener('close',()=>{
  clearTimeout(timer);timer=null;closing=false;dialog.classList.remove('is-leaving');
  const next=afterClose;afterClose=null;if(next)next();
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss()});
 dialog.addEventListener('click',event=>{if(event.target===dialog)dismiss()});
 closeButton.onclick=()=>dismiss();
 window.SvitloSheetMotion?.bind(dialog,()=>dismiss());
 function open(date){
  if(!src())return;
  const dates=src().dates();
  selected=math.safeDate(date)&&dates.includes(date)?date:src().today();
  selectedCell=null;
  if(!dialog.open)try{dialog.showModal()}catch(error){console.warn('All queues:',error);return}
  render();
 }
 function imageCanvas(){
  if(!src())throw Error('Schedule model unavailable');
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1130;
  const c=canvas.getContext('2d');if(!c)throw Error('Canvas unavailable');
  const W=canvas.width,H=canvas.height;
  c.fillStyle='#f6f9fe';c.fillRect(0,0,W,H);
  c.fillStyle='#172b48';c.fillRect(0,0,W,225);
  c.fillStyle='#8fc5ff';c.font='700 26px -apple-system, BlinkMacSystemFont, Arial';c.fillText('СВІТЛО ЧЕРКАСИ',80,71);
  c.fillStyle='#fff';c.font='bold 59px -apple-system, BlinkMacSystemFont, Arial';c.fillText('Графік усіх підчерг',80,142);
  c.font='32px -apple-system, BlinkMacSystemFont, Arial';
  c.fillStyle='#d4e4f9';c.fillText(dateString(selected),80,195);
  const left=175,right=1510,gridW=right-left,rowH=47,rowGap=7,firstY=322;
  c.textBaseline='middle';
  c.font='700 19px -apple-system, BlinkMacSystemFont, Arial';c.fillStyle='#69829f';
  c.fillText('ПІДЧЕРГА',70,286);
  c.textAlign='center';
  for(let h=0;h<=24;h+=2)c.fillText(String(h).padStart(2,'0'),left+gridW*h/24,286);
  c.textAlign='left';
  for(let qi=0;qi<math.QUEUES.length;qi++){
   const queue=math.QUEUES[qi],y=firstY+qi*(rowH+rowGap);
   c.fillStyle=qi%2===0?'#ebf1f8':'#f5f8fc';c.fillRect(56,y-3,1480,rowH+6);
   c.fillStyle='#203a5b';c.font='bold 30px -apple-system, BlinkMacSystemFont, Arial';c.fillText(queue,86,y+rowH/2);
   const line=src().timeline(selected,queue);
   const parts=math.allDaySegments(line);
   for(const p of parts){
    const x=left+gridW*p.start/1440,w=gridW*(p.end-p.start)/1440;
    c.fillStyle=palette[p.state];c.fillRect(x,y,Math.max(.6,w),rowH);
    if(p.state===-1&&w>=3){
     c.save();c.beginPath();c.rect(x,y,w,rowH);c.clip();c.strokeStyle='#acb9cb';c.lineWidth=1.2;
     for(let d=-rowH;d<w+rowH;d+=13){c.beginPath();c.moveTo(x+d,y+rowH);c.lineTo(x+d+rowH,y);c.stroke()}
     c.restore();
    }
   }
   c.fillStyle='#ffffff8a';
   for(let h=1;h<24;h++){const x=left+gridW*h/24;c.fillRect(x,y,1,rowH)}
  }
  const legendY=1004;
  for(const [i,[color,label]]of [[palette[0],'За графіком світло є'],[palette[1],'Планове відключення'],['#dce4ef','Немає даних']].entries()){
   const x=70+i*510;c.fillStyle=color;c.fillRect(x,legendY,28,24);
   c.fillStyle='#526985';c.font='23px -apple-system, BlinkMacSystemFont, Arial';c.textBaseline='middle';c.fillText(label,x+39,legendY+12);
  }
  const hasUnknown=math.QUEUES.some(queue=>math.allDaySegments(src().timeline(selected,queue)).some(s=>s.state===-1));
  c.fillStyle='#6f8199';c.font='21px -apple-system, BlinkMacSystemFont, Arial';
  c.fillText(hasUnknown?'Деякі інтервали не підтверджені.':'Показано плановий графік, не фактичний стан електромережі.',70,1070);
  c.textAlign='right';c.font='bold 22px -apple-system, BlinkMacSystemFont, Arial';
  c.fillText('svitlo-cherkasy.pp.ua',1530,1070);
  return canvas;
 }
 async function exportPng(){
  if(busy)return;
  busy=true;exportButton.disabled=true;
  try{
   const canvas=imageCanvas();
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG unavailable')),'image/png'));
   if(!blob)throw Error('PNG unavailable');
   const filename='svitlo-cherkasy-vsi-pidchergy-'+selected+'.png';
   // Reuse the existing save/share preview so iPhone and Android behave alike.
   if(typeof src()?.sharePreview==='function')await src().sharePreview(blob,filename,selected,'Усі підчерги');
   else{
    const url=URL.createObjectURL(blob),a=e('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
   }
  }catch(error){console.warn('All queues export:',error);status.textContent='Не вдалося створити PNG. Спробуйте ще раз.'}
  finally{busy=false;exportButton.disabled=false}
 }
 exportButton.onclick=()=>exportPng();
 for(const id of ['allQueuesHomeOpen','allQueuesDetailOpen']){
  $(id)?.addEventListener('click',()=>open(id==='allQueuesDetailOpen'?src()?.selectedDate():src()?.today()));
 }
 window.SvitloAllQueues={open,refresh:()=>{if(dialog.open&&!closing)render()},model:math};
})();
