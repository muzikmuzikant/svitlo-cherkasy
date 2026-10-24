/* Rich text editor over the existing plain-Markdown storage format.
 * Only a tiny, explicitly supported markup subset is allowed. Never save HTML.
 */
(()=>{'use strict';
 const textarea=document.getElementById('opsNoticeContent');
 if(!textarea)return;
 const toolbar=textarea.previousElementSibling;
 if(!toolbar?.classList.contains('ops-text-toolbar'))return;
 const switcher=document.createElement('div');switcher.className='ops-editor-modes';switcher.setAttribute('role','group');switcher.setAttribute('aria-label','Режим редактора');
 const visualButton=document.createElement('button'),sourceButton=document.createElement('button');
 visualButton.type=sourceButton.type='button';visualButton.textContent='✦ Візуально';sourceButton.textContent='⌘ Markdown';
 switcher.append(visualButton,sourceButton);toolbar.before(switcher);
 const visual=document.createElement('div');visual.id='opsVisualEditor';visual.className='ops-visual-editor';
 visual.contentEditable='true';visual.spellcheck=true;visual.setAttribute('role','textbox');visual.setAttribute('aria-multiline','true');
 visual.setAttribute('aria-label','Візуальне редагування повного тексту повідомлення');textarea.before(visual);
 const allowedLink=url=>{
  try{const v=new URL(url);return v.protocol==='https:'&&!v.username&&!v.password?v.href:''}catch{return ''}
 };
 function formatInline(target,text){
  for(const token of String(text).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^)\s]+\))/g)){
   if(!token)continue;
   if(token.startsWith('**')&&token.endsWith('**')){
    const strong=document.createElement('strong');strong.textContent=token.slice(2,-2);target.append(strong);
   }else{
    const match=token.match(/^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/);
    if(match&&allowedLink(match[2])){const a=document.createElement('a');a.href=allowedLink(match[2]);a.textContent=match[1];target.append(a)}
    else target.append(document.createTextNode(token));
   }
  }
 }
 function parseMarkdown(text){
  if(window.SvitloMessageFormat?.render)return window.SvitloMessageFormat.render(visual,text);
  visual.replaceChildren();
  let list=null;
  for(const line of String(text||'').split('\n').slice(0,150)){
   const trimmed=line.trim();
   if(/^[-*]\s+/.test(trimmed)){
    if(!list){list=document.createElement('ul');visual.append(list)}
    const li=document.createElement('li');formatInline(li,trimmed.replace(/^[-*]\s+/,''));list.append(li);continue;
   }
   list=null;
   const heading=/^#{1,3}\s+/.test(trimmed);
   const row=document.createElement(heading?'h3':'p');
   if(heading)formatInline(row,trimmed.replace(/^#{1,3}\s+/,''));
   else if(trimmed)formatInline(row,line);
   else row.append(document.createElement('br'));
   visual.append(row);
  }
 }
 function serializeInline(node){
  if(node.nodeType===3)return (node.nodeValue||'').replace(/\u00a0/g,' ');
  if(node.nodeType!==1)return '';
  const name=node.tagName.toUpperCase();
  const inner=Array.from(node.childNodes).map(serializeInline).join('');
  if(name==='BR')return '\n';
  if(name==='STRONG'||name==='B')return '**'+inner+'**';
  if(name==='EM'||name==='I')return '*'+inner+'*';
  if(name==='CODE')return '`'+inner.replace(/`/g,'')+'`';
  if(name==='A'){const href=allowedLink(node.getAttribute('href')||'');return href?'['+inner+']('+href+')':inner}
  return inner;
 }
 function serialize(){
  let result=[];
  for(const node of visual.childNodes){
   if(node.nodeType===3){result.push(serializeInline(node));continue}
   if(node.nodeType!==1)continue;
   const tag=node.tagName.toUpperCase();
   if(tag==='UL'||tag==='OL'){
    for(const [index,li] of Array.from(node.children).entries())result.push((tag==='OL'?(index+1)+'. ':'- ')+serializeInline(li).replace(/\n/g,' ').trim());
   }else if(['H1','H2','H3'].includes(tag))result.push('## '+serializeInline(node).trim());
   else if(tag==='BLOCKQUOTE')result.push('> '+serializeInline(node).trim());
   else if(tag==='HR')result.push('---');
   else if(node.classList.contains('message-space'))result.push('');
   else result.push(serializeInline(node).trim());
  }
  return result.join('\n').slice(0,6000);
 }
 let mode='visual',inSync=false;
 function switchMode(next){
  if(next===mode)return;
  if(mode==='visual'&&next==='source')sync();
  if(next==='visual')parseMarkdown(textarea.value);
  mode=next;renderMode();
 }
 function renderMode(){
  visual.hidden=mode!=='visual';textarea.hidden=mode!=='source';
  visualButton.classList.toggle('selected',mode==='visual');sourceButton.classList.toggle('selected',mode==='source');
  visualButton.setAttribute('aria-pressed',String(mode==='visual'));sourceButton.setAttribute('aria-pressed',String(mode==='source'));
 }
 function sync(){
  if(inSync||mode!=='visual')return;
  inSync=true;
  const output=serialize();
  if(textarea.value!==output){textarea.value=output;textarea.dispatchEvent(new Event('input',{bubbles:true}))}
  inSync=false;
 }
 visual.addEventListener('input',sync);
 visual.addEventListener('blur',sync);
 visualButton.addEventListener('click',()=>switchMode('visual'));
 sourceButton.addEventListener('click',()=>switchMode('source'));
 textarea.addEventListener('input',()=>{if(mode==='source')return;/* Other content updates use cms-loaded. */});
 document.addEventListener('svitlo:cms-loaded',()=>{parseMarkdown(textarea.value);renderMode()});
 for(const button of toolbar.querySelectorAll('[data-ops-format]')){
  button.addEventListener('click',event=>{
   if(mode!=='visual')return;
   event.preventDefault();event.stopImmediatePropagation();
   visual.focus();
   const kind=button.dataset.opsFormat;
   if(kind==='bold')document.execCommand('bold');
   if(kind==='italic')document.execCommand('italic');
   if(kind==='heading')document.execCommand('formatBlock',false,'h3');
   if(kind==='bullet')document.execCommand('insertUnorderedList');
   if(kind==='numbered')document.execCommand('insertOrderedList');
   if(kind==='quote')document.execCommand('formatBlock',false,'blockquote');
   if(kind==='code'){
    const selection=window.getSelection();if(selection?.rangeCount){const range=selection.getRangeAt(0),code=document.createElement('code');code.textContent=selection.toString()||'код';range.deleteContents();range.insertNode(code);range.setStartAfter(code);range.collapse(true);selection.removeAllRanges();selection.addRange(range)}
   }
   if(kind==='divider')document.execCommand('insertHorizontalRule');
   if(kind==='link'){
    const href=allowedLink(prompt('HTTPS-посилання:')||'');
    if(!href)return;
    document.execCommand('createLink',false,href);
   }
   sync();
  },true);
 }
 parseMarkdown(textarea.value);renderMode();
 window.SvitloRichEditor={switchMode,serialize};
})();
