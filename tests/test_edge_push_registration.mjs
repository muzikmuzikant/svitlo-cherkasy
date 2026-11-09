import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Push setup obtains and refreshes the exact active service worker registration for Edge PWA',()=>{
 assert.match(app,/async function getPushRegistration\(\)/);
 assert.match(app,/navigator\.serviceWorker\.getRegistration\(scopeUrl\)/);
 assert.match(app,/navigator\.serviceWorker\.register\(new URL\('sw\.js',scopeUrl\)\.href,\{scope:scopeUrl,updateViaCache:'none'\}\)/);
 assert.match(app,/registration\.update\(\)/);
 assert.match(app,/pushStage='worker-activation'/);
 assert.match(app,/new URL\('\.\/',location\.href\)\.href/);
 assert.match(app,/!registration\.active/);
 assert.match(app,/!registration\.pushManager/);
 assert.match(app,/const reg=await getPushRegistration\(\);let sub=await reg\.pushManager\.getSubscription\(\)/);
});

test('Push API CORS preflight allows the cache-control header sent by the client',()=>{
 const server=readFileSync(new URL('../push-server/server.js',import.meta.url),'utf8');
 assert.match(server,/access-control-allow-headers[^\\n]*content-type, authorization, cache-control/);
});

test('Push subscription validates the VAPID key and reports server rejection details',()=>{
 assert.match(app,/key\.length!==65/);
 assert.match(app,/cache:'no-store',body:JSON\.stringify\(payload\)/);
 assert.match(app,/Push server response '\+response\.status/);
 assert.match(app,/pushStage='server-register'/);
});

test('Edge Push failures expose a stage and a useful user-facing diagnostic',()=>{
 assert.match(app,/Push registration failed:/);
 assert.match(app,/Етап: '\+stage/);
});

test('production service worker cache is refreshed with the Edge Push repair',()=>{
 assert.match(sw,/edge-push-registration-diagnostics-20261104/);
});

test('Push endpoint validation accepts Microsoft WNS while rejecting unsafe endpoints',async()=>{
 const {validPushEndpoint}=await import('../push-server/valid-endpoint.js');
 assert.equal(validPushEndpoint('https://wns2-example.notify.windows.com/?token=abc'),true);
 assert.equal(validPushEndpoint('https://notify.windows.com/path'),true);
 assert.equal(validPushEndpoint('http://wns2-example.notify.windows.com/?token=abc'),false);
 assert.equal(validPushEndpoint('https://notify.windows.com.evil.example/path'),false);
 assert.equal(validPushEndpoint('https://user:pass@wns2-example.notify.windows.com/path'),false);
});
