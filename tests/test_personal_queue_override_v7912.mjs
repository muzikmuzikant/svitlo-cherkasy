import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('any automatically matched address may opt into a personal subqueue',()=>{
 const app=read('app.js'),html=read('index.html');
 assert.match(html,/id="queueOverride"/);
 assert.match(html,/id="queueOverrideControl"/);
 assert.match(app,/const queue=personalSelection\?\$\('manualQueue'\)\.value:r\.queue/);
 assert.match(app,/method:personalSelection\?/);
 assert.match(app,/\['manual','manual-override','street-choice'\]\.includes\(item\.method\)/);
 assert.match(app,/\$\('queueOverride'\)\.onchange=checkLookup/);
 assert.match(app,/updatePushSubscription\(\)\.catch/);
});
test('unlisted houses never silently inherit a street queue and can choose any valid queue',()=>{
 const source=read('address-lookup.js');
 assert.match(source,/!house \|\| !houses\.length/);
 assert.match(read('app.js'),/QUEUES\.includes\(chosen\)/);
});
test('Khomenka is present in Heronymivka, and app guides a mismatched settlement',()=>{
 const live=JSON.parse(read('data/addresses.json'));
 assert.equal(live.localities['геронимівка'].streets['вулиця|хоменка'],'Вулиця Хоменка');
 assert.match(read('app.js'),/otherSettlementsWithStreet/);
 assert.match(read('app.js'),/Таку вулицю знайдено в:/);
});
