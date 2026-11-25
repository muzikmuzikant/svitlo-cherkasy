import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('advertising page script parses and renders admin-managed packages',()=>{
 const html=read('advertising.html');
 const scripts=[...html.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)];
 assert.ok(scripts.length);
 assert.doesNotThrow(()=>new Function(scripts.at(-1)[1]));
 assert.match(html,/const visiblePackages=Array\\.isArray\\(data\\.packages\\)/);
 assert.doesNotMatch(html,/const packs=\\$\\('packages'\\);packs\\.replaceChildren\\(\\);const visible=/);
});

test('Do Not Disturb defaults on and suppresses push display during Kyiv quiet hours',()=>{
 const theme=read('theme.js'),sw=read('sw.js'),html=read('index.html');
 assert.match(theme,/localStorage\\.getItem\\(DND_KEY\\)!=='0'/);
 assert.match(theme,/timeZone:'Europe\\/Kyiv'/);
 assert.match(theme,/doNotDisturb:dndEnabled\\(\\)/);
 assert.match(sw,/svitlo-push-preferences-v1/);
 assert.match(sw,/total>=1320\\|\\|total<420/);
 assert.match(html,/id="doNotDisturbToggle" checked/);
 assert.match(html,/id="homeDndNotice"/);
});

test('appearance selector is compact and follows notification settings',()=>{
 const html=read('index.html');
 assert.match(html,/id="appearanceThemeSelect"/);
 assert.ok(html.indexOf('id="pushCategorySettings"')<html.indexOf('id="appearanceThemeSelect"'));
 assert.doesNotMatch(html,/class="appearance-options"/);
});

test('community controls align and partner footer labels the partner',()=>{
 const css=read('community-status.css'),commercial=read('commercial-ui.js');
 assert.match(css,/\.community-card-shell\\{display:flex;align-items:flex-start/);
 assert.match(css,/\.community-refresh\\{display:grid;place-items:center;align-self:flex-start/);
 assert.match(css,/\.community-collapse-icon\\{display:grid;place-items:center/);
 assert.match(commercial,/make\\('span','ПАРТНЕР','partner-mini-label'\\)/);
});
