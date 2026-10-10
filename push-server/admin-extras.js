/* Public help content + private administrative audit trail. All writes live on the persistent Railway volume. */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ARTICLES=[
 {id:'how-find',category:'Підчерги та адреси',question:'Як дізнатися свою підчергу?',answer:'У застосунку відкрийте «Мої місця», оберіть населений пункт і вулицю. Якщо підчергу неможливо визначити однозначно, перевірте її у переліку адрес на офіційному сайті Черкасиобленерго.'},
 {id:'wrong-address',category:'Підчерги та адреси',question:'Моя адреса або підчерга неправильна. Що робити?',answer:'Звірте підчергу з офіційним переліком Черкасиобленерго. У «Зв’язок із нами» оберіть тему «Неправильна адреса або підчерга» і вкажіть населений пункт, вулицю та правильну підчергу, якщо вона відома. Особисті документи надсилати не потрібно.'},
 {id:'light-diff',category:'Графіки',question:'Чому світло вимкнули не за графіком?',answer:'Опублікований графік є плановим. Можливі аварійні обмеження, технічні роботи або відхилення за рішенням оператора. Застосунок не вимірює фактичну наявність електроенергії у будинку. Для підтвердження перевіряйте офіційні повідомлення.'},
 {id:'wrong-date',category:'Графіки',question:'У повідомленні оператора помилка в даті. Чи можна довіряти графіку?',answer:'Автоматична перевірка відхиляє публікації з підозрілою датою, наприклад якщо в заголовку вказано липень, а матеріал опубліковано в жовтні. Такі випадки потребують додаткової перевірки. Дивіться час останньої перевірки та посилання на джерело.'},
 {id:'stale',category:'Графіки',question:'Що означає «дані давно не перевірялися»?',answer:'Це час останньої успішної перевірки офіційних публікацій, а не час запуску застосунку. Коли інтернет або джерело недоступні, можуть відображатися збережені дані. Уточніть актуальну інформацію на сайті оператора.'},
 {id:'push-enable',category:'Сповіщення',question:'Як увімкнути сповіщення на iPhone?',answer:'Відкрийте сайт у Safari, додайте його на початковий екран і запустіть з іконки. У «Опції» виберіть потрібні сповіщення та надайте дозвіл. Push працює для встановленого PWA на підтримуваних версіях iOS.'},
 {id:'push-missing',category:'Сповіщення',question:'Чому не надходять Push-сповіщення?',answer:'Перевірте дозвіл у налаштуваннях телефона, інтернет, режим фокусування і вибрану підчергу. Сервер надсилає сповіщення лише за наявності підтверджених даних; доставка залежить також від системних служб iOS або Android.'},
 {id:'privacy',category:'Приватність',question:'Які мої дані зберігає застосунок?',answer:'Вибрані адреси та налаштування зазвичай зберігаються на пристрої. Для Push сервер отримує технічний ідентифікатор підписки, підчергу та вибрані типи сповіщень. Якщо надсилаєте звернення, сервер зберігає текст і необов’язкову email-адресу.'}
];
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file)}
export function validateHelp(body){
 if(!body||!Array.isArray(body.articles)||body.articles.length>35)throw Error('Некоректний список статей (максимум 35)');
 const ids=new Set();const articles=body.articles.map(a=>{
  const id=String(a.id||'').trim(),category=String(a.category||'').trim(),question=String(a.question||'').trim(),answer=String(a.answer||'').trim();
  if(!/^[a-z0-9-]{3,55}$/.test(id)||ids.has(id))throw Error('Повторюваний або неправильний ID статті');ids.add(id);
  if(category.length<3||category.length>65||question.length<8||question.length>140||answer.length<20||answer.length>1600)throw Error('Перевірте довжину категорії, запитання та відповіді');
  return {id,category,question,answer};
 });
 const src=body.banner||{};
 const banner={enabled:!!src.enabled,title:String(src.title||'').trim(),message:String(src.message||'').trim()};
 if(banner.title.length>110||banner.message.length>420||(banner.enabled&&(banner.title.length<5||banner.message.length<12)))throw Error('Перевірте заголовок та повідомлення оголошення');
 return {schemaVersion:1,updatedAt:new Date().toISOString(),articles,banner};
}
export function createAdminExtras({directory}){
 const helpFile=path.join(directory,'help-content.json'),auditFile=path.join(directory,'admin-audit.json');
 let content=read(helpFile,{schemaVersion:1,updatedAt:null,articles:DEFAULT_ARTICLES,banner:{enabled:false,title:'',message:''}});
 let audit=read(auditFile,{events:[]}).events;if(!Array.isArray(audit))audit=[];
 function record(action,details=''){
  audit.unshift({at:new Date().toISOString(),action:String(action).slice(0,70),details:String(details).slice(0,200)});
  audit=audit.slice(0,250);try{write(auditFile,{events:audit})}catch(e){console.error('Audit save error',e.message)}
 }
 function updateHelp(value){const validated=validateHelp(value);write(helpFile,validated);content=validated;record('help.updated',validated.articles.length+' articles');return content}
 return {getHelp:()=>content,updateHelp,getAudit:()=>audit.slice(0,150),record};
}
