import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('advertising page inline script parses after admin content update',()=>{
 const html=read('advertising.html');
 const start=html.lastIndexOf('<script>');
 const end=html.indexOf('</script>',start);
 assert.ok(start>=0&&end>start);
 assert.doesNotThrow(()=>new Function(html.slice(start+8,end)));
 assert.ok(html.includes('const visiblePackages=Array.isArray(data.packages)'));
 assert.equal(html.includes("const packs=$('packages');packs.replaceChildren();const visible="),false);
});

test('Do Not Disturb defaults on and suppresses push alerts during Kyiv quiet hours',()=>{
 const theme=read('theme.js'),sw=read('sw.js'),html=read('index.html');
 assert.ok(theme.includes("localStorage.getItem(DND_KEY)!=='0'"));
 assert.ok(theme.includes("timeZone:'Europe/Kyiv'"));
 assert.ok(theme.includes('doNotDisturb:dndEnabled()'));
 assert.ok(sw.includes('svitlo-push-preferences-v1'));
 assert.ok(sw.includes('total>=1320||total<420'));
 assert.ok(html.includes('id="doNotDisturbToggle" checked'));
 assert.ok(html.includes('id="homeDndNotice"'));
});

test('appearance selector is compact and follows notification settings',()=>{
 const html=read('index.html');
 assert.ok(html.includes('id="appearanceThemeSelect"'));
 assert.ok(html.indexOf('id="pushCategorySettings"')<html.indexOf('id="appearanceThemeSelect"'));
 assert.equal(html.includes('class="appearance-options"'),false);
});

test('community controls align and partner footer labels the partner',()=>{
 const css=read('community-status.css'),commercial=read('commercial-ui.js');
 assert.ok(css.includes('.community-card-shell{display:flex;align-items:flex-start'));
 assert.ok(css.includes('.community-refresh{display:grid;place-items:center;align-self:flex-start'));
 assert.ok(css.includes('.community-collapse-icon{display:grid;place-items:center'));
 assert.ok(commercial.includes("make('span','ПАРТНЕР','partner-mini-label')"));
});
