import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const html=read('index.html');
const css=read('style.css');
const mode=read('site-mode.js');

test('fixed beta tab dock is a sibling of the clipped scrolling viewport',()=>{
  assert.match(html, /<\/main>\s*<\/div>\s*<nav class="bottom-nav"/);
  assert.match(html, /html:not\(\[data-app-mode="standalone"\]\) \.viewport,html:not\(\[data-app-mode="standalone"\]\) \.bottom-nav\{display:none!important\}/);
});

test('fixed nav no longer uses a transformed blurred WebKit compositing layer',()=>{
  const marker='/* iOS standalone PWA:';
  assert.ok(css.includes(marker),'Expected dedicated iOS scroll-stability dock rule');
  const dock=css.slice(css.lastIndexOf(marker),css.indexOf('/* Explicitly match the neutral day/',css.lastIndexOf(marker)));
  assert.match(dock,/\.bottom-nav\s*\{[^}]*position:fixed/);
  assert.match(dock,/left:0;\s*right:0;\s*margin-inline:auto/);
  assert.match(dock,/transform:none/);
  assert.match(dock,/backdrop-filter:none/);
  assert.match(dock,/safe-area-inset-bottom/);
  assert.match(css,/\.bottom-nav::before/,'Keep animated active-tab pill');
});

test('nav is disabled whenever full-screen maintenance is active',()=>{
  assert.match(mode,/viewport,document\.querySelector\('\.bottom-nav'\)/);
  assert.match(css,/body\.svitlo-maintenance-active \.bottom-nav\{visibility:hidden;pointer-events:none\}/);
});

test('offline cache and user-visible beta release remain versioned together',()=>{
  const release=JSON.parse(read('release.json'));
  const sw=read('sw.js');
  assert.equal(release.channel,'beta');
  assert.match(html,new RegExp('name="svitlo-version" content="'+release.version.replaceAll('.','\\.')+'"'));
  assert.ok(sw.includes('svitlo-cherkasy-shell-v'+release.version+'-beta'));
  assert.ok(sw.includes("'./style.css'"),'Fixed CSS must be available from offline PWA cache');
});
