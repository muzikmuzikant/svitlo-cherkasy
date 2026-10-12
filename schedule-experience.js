/* Svitlo schedule experience: visible progress, hourly detail, day swipes and motion. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const allowed=()=>!reduced.matches&&document.documentElement.dataset.comfortMotion!=='calm'&&!document.documentElement.classList.contains('feature-off-animations');
function init(){
 const grid=$('hourGrid'),days=$('days'),hero=$('heroStatus'),bar=$('overviewBar');
 if(!grid||!days||!hero||!bar)return;
 const insight=document.createElement('div');insight.className='schedule-insight';insight.setAttribute('aria-live','polite');
 insight.innerHTML='<span class="schedule-insight-icon" aria-hidden="true">◷</span><div class="schedule-insight-copy"><strong id="scheduleInsightTitle">Огляд вибраного дня</strong><small id="scheduleInsightText">Перевіряємо графік</small></div>';
 grid.parentElement?.append(insight);
 const hint=document.createElement('p');hint.className='schedule-swipe-hint';hint.textContent='Гортайте таблицю вбік, щоб змінювати дні';
 grid.parentElement?.append(hint);
 const rail=document.createElement('div');rail.className='schedule-progress';rail.setAttribute('aria-hidden','true');rail.innerHTML='<span class="schedule-progress-fill"></span>';
 bar.parentElement?.append(rail);
 const fill=rail.firstElementChild;
 const nowLabel=document.createElement('span');nowLabel.className='schedule-now-label';nowLabel.setAttribute('aria-hidden','true');bar.parentElement?.append(nowLabel);
 const dateFormatter=new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const pulseTitle=$('dayPulseTitle'),pulseSubtitle=$('dayPulseSubtitle'),pulseOrb=$('dayPulseOrb'),pulsePercent=$('dayPulsePercent');
 $('dayPulseOpen')?.addEventListener('click',()=>$('openDetail')?.click());
 function updateProgress(){
  const time=dateFormatter.format(new Date());const parts=time.match(/(\d{1,2})\D+(\d{2})/);
  if(!parts)return;
  const minutes=Number(parts[1])*60+Number(parts[2]),percent=Math.round(minutes/1440*100);
  const exact=Math.min(100,Math.max(0,minutes/1440*100));
  fill.style.width=exact+'%';nowLabel.textContent='Зараз '+time;
  const line=bar.querySelector('.bar-now');if(line)line.style.left=exact+'%';
  if(pulseOrb)pulseOrb.style.setProperty('--day-progress',exact+'%');
  if(pulsePercent)pulsePercent.textContent=percent+'%';
  if(pulseTitle)pulseTitle.textContent='Зараз '+time;
  if(pulseSubtitle)pulseSubtitle.textContent='Пройшло '+percent+'% сьогоднішнього дня';
 }
 let lastDay='',lastHero='',raf=0;
 const dialog=$('hourDetailDialog');
 let previousFocus=null;
 function describeHour(cell){
  if(!dialog)return;
  const hour=String(cell.dataset.hour||'00:00');const start=Number(hour.slice(0,2)),end=start===23?'24:00':String(start+1).padStart(2,'0')+':00';
  const title=$('hourDetailTitle'),date=$('hourDetailDate'),desc=$('hourDetailDescription'),state=$('hourDetailState');
  if(title)title.textContent=hour+' - '+end;
  if(date)date.textContent=$('detailDayLabel')?.textContent||'Вибраний день';
  const data=cell.getAttribute('aria-label')||'';
  if(desc)desc.textContent=(data.startsWith(hour+': ')?data.slice(hour.length+2):data)||'Немає інформації про годину.';
  const kind=['on','off','mixed','unknown'].find(x=>cell.classList.contains(x))||'unknown';
  if(state){state.dataset.kind=kind;state.textContent=kind==='on'?'За графіком зі світлом':kind==='off'?'За графіком без світла':kind==='mixed'?'Часткове відключення':'Немає підтверджених даних';}
  previousFocus=cell;
  if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}
  else dialog.setAttribute('open','');
 }
 const close=()=>{if(dialog?.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}previousFocus?.focus?.({preventScroll:true})};
 $('hourDetailClose')?.addEventListener('click',close);
 $('hourDetailDone')?.addEventListener('click',close);
 dialog?.addEventListener('click',e=>{if(e.target===dialog)close()});
 let suppressTapUntil=0;
 grid.addEventListener('click',e=>{if(Date.now()<suppressTapUntil)return;const cell=e.target.closest('.hour-cell');if(cell)describeHour(cell)});
 grid.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const cell=e.target.closest('.hour-cell');if(cell){e.preventDefault();describeHour(cell)}});
 function updateDay(){
  if($('detail')?.hidden)return;
  const selected=days.querySelector('.day-choice.selected'),key=selected?.getAttribute('aria-label')||'';
  const cells=[...grid.querySelectorAll('.hour-cell')];
  if(!cells.length)return;
  for(const cell of cells){cell.tabIndex=0;cell.setAttribute('role','button');cell.setAttribute('title',(cell.getAttribute('aria-label')||'')+'. Натисніть для деталей');}
  if(!key)return;
  const changing=!!lastDay&&key!==lastDay;lastDay=key;
  if(changing&&allowed()){
   grid.classList.remove('schedule-day-enter');void grid.offsetWidth;grid.classList.add('schedule-day-enter');
  }
  const off=cells.filter(x=>x.classList.contains('off')).length;
  const mixed=cells.filter(x=>x.classList.contains('mixed')).length;
  const unknown=cells.filter(x=>x.classList.contains('unknown')).length;
  const t=$('scheduleInsightTitle'),d=$('scheduleInsightText');
  if(!t||!d)return;
  if(unknown===24){t.textContent='На цей день немає підтверджених годин';d.textContent='Перевірте офіційну публікацію';insight.dataset.kind='unknown'}
  else if(!off&&!mixed){t.textContent='Немає повних годин відключення';d.textContent=unknown?'Частина годин залишається непідтвердженою':'У графіку відключень немає';insight.dataset.kind='on'}
  else{t.textContent='Ваш день у цифрах';d.textContent=off+' повних год без світла'+(mixed?' · '+mixed+' часткових год':'')+(unknown?' · '+unknown+' без даних':'');insight.dataset.kind='off'}
 }
 const renderQueued=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(updateDay)};
 new MutationObserver(renderQueued).observe(days,{childList:true});
 new MutationObserver(renderQueued).observe(grid,{childList:true});
 let start=null;
 grid.addEventListener('touchstart',e=>{if(e.touches.length===1)start={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
 grid.addEventListener('touchend',e=>{
  if(!start||$('detail')?.hidden)return;
  const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;start=null;
  if(Math.abs(dx)<75||Math.abs(dx)<Math.abs(dy)*1.7)return;
  suppressTapUntil=Date.now()+400;
  const options=[...days.querySelectorAll('.day-choice')],i=options.findIndex(e=>e.classList.contains('selected'));
  const next=i+(dx<0?1:-1);
  if(options[next])options[next].click();
  else if(dx<0)$('weekNext')?.click();
  else{$('weekPrev')?.click();days.querySelector('.day-choice:last-child')?.click();}
 },{passive:true});
 function updateHero(){
  const kind=[...hero.classList].find(c=>/^status-(on|off|unknown)$/.test(c))||'';
  if(kind===lastHero)return;
  const changed=!!lastHero;lastHero=kind;
  if(changed&&allowed()){hero.classList.remove('schedule-status-change');void hero.offsetWidth;hero.classList.add('schedule-status-change')}
 }
 new MutationObserver(updateHero).observe(hero,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateProgress();renderQueued()}});
 window.addEventListener('svitlo:comfort-change',renderQueued);
 setInterval(()=>{if(!document.hidden)updateProgress()},60000);
 updateProgress();renderQueued();updateHero();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();