/* Versioned, local-only acknowledgment of legal documents. No implied analytics consent. */
(()=>{'use strict';
 const dialog=document.createElement('dialog');dialog.className='svitlo-legal-dialog';dialog.id='legalRevisionDialog';
 dialog.setAttribute('aria-labelledby','legalDialogTitle');
 const body=document.createElement('div');body.className='legal-content';
 const icon=document.createElement('div');icon.className='legal-icon';icon.textContent='📋';
 const title=document.createElement('h2');title.id='legalDialogTitle';title.textContent='Оновлення умов користування';
 const description=document.createElement('p');description.textContent='Ознайомтеся з актуальною редакцією умов і політики конфіденційності.';
 const links=document.createElement('div');links.className='legal-links';
 for(const [href,label] of [['./terms.html','Умови використання'],['./privacy.html','Політика конфіденційності']]){
  const a=document.createElement('a');a.href=href;a.textContent=label+' 📄';links.append(a)
 }
 const accept=document.createElement('button');accept.type='button';accept.className='legal-agree';accept.textContent='Погоджуюся з умовами';
 const later=document.createElement('button');later.type='button';later.className='legal-later';later.textContent='Не зараз';
 body.append(icon,title,description,links,accept,later);dialog.append(body);document.body.append(dialog);
 let revision='',lastRevision=null;
 const KEY='svitlo-legal-accepted-revision';
 async function check(){
  try{
   const config=await fetch('./push-config.json',{cache:'no-store'}).then(r=>r.json());
   if(!/^https:\/\//.test(config.apiBase||''))return;
   const res=await fetch(config.apiBase+'/api/legal',{cache:'no-store'});if(!res.ok)return;
   const info=await res.json();revision=[info.termsVersion,info.privacyVersion].join('|');
   if(!info.requireAcknowledgement||!revision||localStorage.getItem(KEY)===revision||lastRevision===revision)return;
   description.textContent=info.summary||description.textContent;
   if(dialog.open)return;
   if(document.getElementById('betaConsentDialog')?.open)return;
   // Critical outage information remains accessible, regardless of acceptance.
   dialog.showModal();
  }catch(error){console.warn('Legal revision check:',error.message)}
 }
 accept.onclick=()=>{try{localStorage.setItem(KEY,revision)}catch{}lastRevision=revision;(window.SvitloMotion?.closeDialog||((d)=>d.close()))(dialog)};
 later.onclick=()=>{lastRevision=revision;(window.SvitloMotion?.closeDialog||((d)=>d.close()))(dialog)};
 dialog.addEventListener('cancel',()=>{lastRevision=revision});
 document.getElementById('betaConsentDialog')?.addEventListener('close',()=>setTimeout(check,550));
 setTimeout(check,10500);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(check,2500)});
})();
