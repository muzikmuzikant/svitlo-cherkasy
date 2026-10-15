import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const motion=source('motion.js'),css=source('motion.css');
test('shared motion system is included on every new page and in the beta build cache',()=>{
 for(const page of ['index.html','admin.html','advertising.html','support-project.html','ad-detail.html']){
  const html=source(page);
  assert.match(html,/href="\.\/motion\.css"/,page+' missing motion styles');
  assert.match(html,/src="\.\/motion\.js"/,page+' missing motion logic');
 }
 const build=source('scripts/build_pages.py'),sw=source('sw.js');
 assert.match(build,/'motion\.js','motion\.css'/);
 assert.match(sw,/"\.\/motion\.js","\.\/motion\.css"/);
});
test('new dialogs and internal pages animate on open AND close',()=>{
 const shell=source('internal-pages.js'),sheet=source('internal-pages.css');
 assert.match(shell,/svitlo-internal-leaving/);
 assert.match(shell,/finishClose/);
 assert.match(shell,/const resumingClose=leaveTimer!==null/);
 assert.match(sheet,/@keyframes svitloScreenOut/);
 assert.match(sheet,/svitlo-internal-loading/);
 assert.match(css,/svitloDialogEnter/);
 assert.match(css,/svitloDialogExit/);
 assert.match(css,/svitloBackdropExit/);
 assert.match(source('beta-ads.js'),/SvitloMotion\?\.closeDialog/);
 assert.match(source('legal-consent.js'),/SvitloMotion\?\.closeDialog/);
});
test('animation preferences and interruptible admin tabs are respected',()=>{
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(motion,/prefers-reduced-motion: reduce/);
 assert.match(source('admin-extra.js'),/skipTransition/);
 assert.match(source('admin-extra.js'),/startViewTransition/);
 assert.match(motion,/anim\.finished\.then/);
 assert.match(motion,/\.cancel\(\)/);
});
test('motion JS starts on all routes, including marketing and administrator pages',()=>{
 for(const pathname of ['/index.html','/advertising.html','/support-project.html','/ad-detail.html','/admin.html']){
  const listeners=new Map();
  const classes=new Set();
  const html={classList:{add:x=>classes.add(x),contains:x=>classes.has(x)}};
  const document={documentElement:html,body:{},querySelectorAll:()=>[],addEventListener:(key,fn)=>listeners.set(key,fn)};
  const window={matchMedia:()=>({matches:false})};
  const context={document,window,location:{pathname},setTimeout,console};
  assert.doesNotThrow(()=>vm.runInNewContext(motion,context,{filename:'motion.js'}),pathname);
  assert.equal(classes.has('svitlo-motion-ready'),true);
  assert.equal(typeof window.SvitloMotion?.closeDialog,'function');
 }
});
test('details open and close using height animation',async()=>{
 const listeners=new Map(),classes=new Set();
 const document={documentElement:{classList:{add:x=>classes.add(x),contains:x=>classes.has(x)}},body:{},querySelectorAll:()=>[],addEventListener:(k,cb)=>listeners.set(k,cb)};
 const window={matchMedia:()=>({matches:false})};
 vm.runInNewContext(motion,{document,window,location:{pathname:'/index.html'},setTimeout,console});
 const summary={parentElement:null};
 const details={
  tagName:'DETAILS',open:false,dataset:{},
  style:{height:'',overflow:'',removeProperty(){}},
  querySelector:()=>summary,
  getBoundingClientRect(){return {height:this.open?120:38}},
  animate(){return {finished:Promise.resolve(),cancel(){}}}
 };
 summary.parentElement=details;
 const target={closest:selector=>selector==='summary'?summary:null};
 const click=()=>{let prevented=false;listeners.get('click')({target,preventDefault(){prevented=true}});return prevented};
 assert.equal(click(),true);
 assert.equal(details.open,true);
 await Promise.resolve();await Promise.resolve();
 assert.equal(click(),true);
 await Promise.resolve();await Promise.resolve();
 assert.equal(details.open,false);
});
test('new pages use phone emoji, not fake symbol-font glyphs',()=>{
 const broken=/[ϟ⌖◇▤▣✳✦↗♡⌘◈▥▦◫▧◉⌁⛨▨↶◷♧◎★☆‹›]/u;
 for(const name of ['advertising.html','support-project.html','ad-detail.html','admin-ads.js','beta-ads.js','admin-workspace.js']){
  assert.equal(broken.test(source(name)),false,name+' contains decorative Unicode placeholder');
 }
 assert.match(source('advertising.html'),/📍|📱|📰/u);
 assert.match(source('support-project.html'),/💙/u);
 // Existing main PWA and admin icons are intentional and must not be emoji-replaced.
});
