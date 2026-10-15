import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),server=read('push-server/server.js');
test('7.9.8 rollback: no new user settings or paid app controls',()=>{
 for(const id of ['offMinutes','onMinutes','quietEnabled','quietFrom','quietTo','favoriteQueues','favoriteSelect','favoriteAdd','offlineDetails','addressNotificationRules','checkAppRelease','appBuildDetails','appPwaDetails','appPushDetails','betaAnalyticsConsent']){
  assert.ok(!html.includes('id="'+id+'"'),'retired user setting '+id);
 }
 assert.ok(html.includes('id="notifyOff"'));
 assert.ok(html.includes('id="notifyOn"'));
 assert.ok(html.includes('id="quickQueueSelect"'),'existing quick queue remains');
 assert.ok(!app.includes('function renderFavorites()'));
 assert.ok(!app.includes('function renderAddressRules()'));
 assert.ok(!server.includes('quietNow('));
 assert.ok(!server.includes('rec.rules'));
 assert.ok(server.includes("['off',30,1],['on',15,0]"),'fixed legacy off/on reminders restored');
});
test('PWA shell contains one top-level back, and only the embedded page legacy buttons disappear',()=>{
 const nav=read('internal-pages.js');
 assert.match(nav,/svitlo-internal-back/);
 assert.match(nav,/svitlo-embedded-back-cleanup/);
 assert.match(nav,/doc\.documentElement\.classList\.add\('svitlo-embedded'\)/);
 assert.match(nav,/doc\.head\.append\(style\)/);
 assert.ok(html.includes('id="betaConsentDialog"'),'standalone opt-in consent request is not an ordinary settings control');
});
test('full redesigned advertising and support pages retain dynamic API integration',()=>{
 const ads=read('advertising.html'),support=read('support-project.html');
 for(const [name,source] of [['ads',ads],['support',support]]){
  assert.match(source,/\/api\/ads/,'Page '+name+' still uses public ad configuration');
  assert.match(source,/viewport-fit=cover/);
  assert.match(source,/prefers-reduced-motion/);
  assert.match(source,/class="back"/);assert.match(source,/href="\.\/index\.html"/);
 }
 for(const x of ['id="packages"','id="benefits"','id="contacts"','id="faq"'])assert.ok(ads.includes(x),x);
 for(const x of ['id="methodList"','id="goals"','id="expenses"','id="thanks"'])assert.ok(support.includes(x),x);
 assert.match(support,/navigator\.clipboard/);
 assert.match(support,/rel='noopener noreferrer'/);
});
test('beta build fingerprints static changes without changing semantic release numbering',()=>{
 const build=read('scripts/build_pages.py');
 assert.match(build,/hashlib\.sha256/);
 assert.match(build,/build_hash/);
 assert.match(build,/channel_suffix\+"-"\+build_hash/);
});

test('preserve existing beautiful application icons and admin navigation, never emoji-replace originals',()=>{
 const app=read('index.html'),admin=read('admin.html');
 assert.ok(app.includes('install-kicker-icon" aria-hidden="true">✦'));
 assert.ok(app.includes('install-benefit-icon" aria-hidden="true">⌖'));
 assert.ok(admin.includes('<div class="login-symbol" aria-hidden="true">ϟ'));
 assert.ok(admin.includes('data-admin-tab="insights" aria-pressed="false">▥'));
 assert.ok(app.includes('./motion.js'));
 assert.ok(admin.includes('./motion.js'));
});


test('7.9.8 navigation keeps 460ms motion, no cooldown and correct neutral schedule legend',()=>{
 const style=read('style.css'),paint=read('hour-paint.js');
 assert.match(app,/const TAB_MOTION_MS=460/);
 assert.match(app,/token\.incoming\.finished/);
 assert.match(app,/token\.outgoing\.cancel/);
 assert.match(app,/getComputedStyle/);
 assert.match(style,/\.bottom-nav::before/);
 assert.match(style,/width:min\(calc\(100% - 28px\)/);
 assert.match(style,/\.dot-light\{background:#fff/);
 assert.match(style,/\.dot-mixed\{background:linear-gradient\(90deg,#2c3c54 50%,#fff 50%\)/);
 assert.match(paint,/COLOR=\{0:'#ffffff'/);
});
test('hero banner placeholders are masked until API config arrives with fallback',()=>{
 for(const path of ['support-project.html','advertising.html']){
  const page=read(path);
  assert.match(page,/data-content-loading="true"/);
  assert.match(page,/data\.contentLoading='false'/);
  assert.match(page,/heroSkeleton/);
  assert.match(page,/heroReady/);
  assert.match(page,/src="\.\/assets\/icon\.svg"/);
 }
});
test('support has no suggested amounts, admin editor also omits them, icon goals are emoji',()=>{
 const page=read('support-project.html'),admin=read('admin-ads.js'),ads=read('push-server/ads.js');
 assert.ok(!page.includes('amountBlock'));
 assert.ok(!page.includes('showAmounts'));
 assert.ok(!admin.includes('Показувати приклади сум'));
 assert.ok(!admin.includes('Приклади сум підтримки'));
 assert.ok(!ads.includes('showAmounts'));
 assert.match(page,/🛡️/u);
 assert.match(page,/🚀/u);
 assert.match(page,/✨/u);
});
test('iframe in-page anchor links do not add history entries before Back',()=>{
 const nav=read('internal-pages.js');
 assert.match(nav,/section\.scrollIntoView/);
 assert.match(nav,/e\.preventDefault\(\);section\.scrollIntoView/);
 assert.match(nav,/history\.back\(\)/);
});
