/* Personal comfort settings. No user data is transmitted. */
(()=>{
'use strict';
const KEY='svitlo-comfort-v1';
const defaults={motion:'balanced',density:'comfortable',contrast:false,haptics:false,ambient:true};
const choices={motion:['calm','balanced','playful'],density:['comfortable','compact']};
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{}
const settings={...defaults,...saved};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const root=document.documentElement;
function apply(){
 for(const [k,values] of Object.entries(choices))if(!values.includes(settings[k]))settings[k]=defaults[k];
 for(const k of ['contrast','haptics','ambient'])settings[k]=settings[k]===true;
 root.dataset.comfortMotion=reduced.matches?'calm':settings.motion;
 root.dataset.comfortDensity=settings.density;
 root.dataset.comfortContrast=String(settings.contrast);
 root.dataset.comfortAmbient=String(settings.ambient);
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(settings))}catch{}apply()}
apply();
reduced.addEventListener?.('change',apply);
const option=(value,label)=>'<option value="'+value+'">'+label+'</option>';
const section=document.createElement('section');
section.className='comfort-section';
section.innerHTML='<h2 class="subsection-title">Вигляд і комфорт</h2>'+
 '<p class="comfort-intro">Зробіть застосунок зручним саме для себе. Усі зміни застосовуються одразу.</p>'+
 '<div class="surface settings-card">'+
 '<label class="setting-line comfort-row"><span><strong>Анімації</strong><p>Від спокійних до виразних переходів</p></span><select id="comfortMotion" aria-label="Інтенсивність анімацій">'+option('calm','Мінімальні')+option('balanced','Плавні')+option('playful','Жваві')+'</select></label>'+
 '<label class="setting-line comfort-row"><span><strong>Щільність елементів</strong><p>Більше простору або більше інформації</p></span><select id="comfortDensity" aria-label="Щільність інтерфейсу">'+option('comfortable','Комфортна')+option('compact','Компактна')+'</select></label>'+
 '<label class="setting-line"><span><strong>Підвищена контрастність</strong><p>Чіткіші межі карток і написи</p></span><span class="switch"><input type="checkbox" id="comfortContrast"><span></span></span></label>'+
 '<label class="setting-line"><span><strong>Тактильний відгук</strong><p>Легкий сигнал на сумісних пристроях</p></span><span class="switch"><input type="checkbox" id="comfortHaptics"><span></span></span></label>'+
 '<label class="setting-line"><span><strong>Живий фон</strong><p>Ледь помітний рух декоративних елементів</p></span><span class="switch"><input type="checkbox" id="comfortAmbient"><span></span></span></label>'+
 '</div><p class="comfort-note">Якщо в системі ввімкнено «Зменшення руху», застосунок автоматично вимикає інтенсивні анімації.</p>';
function init(){
 const settingsScreen=document.getElementById('settings');
 if(!settingsScreen)return;
 const push=settingsScreen.querySelector('.settings-push-controls');
 (push||settingsScreen.querySelector('.subsection-title'))?.before(section);
 for(const [key,id] of [['motion','comfortMotion'],['density','comfortDensity'],['contrast','comfortContrast'],['haptics','comfortHaptics'],['ambient','comfortAmbient']]){
  const el=document.getElementById(id);if(!el)continue;
  if(el.type==='checkbox')el.checked=settings[key];else el.value=settings[key];
  el.addEventListener('change',()=>{settings[key]=el.type==='checkbox'?el.checked:el.value;save()});
 }
 // Haptic feedback is opt-in, unavailable on many iPhones; no blocking fallback.
 document.addEventListener('click',event=>{
  const button=event.target.closest('button, .setting-action, .picker-btn');
  if(!button||button.disabled||!settings.haptics||reduced.matches)return;
  if(typeof navigator.vibrate==='function')navigator.vibrate(8);
 },{passive:true});
 // Animate only genuine tab changes, not every background data refresh.
 document.querySelectorAll('.bottom-nav [data-go]').forEach(button=>{
  button.addEventListener('click',()=>{
   if(reduced.matches||settings.motion==='calm')return;
   const target=document.getElementById(button.dataset.go);
   if(!target||target.hidden===false)return;
   target.classList.remove('comfort-enter');
   requestAnimationFrame(()=>{target.classList.add('comfort-enter');setTimeout(()=>target.classList.remove('comfort-enter'),650)});
  });
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();