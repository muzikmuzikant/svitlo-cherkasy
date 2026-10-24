import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('index.html'),js=read('inbox-ui.js'),css=read('inbox-refresh.css');

test('clean Inbox retains accessible filters and one prominent read-all action',()=>{
 assert.match(html,/<h1>Вхідні /);
 assert.match(html,/id="inboxMarkAll"/);
 assert.match(html,/id="inboxUnreadNote"/);
 for(const kind of ['all','unread','important','schedule','support'])
  assert.match(html,new RegExp('data-inbox-filter="'+kind+'"'));
 assert.doesNotMatch(html,/id="inboxSort"/);
 assert.doesNotMatch(html,/id="inboxOverview"/);
 assert.doesNotMatch(html,/class="inbox-actions-bar"/);
 assert.match(html,/id="inboxSearchPanel" hidden/);
 assert.match(html,/id="inboxSearchToggle"[^>]*aria-expanded="false"/);
 assert.match(js,/searchToggle.*addEventListener\('click'/);
 assert.match(js,/inboxSearchClose/);
});
test('Inbox has chronological sections and keeps pinned notices first',()=>{
 assert.match(js,/const section=item\.pinned\?'pinned':dayKey\(item\)/);
 assert.match(js,/String\(b\.at\)\.localeCompare\(String\(a\.at\)\)/);
 assert.match(js,/messageSection\(section,today,yesterday\)/);
 assert.match(js,/inbox-day-label/);
 assert.match(js,/inbox-new-dot/);
 assert.doesNotMatch(js,/inbox-auto-group/);
});
test('list actions use a native modal sheet, not overlapping per-card dropdowns',()=>{
 assert.match(js,/document\.createElement\('dialog'\)/);
 assert.match(js,/className='inbox-actions-sheet'/);
 assert.match(js,/actionsSheet\.showModal\(\)/);
 assert.match(js,/window\.SvitloSheetMotion\?\.bind\(actionsSheet,closeActions\)/);
 assert.match(js,/const more=el\('button','','inbox-row-more'\)/);
 assert.doesNotMatch(js,/el\('details','','inbox-context'\)/);
 for(const label of ['Позначити непрочитаним','Копіювати текст','Копіювати посилання','Поділитися','Відкрити звернення'])
  assert.ok(js.includes(label),label);
});
test('rich messages, deep links, Push and support actions survive redesign',()=>{
 assert.match(js,/SvitloMessageFormat\?\.render/);
 assert.match(js,/copy\.noticeDisplayTitle\(a\)/);
 assert.match(js,/trackNotice\(id,'opened'\)/);
 assert.match(js,/rememberLinkedNotice\(id\)/);
 assert.match(js,/svitlo:open-schedule/);
 assert.match(js,/\/api\/public\/message/);
 assert.match(js,/store\.mark\(unread\)/);
 assert.match(js,/const gallery=el\('div','','inbox-gallery'\)/);
});
test('new responsive Inbox styling is loaded and offline-cached including dark mode',()=>{
 assert.match(html,/href="\.\/inbox-refresh\.css"/);
 assert.match(read('scripts/build_pages.py'),/'inbox-refresh\.css'/);
 assert.match(read('sw.js'),/"\.\/inbox-refresh\.css"/);
 assert.match(css,/#updates \.inbox-leading/);
 assert.match(css,/:root\[data-theme="dark"\] #updates \.inbox-item/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/\.inbox-actions-sheet\[open\]\.is-leaving/);
});
