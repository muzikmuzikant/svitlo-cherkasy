/* Svitlo UI preferences: no haptics, no permissions, no network calls. */
(()=>{'use strict';
const KEY='svitlo-ui-v2';
const LEGACY='svitlo-comfort-v1';
const defaults={motion:'playful',density:'comfortable',accent:'blue',contrast:false,largeText:false,ambient:true,showInsights:true,showTimebar:true,highlightNow:true,showHints:true,showLegend:true};
const enums={motion:['calm','balanced','playful'],density:['comfortable','compact'],accent:['blue','mint','violet']};
const switches={contrast:'comfortContrast',largeText:'comfortLargeText',ambient:'comfortAmbient',showInsights:'comfortShowInsights',showTimebar:'comfortShowTimebar',highlightNow:'comfortHighlightNow',showHints:'comfortShowHints',showLegend:'comfortShowLegend'};
const root=document.documentElement;
const mq=matchMedia('(prefers-reduced-motion: reduce)');
let stored={};try{stored=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
if(!Object.keys(stored).length){try{const old=JSON.parse(localStorage.getItem(LEGACY)||'{}')||{};stored={motion:old.motion,density:old.density,contrast:old.contrast,ambient:old.ambient};}catch{}}
const state={...defaults};
function validate(input){
 for(const [k,values] of Object.entries(enums)){if(values.includes(input[k]))state[k]=input[k]}
 for(const k of Object.keys(switches)){if(typeof input[k]==='boolean')state[k]=input[k]}
}
validate(stored);
function updateMotionStatus(){
 const el=document.getElementById('settingsMotionStatus');if(!el)return;
 if(root.classList.contains('feature-off-animations')){
  el.textContent='Анімації вимкнені в адмінці застосунку. Увімкніть функцію «Анімації» в адмінпанелі.';
  el.dataset.kind='limited';
 }else if(mq.matches){
  el.textContent='iOS зараз використовує «Зменшення руху», тому інтенсивні переходи вимкнені.';
  el.dataset.kind='limited';
 }else{
  el.textContent=state.motion==='calm'?'Вибрано мінімальний рух. Перейдіть на «Жваві», щоб побачити всі ефекти.':'Анімації працюють. Спробуйте перемкнути вкладку або натиснути годину графіка.';
  el.dataset.kind='active';
 }
}
function applyAccent(){
 const colors={blue:['#377dff','#ecf3ff'],mint:['#087a60','#e8f7f1'],violet:['#6949c3','#f2ecff']};
 const pair=colors[state.accent]||colors.blue;
 // Inline site appearance may be refreshed by the backend, so local user choice must be re-applied.
 root.style.setProperty('--blue',pair[0]);
 root.style.setProperty('--bluewash',pair[1]);
}
function apply(){
 const motion=mq.matches?'calm':state.motion;
 root.dataset.comfortMotion=motion;
 root.dataset.comfortDensity=state.density;
 root.dataset.comfortAccent=state.accent;
 applyAccent();
 root.dataset.comfortContrast=String(state.contrast);
 root.dataset.comfortLargeText=String(state.largeText);
 root.dataset.comfortAmbient=String(state.ambient);
 for(const k of ['showInsights','showTimebar','highlightNow','showHints','showLegend'])root.dataset['comfort'+k[0].toUpperCase()+k.slice(1)]=String(state[k]);
 root.classList.toggle('user-hide-insights',!state.showInsights);
 root.classList.toggle('user-hide-timeline',!state.showTimebar);
 root.classList.toggle('user-hide-hour-highlight',!state.highlightNow);
 root.classList.toggle('user-hide-swipe-hints',!state.showHints);
 root.classList.toggle('user-hide-legend',!state.showLegend);
 root.classList.toggle('user-no-ambient',!state.ambient);
 updateMotionStatus();
 window.dispatchEvent(new CustomEvent('svitlo:comfort-change',{detail:{...state,effectiveMotion:motion}}));
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));localStorage.removeItem(LEGACY)}catch{}apply()}
function refreshUI(){
 for(const [key,id] of Object.entries(switches)){const e=document.getElementById(id);if(e)e.checked=state[key]}
 for(const name of ['motion','density','accent']){
  document.querySelectorAll('[data-comfort-'+name+']').forEach(button=>{
   const selected=button.dataset['comfort'+name[0].toUpperCase()+name.slice(1)]===state[name];
   button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  });
 }
 const pv=document.getElementById('comfortPreview');
 if(pv){pv.classList.remove('preview-replay');void pv.offsetWidth;pv.classList.add('preview-replay')}
}
function init(){
 const screen=document.getElementById('settings');
 if(!screen)return;
 const tabs=[...screen.querySelectorAll('[data-settings-pane]')];
 const panes=[...screen.querySelectorAll('[data-settings-section]')];
 function choose(name){
  if(!panes.some(p=>p.dataset.settingsSection===name))return;
  for(const tab of tabs){
   const selected=tab.dataset.settingsPane===name;
   tab.classList.toggle('selected',selected);
   tab.setAttribute('aria-selected',String(selected));
   tab.tabIndex=selected?0:-1;
  }
  for(const pane of panes)pane.hidden=pane.dataset.settingsSection!==name;
  try{sessionStorage.setItem('svitlo-settings-pane',name)}catch{}
 }
 tabs.forEach((button,i)=>{
  button.setAttribute('aria-controls','settings-'+button.dataset.settingsPane);
  button.addEventListener('click',()=>choose(button.dataset.settingsPane));
  button.addEventListener('keydown',event=>{
   if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
   tabs[next].focus();choose(tabs[next].dataset.settingsPane);
  });
 });
 screen.classList.add('settings-enhanced');
 new MutationObserver(updateMotionStatus).observe(root,{attributes:true,attributeFilter:['class']});
 let last='appearance';try{last=sessionStorage.getItem('svitlo-settings-pane')||last}catch{}
 choose(last);
 document.querySelectorAll('[data-comfort-motion],[data-comfort-density],[data-comfort-accent]').forEach(button=>{
  button.addEventListener('click',()=>{
   for(const key of Object.keys(enums)){
    const dataKey='comfort'+key[0].toUpperCase()+key.slice(1);
    if(button.dataset[dataKey]&&enums[key].includes(button.dataset[dataKey])){
     state[key]=button.dataset[dataKey];save();refreshUI();break;
    }
   }
  });
 });
 for(const [key,id] of Object.entries(switches)){
  const input=document.getElementById(id);
  input?.addEventListener('change',()=>{state[key]=input.checked;save()});
 }
 document.getElementById('comfortReset')?.addEventListener('click',()=>{
  Object.assign(state,defaults);save();refreshUI();
  const toast=document.getElementById('toast');
  if(toast){toast.textContent='Вигляд і графік повернуто до стандартних налаштувань';toast.hidden=false;setTimeout(()=>toast.hidden=true,3500)}
 });
 refreshUI();apply();
}
apply();
if(mq.addEventListener)mq.addEventListener('change',apply);else mq.addListener?.(apply);
window.addEventListener('svitlo:public-config',()=>{applyAccent();updateMotionStatus()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();