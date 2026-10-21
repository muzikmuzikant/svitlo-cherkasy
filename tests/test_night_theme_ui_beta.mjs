import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const theme=read('theme.css');
const contrast=(a,b)=>{
 const lum=hex=>{const rgb=hex.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
 const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
};
test('night palette uses true near-black and readable type',()=>{
 const root=theme.slice(0,900);
 assert.match(root,/--bg:#090b0f/);
 assert.match(root,/--surface:#161a21/);
 assert.ok(contrast('#f2f5f9','#090b0f')>=7);
 assert.ok(contrast('#a9b3c1','#161a21')>=4.5);
 assert.ok(contrast('#83b5ff','#161a21')>=4.5);
});
test('forecast colors remain readable and not plain red-green on black',()=>{
 assert.ok(contrast('#a8f0bc','#143725')>=4.5);
 assert.ok(contrast('#ffc4cb','#392028')>=4.5);
 assert.ok(contrast('#dcfbe7','#295941')>=4.5);
 const app=read('app.js'),hour=read('hour-paint.js');
 assert.match(app,/SvitloHour\.paintHour\(t,h,document\.documentElement\.dataset\.theme/);
 assert.match(hour,/const NIGHT=\{0:/);
 assert.match(app,/addEventListener\('svitlo:theme-change'/);
});
test('dark iPhone bottom navigation stays fixed without blur or transforms',()=>{
 const rule=theme.match(/:root\[data-theme="dark"\] \.bottom-nav\{([^}]*)\}/)?.[1];
 assert.ok(rule);
 assert.match(rule,/backdrop-filter:none/);
 assert.doesNotMatch(rule,/transform:/);
 assert.doesNotMatch(rule,/blur\(/);
 const root=theme.slice(0,1100);assert.match(root,/color-scheme:dark/);
});
test('dark palette covers major user-visible surfaces, not just the shell',()=>{
 for(const selector of ['.picker-btn','.status-panel.status-on','.hour-ink-on','.bottom-nav','.inbox-item','.inbox-detail','.setting-line','.sheet','.share-preview-dialog','.beta-consent-dialog','.support-card','.layout .hero','.install-landing']){
  assert.ok(theme.includes(selector),'Missing dark treatment: '+selector);
 }
 for(const path of ['index.html','feedback.html','help.html']){
  const html=read(path);
  assert.ok(html.indexOf('./theme.js')<html.indexOf('./theme.css'),path+' should initialize before styles');
 }
});
