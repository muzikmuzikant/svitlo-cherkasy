import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app.js'),css=read('style.css');
const nav=app.slice(app.indexOf('function navigate(name){'),app.indexOf('function renderDetail(){'));
test('rapid tap sequence always shows the last requested screen synchronously',()=>{
 const pages=Object.fromEntries(['home','detail','updates','settings'].map(id=>[id,{hidden:id!=='home',classList:{add(){},remove(){}},style:{cssText:''}}]));
 const html={style:{scrollBehavior:''},dataset:{},classList:{contains:()=>false}};
 const context={active:'home',tabMotion:null,TAB_MOTION_MS:260,previewQueue:null,primary:()=>({queue:'1.1'}),SCREEN_RETURN:'saved',sessionStorage:{setItem(){}},today:()=> '2026-10-15',
  renderDetail(){},renderHome(){},renderUpdates(){},renderSettings(){},
  window:{scrollTo(){},matchMedia:()=>({matches:false})},
  document:{documentElement:html,querySelector:()=>null,querySelectorAll:()=>[]},
  $:id=>pages[id]
 };
 vm.runInNewContext(nav+';this.navigate=navigate;',context);
 for(const name of ['updates','settings','detail','home','settings','updates']){
  context.navigate(name);assert.equal(context.active,name);assert.equal(pages[name].hidden,false);
 }
 context.navigate('updates');assert.equal(pages.updates.hidden,false);
 assert.equal(html.style.scrollBehavior,'');
});
test('same-tab taps never queue or restart running transitions',()=>{
 assert.doesNotMatch(nav,/Promise\.resolve|skipTransition|startViewTransition|setTimeout|pendingName|queuedName/);
 assert.match(nav,/if\(name===active\)return/);
 assert.match(nav,/token\.incoming\.finished\.then/);
 assert.match(nav,/token\.outgoing\.cancel\(\)/);
 assert.doesNotMatch(css,/translate3d\(0,30px,0\)/);
});
