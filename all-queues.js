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
 const enabled=key=>!document.documentElement.classList.contains('feature-off-'+key);
 const nowFraction=()=>{const bits=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const n=key=>Number(bits.find(b=>b.type===key)?.value||0);return (n('hour')*60+n('minute'))/1440*100};
 const e=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
 const dateString=date=>new Intl.DateTimeFormat('uk-UA',{timeZone:'UTC',day:'numeric',month:'long',weekday:'long'}).format(new Date(date+'T12:00:00Z'));
 const weekday=date=>['Нд','Пн','Вт','Ср','Чт','Пт','Сб'][new Date(date+'T12:00:00Z').getUTCDay()];
 let selected='',closing=false,timer=null,selectedCell=null,busy=false;
 let currentSignature='',expandedToken=0;
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
 const duration=n=>Math.floor(n/60)?Math.floor(n/60)+' год'+(n%60?' '+n%60+' хв':''):n+' хв';
 const modes=e('nav','all-queues-modes'),controls=e('div','all-queues-mode-controls');
 modes.setAttribute('aria-label','Режим перегляду');
 dayRow.after(modes,controls);
 const detailPanel=e('section','all-queues-detail-panel');detailPanel.hidden=true;detailPanel.setAttribute('aria-live','polite');
 root.closest('.all-queues-chart')?.append(detailPanel);
 let mode='all',group=1,compare=['1.1','2.1'];
 const partsFor=queue=>math.allDaySegments(src().timeline(selected,queue));
 function drawModes(){
  if(mode==='groups'&&!enabled('allQueuesGroups'))mode='all';
  if(mode==='compare'&&!enabled('allQueuesCompare'))mode='all';
  modes.replaceChildren();controls.replaceChildren();
  for(const [key,title,feature] of [['all','Усі 12',null],['groups','За групами','allQueuesGroups'],['compare','Порівняння','allQueuesCompare']]){
   if(feature&&!enabled(feature))continue;
   const b=e('button','all-queues-mode'+(mode===key?' active':''),title);
   b.type='button';b.setAttribute('aria-pressed',String(mode===key));
   b.onclick=()=>{if(mode===key)return;mode=key;selectedCell=null;currentSignature='';render()};
   modes.append(b);
  }
  if(mode==='groups'){
   const picker=e('label','all-queues-group-select');picker.append(e('span','','Переглянути'));
   const select=e('select');select.setAttribute('aria-label','Група відключень');
   for(let n=1;n<=6;n++)select.append(new Option('Група '+n,String(n)));
   select.value=String(group);
   select.onchange=()=>{group=Number(select.value);selectedCell=null;currentSignature='';render()};
   picker.append(select);controls.append(picker);
  }
  if(mode==='compare'){
   const picker=e('div','all-queues-compare-chooser');
   for(let n=0;n<2;n++){
    const field=e('label','all-queues-compare-field');field.append(e('span','',n?'Друга підчерга':'Перша підчерга'));
    const select=e('select');select.setAttribute('aria-label',n?'Друга підчерга':'Перша підчерга');
    for(const q of math.QUEUES)select.append(new Option('Підчерга '+q,q));
    select.value=compare[n];
    select.onchange=()=>{if(select.value===compare[1-n])compare[1-n]=compare[n];compare[n]=select.value;selectedCell=null;currentSignature='';render()};
    field.append(select);picker.append(field);
   }controls.append(picker);
  }
 }
 function drawDetail(){
  detailPanel.replaceChildren();
  if(!selectedCell){
   detailPanel.hidden=true;status.textContent='Торкніться підчерги для перегляду точних годин.';return;
  }
  const q=selectedCell.queue,parts=partsFor(q),off=intervalText(parts),unknown=parts.some(p=>p.state===-1);
  const head=e('div','all-queues-detail-heading');head.append(e('strong','','Підчерга '+q));
  const close=e('button','all-queues-detail-close','Закрити');close.type='button';close.onclick=()=>toggleQueue(q);head.append(close);
  detailPanel.append(head,e('p','all-queues-detail-summary',unknown?'Частина годин не підтверджена.':'Без світла: '+duration(totalOff(parts))));
  const intervals=e('div','all-queues-intervals');
  if(off.length)for(const span of off)intervals.append(e('span','all-queues-interval',span));
  else intervals.append(e('span','all-queues-interval',unknown?'Уточнюється':'Світло весь день'));
  detailPanel.append(intervals);
  root.querySelector('.all-queues-lane[data-queue="'+q+'"]')?.after(detailPanel);
  detailPanel.hidden=false;
  status.textContent='Точні інтервали підчерги '+q+' відкрито нижче графіка.';
 }
 function toggleQueue(queue){
  if(!enabled('allQueuesDetails'))return;
  selectedCell=selectedCell?.queue===queue?null:{queue};
  for(const lane of root.querySelectorAll('.all-queues-lane')){
   const active=lane.dataset.queue===selectedCell?.queue;lane.classList.toggle('is-selected',active);
   lane.setAttribute('aria-expanded',String(active));
  }drawDetail();
 }
 function axis(){
  const a=e('div','all-queues-time-scale');a.setAttribute('aria-label','Шкала від 00:00 до 24:00');
  for(const h of ['00:00','06:00','12:00','18:00','24:00'])a.append(e('span','',h));
  return a;
 }
 function lane(queue){
  const parts=math.allDaySegments(src().timeline(selected,queue)),off=intervalText(parts),unknown=parts.some(p=>p.state===-1);
  const row=e('button','all-queues-lane'+(selectedCell?.queue===queue?' is-selected':''));row.type='button';row.dataset.queue=queue;
  row.setAttribute('aria-expanded',String(selectedCell?.queue===queue));
  const name=e('span','all-queues-lane-name',queue),content=e('span','all-queues-lane-content'),track=e('span','all-queues-lane-track');
  for(const p of parts){
   const seg=e('span','all-queues-lane-segment state-'+(p.state===0?'on':p.state===1?'off':'unknown'));
   seg.style.width=((p.end-p.start)/1440*100).toFixed(5)+'%';track.append(seg);
  }
  if(enabled('allQueuesNowMarker')&&selected===src().today()){
   track.classList.add('has-now-marker');track.style.setProperty('--now-left',nowFraction().toFixed(3)+'%');
  }
  content.append(track);
  if(enabled('allQueuesRowIntervals'))content.append(e('span','all-queues-lane-caption',off.length?off.join(' · '):unknown?'Є непідтверджені години':'Світло весь день'));
  const meta=e('span','all-queues-lane-meta',unknown?'Уточн.':totalOff(parts)?duration(totalOff(parts)):'0 год');
  row.append(name,content,meta);
  row.setAttribute('aria-label','Підчерга '+queue+'. '+(off.length?'Відключення: '+off.join(', '):unknown?'Невідомі години':'Світло весь день')+(enabled('allQueuesDetails')?'. Відкрити деталі':''));
  row.disabled=!enabled('allQueuesDetails');
  if(!row.disabled)row.onclick=()=>toggleQueue(queue);
  return row;
 }
 function groupCard(n){
  const card=e('section','all-queues-group-card'),heading=e('h3','all-queues-group-heading');
  heading.append(e('span','all-queues-group-number',String(n)),e('span','','Підчерги '+n+'.1 і '+n+'.2'));
  card.append(heading,lane(n+'.1'),lane(n+'.2'));return card;
 }
 function compareSummary(){
  const card=e('div','all-queues-compare-summary'),a=src().timeline(selected,compare[0]),b=src().timeline(selected,compare[1]);
  if(!a||!b||a.length!==1440||b.length!==1440){card.textContent='Для порівняння потрібні підтверджені графіки обох підчерг.';return card}
  let bothOff=0,bothOn=0,different=0,unknown=0;
  for(let m=0;m<1440;m++){
   if(a[m]<0||b[m]<0){unknown++;continue}
   if(a[m]===1&&b[m]===1)bothOff++;
   if(a[m]===0&&b[m]===0)bothOn++;
   if(a[m]!==b[m])different++;
  }
  for(const [title,n] of [['Обидві без світла',bothOff],['Обидві зі світлом',bothOn],['Різний стан',different]]){
   const stat=e('div','all-queues-compare-stat');stat.append(e('strong','',duration(n)),e('small','',title));card.append(stat);
  }
  if(unknown)card.append(e('p','',duration(unknown)+' не підтверджено для однієї або обох підчерг.'));
  return card;
 }
 function render(){
  if(!src()||!dialog.open)return;
  const dates=src().dates();
  if(!dates.includes(selected))selected=dates.includes(src().today())?src().today():dates[0];
  label.textContent=dateString(selected);dayRow.replaceChildren();
  for(const date of dates){
   const b=e('button','all-queues-day'+(date===selected?' active':''),weekday(date));
   b.type='button';b.setAttribute('aria-label',dateString(date));b.setAttribute('aria-pressed',String(date===selected));
   b.onclick=()=>{selected=date;selectedCell=null;currentSignature='';render()};dayRow.append(b);
  }
  const day=src().day(selected),confirmed=src().noSchedule(selected),offline=src().offline();
  const source=day?.source||'https://www.cherkasyoblenergo.com/news';
  if(sourceLink)sourceLink.href=/^https:\/\/(?:www\.)?cherkasyoblenergo\.com\//.test(source)?source:'https://www.cherkasyoblenergo.com/news';
  notice.textContent=offline?
   'Офлайн: збережені дані могли змінитися. Перевірено: '+(src().lastChecked()||'невідомо'):
   day?'Офіційний графік · '+(day.publishedAt?'опубліковано '+new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).format(new Date(day.publishedAt)):'публікацію підтверджено'):
   confirmed?'За опублікованим графіком планових відключень немає.':'Немає підтвердженого графіка. Невідомі години позначено сірим.';
  drawModes();
  if(!enabled('allQueuesDetails'))selectedCell=null;
  const signature=selected+'|'+['allQueuesDetails','allQueuesRowIntervals','allQueuesNowMarker'].map(key=>enabled(key)).join('/')+'|'+mode+'|'+group+'|'+compare.join('/')+'|'+math.QUEUES.map(q=>JSON.stringify(math.allDaySegments(src().timeline(selected,q)))).join('|');
  if(signature===currentSignature&&root.childElementCount)return;
  currentSignature=signature;root.replaceChildren();
  if(mode==='all'||mode==='groups'){
   root.append(axis());
   for(let n=1;n<=6;n++)if(mode==='all'||n===group)root.append(groupCard(n));
  }else{
   const card=e('section','all-queues-group-card all-queues-compare-card');
   card.append(e('h3','all-queues-compare-title','Дві підчерги на спільній шкалі'),axis(),lane(compare[0]),lane(compare[1]));
   root.append(card,compareSummary());
  }
  const key=$('allQueues24Label');if(key)key.hidden=true;
  drawDetail();
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
  if(!src()||!enabled('allQueues'))return;
  const dates=src().dates();
  selected=math.safeDate(date)&&dates.includes(date)?date:src().today();
  selectedCell=null;currentSignature='';
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
 window.addEventListener('svitlo:public-config',()=>{currentSignature='';if(dialog.open){if(!enabled('allQueues'))dismiss();else if(!closing)render()}});
 window.SvitloAllQueues={open,refresh:()=>{if(dialog.open&&!closing)render()},model:math};
})();
