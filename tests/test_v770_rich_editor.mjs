import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
class Elem {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.nodeType=1;this.childNodes=[];this.listeners={};this.hidden=false;this.value='';this.attrs={};
 this.className='';this.classList={contains:x=>this.className.split(/\s+/).includes(x),toggle:()=>{}}}
 get children(){return this.childNodes.filter(x=>x.nodeType===1)}
 append(...nodes){this.childNodes.push(...nodes)}
 replaceChildren(...nodes){this.childNodes=[...nodes]}
 before(){}
 setAttribute(k,v){this.attrs[k]=v}
 addEventListener(k,callback){this.listeners[k]=callback}
 querySelectorAll(){return []}
 focus(){}
 get textContent(){return this.childNodes.map(x=>x.nodeType===3?x.nodeValue:x.textContent).join('')}
 set textContent(v){this.childNodes=[{nodeType:3,nodeValue:String(v)}]}
}
test('visual editor roundtrips previously published Markdown without unsafe HTML',()=>{
 const textarea=new Elem('textarea');
 const toolbar=new Elem('div');toolbar.className='ops-text-toolbar';
 textarea.previousElementSibling=toolbar;
 textarea.value='## Деталі\n**Жирний текст**\n- Перший пункт\n- Другий пункт\n[Джерело](https://example.org/news)';
 const document={getElementById:id=>id==='opsNoticeContent'?textarea:null,
  createElement:tag=>new Elem(tag),
  createTextNode:text=>({nodeType:3,nodeValue:String(text)}),
  addEventListener(type,callback){this.listeners[type]=callback},listeners:{}};
 const window={};
 vm.runInNewContext(read('admin-richtext.js'),{window,document,URL,Event,console});
 assert.ok(window.SvitloRichEditor);
 const raw=window.SvitloRichEditor.serialize();
 assert.match(raw,/^## Деталі/m);
 assert.match(raw,/\*\*Жирний текст\*\*/);
 assert.match(raw,/- Перший пункт/);
 assert.match(raw,/\[Джерело\]\(https:\/\/example\.org\/news\)/);
 textarea.value='## Оновлено\nЦе новий текст';
 document.listeners['svitlo:cms-loaded']();
 assert.match(window.SvitloRichEditor.serialize(),/## Оновлено/);
 assert.doesNotMatch(window.SvitloRichEditor.serialize(),/<script|<strong>/i);
});
test('CMS stores only Markdown and preserves the integrated preview',()=>{
 const rich=read('admin-richtext.js'),admin=read('admin-control.js'),html=read('admin.html');
 assert.match(rich,/contentEditable='true'/);
 assert.match(rich,/textarea\.dispatchEvent\(new Event\('input'/);
 assert.match(rich,/document\.execCommand\('bold'\)/);
 assert.match(rich,/document\.execCommand\('insertUnorderedList'\)/);
 assert.match(rich,/serializeInline/);
 assert.match(admin,/svitlo:cms-loaded/);
 assert.match(html,/src="\.\/admin-richtext\.js"/);
 assert.match(read('sw.js'),/"\.\/admin-richtext\.js"/);
 assert.match(read('scripts/build_pages.py'),/admin-richtext\.js/);
});
