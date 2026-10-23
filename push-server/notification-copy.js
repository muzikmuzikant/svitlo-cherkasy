/* Original Ukrainian notification copy. Kept self-contained because Railway
 * builds /push-server as its root and cannot rely on files outside that directory.
 * Keep templates and canonical IDs in sync with ../notification-text.js.
 */
const dateLabel=s=>{
 if(s==null||s==='')return 'сьогодні';
 if(typeof s!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(s))throw Error('Invalid date');
 const d=new Date(s+'T12:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('Invalid date');
 return new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:'UTC'}).format(d);
};
const clock=n=>{if(!Number.isInteger(n)||n<0||n>=2880)throw Error('Invalid time');n%=1440;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
const firstPublishedAt=d=>String(d?.publications?.[0]?.publishedAt||d?.publishedAt||'');
const dayId=(q,d)=>'day:'+q+':'+d.date;
const changeId=(q,c)=>'change:'+q+':'+c.date+':'+(c.revisionId||c.publishedAt);
const isLatestRevision=(c,d,q)=>!!(c&&d&&c.date===d.date&&c.queues?.includes(q)&&(c.publishedAt===d.publishedAt||c.revisionId&&c.revisionId===d.planFingerprint));
function hash(s){let n=2166136261;for(const c of String(s||'')){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return (n>>>0).toString(36)}
const emergencyId=e=>'emergency:'+hash(e.id||e.source)+':'+e.status+':'+e.publishedAt;
function hours(d,q){
  if(!d||d.verified!==true)return 'Час відключень уточнюється.';
  const entry=d.queues?.[q],partial=entry?.knownFrom&&entry.knownFrom!=='00:00';
  if(!entry||Array.isArray(entry.off)&&!entry.off.length)return 'Планових відключень для вашої підчерги не зазначено.'+(partial?' Ранні години ще уточнюються.':'');
  if(!Array.isArray(entry.off))return 'Години ще уточнюються.';
  return 'Планові відключення: '+entry.off.filter(a=>Array.isArray(a)&&a.length===2).map(a=>a[0]+'–'+a[1]).join(', ')+'.'+(partial?' Частина доби ще уточнюється.':'');
 }
function transitionCopy(type,q,minute,eta,date){
  if(!['off','on'].includes(type)||!Number.isInteger(eta)||eta<0||eta>60)throw Error('Invalid reminder');
  const off=type==='off',time=clock(minute),label=off?'відключення':'відновлення';
  return {title:(off?'🔴 Відключення':'🟢 Відновлення')+' через '+eta+' хв',
   body:'Підчерга '+q+' · За плановим графіком о '+time+'.',
   content:'**Нагадування про '+label+'**\n\nДля підчерги '+q+' за опублікованим графіком на '+dateLabel(date)+' о '+time+
    (off?' заплановане відключення електропостачання.':' заплановане повернення електропостачання.')+
    '\n\nДо зазначеного часу приблизно '+eta+' хв.\n\n**Важливо**\nЦе плановий час, а не підтвердження стану мережі у вашому будинку. Оператор може змінити розклад.'};
 }
const tomorrowCopy=(q,date,day)=>({
  title:'🗓️ Графік на завтра',
  body:'Підчерга '+q+' · На '+dateLabel(date)+'. Перегляньте години відключень.',
  content:'**Графік на '+dateLabel(date)+'**\n\nЧеркасиобленерго опублікувало розклад для підчерги '+q+'.\n\n**Планові години**\n'+hours(day,q)+
   '\n\nВідкрийте вкладку «Графік», щоб побачити розклад на весь день.\n\nЦе планові години, а не показники фактичної наявності електроенергії. Можливі зміни.'
 });
const changeCopy=(q,date,day)=>({
  title:'🔄 Графік оновлено',
  body:'Підчерга '+q+' · Змінено години на '+dateLabel(date)+'. Перевірте розклад.',
  content:'**Оновлення графіка на '+dateLabel(date)+'**\n\nОператор скоригував раніше опублікований графік для підчерги '+q+'. Попередня версія може бути неактуальною.\n\n**Новий розклад**\n'+hours(day,q)+
   '\n\nПеревірте години у вкладці «Графік». Час відключень залишається плановим і може змінюватися.'
 });
const emergencyCopy=status=>status==='active'?({
  title:'⚠️ Аварійні відключення',body:'Додаткові аварійні обмеження. Погодинний графік може відрізнятися від фактичних відключень.',
  content:'**Важливе повідомлення**\n\nОператор повідомив про застосування графіків аварійних відключень (ГАВ). Точний час таких обмежень за адресами може не публікуватися.\n\nПогодинні графіки (ГПВ) продовжують публікуватися, але через ГАВ фактичний час відключень може відрізнятися.\n\nЦе повідомлення не означає, що світло вже вимкнено саме у вашому будинку.'
 }):status==='ended'?({
  title:'✅ Екстрені обмеження завершено',body:'Оператор повідомив про завершення обмежень. Перевірте графік.',
  content:'**Оновлення від оператора**\n\nЧеркасиобленерго повідомило про завершення екстрених обмежень. Відновлення електропостачання за конкретною адресою може відбуватися не одразу.\n\nПеревірте актуальний плановий графік і наступні повідомлення оператора.'
 }):null;
const testCopy=()=>({title:'🧪 Тестове сповіщення',body:'Push працює! Сповіщення від «Світло Черкаси» успішно надійшло.'});

export {firstPublishedAt,dayId,changeId,isLatestRevision,emergencyId,transitionCopy,tomorrowCopy,changeCopy,emergencyCopy,testCopy};
