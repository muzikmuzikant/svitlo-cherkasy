import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('rapid taps in schedule calendar cannot trigger Safari double-tap zoom',()=>{
 const css=read('style.css');
 assert.match(css,/\.viewport,\s*\.viewport button,\s*\.viewport a,[\s\S]*?\.calendar-arrows,[\s\S]*?\.days-row\s*\{\s*touch-action:\s*manipulation\s*;/);
 assert.match(css,/\.calendar-arrows button,[\s\S]*?\.day-choice\s*\{[^}]*-webkit-user-select:\s*none\s*;/);
 const html=read('index.html');
 assert.match(html,/id="weekPrev"/);
 assert.match(html,/id="weekNext"/);
 assert.match(html,/id="days"/);
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
 assert.equal(release.version,'7.3.2');
 assert.match(read('sw.js'),/svitlo-cherkasy-shell-v7\.3\.2/);
 assert.match(read('index.html'),/name="svitlo-version" content="7\.3\.2"/);
});
