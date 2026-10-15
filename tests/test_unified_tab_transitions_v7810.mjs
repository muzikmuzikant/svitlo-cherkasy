import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('All four tabs use a short page reveal without cascading block animations',()=>{
 const css=read('style.css');
 const html=read('index.html'),app=read('app.js');
 for(const name of ['home','detail','updates','settings']){
  assert.match(html,new RegExp('<section id="'+name+'" class="screen"'));
 }
 assert.match(css,/\.screen\.tab-enter:not\(\[hidden\]\)\{animation:tabSettle \.42s/);
 assert.match(css,/\.screen\.tab-enter:not\(\[hidden\]\) > :not\(\[hidden\]\)\{animation:none\}/);
 assert.doesNotMatch(css,/\.screen:not\(\[hidden\]\) > :nth-child\(n\+4\)/);
 assert.doesNotMatch(css,/animation:rise \.52s/);
 assert.match(app,/if\(name===active\)\{/);
 assert.match(app,/Prepare content before reveal/);
 assert.match(app,/section\.classList\.remove\('tab-enter'\)/);
 assert.match(app,/if\(n===name&&useFallback\)section\.classList\.add\('tab-enter'\)/);
 assert.match(app,/document\.startViewTransition\(\(\)=>update\(false\)\)/);
 assert.match(css,/::view-transition-old\(svitlo-screen\)/);
 assert.match(css,/::view-transition-new\(svitlo-screen\)/);
 assert.match(css,/@keyframes tabSettle\{from\{opacity:0;transform:translate3d\(0,30px,0\)/);
});

test('Reduced motion and admin animation-off apply to all tab entrance effects',()=>{
 const css=read('style.css');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{html\{scroll-behavior:auto\}\*,\*::before,\*::after\{animation:none!important;transition:none!important\}\}/);
 assert.match(css,/html\.feature-off-animations \*,html\.feature-off-animations \*::before,html\.feature-off-animations \*::after\{transition-duration:0ms!important;animation-duration:0ms!important\}/);
});

test('PWA version increments so iPhone caches include the unified transitions',()=>{
 const release=JSON.parse(read('release.json'));
 const html=read('index.html'),worker=read('sw.js');
 assert.match(release.version,/^\d+\.\d+\.\d+$/);
 assert.match(html,new RegExp('name="svitlo-version" content="'+release.version.replaceAll('.','\\.')+'"'));
 assert.match(worker,new RegExp('svitlo-cherkasy-shell-v'+release.version.replaceAll('.','\\.')));
 assert.ok(worker.includes('"./style.css"'));
});
