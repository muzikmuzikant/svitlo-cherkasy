import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app.js'),css=read('style.css');
const start=app.indexOf('function navigate(name){'),end=app.indexOf('function renderDetail(){',start);
assert.ok(start>=0&&end>start,'Navigation must remain testable');
const navigation=app.slice(start,end);
const classes=(initial=[])=>{
 const names=new Set(initial);
 return {add:name=>names.add(name),remove:name=>names.delete(name),
  contains:name=>names.has(name),
  toggle(name,enabled){if(enabled)names.add(name);else names.delete(name)}};
};
function setup({reduced=false,adminOff=false,address=true,native=false}={}){
 const actions=[],ids=['home','detail','updates','settings'];
 const pages=Object.fromEntries(ids.map(id=>[id,{hidden:id!=='home',classList:classes()}]));
 const buttons=ids.map(id=>({dataset:{go:id},
  classList:classes(['nav-item',...(id==='home'?['active']:[])])}));
 const context={
  active:'home',previewQueue:null,primary:()=>address?{queue:'1.1'}:null,
  openAddressSheet:()=>actions.push('picker'),sessionStorage:{setItem(){}},
  SCREEN_RETURN:'screen',today:()=> '2026-10-15',
  renderDetail:()=>actions.push('detail'),renderUpdates:()=>actions.push('updates'),
  renderSettings:()=>actions.push('settings'),renderHome:()=>actions.push('home'),
  window:{matchMedia:()=>({matches:reduced}),scrollTo:()=>actions.push('scroll')},
  document:{documentElement:{classList:classes(adminOff?['feature-off-animations']:[]),dataset:{}},
   querySelectorAll:()=>buttons,
   ...(native?{startViewTransition:cb=>{actions.push('native-transition');cb();return {finished:Promise.resolve()}}}:{} )},
  $:id=>pages[id]
 };
 vm.runInNewContext(navigation+';this.navigate=navigate;',context);
 return {navigate:context.navigate,context,pages,buttons,actions};
}
test('All four screens animate as a single unit only when switching',()=>{
 const view=setup();
 view.navigate('detail');
 assert.equal(view.context.active,'detail');
 assert.equal(view.pages.home.hidden,true);
 assert.equal(view.pages.detail.hidden,false);
 assert.equal(view.pages.detail.classList.contains('tab-enter'),true);
 assert.deepEqual(view.actions,['detail','scroll']);
 view.navigate('updates');
 assert.equal(view.pages.detail.hidden,true);
 assert.equal(view.pages.detail.classList.contains('tab-enter'),false);
 assert.equal(view.pages.updates.classList.contains('tab-enter'),true);
 assert.equal(view.buttons.find(x=>x.dataset.go==='updates').classList.contains('active'),true);
 view.navigate('settings');
 assert.equal(view.pages.settings.classList.contains('tab-enter'),true);
 view.navigate('home');
 assert.equal(view.pages.home.classList.contains('tab-enter'),true);
});
test('A second tap on the active tab never restarts the transition or scrolls',()=>{
 const view=setup();
 view.navigate('updates');
 const scrolling=view.actions.filter(x=>x==='scroll').length;
 view.navigate('updates');
 assert.equal(view.actions.filter(x=>x==='scroll').length,scrolling);
 assert.equal(view.actions.filter(x=>x==='updates').length,2);
 assert.equal(view.pages.updates.classList.contains('tab-enter'),true);
});
test('Reduce Motion and admin animation-off both disable the reveal',()=>{
 for(const options of [{reduced:true},{adminOff:true}]){
  const view=setup(options);view.navigate('settings');
  assert.equal(view.pages.settings.hidden,false);
  assert.equal(view.pages.settings.classList.contains('tab-enter'),false);
 }
});
test('Without an address the graph tab opens the address picker, not an empty screen',()=>{
 const view=setup({address:false});view.navigate('detail');
 assert.equal(view.context.active,'home');
 assert.deepEqual(view.actions,['picker']);
});
test('The selected day caption is exactly the requested text for missing schedules',()=>{
 assert.match(app,/setText\('detailUpdated',pub\?`Опубліковано \$\{fmtStamp\(pub\.publishedAt\)\}`:'Світло весь день'\)/);
 assert.doesNotMatch(app,/detailUpdated'.{0,140}за замовчуванням/);
 assert.match(css,/opacity:0;transform:translate3d\(0,30px,0\)/);
});

test('Modern iOS animates both fixed-size viewport snapshots using View Transitions',()=>{
 const view=setup({native:true});
 view.navigate('detail');
 assert.equal(view.context.active,'detail');
 assert.ok(view.actions.includes('native-transition'));
 assert.equal(view.pages.detail.hidden,false);
 assert.equal(view.pages.detail.classList.contains('tab-enter'),false);
 assert.equal(view.context.document.documentElement.dataset.tabDirection,'forward');
 view.navigate('home');
 assert.equal(view.context.document.documentElement.dataset.tabDirection,'backward');
});
test('Reduced Motion skips native View Transitions completely',()=>{
 const view=setup({native:true,reduced:true});
 view.navigate('updates');
 assert.equal(view.context.active,'updates');
 assert.equal(view.actions.includes('native-transition'),false);
});
