import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('mobile admin is included after desktop office modules',()=>{
 const html=read('admin.html'),build=read('scripts/build_pages.py'),sw=read('sw.js');
 assert.ok(html.indexOf('admin-office-plus.css')<html.indexOf('admin-mobile.css'));
 assert.ok(html.indexOf('admin-office-plus.js')<html.indexOf('admin-mobile.js'));
 for(const file of ['admin-mobile.js','admin-mobile.css']){
  assert.ok(build.includes("'"+file+"'"));
  assert.ok(sw.includes('"./'+file+'"'));
 }
});
test('mobile dock exposes primary workflows and respects authentication',()=>{
 const js=read('admin-mobile.js'),css=read('admin-mobile.css');
 for(const id of ['overview','feedback','operations','insights','menu'])assert.ok(js.includes("'"+id+"'"));
 assert.match(js,/bar.hidden=root.hidden/);
 assert.match(js,/MutationObserver/);
 assert.match(css,/position:fixed/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/\[hidden\]\{display:none!important\}/);
});
test('mobile support and editing do not need desktop overflow or iOS zoom',()=>{
 const js=read('admin.js'),css=read('admin-mobile.css');
 assert.match(js,/SvitloMobileAdmin\?\.openTicket/);
 assert.match(js,/SvitloMobileAdmin\?\.decorateTicket/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/font-size:16px!important/);
});
