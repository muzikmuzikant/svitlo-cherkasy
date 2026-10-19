import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('seven weekday buttons prevent unintended Safari double-tap zoom without navigation arrows',()=>{
 const css=read('style.css'),html=read('index.html');
 assert.match(css,/\.days-row\s*\{\s*touch-action:\s*manipulation/);
 assert.match(css,/\.day-choice\s*\{[\s\S]*?-webkit-user-select:\s*none/);
 assert.match(css,/\.days-row\.fixed-weekdays\{display:grid;grid-template-columns:repeat\(7,/);
 assert.match(html,/id="days"/);
 assert.doesNotMatch(html,/id="weekPrev"|id="weekNext"|id="weekBackControl"|id="weekForwardControl"/);
});
test('accessibility zoom remains enabled rather than being locked in viewport settings',()=>{
 const html=read('index.html');
 const meta=html.match(/<meta name="viewport"[^>]*>/)?.[0]||'';
 assert.match(meta,/width=device-width/);
 assert.match(meta,/initial-scale=1/);
 assert.doesNotMatch(meta,/user-scalable\s*=\s*no|maximum-scale\s*=\s*1|minimum-scale\s*=\s*1/i);
 const css=read('style.css');
 const block=css.split('/* v7.3.2 — prevent iOS')[1];
 assert.ok(block);
 assert.doesNotMatch(block,/touch-action:\s*none/);
 assert.match(block,/touch-action:\s*manipulation/);
});

test('release and service worker ship a fresh PWA cache without touching Railway',()=>{
 const release=JSON.parse(read('release.json'));
 assert.ok(Number(release.version.split('.')[0])>=7,'A new release must preserve iOS zoom behavior');
 assert.match(read('sw.js'),new RegExp('svitlo-cherkasy-shell-v'+release.version.replaceAll('.','\\.')));
 assert.match(read('index.html'),new RegExp('name="svitlo-version" content="'+release.version.replaceAll('.','\\.')+'"'));
});
