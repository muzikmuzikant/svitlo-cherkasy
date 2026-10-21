import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function paletteHarness(){
 const source=read('site-mode.js');
 const start=source.indexOf(' let latestAppearance=');
 const finish=source.indexOf(' function applySite(site){',start);
 assert.ok(start>0&&finish>start,'Expected palette helper before applySite');
 const helper=source.slice(start,finish);
 const values=new Map(),listeners=new Map();
 const style={
  setProperty(name,value){values.set(name,value)},
  removeProperty(name){values.delete(name)},
  getPropertyValue(name){return values.get(name)||''}
 };
 const root={dataset:{theme:'light'},style};
 const ctx=createContext({document:{documentElement:root},window:{addEventListener:(name,callback)=>listeners.set(name,callback)}});
 runInContext(helper,ctx);
 assert.match(source,/latestAppearance=appearance;\s*applyPalette\(\)/,'Remote updates must call palette helper');
 return {ctx,root,style,listeners};
}
test('Railway light brand colors never repaint dark background or white cards',()=>{
 const h=paletteHarness();
 runInContext("latestAppearance={accent:'#377dff',background:'#f6f8fc',surface:'#ffffff'};applyPalette()",h.ctx);
 assert.equal(h.style.getPropertyValue('--surface'),'#ffffff');
 assert.equal(h.style.getPropertyValue('--bg'),'#f6f8fc');
 h.root.dataset.theme='dark';
 h.listeners.get('svitlo:theme-change')();
 assert.equal(h.style.getPropertyValue('--surface'),'');
 assert.equal(h.style.getPropertyValue('--bg'),'');
 assert.equal(h.style.getPropertyValue('--blue'),'');
 runInContext('applyPalette()',h.ctx);
 assert.equal(h.style.getPropertyValue('--surface'),'','Repeating 12-second Railway refresh may not restore white surfaces');
 h.root.dataset.theme='light';
 h.listeners.get('svitlo:theme-change')();
 assert.equal(h.style.getPropertyValue('--bg'),'#f6f8fc');
 assert.equal(h.style.getPropertyValue('--surface'),'#ffffff');
});
test('dark mode ignores old cached site-mode inline light palette too',()=>{
 const css=read('theme.css');
 assert.match(css,/--bg:#090b0f!important;/);
 assert.match(css,/--surface:#161a21!important;/);
 assert.match(css,/--blue:#83b5ff!important;/);
 assert.match(css,/:root\[data-theme="dark"\] body\{background:var\(--bg\)/);
});
test('published theme and server script refresh together and keep main unreleased',()=>{
 const release=JSON.parse(read('release.json'));
 const sw=read('sw.js'),build=read('scripts/build_pages.py');
 assert.equal(release.channel,'beta');
 assert.ok(sw.includes('svitlo-cherkasy-shell-v'+release.version+'-beta'));
 for(const asset of ['theme.js','theme.css','site-mode.js']){
  assert.ok(sw.includes('./'+asset),'Missing cached '+asset);
  assert.ok(build.includes("'"+asset+"'"),'Missing published '+asset);
 }
});
