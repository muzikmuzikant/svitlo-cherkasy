import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const manifest=JSON.parse(read('_site/admin-app/manifest.webmanifest'));
const office=read('_site/admin-app/index.html');
const browserAdmin=read('_site/admin.html');
const ordinary=JSON.parse(read('_site/manifest.webmanifest'));
const worker=read('_site/admin-app/sw.js');
test('Office installs independently from the public and Beta PWA',()=>{
 assert.equal(manifest.id,'/admin-app/');
 assert.equal(manifest.scope,'/admin-app/');
 assert.equal(manifest.start_url,'/admin-app/');
 assert.equal(manifest.display,'standalone');
 assert.match(manifest.name,/Адмін Beta/);
 assert.notEqual(manifest.id,ordinary.id);
 assert.ok(manifest.icons.some(x=>x.sizes==='192x192'));
 assert.ok(manifest.icons.some(x=>x.sizes==='512x512'));
 assert.match(office,/rel="manifest" href="\/admin-app\/manifest.webmanifest"/);
 assert.match(browserAdmin,/rel="manifest" href="\.\/manifest.webmanifest/);
 assert.match(office,/<base href="\/"/);
 assert.match(office,/src="\.\/admin.js"/);
 assert.match(office,/id="adminLoginScreen"/);
 assert.match(office,/src="\/admin-app\/register.js"/);
 assert.doesNotMatch(read('_site/index.html'),/src="\/admin-app\/register.js"/);
});
test('Office images are proper, distinct PNG icons',()=>{
 for(const size of [180,192,512]){
  const filename=`_site/admin-app/icon-${size}.png`;
  const data=readFileSync(filename);
  assert.equal(data.subarray(1,4).toString(),'PNG');
  assert.equal(data.readUInt32BE(16),size);
  assert.equal(data.readUInt32BE(20),size);
  assert.ok(statSync(filename).size>100);
 }
});
test('Office service worker never saves authenticated data',()=>{
 assert.match(worker,/request\.mode!=='navigate'/);
 assert.match(worker,/url\.origin!==self\.location\.origin/);
 assert.match(worker,/cache:'no-store'/);
 assert.match(worker,/Cache-Control':'no-store'/);
 assert.doesNotMatch(worker,/caches\.open|cache\.put|indexedDB|localStorage/);
 assert.match(read('_site/admin-app/register.js'),/scope:'\/admin-app\/'/);
});
test('Feature catalog provides admin app access, without a public flag',()=>{
 const features=read('admin-features.js');
 assert.match(features,/Адмінський PWA/);
 assert.match(features,/pwaLink\.href='\/admin-app\/'/);
 assert.doesNotMatch(features,/\['adminPwa',/);
});
