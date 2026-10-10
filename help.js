'use strict';
const fallback=[
 ['Підчерги та адреси','Як дізнатися свою підчергу?','Відкрийте «Мої місця», оберіть населений пункт і вулицю. Якщо підчерга неоднозначна, перевірте адресу на офіційному сайті Черкасиобленерго.'],
 ['Підчерги та адреси','Моя адреса або підчерга неправильна. Що робити?','Звірте підчергу з офіційним переліком. Повідомте нам про неточність у розділі «Зв’язок із нами».'],
 ['Графіки','Чому світло вимкнули не за графіком?','Графік є плановим. Можливі аварійні обмеження чи технічні зміни. Застосунок не вимірює фактичну наявність світла.'],
 ['Графіки','В офіційній публікації помилка в даті. Що тепер?','Автоматична перевірка відхиляє публікації, у яких дата графіка суттєво відрізняється від дати публікації. Відхилені дані не повинні ставати новим графіком без перевірки.'],
 ['Графіки','Чому графік давно не перевірявся?','Час перевірки означає останній успішний запит до джерела, а не останній ваш вхід. Якщо джерело недоступне, попередній графік може залишитися на екрані.'],
 ['Сповіщення','Як увімкнути Push на iPhone?','Додайте сайт на початковий екран через Safari, відкрийте встановлений застосунок і дозвольте сповіщення в «Опціях».'],
 ['Сповіщення','Чому я не отримав сповіщення?','Перевірте налаштування сповіщень, інтернет і вибрану підчергу. Доставка залежить також від служб iOS або Android.'],
 ['Приватність','Які дані зберігаються?','Адреси та налаштування зберігаються переважно на пристрої. Для Push потрібен технічний токен підписки, а для звернень — текст і необов’язкова пошта. Деталі є на сторінці конфіденційності.']
].map(([category,question,answer],i)=>({id:'local-'+i,category,question,answer}));
let articles=fallback,category='Усі';const $=id=>document.getElementById(id);
const norm=s=>String(s||'').toLocaleLowerCase('uk-UA').normalize('NFKC');
function render(){
 const categories=['Усі',...new Set(articles.map(x=>x.category))];if(!categories.includes(category))category='Усі';
 const wrap=$('helpFilters');wrap.replaceChildren();
 categories.forEach(c=>{const b=document.createElement('button');b.type='button';b.textContent=c;b.setAttribute('aria-pressed',String(category===c));b.addEventListener('click',()=>{category=c;render()});wrap.append(b)});
 const text=norm($('helpSearch').value.trim());const filtered=articles.filter(x=>(category==='Усі'||x.category===category)&&(!text||norm([x.category,x.question,x.answer].join(' ')).includes(text)));
 const list=$('helpArticles');list.replaceChildren();filtered.forEach(x=>{
  const d=document.createElement('details'),s=document.createElement('summary'),a=document.createElement('div');s.textContent=x.question;a.className='answer';a.textContent=x.answer;d.append(s,a);list.append(d)
 });$('articleCount').textContent=filtered.length+' відповідей';$('helpEmpty').hidden=filtered.length>0;
}
$('helpSearch').addEventListener('input',render);
document.addEventListener('keydown',event=>{if(event.key==='/'&&document.activeElement!==$('helpSearch')&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){event.preventDefault();$('helpSearch').focus()}});
render();
(async()=>{try{
 const r=await fetch('./push-config.json',{cache:'no-store'});if(!r.ok)return;
 const conf=await r.json();if(!/^https:\/\/[^\s/]+$/.test(String(conf.apiBase||'')))return;
 const response=await fetch(conf.apiBase+'/api/help',{cache:'no-store',signal:AbortSignal.timeout(7500)});if(!response.ok)return;
 const data=await response.json();if(Array.isArray(data.articles)&&data.articles.every(x=>x&&x.question&&x.answer&&x.category)){articles=data.articles;render()}
 if(data.banner?.enabled){$('announcementTitle').textContent=data.banner.title;$('announcementText').textContent=data.banner.message;$('publicAnnouncement').hidden=false}
}catch{/* fallback help remains available offline */}})();

let helpAPI='';
async function resolveHelpAPI(){
 if(helpAPI)return helpAPI;
 const r=await fetch('./push-config.json',{cache:'no-store'});if(!r.ok)throw Error('Сервіс звернень поки недоступний.');
 const c=await r.json();if(!/^https:\/\/[^\s/]+$/.test(String(c.apiBase||'')))throw Error('Сервіс звернень поки недоступний.');
 return helpAPI=String(c.apiBase);
}
$('ticketCheck').addEventListener('submit',async event=>{
 event.preventDefault();const label=$('ticketCheckResult');label.textContent='Перевіряємо…';
 try{
  const api=await resolveHelpAPI();const r=await fetch(api+'/api/ticket/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:$('ticketNumber').value.trim().toUpperCase()}),signal:AbortSignal.timeout(12000)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Не вдалося перевірити звернення.');
  const names={new:'Нове — очікує розгляду',in_progress:'У роботі',resolved:'Вирішено'};
  label.textContent='Статус: '+(names[data.status]||'Невідомий')+'. Оновлено: '+new Date(data.updatedAt).toLocaleString('uk-UA',{dateStyle:'medium',timeStyle:'short'});
 }catch(e){label.textContent=e?.name==='TypeError'?'Немає зв’язку із сервером. Спробуйте пізніше.':(e.message||'Помилка перевірки')}
});
