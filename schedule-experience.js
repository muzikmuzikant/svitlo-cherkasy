/* Svitlo Cherkasy: expressive schedule interactions, progressive enhancement only. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const motion=()=>!reduced.matches&&document.documentElement.dataset.comfortMotion!=='calm'&&!document.documentElement.classList.contains('feature-off-animations');
const active=()=>!$('detail')?.hidden;
let lastDay='',lastHero='',raf=0;
function init(){
 const grid=$('hourGrid'),days=$('days'),hero=$('heroStatus'),bar=$('overviewBar');
 if(!grid||!days||!hero||!bar)return;
 const insight=document.createElement('div');insight.className='schedule-insight';insight.setAttribute('aria-live','polite');
 insight.innerHTML='<div class="schedule-insight-icon" aria-hidden="true">◷</div><div class="schedule-insight-copy"><strong id="scheduleInsightTitle">Огляд дня</strong><small id="scheduleInsightText">Перевіряємо години за графіком</small></div>';
 grid.parentElement?.append(insight);
 const hint=document.createElement('p');hint.className='schedule-swipe-hint';hint.textContent='Гортайте графік ліворуч або праворуч, щоб змінити день';
 grid.parentElement?.append(hint);
 const rail=document.createElement('div');rail.className='schedule-progress';rail.setAttribute('aria-hidden','true');rail.innerHTML='<span class="schedule-progress-fill"></span>';
 bar.parentElement?.append(rail);
 const scheduleProgress=rail.firstElementChild;
 const markers=document.createElement('span');markers.className='schedule-now-label';markers.setAttribute('aria-hidden','true');
 bar.parentElement?.append(markers);
 function updateProgress(){
  const kyiv=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  const [h,m]=kyiv.split(':').map(Number),fraction=Math.max(0,Math.min(100,((h*60+m)/1440)*100));
  scheduleProgress.style.width=fraction+'%';markers.textContent='Зараз '+kyiv;
  const now=bar.querySelector('.bar-now');if(now)now.style.left=fraction+'%';
 }
 function update(){
  if(!active())return;
  const selected=days.querySelector('.selected'),key=selected?.getAttribute('aria-label')||'';
  if(!key||key===lastDay)return;
  const previous=lastDay;lastDay=key;
  if(previous&&motion()){
   grid.classList.remove('schedule-day-enter');void grid.offsetWidth;
   grid.classList.add('schedule-day-enter');
   grid.addEventListener('animationend',()=>grid.classList.remove('schedule-day-enter'),{once:true});
  }
  const cells=[...grid.querySelectorAll('.hour-cell')];
  const off=cells.filter(c=>c.classList.contains('off')).length;
  const mixed=cells.filter(c=>c.classList.contains('mixed')).length;
  const unknown=cells.filter(c=>c.classList.contains('unknown')).length;
  const title=$('scheduleInsightTitle'),copy=$('scheduleInsightText');
  if(!title||!copy)return;
  if(unknown===24){title.textContent='Немає підтверджених годин';copy.textContent='Перевірте офіційне джерело графіка';insight.dataset.kind='unknown'}
  else if(off===0&&mixed===0){title.textContent='Без повних годин відключення';copy.textContent=unknown?'Частина годин ще уточнюється':'У підтверджених годинах відключення не зазначені';insight.dataset.kind='on'}
  else{title.textContent='Графік дня';copy.textContent=off+' повн. год без світла'+(mixed?' · '+mixed+' часткових год':'')+(unknown?' · '+unknown+' без даних':'');insight.dataset.kind='off'}
 }
 const observer=new MutationObserver(()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(update)});
 observer.observe(days,{childList:true,subtree:false});
 // Native horizontal swipe only on the calendar, never the whole screen.
 let start=null;
 const touchArea=grid.parentElement;
 touchArea?.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;start={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
 touchArea?.addEventListener('touchend',e=>{
  if(!start||!active())return;const x=e.changedTouches[0].clientX-start.x,y=e.changedTouches[0].clientY-start.y;start=null;
  if(Math.abs(x)<75||Math.abs(x)<Math.abs(y)*1.7)return;
  const options=[...days.querySelectorAll('.day-choice')],i=options.findIndex(el=>el.classList.contains('selected')),next=i+(x<0?1:-1);
  if(options[next])options[next].click();
  else $(x<0?'weekNext':'weekPrev')?.click();
 },{passive:true});
 const heroObserver=new MutationObserver(()=>{
  const mode=[...hero.classList].find(x=>/^status-(?:on|off|unknown)$/.test(x))||'';
  if(mode===lastHero)return;const changed=!!lastHero;lastHero=mode;
  if(changed&&motion()){hero.classList.remove('schedule-status-change');void hero.offsetWidth;hero.classList.add('schedule-status-change');}
 });
 heroObserver.observe(hero,{attributes:true,attributeFilter:['class']});
 update();updateProgress();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateProgress()});
 setInterval(()=>{if(!document.hidden)updateProgress()},60000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();