import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app.js'),css=read('style.css');
const nav=app.slice(app.indexOf('function navigate(name){'),app.indexOf('function renderDetail(){'));
function setup({reduced=false,off=false,hasAddress=true}={}){
 const events=[],ids=['home','detail','updates','settings'];
 const classes=()=>({set:new Set(),add(k){this.set.add(k)},remove(k){this.set.delete(k)},contains(k){return this.set.has(k)},toggle(k,v){if(v)this.set.add(k);else this.set.delete(k)}});
 const pages=Object.fromEntries(ids.map(id=>[id,{hidden:id!=='home',classList:classes(),style:{cssText:''}}]));
 const buttons=ids.map(name=>({dataset:{go:name},setAttribute(){},classList:{contains:k=>k==='nav-item',toggle(k,v){events.push('nav:'+name+':'+v)}}}));
 const element={style:{scrollBehavior:'smooth'},dataset:{},classList:{contains:k=>off&&k==='feature-off-animations'}};
 const context={active:'home',tabMotion:null,TAB_MOTION_MS:460,previewQueue:null,primary:()=>hasAddress?{queue:'2.1'}:null,openAddressSheet:()=>events.push('picker'),
  sessionStorage:{setItem(){}},SCREEN_RETURN:'selected',today:()=> '2026-10-15',
  renderHome:()=>events.push('render-home'),renderDetail:()=>events.push('render-detail'),
  renderUpdates:()=>events.push('render-updates'),renderSettings:()=>events.push('render-settings'),
  window:{scrollTo:()=>events.push('scroll'),matchMedia:()=>({matches:reduced})},
  document:{documentElement:element,querySelector:()=>null,querySelectorAll:()=>buttons},
  $:id=>pages[id]
 };
 vm.runInNewContext(nav+';this.navigate=navigate;',context);
 return {context,events,pages,element};
}
test('every tab tap commits immediately without queued cooldown',()=>{
 const {context,pages,events}=setup();
 for(const name of ['detail','settings','updates','home','detail']){
  context.navigate(name);
  assert.equal(context.active,name);
  assert.equal(pages[name].hidden,false);
  assert.equal(pages[name].classList.contains('tab-enter'),true);
 }
 assert.equal(events.filter(x=>x==='scroll').length,5);
 assert.equal(context.navigate.queuedName,undefined);
 assert.equal(context.navigate.runningTransition,undefined);
});
test('double-tap does not restart entrance animation or force scrolling',()=>{
 const {context,pages,events}=setup();
 context.navigate('updates');const before=events.slice();
 context.navigate('updates');context.navigate('updates');
 assert.deepEqual(events,before);
 assert.equal(pages.updates.classList.contains('tab-enter'),true);
});
test('reduce motion and admin animation-off remove entrance without delaying tab',()=>{
 for(const x of [{reduced:true},{off:true}]){
  const {context,pages}=setup(x);
  context.navigate('settings');assert.equal(context.active,'settings');
  assert.equal(pages.settings.classList.contains('tab-enter'),false);
 }
});
test('no address opens selector and keeps home active',()=>{
 const {context,events}=setup({hasAddress:false});
 context.navigate('detail');assert.equal(context.active,'home');assert.deepEqual(events,['picker']);
});
test('lateral CSS has no native page snapshot or vertical fallbacks',()=>{
 assert.doesNotMatch(app,/document\.startViewTransition|navigate\.queuedName|navigate\.runningTransition|skipTransition/);
 assert.doesNotMatch(css,/svitloViewportIn|svitloViewportOut|view-transition-name:svitlo-navigation/);
 assert.match(css,/animation:tabSettle \.46s/);
 assert.match(css,/@keyframes tabSettle\{from\{opacity:\.25;transform:translate3d\(28px,0,0\) scale\(\.985\)/);
 assert.match(css,/@keyframes tabSettleBackward\{from\{opacity:\.25;transform:translate3d\(-28px,0,0\) scale\(\.985\)/);
 assert.match(app,/node\.classList\.remove\('tab-enter'\)/);
});
test('missing schedule keeps simple caption',()=>{
 assert.match(app,/setText\('detailUpdated',pub\?\x60Опубліковано/);
});
