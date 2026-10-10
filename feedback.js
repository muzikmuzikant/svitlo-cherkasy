'use strict';
const $=id=>document.getElementById(id);
$('message').addEventListener('input',()=>{$('count').textContent=$('message').value.length+' / 2000'});
$('another').addEventListener('click',()=>{$('feedbackForm').reset();$('count').textContent='0 / 2000';$('feedbackForm').hidden=false;$('success').hidden=true;$('formMessage').hidden=true});
function error(text){$('formMessage').textContent=text;$('formMessage').hidden=false;$('formMessage').classList.remove('good')}
$('feedbackForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!$('feedbackForm').reportValidity())return;
 const message=$('message').value.trim();
 if(message.length<12){error('Напишіть трохи більше подробиць (мінімум 12 символів).');return}
 const button=$('send');button.disabled=true;button.textContent='Надсилаємо…';$('formMessage').hidden=true;
 try{
  const configResponse=await fetch('./push-config.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!configResponse.ok)throw Error('Форма зв’язку поки недоступна. Спробуйте пізніше.');
  const config=await configResponse.json();
  if(!/^https:\/\/[^\s/]+/.test(config.apiBase||''))throw Error('Форма зв’язку поки недоступна.');
  const r=await fetch(String(config.apiBase).replace(/\/$/,'')+'/api/feedback',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(16000),body:JSON.stringify({topic:$('topic').value,message,email:$('email').value.trim(),website:$('website').value})});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(body.error||'Не вдалося надіслати звернення. Спробуйте пізніше.');
  $('ticketId').textContent=body.id||'—';$('feedbackForm').hidden=true;$('success').hidden=false;
 }catch(e){const connectionError=e instanceof TypeError||e?.name==='TimeoutError'||e?.name==='AbortError';error(connectionError?'Не вдалося з’єднатися із сервісом звернень. Перевірте інтернет і спробуйте пізніше. Якщо помилка повторюється, повідомте адміністратора.':(e.message||'Перевірте інтернет і спробуйте ще раз.'))}
 finally{button.disabled=false;button.textContent='Надіслати звернення'}
});

const requestedTopic=new URLSearchParams(location.search).get('topic');if(['bug','address','idea','other'].includes(requestedTopic))$('topic').value=requestedTopic;
