import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('all four Beta tabs use the requested identical 460ms motion',()=>{
 assert.match(app,/const TAB_MOTION_MS=460;/);
 const begin=app.indexOf('function navigate(name,');
 const end=app.indexOf('function renderDetail(){',begin);
 assert.ok(begin>=0&&end>begin);
 const nav=app.slice(begin,end);
 assert.match(nav,/\['home','detail','updates','settings'\]/);
 assert.match(nav,/if\(name===active\)return;/);
 assert.match(nav,/token\.outgoing=previousSection\.animate\([\s\S]*?duration:TAB_MOTION_MS/);
 assert.match(nav,/token\.incoming=nextSection\.animate\([\s\S]*?duration:TAB_MOTION_MS/);
 assert.doesNotMatch(nav,/queuedName|cooldown|setTimeout\(/i);
 assert.match(nav,/prefers-reduced-motion: reduce/);
});
