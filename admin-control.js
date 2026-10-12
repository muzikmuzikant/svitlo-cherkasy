/* Admin operations UI. Uses the existing authenticated api() session.
 * Content published to the app is plain text, never HTML.
 */
(()=>{'use strict';
 const nav=document.querySelector('.admin-tabs'),dashboard=document.getElementById('adminDashboard');
 if(!nav||!dashboard)return;
 const tab=document.createElement('button');tab.type='button';tab.dataset.adminTab='operations';tab.setAttribute('aria-pressed','false');tab.textContent='Застосунок';
 const anchor=nav.querySelector('[data-admin-tab="help"]');nav.insertBefore(tab,anchor);
 const section=document.createElement('section');section.className='card operations-panel';section.dataset.adminPanel='operations';section.hidden=true;
 section.innerHTML=`<div class="headline"><div><span class="panel-eyebrow">CONTROL CENTER</span><h2>Керування застосунком</h2></div><span id="opsStatusPill" class="pill">Очікуємо сервер</span></div>
 <p>Технічні роботи й повідомлення без редагування коду. Налаштування зберігаються в Railway. Адреси, графіки й Push-підписки не змінюються.</p>
 <div class="operations-split">
 <div class="ops-section"><div class="headline"><h2>🛠️ Технічні роботи</h2><span class="pill">За замовчуванням вимкнено</span></div>
 <label class="ops-toggle"><span><strong>Показувати екран техробіт</strong><small>Тимчасово приховує застосунок. Адмінпанель залишається доступною.</small></span><input id="opsMaintenance" type="checkbox"></label>
 <div class="field"><label for="opsTitle">Заголовок</label><input id="opsTitle" maxlength="90" value="Ми покращуємо застосунок"></div>
 <div class="field"><label for="opsMessage">Пояснення для користувачів</label><textarea id="opsMessage" maxlength="320" rows="3">Незабаром усе знову працюватиме. Актуальні графіки можна перевірити на сайті оператора.</textarea></div>
 <div class="field"><label for="opsUntil">Орієнтовне завершення (необов'язково)</label><input id="opsUntil" type="datetime-local"></div>
 <div class="ops-preview"><small>ЯК ПОБАЧАТЬ КОРИСТУВАЧІ</small><div class="ops-preview-mark">✨</div><strong id="opsPreviewTitle">Ми покращуємо застосунок</strong><p id="opsPreviewMessage">Незабаром усе знову працюватиме.</p></div>
 </div>
 <div class="ops-section"><div class="headline"><h2>📣 Оголошення у «Вхідних»</h2><span id="opsNoticeCount" class="pill">0</span></div>
 <p>Надходять у центр повідомлень, без масових Push.</p>
 <div class="field"><label for="opsNoticeTitle">Заголовок</label><input id="opsNoticeTitle" maxlength="90" placeholder="Наприклад, Додали нові можливості"></div>
 <div class="field"><label for="opsNoticeBody">Текст</label><textarea id="opsNoticeBody" rows="3" maxlength="320"></textarea></div>
 <div class="two"><div class="field"><label for="opsNoticeKind">Тип</label><select id="opsNoticeKind"><option value="info">💬 Інформація</option><option value="important">📣 Важливе</option><option value="update">✨ Оновлення</option></select></div>
 <div class="field"><label for="opsNoticeExpires">Дійсне до</label><input type="datetime-local" id="opsNoticeExpires"></div></div>
 <button id="opsAddNotice" type="button" class="secondary">+ Додати у список</button>
 <div id="opsNoticeList" class="ops-notices" aria-live="polite"></div></div></div>
 <div class="ops-bottom"><span id="opsMessageStatus" class="push-state" role="status">Увійдіть, щоб завантажити налаштування.</span>
 <div class="flex"><button id="opsReload" type="button" class="secondary">Скасувати зміни</button><button id="opsSave" type="button">Зберегти</button></div></div>`;
 nav.after(section);
 const $=id=>document.getElementById(id);
 let state=null,busy=false;
 const isoLocal=value=>{if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
 const fromLocal=value=>value?new Date(value).toISOString():null;
 function note(msg,bad=false){$('opsMessageStatus').textContent=msg;$('opsMessageStatus').className='push-state'+(bad?' error':' good')}
 function preview(){
  $('opsPreviewTitle').textContent=$('opsTitle').value.trim()||'Ми покращуємо застосунок';
  $('opsPreviewMessage').textContent=$('opsMessage').value.trim()||'Незабаром усе знову працюватиме.';
  $('opsStatusPill').textContent=$('opsMaintenance').checked?'Підготовлено увімкнення':'Режим вимкнено';
  $('opsStatusPill').className='pill'+($('opsMaintenance').checked?' err':' ok');
 }
 function notices(){
  $('opsNoticeCount').textContent=String(state?.announcements?.length||0);
  const root=$('opsNoticeList');root.replaceChildren();
  for(const n of state?.announcements||[]){
   const item=document.createElement('article');item.className='ops-notice';
   const wrap=document.createElement('div'),headline=document.createElement('strong'),body=document.createElement('p');
   headline.textContent=n.title;body.textContent=n.body;wrap.append(headline,body);
   const actions=document.createElement('div');actions.className='ops-notice-actions';
   const toggle=document.createElement('button');toggle.className='secondary';toggle.type='button';toggle.textContent=n.active?'Приховати':'Показати';
   toggle.onclick=()=>{n.active=!n.active;notices();note('Зміни готові до збереження.')};
   const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='Видалити';
   remove.onclick=()=>{if(!confirm('Видалити це оголошення зі списку?'))return;state.announcements=state.announcements.filter(x=>x.id!==n.id);notices();note('Збережіть зміни, щоб видалити оголошення.')};
   actions.append(toggle,remove);item.append(wrap,actions);root.append(item);
  }
  if(!state?.announcements?.length){const p=document.createElement('p');p.className='hint';p.textContent='Оголошень поки немає.';root.append(p)}
 }
 async function reload(){
  if(!remote)return;try{
   const result=await api('app-config');
   state=result;
   $('opsMaintenance').checked=result.maintenance.enabled===true;
   $('opsTitle').value=result.maintenance.title;
   $('opsMessage').value=result.maintenance.message;
   $('opsUntil').value=isoLocal(result.maintenance.until);
   notices();preview();note('Налаштування завантажено.');
  }catch(error){note('Не вдалося завантажити керування: '+error.message,true)}
 }
 tab.addEventListener('click',()=>{if(typeof setTab==='function')setTab('operations');reload()});
 for(const id of ['opsTitle','opsMessage','opsUntil','opsMaintenance'])$(id).addEventListener('input',preview);
 $('opsAddNotice').addEventListener('click',()=>{
  if(!state)return note('Спершу завантажте налаштування',true);
  const title=$('opsNoticeTitle').value.trim(),body=$('opsNoticeBody').value.trim();
  if(title.length<5||body.length<10)return note('Заповніть заголовок (5+) і текст (10+).',true);
  if(state.announcements.length>=30)return note('Максимум 30 оголошень.',true);
  state.announcements.unshift({id:'n_'+crypto.randomUUID().replaceAll('-',''),title,body,kind:$('opsNoticeKind').value,
   active:true,publishedAt:new Date().toISOString(),expiresAt:fromLocal($('opsNoticeExpires').value)});
  $('opsNoticeTitle').value='';$('opsNoticeBody').value='';$('opsNoticeExpires').value='';
  notices();note('Додано. Натисніть «Зберегти», щоб опублікувати.');
 });
 $('opsReload').addEventListener('click',reload);
 $('opsSave').addEventListener('click',async()=>{
  if(!state||busy)return;
  const enabled=$('opsMaintenance').checked;
  if(enabled&&!state.maintenance.enabled&&!confirm('Увімкнути технічні роботи? Головний екран тимчасово буде недоступний усім користувачам. Увімкнути?'))return;
  const next={...state,maintenance:{enabled,title:$('opsTitle').value.trim(),message:$('opsMessage').value.trim(),until:fromLocal($('opsUntil').value)}};
  busy=true;$('opsSave').disabled=true;
  try{state=await api('app-config',{method:'PUT',body:JSON.stringify(next)});notices();preview();note('Збережено. Зміни будуть доступні у застосунку протягом хвилини.')}
  catch(error){note('Не збережено: '+error.message,true)}
  finally{busy=false;$('opsSave').disabled=false}
 });
 document.addEventListener('svitlo:admin-ready',()=>{if(!section.hidden)reload()});
 document.addEventListener('svitlo:admin-logout',()=>{state=null;note('Для керування потрібен вхід.')});
})();
