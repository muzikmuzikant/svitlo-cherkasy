import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.nodeType=1;this.childNodes=[];this.listeners={};this.hidden=false;this.value='';this.attrs={};
  this.className='';this.classList={contains:key=>this.className.split(' ').includes(key),toggle:()=>{}}}
 get children(){return this.childNodes.filter(x=>x.nodeType===1)}
 append(...nodes){this.childNodes.push(...nodes)}
 replaceChildren(...nodes){this.childNodes=[...nodes]}
 before(){}
 setAttribute(k,v){this.attrs[k]=v}
 getAttribute(k){return this.attrs[k]||this[k]||null}
 addEventListener(k,fn){this.listeners[k]=fn}
 querySelectorAll(){return []}
 focus(){}
 get textContent(){return this.childNodes.map(x=>x.nodeType===3?x.nodeValue:x.textContent).join('')}
 set textContent(v){this.childNodes=[{nodeType:3,nodeValue:String(v)}]}
}
test('FAQ visual editor roundtrips headings/bold/links safely',()=>{
 const textarea=new Element('textarea');textarea.value='## Про застосунок\n**Графіки**\n- Сьогодні\n- Завтра\n[Довідка](https://example.org/help)';
 const toolbar=new Element();toolbar.className='ops-text-toolbar';textarea.previousElementSibling=toolbar;
 const document={listeners:{},getElementById:id=>id==='helpAnswer'?textarea:null,
  createElement:tag=>new Element(tag),createTextNode:txt=>({nodeType:3,nodeValue:txt}),
  addEventListener(type,fn){this.listeners[type]=fn}};
 const window={};
 vm.runInNewContext(read('admin-help-richtext.js'),{document,window,URL,Event,console});
 const rich=window.SvitloHelpRichEditor;
 assert.ok(rich);
 assert.match(rich.serialize(),/## Про застосунок/);
 assert.match(rich.serialize(),/\*\*Графіки\*\*/);
 assert.match(rich.serialize(),/- Сьогодні/);
 assert.match(rich.serialize(),/\[Довідка\]\(https:\/\/example.org\/help\)/);
 textarea.value='## Що нового\nОновили статтю';
 document.listeners['svitlo:help-loaded']();
 assert.match(rich.serialize(),/## Що нового/);
});
test('help editor and public FAQ have the same safe Markdown behavior',()=>{
 const help=read('help.js'),admin=read('admin-extra.js'),html=read('admin.html'),src=read('admin-help-richtext.js');
 assert.match(help,/function renderHelpAnswer\(node,markdown\)/);
 assert.match(help,/new URL\(match\[2\]\)/);
 assert.match(help,/url\.protocol==='https:'/);
 assert.match(help,/renderHelpAnswer\(a,x\.answer\)/);
 assert.doesNotMatch(help,/a\.innerHTML\s*=\s*x\.answer/);
 assert.match(admin,/svitlo:help-loaded/);
 assert.match(html,/id="helpAnswer"/);
 assert.match(html,/data-help-format="bold"/);
 assert.match(html,/src="\.\/admin-help-richtext\.js"/);
 assert.match(src,/slice\(0,1600\)/);
 assert.match(read('sw.js'),/"\.\/admin-help-richtext\.js"/);
 assert.match(read('scripts/build_pages.py'),/admin-help-richtext\.js/);
});
