/* Small, safe Markdown subset shared by the Inbox and the admin editor.
 * DOM nodes only, never insert user-authored HTML. */
(function(root){'use strict';
 function secureUrl(url){
  try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&url.length<600?parsed.href:''}
  catch{return ''}
 }
 function inline(host,source){
  const pieces=String(source).split(/(\*\*[^*\n]{1,250}\*\*|\*[^*\n]{1,250}\*|\x60[^\x60\n]{1,160}\x60|\[[^\]\n]{1,120}\]\(https:\/\/[^\s)]+\))/g);
  for(const value of pieces){
   if(!value)continue;
   let node=null;
   if(value.startsWith('**')&&value.endsWith('**')){node=document.createElement('strong');node.textContent=value.slice(2,-2)}
   else if(value.startsWith('*')&&value.endsWith('*')){node=document.createElement('em');node.textContent=value.slice(1,-1)}
   else if(value.startsWith('\x60')&&value.endsWith('\x60')){node=document.createElement('code');node.textContent=value.slice(1,-1)}
   else if(value.startsWith('[')){
    const match=/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(value);
    const url=match&&secureUrl(match[2]);
    if(url){node=document.createElement('a');node.href=url;node.textContent=match[1];node.target='_blank';node.rel='noopener noreferrer'}
   }
   host.append(node||document.createTextNode(value));
  }
 }
 function render(host,text){
  host.replaceChildren();
  let list=null,listType='';
  for(const raw of String(text||'').split('\n').slice(0,150)){
   const t=raw.trim();
   if(!t){list=null;listType='';const space=document.createElement('div');space.className='message-space';host.append(space);continue}
   if(/^([-*_])\1\1+$/.test(t)){list=null;listType='';host.append(document.createElement('hr'));continue}
   const item=t.match(/^([-*])\s+(.+)$/)||t.match(/^(\d+)[.)]\s+(.+)$/);
   if(item){
    const kind=/^\d/.test(item[1])?'ol':'ul';
    if(!list||listType!==kind){list=document.createElement(kind);listType=kind;host.append(list)}
    const li=document.createElement('li');inline(li,item[2]);list.append(li);continue;
   }
   list=null;listType='';
   const match=/^(#{1,3})\s+(.+)$/.exec(t);
   const quote=/^>\s?(.*)$/.exec(t);
   const el=document.createElement(match?'h3':quote?'blockquote':'p');
   if(match)el.className='message-heading';
   inline(el,match?match[2]:quote?quote[1]:raw);
   host.append(el);
  }
 }
 root.SvitloMessageFormat={render,secureUrl};
})(typeof window!=='undefined'?window:globalThis);
