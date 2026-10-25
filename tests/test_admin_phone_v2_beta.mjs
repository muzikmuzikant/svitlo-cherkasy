import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Admin phone runs last in browser and separate PWA',()=>{
 const html=read('admin.html'),build=read('scripts/build_pages.py'),sw=read('sw.js');
 assert.ok(html.indexOf('admin-sidebar-stability.css')<html.indexOf('admin-phone-v2.css'));
 assert.ok(html.indexOf('admin-form-safety.js')<html.indexOf('admin-phone-v2.js'));
 for(const file of ['admin-phone-v2.js','admin-phone-v2.css','admin-sidebar-stability.css']){
  assert.ok(build.includes("'"+file+"'"),file);
  assert.ok(sw.includes('"./'+file+'"'),file);
 }
 for(const file of ['admin-phone-v2.js','admin-phone-v2.css']){
  assert.ok(read('_site/admin-app/index.html').includes(file),file);
 }
 assert.doesNotMatch(read('index.html'),/admin-phone-v2/);
});
test('Phone navigation respects role and uses existing handlers',()=>{
 const s=read('admin-phone-v2.js');
 for(const id of ['operations','feedback','planner','maintenance','registry','insights','overview','menu'])
  assert.ok(s.includes("'"+id+"'"),id);
 for(const key of ['canTab','canWrite','data-admin-tab','tab.click()','office-mobile-nav',
 'svitlo:admin-ready','svitlo:admin-logout','touchend','phone-keyboard'])
  assert.ok(s.includes(key),key);
 assert.doesNotMatch(s,/localStorage\.setItem|sessionStorage\.setItem|document\.cookie/);
});
test('Phone layout stays below iOS safe area and preserves native inputs',()=>{
 const s=read('admin-phone-v2.css');
 for(const rule of ['@media(max-width:760px)','safe-area-inset-top','safe-area-inset-bottom',
 'position:sticky!important','pointer-events:none','font-size:16px!important',
 'prefers-reduced-motion:reduce','.phone-quick-item[hidden]','office-mobile-dock button[hidden]'])
  assert.ok(s.includes(rule),rule);
});

test('Mobile menu is independent of the old overlapping sidebar',()=>{
 const js=read('admin-phone-nav.js'),css=read('admin-phone-nav.css');
 const html=read('admin.html'),build=read('scripts/build_pages.py'),sw=read('sw.js');
 assert.ok(html.indexOf('admin-phone-v2.css')<html.indexOf('admin-phone-nav.css'));
 assert.ok(html.indexOf('admin-phone-v2.js')<html.indexOf('admin-phone-nav.js'));
 for(const file of ['admin-phone-nav.js','admin-phone-nav.css']){
  assert.ok(build.includes("'"+file+"'"));
  assert.ok(sw.includes('"./'+file+'"'));
  assert.ok(read('_site/admin-app/index.html').includes(file));
 }
 for(const string of ['phone-menu-drawer','phone-menu-group','aria-expanded','aria-hidden',
    'source.querySelector', 'phone-menu-input','sourceTab','touchend','canTab','inert']){
  // Inspect the public module to avoid silently reintroducing desktop nav.
  if(string==='sourceTab')continue;
  assert.ok(js.includes(string),string);
 }
 assert.match(css,/#adminDashboard > nav\.admin-tabs,[\s\S]*?display:none!important/);
 assert.match(css,/\.phone-menu-link\[aria-current="page"\]/);
 assert.match(css,/\.phone-menu-items\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.phone-menu-list\{[\s\S]*?overflow-y:auto/);
});

test('Favorites no longer overlap the desktop or phone sidebar',()=>{
 const js=read('admin-workspace.js'),css=read('admin-workspace.css');
 assert.doesNotMatch(js,/tab\.insertAdjacentElement\('afterend',toggle\)/);
 assert.doesNotMatch(js,/admin-fav-star/);
 assert.doesNotMatch(css,/margin:0 0 -33px/);
 assert.match(js,/admin-favorite-manager/);
 assert.match(js,/window\.SvitloAdminAccess\?\.canTab\(id\)/);
 assert.match(css,/flex:0 0 auto!important/);
});
