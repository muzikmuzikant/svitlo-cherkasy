import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('beta release 7.9.12 is consistent across manifest, HTML and service worker',()=>{
 const release=JSON.parse(source('release.json'));
 assert.equal(release.version,'7.9.12');
 assert.equal(release.channel,'beta');
 for(const file of ['index.html','feedback.html'])
  assert.match(source(file),/name="svitlo-version" content="7\.9\.12"/);
 assert.match(source('sw.js'),/const VERSION='svitlo-cherkasy-shell-v7\.9\.12-beta/);
});
test('privacy policy explicitly explains secure private media, purpose, access and retention',()=>{
 const privacy=source('privacy.html');
 for(const phrase of ['4а. Фото та відео у зверненнях','HEIC','HEIF',
  'до 9 МБ','Railway','приватним кодом','уповноваженим операторам',
  '90 днів','метадані','Соцмережах','22 жовтня 2026 року']){
  assert.ok(privacy.includes(phrase),'Privacy missing '+phrase);
 }
 assert.match(privacy,/контакт/);
});
test('terms, help, and support form are aligned for attachments and external links',()=>{
 const terms=source('terms.html'),help=source('help.html'),
  form=source('feedback.html'),about=source('about.html');
 for(const page of [terms,help,form])for(const word of ['відео','фото','9 МБ'])
  assert.match(page,new RegExp(word));
 assert.match(terms,/4а\. Фото, відео/);
 assert.match(terms,/6а\. Посилання на зовнішні канали/);
 assert.match(help,/Як надіслати фото або відео/);
 assert.match(form,/id="newTicketFiles"/);
 assert.match(form,/id="replyTicketFiles"/);
 assert.match(form,/href="\.\/terms.html"/);
 assert.match(form,/href="\.\/privacy.html"/);
 assert.match(about,/Підтримка з фото та відео/);
});
test('server never serves private media through the public image route',()=>{
 const media=source('push-server/ticket-media.js'),
  store=source('push-server/feedback-store.js'),
  server=source('push-server/server.js');
 assert.match(media,/ticket-media/);
 assert.match(store,/getAttachment\(ticketId,attachmentId,token,authorized=false\)/);
 assert.match(store,/if\(!authorized\)validateToken\(ticket,token\)/);
 assert.match(server,/\/api\/ticket\/attachment/);
 assert.match(server,/getAttachment\(id,data\.attachmentId,data\.token\)/);
 assert.doesNotMatch(server,/mediaStore\.read\(.*ticket/);
});
