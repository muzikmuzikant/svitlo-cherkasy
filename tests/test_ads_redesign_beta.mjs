import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');

test('Beta advertising redesign is wired into public and admin pages', () => {
  const index=read('index.html'), admin=read('admin.html'), detail=read('ad-detail.html'), landing=read('advertising.html'), build=read('scripts/build_pages.py');
  assert.match(index,/ads-redesign\.css/);
  assert.match(admin,/ads-redesign\.css/);
  assert.match(admin,/ads-admin-enhance\.js/);
  assert.match(index,/beta-ads\.js/);
  assert.match(detail,/ads-redesign\.css/);
  assert.match(landing,/ads-redesign\.css/);
  assert.ok(build.includes("'ads-redesign.css'")&&build.includes("'ads-admin-enhance.js'"));
  assert.ok(fs.existsSync(new URL('../_site/ads-redesign.css',import.meta.url)),'published CSS must be copied to _site');
  assert.ok(fs.existsSync(new URL('../_site/ads-admin-enhance.js',import.meta.url)),'published admin script must be copied to _site');
  assert.doesNotMatch(index,/svitlo-cherkasy-production\.up\.railway\.app/);
});
test('admin campaign tools provide search, status filters and sorting', () => {
  const js=read('ads-admin-enhance.js');
  for(const term of ['Пошук за назвою або описом','Активні','Заплановані','Вимкнені','Завершені','За назвою А-Я','Показано']) assert.ok(js.includes(term),term);
  assert.match(js,/MutationObserver/);
  assert.match(js,/applyCurrent/);
  const admin=read('admin-ads.js');
  for(const metric of ['stats.detailOpens','stats.outboundClicks','Переходи','ad-upload-preview']) assert.ok(admin.includes(metric),metric);
  assert.match(js,/aria-label/);
});
test('ads redesign preserves reduced-motion and mobile layouts', () => {
  const css=read('ads-redesign.css'), sw=read('sw.js'), carousel=read('beta-ads.js'), admin=read('admin-ads.js');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/\.beta-ad-content/);
  assert.match(css,/\.ad-campaign-tools/);
  assert.match(css,/\.ad-upload-preview/);
  assert.match(carousel,/weighted\.findIndex/);
  assert.match(carousel,/ads\.length>1/);
  assert.match(carousel,/a\.dataset\.hasImage=item\.image/);
  assert.doesNotMatch(carousel,/make\('span','🔗','beta-ad-arrow'\)/);
  for(const key of ['titleColor','descriptionColor','buttonBackground','buttonForeground','labelBackground','labelForeground','borderColor']){assert.ok(carousel.includes('item.'+key),key);assert.ok(admin.includes("c,'"+key+"'"),key);assert.ok(read('push-server/ads.js').includes(key),key)}
  assert.match(css,/data-has-image="false"/);
  assert.doesNotMatch(css,/beta-ad-arrow\{/);
  assert.ok(sw.includes('"./ads-redesign.css"')&&sw.includes("'./ads-redesign.css'"),'new ad styles must be available offline');
  assert.ok(sw.includes('"./ads-admin-enhance.js"'),'admin enhancements must be in the shell asset list');
});
test('server continues to sanitize outbound ad URLs and campaign caps', () => {
  const server=read('push-server/ads.js');
  assert.match(server,/protocol==='https:'/);
  assert.match(server,/maxImpressions/);
  assert.match(server,/dailyCap/);
  assert.match(server,/detailEnabled/);
});
