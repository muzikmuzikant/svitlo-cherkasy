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
 assert.match(app,/previewQueue=quickSelect\.value;\s*navigate\('detail'\)/);
 assert.match(app,/for\(const queue of QUEUES\)/);
 assert.match(html,/id="quickQueueSelect"/);
 assert.match(html,/id="quickQueueOpen"/);
 // The preview click only changes temporary state, never posts to the Push server.
 const click=app.slice(app.indexOf("$('quickQueueOpen').onclick"),app.indexOf("$('quickQueueOpen').onclick")+230);
 assert.doesNotMatch(click,/updatePushSubscription|savePrefs|saveAddresses|fetch\(/);
});
test('verified badge distinguishes official publication from no-publication display',()=>{
 const app=read('app.js'),html=read('index.html'),css=read('style.css');
 assert.match(html,/id="detailVerified"/);
 assert.match(app,/const official=!!pub/);
 assert.match(app,/is-verified/);
 assert.match(app,/is-unpublished/);
 assert.match(app,/Графік не опубліковано/);
 assert.match(css,/\.verified-source-badge\.is-verified/);
 assert.match(css,/\.verified-source-badge\.is-unpublished/);
});
test('maintenance incident mode has its own readable look',()=>{
 const mode=read('site-mode.js'),css=read('style.css');
 assert.match(mode,/overlay\.dataset\.mode=m\.mode==='incident'/);
 assert.match(mode,/ВАЖЛИВЕ ПОВІДОМЛЕННЯ/);
 assert.match(css,/\.maintenance-screen\[data-mode="incident"\]/);
 const version=JSON.parse(read('release.json')).version;
 assert.equal(version,'7.7.1');
 assert.match(read('sw.js'),/svitlo-cherkasy-shell-v7\.7\.1/);
});
