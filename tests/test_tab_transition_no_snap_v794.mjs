import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app.js'),css=read('style.css');
const start=app.indexOf('function navigate(name){');
const end=app.indexOf('function renderDetail(){',start);
const nav=app.slice(start,end);
function setup(){
 const pages=Object.fromEntries(['home','detail','updates','settings'].map(name=>[name,{hidden:name!=='home',classList:{add(){},remove(){}}}]));
 const actions=[],pending=[],html={classList:{contains:()=>false},dataset:{},style:{scrollBehavior:''}};
 const buttons=['home','detail','updates','settings'].map(name=>({dataset:{go:name},classList:{contains:k=>k==='nav-item',toggle(){}}}));
 const ctx={primary:()=>({queue:'1.1'}),previewQueue:null,active:'home',daySelected:null,dayStripStart:null,
  sessionStorage:{setItem(){}},SCREEN_RETURN:'return-screen',today:()=> '2026-10-15',
  renderDetail:()=>actions.push('detail'),renderHome:()=>actions.push('home'),
  renderUpdates:()=>actions.push('updates'),renderSettings:()=>actions.push('settings'),
  window:{scrollTo:()=>actions.push('scroll'),matchMedia:()=>({matches:false})},
  document:{documentElement:html,querySelectorAll:()=>buttons,
   startViewTransition:callback=>{
    const transition={finished:new Promise(()=>{}),skipped:false,
     skipTransition(){this.skipped=true;actions.push('skip')}};
    pending.push({callback,transition});return transition;
   }},
  $:id=>pages[id],console,Promise
 };
 vm.runInNewContext(nav+';this.navigate=navigate;',ctx);
 return {ctx,pending,actions,pages,html};
}
test('rapid taps cannot let a stale view-transition callback replace the final tab',()=>{
 const v=setup();
 v.ctx.navigate('detail');
 assert.equal(v.ctx.active,'home','native VT callback is asynchronous');
 v.ctx.navigate('settings');
 assert.equal(v.pending[0].transition.skipped,true);
 v.pending[1].callback();
 v.pending[0].callback(); // a stale completion must never reset the UI
 assert.equal(v.ctx.active,'settings');
 assert.equal(v.pages.settings.hidden,false);
 assert.equal(v.pages.detail.hidden,true);
 assert.equal(v.actions.filter(x=>x==='scroll').length,1);
});
test('selecting current tab while another transition is pending cancels that transition',()=>{
 const v=setup();
 v.ctx.navigate('detail');
 v.ctx.navigate('home');
 assert.equal(v.pending[0].transition.skipped,true);
 v.pending[0].callback();
 assert.equal(v.ctx.active,'home');
 assert.equal(v.pages.home.hidden,false);
 assert.equal(v.actions.filter(x=>x==='scroll').length,0);
});
test('scroll-to-top is forced synchronously, never animated by CSS smooth scroll',()=>{
 const v=setup();
 v.html.style.scrollBehavior='smooth';
 v.ctx.navigate('updates');v.pending[0].callback();
 assert.equal(v.ctx.active,'updates');
 assert.equal(v.html.style.scrollBehavior,'smooth','inline scroll setting must be restored');
 assert.ok(v.actions.includes('scroll'));
 assert.match(app,/scrollStyle\.scrollBehavior='auto'/);
 assert.match(app,/window\.scrollTo\(0,0\)/);
});
test('fixed viewport View Transition avoids size interpolation of variable-height screens',()=>{
 assert.doesNotMatch(css,/view-transition-name:svitlo-screen/);
 assert.match(css,/::view-transition-group\(root\)\{\s*animation:none!important/);
 assert.match(css,/\.bottom-nav\{view-transition-name:svitlo-navigation\}/);
 assert.match(css,/::view-transition-new\(root\)\{\s*animation:svitloViewportIn \.46s/);
 assert.match(css,/::view-transition-old\(root\)\{\s*animation:svitloViewportOut \.46s/);
 for(const name of ['svitloViewportOut','svitloViewportIn','svitloViewportOutBackward','svitloViewportInBackward']){
  const piece=css.slice(css.indexOf('@keyframes '+name+'{'));
  assert.match(piece,/to\{opacity:0;transform:translate3d\(-?\d+px,0,0\) scale\(\.985\)\}|to\{opacity:1;transform:translate3d\(0,0,0\) scale\(1\)\}/);
 }
});
