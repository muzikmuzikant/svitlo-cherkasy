/* Administrative editor forms are NOT postal-address forms.
 * Keep real login/autofill intact, while preventing Chrome's "save address"
 * offer and accidental native form navigation during Railway writes.
 *
 * Existing onsubmit / addEventListener('submit') code remains authoritative.
 * A synthetic, cancelable event calls those handlers without native submission.
 */
(()=>{'use strict';
 const dashboard=document.getElementById('adminDashboard');
 if(!dashboard)return;
 const wired=new WeakSet();
 const editorField=field=>{
  if(!(field instanceof HTMLElement)||!field.matches('input,select,textarea'))return;
  if(field.matches('input[type="password"],input[type="hidden"]'))return;
  if(['current-password','new-password','one-time-code','username'].includes(field.autocomplete))return;
  field.setAttribute('autocomplete','off');
 };
 const saveWithoutNativeSubmit=form=>{
  if(!form.isConnected||!form.reportValidity())return;
  // dispatchEvent never invokes the browser's native form-submit algorithm.
  // Chrome cannot interpret a genuine address-form submission here.
  form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 };
 function prepare(form){
  if(!(form instanceof HTMLFormElement)||wired.has(form)||form.id==='loginForm')return;
  wired.add(form);
  form.setAttribute('autocomplete','off');
  form.querySelectorAll('input,select,textarea').forEach(editorField);
  // Even if a future handler forgets event.preventDefault, never navigate.
  form.addEventListener('submit',event=>event.preventDefault(),true);
  const submitters=[...form.querySelectorAll('button[type="submit"],input[type="submit"]')];
  for(const button of submitters){
   button.type='button';
   button.setAttribute('data-admin-save-action','');
   button.addEventListener('click',()=>saveWithoutNativeSubmit(form));
  }
  // Enter must still save a document, without a native HTML form submission.
  form.addEventListener('keydown',event=>{
   if(event.key!=='Enter'||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
   const target=event.target;
   if(!(target instanceof HTMLInputElement)||target.matches('[type="button"],[type="checkbox"],[type="radio"],[type="file"]'))return;
   const button=submitters.find(x=>!x.disabled);
   if(!button)return;
   event.preventDefault();
   saveWithoutNativeSubmit(form);
  });
 }
 const prepareTree=node=>{
  if(!(node instanceof Element))return;
  if(node.matches('form'))prepare(node);
  node.querySelectorAll('form').forEach(prepare);
  if(node.matches('input,select,textarea'))editorField(node);
  node.querySelectorAll('input,select,textarea').forEach(editorField);
 };
 prepareTree(dashboard);
 new MutationObserver(records=>{
  for(const record of records)
   for(const node of record.addedNodes)prepareTree(node);
 }).observe(dashboard,{childList:true,subtree:true});
})();
