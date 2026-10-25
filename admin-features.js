/* Admin Features: each switch maps to a real public UI behavior.
 * Authenticated Railway config is the source of truth. Never embed credentials.
 */
(()=>{'use strict';
 const root=document.getElementById('featuresGrid');if(!root)return;
 const $=id=>document.getElementById(id);
 const groups=[
 ['Головна та графік',[
  ['tomorrowPreview','Картка «Завтра»','Показувати прогноз на наступний день.'],
  ['quickAddresses','Швидке перемикання адрес','Перемикання адрес одним натисканням на головній.'],
  ['homePlaces','Список збережених місць','Картки власних адрес на головній.'],
  ['dailyStats','Підсумок годин на головній','Скільки годин є та немає світла.'],
  ['overviewTimeline','Мініграфік на сьогодні','Кольорова шкала електропостачання.'],
  ['statusCountdown','Таймер наступної зміни','Час до наступного планового перемикання.'],
  ['weekNavigation','Гортання тижнів','Стрілки календаря графіка.'],
  ['dayStats','Статистика конкретного дня','Підсумок на сторінці графіка.'],
  ['scheduleLegend','Пояснення кольорів','Легенда під графіком.'],
  ['scheduleSource','Джерело та дата оновлення','Інформація про офіційну публікацію.'],
  ['manualRefresh','Ручна перевірка графіків','Кнопка оновлення даних.'],
  ['homeQuickActions','Дії під графіком','Швидкі кнопки поділитися й скопіювати.']
 ]],
 ['Повідомлення та Push',[
  ['inbox','Вкладка «Вхідні»','Доступ до списку повідомлень.'],
  ['inboxFilters','Фільтри «Вхідних»','Фільтрація нових, графіків та важливого.'],
  ['inboxHistory','Історія офіційних публікацій','Розгорнутий архів у «Вхідних».'],
  ['pushPrompt','Банер підключення Push','Пропонувати сповіщення на головній.'],
  ['pushSettings','Налаштування Push','Керування підпискою в «Опціях».']
 ]],
 ['Зручність та навігація',[
  ['sharing','Поширення графіка','Експорт картинки графіка.'],
  ['sharePreview','Попередній перегляд картинки','Показати картинку до поширення.'],
  ['copySchedule','Копіювання годин','Кнопка скопіювати текст розкладу.'],
  ['help','Центр допомоги','Посилання на довідку.'],
  ['feedback','Зв’язок із підтримкою','Форма звернення користувачів.'],
  ['addressSearch','Пошук нової адреси','Кнопки додавання та пошуку адрес.'],
  ['offlineStatus','Офлайн-індикатор','Показувати збережений стан без інтернету.'],
  ['animations','Плавні анімації','Переходи та ефекти інтерфейсу.'],
  ["quickQueueLookup","Швидкий перегляд підчерги","Перегляд без збереження адреси."],
  ["nextChangeCard","Найближча зміна","Картка наступної планової зміни."],
  ["dayShortcuts","Сьогодні та завтра","Кнопки швидкої зміни дня."],
  ["detailSourceLink","Джерело графіка","Посилання на офіційний матеріал."],
  ["hourlyLabels","Мітки часу графіка","Показувати 00 / 06 / 12 / 18 / 24."],
  ["inboxMarkAll","Прочитати всі","Масова позначка повідомлень."],
  ["inboxClearRead","Очищення прочитаного","Видалення прочитаної історії."],
  ["appUpdateCheck","Перевірити оновлення","Ручна перевірка нової версії."],
  ["editAddressFromGraph","Редагувати адресу","Кнопка редагування з графіка."],
  ["syncStatus","Статус синхронізації","Індикатор автоматичного оновлення."],
  ["settingsFooter","Підпис застосунку","Нижній підпис у налаштуваннях."],
  ["tomorrowOpenShortcut","Перейти до завтра","Швидка кнопка у картці «Завтра»."],
  ["scheduleOpenShortcut","Детальніше про графік","Кнопка відкриття графіка з головної."]
 ]]
 ];
 const controls=new Map();let busy=false,dirty=false,baseline=null;
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 function status(text,bad=false){const e=$('featuresStatus');e.textContent=text;e.className=bad?'feature-feedback is-error':'feature-feedback'}
 function draw(){
  root.replaceChildren();controls.clear();
  for(const [group,items] of groups){
   const section=make('section','feature-group');
   section.append(make('h3','feature-group-heading',group));
   const grid=make('div','feature-group-grid');
   for(const [key,title,desc] of items){
    const card=make('label','feature-toggle');
    const body=make('span','feature-toggle-copy');
    body.append(make('strong','',title),make('small','',desc));
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name=key;checkbox.checked=true;
    checkbox.addEventListener('change',()=>{dirty=true;count();status('Є незбережені зміни. Натисніть «Зберегти функції».')});
    card.append(body,checkbox);grid.append(card);controls.set(key,{checkbox,card,title,desc});
   }
   section.append(grid);root.append(section);
  }
  count();
 }
 function count(){
  const n=[...controls.values()].filter(x=>x.checkbox.checked).length;
  $('featuresActiveCount').textContent=n+' із '+controls.size+' увімкнено';
 }
 function assign(cfg){
  const flags=cfg?.site?.flags||{};
  controls.forEach(({checkbox},key)=>{checkbox.checked=flags[key]!==false});
  for(const [id,value] of [
   ['opsFlagInbox',flags.inbox!==false],['opsFlagSharing',flags.sharing!==false],['opsFlagHelp',flags.help!==false]
  ])if($(id))$(id).checked=value;
  const links=cfg?.site?.links||{},banner=cfg?.site?.banner||{};
  for(const [id,value] of [['opsLinkHelp',links.help],['opsLinkFeedback',links.feedback],['opsLinkOfficial',links.official],
   ['opsBannerTitle',banner.title],['opsBannerBody',banner.body],['opsBannerButton',banner.button],['opsBannerUrl',banner.url]]){
   if($(id)&&value!==undefined)$(id).value=value;
  }
  if($('opsBannerActive'))$('opsBannerActive').checked=banner.enabled===true;
  baseline=cfg;dirty=false;count();
 }
 async function reload(){
  if(busy||typeof remote==='undefined'||!remote)return;
  busy=true;
  try{assign(await api('app-config'));status('Налаштування завантажено з Railway.')}
  catch(e){status('Не вдалося завантажити: '+e.message,true)}
  finally{busy=false}
 }
 const val=id=>$(id)?.value.trim()||'';
 async function save(){
  if(busy||typeof remote==='undefined'||!remote)return;
  busy=true;$('featuresSave').disabled=true;
  try{
   // Obtain latest content/maintenance/drafts immediately before PUT.
   // A feature change must never revert edits made in another CMS tab.
   const cfg=await api('app-config');
   const flags={...(cfg.site?.flags||{})};
   for(const [key,{checkbox}] of controls)flags[key]=checkbox.checked;
   cfg.site={...cfg.site,flags,links:{...cfg.site?.links,help:val('opsLinkHelp'),feedback:val('opsLinkFeedback'),official:val('opsLinkOfficial')},
    banner:{...cfg.site?.banner,enabled:$('opsBannerActive').checked,title:val('opsBannerTitle'),
     body:val('opsBannerBody'),button:val('opsBannerButton'),url:val('opsBannerUrl')}};
   const answer=await api('app-config',{method:'PUT',body:JSON.stringify(cfg)});
   assign(answer);status('Збережено. Застосунок підхопить зміни автоматично.');
   try{const bc=new BroadcastChannel('svitlo-content-v1');bc.postMessage({type:'REFRESH_APP_CONFIG',at:Date.now()});bc.close()}catch{}
  }catch(e){status('Не збережено: '+e.message,true)}
  finally{busy=false;$('featuresSave').disabled=false}
 }
 draw();
 // Admin Office is a separately installable PWA, not a public feature flag.
 // Keep its entry in «Функції» without storing a fake switch in Railway config.
 const pwaSection=make('section','feature-group admin-pwa-feature');
 pwaSection.append(make('h3','feature-group-heading','Адмінський PWA'));
 const pwaCard=make('div','feature-toggle');
 pwaCard.style.cssText='display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px';
 const pwaText=make('span','feature-toggle-copy');
 pwaText.append(make('strong','','Окремий застосунок для адміністрації'),
  make('small','','Власна іконка, окреме встановлення, ті самі дані й права доступу.'));
 const pwaLink=make('a','','Відкрити адмінський PWA');
 pwaLink.href='/admin-app/';
 pwaLink.style.cssText='display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#347dff;color:#fff;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:700';
 pwaCard.append(pwaText,pwaLink);
 pwaSection.append(pwaCard,make('p','hint','iPhone: Safari → Поділитися → На початковий екран. Android: меню браузера → Встановити застосунок.'));
 root.before(pwaSection);
 $('featuresSearch').addEventListener('input',()=>{
  const q=$('featuresSearch').value.trim().toLocaleLowerCase('uk-UA');
  controls.forEach(({card,title,desc})=>{card.hidden=!!q&&!(title+' '+desc).toLocaleLowerCase('uk-UA').includes(q)});
  root.querySelectorAll('.feature-group').forEach(section=>{
   section.hidden=!Array.from(section.querySelectorAll('.feature-toggle')).some(x=>!x.hidden);
  });
 });
 document.querySelector('[data-admin-tab="features"]')?.addEventListener('click',()=>{
  if(dirty&&!confirm('У вас є незбережені зміни. Завантажити налаштування із сервера?'))return;
  reload();
 });
 $('featuresReload').onclick=()=>reload();
 $('featuresSave').onclick=save;
 document.addEventListener('svitlo:admin-logout',()=>{baseline=null;dirty=false;status('Увійдіть для керування функціями.')});
 window.SvitloAdminFeatures={reload};
})();
