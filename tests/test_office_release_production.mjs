import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Production release version and official domain stay unchanged',()=>{
 const release=JSON.parse(read('release.json'));
 assert.equal(release.version,'7.9.13');
 assert.equal(release.channel,'production');
 assert.equal(read('CNAME'),'svitlo-cherkasy.pp.ua');
 assert.equal(read('_site/CNAME'),'svitlo-cherkasy.pp.ua');
 const cfg=JSON.parse(read('_site/push-config.json'));
 assert.equal(cfg.apiBase,'https://svitlo-cherkasy-production.up.railway.app');
 assert.equal(JSON.parse(read('_site/release.json')).version,release.version);
 assert.equal(JSON.parse(read('_site/manifest.webmanifest')).name,'Світло Черкаси');
});
test('Admin installs as separate network-only PWA',()=>{
 const manifest=JSON.parse(read('_site/admin-app/manifest.webmanifest'));
 const html=read('_site/admin-app/index.html');
 assert.equal(manifest.id,'/admin-app/');
 assert.equal(manifest.start_url,'/admin-app/');
 assert.equal(manifest.scope,'/admin-app/');
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.name,'Світло Черкаси | Адмін');
 assert.match(html,/<base href="\/"/);
 assert.match(html,/rel="manifest" href="\/admin-app\/manifest.webmanifest"/);
 assert.match(html,/src="\/admin-app\/register.js"/);
 assert.match(html,/admin-phone-nav\.js/);
 assert.match(html,/admin-phone-v2\.css/);
 assert.match(html,/id="loginForm"/);
 assert.match(html,/autocomplete="current-password"/);
 const sw=read('_site/admin-app/sw.js');
 assert.match(sw,/cache:'no-store'/);
 assert.doesNotMatch(sw,/caches\.open|cache\.put|localStorage|indexedDB/);
 assert.match(read('_site/admin-app/register.js'),/scope:'\/admin-app\/'/);
 for(const dim of [180,192,512]){
  const path=new URL('../_site/admin-app/icon-'+dim+'.png',import.meta.url);
  assert.ok(existsSync(path)&&statSync(path).size>100,dim);
  const bytes=readFileSync(path);
  assert.equal(bytes.readUInt32BE(16),dim);
  assert.equal(bytes.readUInt32BE(20),dim);
 }
});
test('Production shares Office code with browser; does not change the customer PWA',()=>{
 const admin=read('_site/admin.html'),publicPage=read('_site/index.html');
 for(const file of ['admin-phone-v2.js','admin-phone-v2.css','admin-phone-nav.js','admin-phone-nav.css']){
  assert.ok(admin.includes(file),file);
  assert.ok(read('_site/admin-app/index.html').includes(file),file);
  assert.doesNotMatch(publicPage,new RegExp(file.replaceAll('.','\\.')));
 }
 assert.match(admin,/admin-form-safety-v2\.js/);
 assert.match(read('admin-features.js'),/Адмінський PWA/);
 assert.match(read('admin-features.js'),/pwaLink.href='\/admin-app\/'/);
});
test('Phone menus preserve role enforcement and cannot store secrets',()=>{
 const nav=read('admin-phone-nav.js'),phone=read('admin-phone-v2.js');
 for(const needle of ['SvitloAdminAccess','canTab','aria-current','phone-menu-drawer','source.querySelector']){
  assert.ok(nav.includes(needle),needle);
 }
 assert.match(nav,/root\.hidden/);
 assert.match(phone,/SvitloAdminAccess\?\.canTab/);
 assert.doesNotMatch(nav+phone,/sessionStorage\.setItem|localStorage\.setItem|document\.cookie/);
 const workspace=read('admin-workspace.js');
 assert.doesNotMatch(workspace,/insertAdjacentElement\('afterend',toggle\)/);
 assert.match(workspace,/admin-favorite-manager/);
});
