import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const release=JSON.parse(read('release.json'));
const manifest=JSON.parse(read('manifest.webmanifest'));
const push=JSON.parse(read('push-config.json'));
test('release candidate uses production identity and API, never Beta identity',()=>{
 assert.equal(release.version,'7.9.8');
 assert.equal(release.channel,'production');
 assert.equal(manifest.id,'./');
 assert.equal(manifest.start_url,'./');
 assert.equal(push.apiBase,'https://svitlo-cherkasy-production.up.railway.app');
 assert.notEqual(push.publicKey,'');
 const html=read('index.html');
 assert.match(html,/<body data-deployment-channel="production">/);
 assert.match(html,/name="robots" content="index,follow"/);
 assert.doesNotMatch(html,/stagingBadge|svitlo-cherkasy.pages.dev|noindex,follow/);
 assert.equal(read('CNAME').trim(),'svitlo-cherkasy.pp.ua');
 assert.ok(read('google651cc9e5e29fd428.html').includes('google-site-verification'));
 assert.doesNotMatch(read('robots.txt'),/^Disallow: \/$/m);
});
test('builder includes Google verification, production origin and content-hash SW cache',()=>{
 const build=read('scripts/build_pages.py');
 assert.ok(build.includes("'google651cc9e5e29fd428.html'"));
 assert.ok(build.includes("hashlib.sha256()"));
 assert.match(read('sw.js'),/const VERSION='svitlo-cherkasy-shell-v/);
 assert.ok(read('sitemap.xml').includes('https://svitlo-cherkasy.pp.ua/'));
});
test('advertising is disabled by default until legal and operator signoff',()=>{
 const ads=read('push-server/ads.js');
 assert.match(ads,/enabled:false,rotationSeconds:8/);
 assert.match(read('docs/LEGAL_RELEASE_REVIEW.md'),/Статус.*лише проєкт/);
});
