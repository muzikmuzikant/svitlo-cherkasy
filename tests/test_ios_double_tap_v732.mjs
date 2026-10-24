import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('rapid taps in schedule calendar cannot trigger Safari double-tap zoom',()=>{
 const css=read('style.css');
 assert.match(css,/\.viewport,\s*\.viewport button,\s*\.viewport a,[\s\S]*?\.calendar-arrows,[\s\S]*?\.days-row\s*\{\s*touch-action:\s*manipulation\s*;/);
 assert.match(css,/\.calendar-arrows button,[\s\S]*?\.day-choice\s*\{[^}]*-webkit-user-select:\s*none\s*;/);
 const html=read('index.html');
 assert.doesNotMatch(html,/id="weekPrev"/,'Fixed weekdays have no previous-week arrow');
 assert.doesNotMatch(html,/id="weekNext"/,'Fixed weekdays have no next-week arrow');
 assert.match(html,/id="days"/);
});

test('installed PWA prevents browser zoom as requested while keeping manual scrolling',()=>{
 const html=read('index.html');
 const meta=html.match(/<meta name="viewport"[^>]*>/)?.[0]||'';
 assert.match(meta,/width=device-width/);
 assert.match(meta,/initial-scale=1/);
 assert.match(meta,/maximum-scale\s*=\s*1/i);
 assert.match(meta,/user-scalable\s*=\s*no/i);
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
