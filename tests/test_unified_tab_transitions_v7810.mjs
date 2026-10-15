import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('four sections use horizontal reveal without a navigation cooldown',()=>{
 const css=read('style.css'),app=read('app.js'),html=read('index.html');
 for(const id of ['home','detail','updates','settings'])
  assert.match(html,new RegExp('<section id="'+id+'" class="screen"'));
 assert.match(css,/\.screen\.tab-enter:not\(\[hidden\]\)\{animation:tabSettle \.46s/);
 assert.match(css,/@keyframes tabSettleBackward/);
 assert.match(app,/if\(name===active\)return/);
 assert.doesNotMatch(app,/startViewTransition|queuedName|pendingName/);
 assert.doesNotMatch(css,/svitloViewportOut|svitloViewportIn/);
});
test('reduced motion remains supported',()=>{
 const css=read('style.css');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/html\.feature-off-animations \*,html\.feature-off-animations \*::before,html\.feature-off-animations \*::after/);
});
test('version and service worker cache match for future reviewed release',()=>{
 const release=JSON.parse(read('release.json'));
 const index=read('index.html'),sw=read('sw.js');
 assert.match(index,new RegExp('name="svitlo-version" content="'+release.version.replaceAll('.','\\.')+'"'));
 assert.match(sw,new RegExp('svitlo-cherkasy-shell-v'+release.version.replaceAll('.','\\.')));
});
