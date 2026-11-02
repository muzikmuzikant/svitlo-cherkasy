import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Push setup explicitly obtains an active service worker registration for Edge PWA',()=>{
 assert.match(app,/async function getPushRegistration\(\)/);
 assert.match(app,/navigator\.serviceWorker\.getRegistration\('\.\/\'/);
 assert.match(app,/navigator\.serviceWorker\.register\('\.\/sw\.js',\{scope:'\.\/',updateViaCache:'none'\}\)/);
 assert.match(app,/navigator\.serviceWorker\.ready,timeout/);
 assert.match(app,/!ready\?\.active\|\|!ready\.pushManager/);
 assert.match(app,/const reg=await getPushRegistration\(\);let sub=await reg\.pushManager\.getSubscription\(\)/);
});

test('Push subscription validates the VAPID key and reports server rejection details',()=>{
 assert.match(app,/key\.length!==65/);
 assert.match(app,/cache:'no-store',body:JSON\.stringify\(payload\)/);
 assert.match(app,/Push server response '\+response\.status/);
});

test('production service worker cache is refreshed with the Edge Push repair',()=>{
 assert.match(sw,/edge-push-fix-20261102/);
});
