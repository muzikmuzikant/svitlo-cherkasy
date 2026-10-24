import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('queue preview never changes address storage or push subscription',()=>{
 const app=read('app.js'),html=read('index.html');
 assert.match(app,/let previewQueue=null/);
 assert.match(app,/const a=previewQueue\?\{queue:previewQueue/);
 assert.match(app,/if\(name!=='detail'\)previewQueue=null/);
 assert.match(app,/if\(name==='detail'&&!primary\(\)&&!previewQueue\)/);
 assert.match(app,/const queue=previewQueue\|\|primary\(\)\?\.queue/);
 assert.match(app,/previewQueue=quickSelect\.value;[\s\S]{0,180}navigate\('detail'\)/);
 assert.match(app,/for\(const queue of QUEUES\)/);
 assert.match(html,/id="quickQueueSelect"/);
 assert.match(html,/id="quickQueueOpen"/);
 // The preview click only changes temporary state, never posts to the Push server.
 const click=app.slice(app.indexOf("$('quickQueueOpen').onclick"),app.indexOf("$('quickQueueOpen').onclick")+230);
 assert.doesNotMatch(click,/updatePushSubscription|savePrefs|saveAddresses|fetch\(/);
});
test('detail screen shows source context without the removed decorative verification badge',()=>{
 const app=read('app.js'),html=read('index.html');
 assert.doesNotMatch(html,/id="detailVerified"/);
 assert.match(html,/id="detailUpdated"/);
 assert.match(app,/Світло весь день/);
 assert.match(app,/pub\?\x60Опубліковано/);
});
test('maintenance incident mode has its own readable look',()=>{
 const mode=read('site-mode.js'),css=read('style.css');
 assert.match(mode,/overlay\.dataset\.mode=m\.mode==='incident'/);
 assert.match(mode,/ВАЖЛИВЕ ПОВІДОМЛЕННЯ/);
 assert.match(css,/\.maintenance-screen\[data-mode="incident"\]/);
 const version=JSON.parse(read('release.json')).version;
 assert.match(version,/^7\.(?:7|[89]|[1-9]\d)\./);
 assert.match(read('sw.js'),new RegExp('svitlo-cherkasy-shell-v'+version.replaceAll('.','\\.')));
});
