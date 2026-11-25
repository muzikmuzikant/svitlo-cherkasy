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
 const push=html.indexOf('id="pushCategorySettings"'),dnd=html.indexOf('id="doNotDisturbSettings"'),appearance=html.indexOf('settings-appearance-section'),analytics=html.indexOf('id="analyticsSettings"');
 assert.ok(push<dnd&&dnd<appearance&&appearance<analytics);
 assert.ok(html.includes('<h2 class="subsection-title">Оформлення</h2>'));
 assert.equal(html.includes('class="appearance-options"'),false);
 assert.ok(html.includes('class="appearance-select"'));
});

test('community controls align and partner footer labels the partner',()=>{
 const css=read('community-status.css'),commercial=read('commercial-ui.js');
 const community=read('community-status.js');
 assert.ok(css.includes('.community-card-shell{display:grid;grid-template-columns:minmax(0,1fr) 38px;align-items:center'));
 assert.ok(css.includes('.community-refresh{align-self:start;justify-self:center;margin-top:2px}'));
 assert.ok(css.includes('.community-collapse-icon{box-sizing:border-box;flex:0 0 32px;width:32px;height:32px;border:1px solid var(--line);border-radius:10px;background:var(--bg)'));
 assert.ok(css.includes('.appearance-select-label{display:block;width:100%;margin:0;padding:0'));
 assert.ok(css.includes('.appearance-select{display:block;box-sizing:border-box;width:100%;min-width:0;max-width:100%'));
 assert.ok(index.includes('community-status.css?v=community-6'));
 assert.ok(css.includes('.community-collapse-icon{display:grid;place-items:center;flex:0 0 30px'));
 assert.ok(css.includes('.community-queue{flex:0 0 auto;padding:5px 8px'));
 assert.ok(community.includes('summary.append(title,queueBadge,collapse)'));
 assert.equal(community.includes('community-summary-meta'),false);
 assert.ok(commercial.includes("make('span','ПАРТНЕР','partner-mini-label')"));
});
