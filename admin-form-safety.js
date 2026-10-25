/* Admin editor groups are not address forms. Only loginForm remains a
 * native HTML form, so Chrome cannot mistake a document save for submitting
 * street, house and town fields to an address profile.
 */
(()=>{'use strict';
 const dashboard=document.getElementById('adminDashboard');
 if(!dashboard)return;
 const wired=new WeakSet();
 const field=el=>{
  if(!(el instanceof HTMLElement)||!el.matches('input,select,textarea'))return;
  if(el.matches('input[type="password"],input[type="hidden"]'))return;
  if(['username','current-password','new-password','one-time-code'].includes(el.autocomplete))return;
  el.setAttribute('autocomplete','off');
 };
 const submit=group=>{
  if(!group.isConnected)return;
  for(const el of group.querySelectorAll('input,select,textarea')){
   if(el.disabled||el.closest('[hidden]'))continue;
   if(typeof el.reportValidity==='function'&&!el.reportValidity())return;
  }
  // Existing Railway .onsubmit handlers run, but native HTML submission cannot.
  group.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 };
 function prepare(group){
  if(!(group instanceof HTMLElement)||!group.matches('[data-admin-editor-group]')||wired.has(group))return;
  wired.add(group);
  group.querySelectorAll('input,select,textarea').forEach(field);
  group.addEventListener('submit',event=>event.preventDefault(),true);
  const buttons=[...group.querySelectorAll('[data-admin-save-action],button[type="submit"],input[type="submit"]')];
  for(const button of buttons){
   button.type='button';
   button.setAttribute('data-admin-save-action','');
   button.addEventListener('click',()=>submit(group));
  }
  group.addEventListener('keydown',event=>{
   if(event.key!=='Enter'||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
   if(!(event.target instanceof HTMLInputElement)||event.target.matches('[type="button"],[type="checkbox"],[type="radio"],[type="file"]'))return;
   if(!buttons.some(btn=>!btn.disabled))return;
   event.preventDefault();submit(group);
  });
 }
 const prepareTree=node=>{
  if(!(node instanceof Element))return;
  if(node.matches('[data-admin-editor-group]'))prepare(node);
  node.querySelectorAll('[data-admin-editor-group]').forEach(prepare);
  if(node.matches('input,select,textarea'))field(node);
  node.querySelectorAll('input,select,textarea').forEach(field);
 };
 prepareTree(dashboard);
 new MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes)prepareTree(node);
 }).observe(dashboard,{childList:true,subtree:true});
})();
