import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {latestOfficialEvent} from '../push-server/schedule-engine.js';
import {emergencyCopy} from '../push-server/notification-copy.js';
import {selectRecipients} from '../push-server/manual-push.js';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('operator Telegram can be a verified emergency source, spoofed channels cannot',()=>{
 const now=Date.parse('2026-10-23T09:00:00Z');
 const mk=source=>({id:source,source,status:'active',publishedAt:new Date(now-60000).toISOString()});
 assert.equal(latestOfficialEvent([mk('https://t.me/pat_cherkasyoblenergo/978')],now)?.status,'active');
 assert.equal(latestOfficialEvent([mk('https://t.me/not_pat_cherkasyoblenergo/978')],now),null);
 assert.equal(latestOfficialEvent([mk('https://evil.example/media/example')],now),null);
});
test('emergency notice describes GPV as planned information, not completely abolished',()=>{
 const body=emergencyCopy('active');
 assert.ok(body.body.includes('Погодинний'));
 assert.ok(body.content.includes('фактичний час'));
 assert.ok(body.content.includes('за адресами'));
 assert.equal(emergencyCopy('notice'),null);
});
test('manual emergency Push honors category opt-out',()=>{
 const rec=(id,enabled)=>({queue:'1.1',subscription:{endpoint:'https://fcm.googleapis.com/'+id},preferences:{emergency:enabled}});
 const rows={a:rec('a',true),b:rec('b',false),c:rec('c',undefined)};
 assert.equal(selectRecipients(rows,{emergencyOnly:true}).length,1);
 assert.equal(selectRecipients(rows,{emergencyOnly:false}).length,3);
});
test('dedicated emergency admin desk is packaged into Cloudflare beta',()=>{
 const html=read('admin.html'),js=read('admin-emergency.js'),build=read('scripts/build_pages.py'),sw=read('sw.js');
 assert.match(html,/data-admin-tab="emergency"/);
 assert.match(html,/data-admin-panel="emergency"/);
 assert.match(html,/id="emergencyDeskConfirm"/);
 assert.match(html,/src="\.\/admin-emergency\.js"/);
 assert.match(js,/window\.svitloAdminApi/);
 assert.match(js,/confirm\(question\)/);
 assert.match(js,/already|вже створено/);
 assert.match(js,/notices\/send/);
 assert.ok(build.includes("'admin-emergency.js'"));
 assert.ok(sw.includes('"./admin-emergency.js"'));
});
test('manual emergency delivery is limited to authorized beta server',()=>{
 const admin=read('push-server/admin.js'),server=read('push-server/server.js');
 assert.match(admin,/emergencyOnly:entry\.kind==='emergency'/);
 assert.match(server,/emergencyOnly:notice\.kind==='emergency'/);
});
