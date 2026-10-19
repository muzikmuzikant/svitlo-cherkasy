import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Cold-start loading cover exists only in installed PWA, and cannot trap a browser visitor',()=>{
  const html=source('index.html'),css=source('style.css');
  assert.match(html,/id="appBootScreen" class="app-boot-screen"/);
  assert.match(html,/id="appBootMessage"/);
  assert.match(html,/id="appBootRetry"[^>]*hidden/);
  assert.match(css,/html:not\(\[data-app-mode="standalone"\]\) #appBootScreen/);
  assert.match(css,/\.app-boot-screen\[hidden\]\{display:none!important\}/);
  assert.match(css,/\.app-boot-screen\.is-complete\{opacity:0;pointer-events:none\}/);
});

test('Cold start reveals the interface promptly while schedule sync may continue',()=>{
  const app=source('app.js'),install=source('install.js');
  assert.match(app,/async function finishInitialLoad\(\)/);
  assert.match(app,/const refresh=refreshData\(\)/);
  assert.match(app,/Promise\.race\(\[refresh\.then\(\(\)=> 'loaded'\),deadline\]\)/);
  assert.match(app,/navigator\.onLine===false\?350:1800/);
  assert.match(app,/finally\{[\s\S]*?splash\.classList\.add\('is-complete'\)/);
  assert.match(app,/finishInitialLoad\(\);/);
  assert.match(install,/hour\.onerror = reportLaunchFailure/);
  for(const dependency of ['lookup','merger','inbox','app'])assert.match(install,new RegExp(dependency+'\\.onerror = reportLaunchFailure'));
  assert.match(install,/const bootTimeout = setTimeout\(reportLaunchFailure, 25000\)/);
});

test('Persisted permitted Push does not show an invitation before subscription check',()=>{
  const app=source('app.js');
  assert.match(app,/pushActive=\('Notification' in window&&Notification.permission==='granted'&&localStorage.getItem\(PUSH_CONSENT\)==='yes'\)/);
});

test('Never change the rule: no published schedule is 24h green',()=>{
  const app=source('app.js');
  assert.match(app,/if\(!day\)\{[\s\S]*?return isOfflineMode\(\)\?null:new Int8Array\(1440\)/);
  assert.match(app,/unknownOffline\?'Немає збереженого графіка':'Світло весь день'/);
});
