import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('manual notice cards never show a misleading updated badge, including saved notices',()=>{
 const inbox=read('inbox-ui.js');
 assert.doesNotMatch(inbox,/Оновлено\s*✨/);
 assert.doesNotMatch(inbox,/item\.updatedAt\s*&&\s*Date\.parse\(item\.updatedAt\)/);
 assert.match(inbox,/card\.append\(head,el\('strong',item\.title\),el\('p',item\.body\)\)/);
 assert.match(inbox,/Переглянути детальніше/);
});

test('removing the badge does not delete notice edits or schedule-change messages',()=>{
 const inbox=read('inbox-ui.js');
 const store=read('notification-center.js');
 const server=read('push-server/app-config.js');
 assert.match(inbox,/updatedAt:a\.updatedAt/,'manual notice content and edits must still synchronize');
 assert.match(store,/updatedAt:typeof item\.updatedAt/,'existing IndexedDB schema and timestamps stay intact');
 assert.match(server,/updatedAt:date\(a\.updatedAt\)/,'admin edit timestamps remain intact');
 assert.match(read('notification-text.js'),/Графік оновлено/,'legitimate schedule changes still have descriptive titles');
});
