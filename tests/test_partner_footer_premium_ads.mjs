import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('community status is collapsible and remembers the user choice',()=>{
 const js=read('community-status.js'),css=read('community-status.css');
 assert.match(js,/community-disclosure/);
 assert.match(js,/svitlo-community-collapsed/);
 assert.match(js,/addEventListener\('toggle'/);
 assert.match(css,/\.community-disclosure\[open\]/);
});

test('permanent partner is a compact logo and name link at every app screen footer',()=>{
 const html=read('index.html'),js=read('commercial-ui.js'),css=read('community-status.css');
 assert.doesNotMatch(html,/id="permanentPartnerCard"/);
 assert.match(js,/querySelectorAll\('\.screen'\)/);
 assert.match(js,/partner-page-footer/);
 assert.match(js,/partner-mini-button/);
 assert.match(js,/partner\.name/);
 assert.match(js,/partner\.logo/);
 assert.doesNotMatch(js,/partner\.description/);
 assert.match(css,/\.partner-mini-button/);
});

test('advertising landing page is premium and every service section is admin-managed',()=>{
 const page=read('advertising.html'),admin=read('admin-ads.js'),server=read('push-server/ads.js');
 for(const key of ['pageSections','pageFaq','pageVisibility'])assert.ok(server.includes(key),key);
 for(const label of ['Розділи рекламних послуг','Показувати цей розділ','+ Створити розділ послуг','Дублювати','Видалити'])assert.ok(admin.includes(label),label);
 assert.match(page,/id="managedSections"/);
 assert.match(page,/id="faqItems"/);
 assert.match(page,/service-card/);
 assert.match(page,/setSection\('hero','hero'\)/);
 assert.match(page,/--bg/);
 assert.match(page,/pageVisibility/);
 assert.match(page,/data\.pageSections/);
 assert.match(page,/data\.pageFaq/);
});

test('partner feature is controllable and PWA cache version was refreshed',()=>{
 const features=read('admin-features.js'),mode=read('site-mode.js'),sw=read('sw.js');
 assert.match(features,/Кнопка постійного партнера/);
 assert.match(mode,/permanentPartner/);
 assert.match(sw,/partner-footer-premium/);
});
