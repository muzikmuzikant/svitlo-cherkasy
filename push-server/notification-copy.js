/** Concise Ukrainian Web Push copy. No user address or live power-status claims. */
const clock = minute => {
 if(!Number.isInteger(minute)||minute<0||minute>=2880)throw Error('Invalid clock minute');
 const m=minute%1440;
 return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
};
const dateLabel = iso => {
 if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw Error('Invalid schedule date');
 const date=new Date(iso+'T12:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)throw Error('Invalid schedule date');
 return new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',timeZone:'UTC'}).format(date);
};
const queueLabel=queue=>`Підчерга ${queue}`;

export function transitionCopy(type,queue,minute,eta){
 if(type!=='off'&&type!=='on')throw Error('Unknown transition');
 if(!Number.isInteger(eta)||eta<0||eta>60)throw Error('Invalid reminder offset');
 const label=type==='off'?'🔴 Відключення':'🟢 Відновлення';
 return {
  title:`${label} через ${eta} хв`,
  body:`${queueLabel(queue)} · За графіком о ${clock(minute)}. Час орієнтовний.`
 };
}
export function tomorrowCopy(queue,date){
 return {
  title:'🗓️ Графік на завтра',
  body:`${queueLabel(queue)} · На ${dateLabel(date)}. Перегляньте години відключень.`
 };
}
export function changeCopy(queue,date){
 return {
  title:'🔄 Графік оновлено',
  body:`${queueLabel(queue)} · Змінено години на ${dateLabel(date)}. Перевірте розклад.`
 };
}
export function emergencyCopy(status){
 if(status==='active')return {
  title:'⚠️ Екстрені відключення',
  body:'Оператор повідомив про позапланові обмеження. Звичайний графік може не діяти.'
 };
 if(status==='ended')return {
  title:'✅ Екстрені обмеження завершено',
  body:'Оператор повідомив про завершення обмежень. Перевірте актуальний графік.'
 };
 return null;
}
export function testCopy(){
 return {
  title:'🧪 Тестове сповіщення',
  body:'Push працює! Сповіщення від «Світло Черкаси» успішно надійшло.'
 };
}
