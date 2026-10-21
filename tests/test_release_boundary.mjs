import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const release=JSON.parse(read('release.json'));
const manifest=JSON.parse(read('manifest.webmanifest'));
const push=JSON.parse(read('push-config.json'));
test('release candidate uses production identity and API, never Beta identity',()=>{
 if(release.channel==='beta'){
  assert.match(release.version,/^7\.9\.\d+$/);
  assert.equal(push.apiBase,'https://svitlo-beta-api-staging.up.railway.app');
  assert.equal(push.publicKey,''); // Beta key must come from Beta server, never production.
  assert.match(read('sw.js'),/svitlo-cherkasy-shell-v7\.9\.\d+-beta/);
  assert.match(read('index.html'),/data-deployment-channel="beta"/);
  return
 }
 assert.equal(release.version,'7.9.10');
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

test('fresh Production storage publishes no ads, promo campaigns or payment destination',async()=>{
 const {createAdsStore}=await import('../push-server/ads.js');
 const os=await import('node:os');
 const path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-prod-ads-off-'));
 try{
  const store=createAdsStore({directory:dir});
  const pub=store.publicState();
  assert.equal(pub.enabled,false,'No paid campaigns before signoff');
  assert.equal(pub.support.enabled,false,'No donation/payment methods before signoff');
  assert.deepEqual(pub.campaigns,[]);
  assert.equal(store.event('promo','impression'),false);
  const client=read('beta-ads.js');
  assert.match(client,/if\(!config\?\.enabled\)\{host\.hidden=true;return\}/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Production commercial lock survives enabled stored config and cannot collect ad events',async()=>{
 const {createAdsStore}=await import('../push-server/ads.js');
 const os=await import('node:os');
 const path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-prod-commerce-lock-'));
 try{
  const store=createAdsStore({directory:dir});
  const config=store.dashboard().settings;
  store.update({...config,enabled:true,showPromo:true,
   contacts:[{label:'Контакт',url:'https://example.com',enabled:true}],
   packages:[{title:'Тариф',price:800,durationDays:30,visible:true}],
   campaigns:[{id:'advert',title:'Оголошення',link:'https://example.com',enabled:true}],
   support:{...config.support,enabled:true,paymentUrl:'https://example.com/pay',details:'PRIVATE-IBAN-NEVER-PUBLISH',provider:'monobank',methods:[{title:'Банка',kind:'monobank',url:'https://example.com/donate',enabled:true}],expenses:[{title:'Private invoice',amount:123,public:false}]}
  });
  assert.equal(store.dashboard().commercialLocked,true,'Production must visibly warn admin that ad drafts are non-public');
  const publicConfig=store.publicState();
  assert.equal(publicConfig.enabled,false);
  assert.deepEqual(publicConfig.campaigns,[]);
  assert.deepEqual(publicConfig.packages,[]);
  assert.deepEqual(publicConfig.contacts,[]);
  assert.equal(publicConfig.support.enabled,true,'Voluntary support is independent of advertising');
  assert.equal(publicConfig.support.paymentUrl,'https://example.com/pay');
  assert.equal(publicConfig.support.methods.length,1);
  assert.equal(publicConfig.support.methods[0].url,'https://example.com/donate');
  assert.deepEqual(publicConfig.support.expenses,[]);
  assert.deepEqual(Object.keys(publicConfig).sort(),['campaigns','contacts','enabled','packages','support']);
  assert.doesNotMatch(JSON.stringify(publicConfig),/Private invoice|Оголошення|Тариф/);
  assert.equal(publicConfig.support.methods[0].kind,'monobank');
  assert.equal(store.event('advert','impression'),false);
  assert.equal(store.event('promo','impression'),false);
  assert.ok(read('admin-ads.js').includes('report.commercialLocked'),'Admin must label Production advertising drafts');
  assert.ok(read('index.html').includes('href="./support-project.html"'));
  assert.ok(read('advertising.html').includes('if(!data.enabled)'));
  assert.ok(read('support-project.html').includes('if(!s.enabled)'));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Owner can disable support independently and private payment fields never leak',async()=>{
 const {createAdsStore}=await import('../push-server/ads.js');
 const os=await import('node:os'),path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-disabled-support-'));
 try{
  const store=createAdsStore({directory:dir,commercialAllowed:false});
  const original=store.dashboard().settings;
  store.update({...original,support:{...original.support,enabled:false,paymentUrl:'https://example.com/private',methods:[{title:'IBAN',details:'PRIVATE_IBAN_TEST',enabled:true}]}});
  const publicView=store.publicState();
  assert.equal(publicView.enabled,false);
  assert.deepEqual(publicView.campaigns,[]);
  assert.equal(publicView.support.enabled,false);
  assert.equal(publicView.support.paymentUrl,'');
  assert.deepEqual(publicView.support.methods,[]);
  assert.doesNotMatch(JSON.stringify(publicView),/PRIVATE_IBAN_TEST|example.com\/private/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
