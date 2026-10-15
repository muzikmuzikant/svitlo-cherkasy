import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('All four tabs use the same entrance animation, easing and stagger',()=>{
 const css=read('style.css');
 const html=read('index.html');
 for(const name of ['home','detail','updates','settings']){
   assert.match(html,new RegExp('<section id="'+name+'" class="screen"'));
 }
 assert.match(css,/\.screen:not\(\[hidden\]\)\{animation:screenIn \.38s var\(--ease\) both\}/);
 assert.match(css,/\.screen:not\(\[hidden\]\) > :not\(\[hidden\]\)\{animation:rise \.52s var\(--ease\) both\}/);
 for(const rule of [
   '.screen:not([hidden]) > :nth-child(2):not([hidden]){animation-delay:55ms}',
   '.screen:not([hidden]) > :nth-child(3):not([hidden]){animation-delay:105ms}',
   '.screen:not([hidden]) > :nth-child(n+4):not([hidden]){animation-delay:150ms}'
 ])assert.ok(css.includes(rule), 'Missing shared reveal rule: '+rule);
 assert.doesNotMatch(css,/\.status-panel,\.primary-picker,\.overview-card,\.stats-row,\.place-card,\.detail-surface\{animation:rise/);
 assert.doesNotMatch(css,/\.place-card\{animation-delay:170ms\}/);
});

test('Reduced motion and admin animation-off apply to all tab entrance effects',()=>{
 const css=read('style.css');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{html\{scroll-behavior:auto\}\*,\*::before,\*::after\{animation:none!important;transition:none!important\}\}/);
 assert.match(css,/html\.feature-off-animations \*,html\.feature-off-animations \*::before,html\.feature-off-animations \*::after\{transition-duration:0ms!important;animation-duration:0ms!important\}/);
});

test('PWA version increments so iPhone caches include the unified transitions',()=>{
 const release=JSON.parse(read('release.json'));
 const html=read('index.html'),worker=read('sw.js');
 assert.equal(release.version,'7.8.10');
 assert.match(html,/name="svitlo-version" content="7\.8\.10"/);
 assert.match(worker,/svitlo-cherkasy-shell-v7\.8\.10-unified-tabs/);
 assert.ok(worker.includes('"./style.css"'));
});
