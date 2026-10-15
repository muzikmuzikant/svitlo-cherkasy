import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Support Center provides two distinct usable workflows on phone',()=>{
 const html=read('feedback.html'),css=read('feedback.css'),js=read('feedback.js');
 for(const id of ['viewNew','viewTickets','topic','subject','queue','message','email','send','savedTickets','ticketConversation','replyForm','lookupForm','lookupToken','copyReceipt'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/sessionStorage\.setItem\(DRAFT/);
 assert.match(js,/localStorage\.setItem\(SAVED/);
 assert.match(js,/\/api\/ticket\/status/);
 assert.match(js,/\/api\/ticket\/reply/);
 assert.match(css,/@media\(max-width:490px\)/);
 assert.match(html,/Не надсилайте паролі/);
});

test('Admin has ticket workbench, filters, internal notes and reply, without XSS',()=>{
 const html=read('admin.html'),js=read('admin.js'),css=read('admin-feedback.css');
 for(const id of ['ticketSearch','ticketFilter','ticketTopicFilter','ticketPriorityFilter','ticketCounts','ticketsList','ticketDetail'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/internalNote/);assert.match(js,/reply:body/);
 assert.match(js,/textContent=String\(value\)/);
 assert.match(js,/adminRole==='viewer'/);
 assert.match(css,/\.support-workspace/);
});

test('Only private Railway API receives conversation messages and ticket secrets',()=>{
 const builder=read('scripts/build_pages.py'),server=read('push-server/server.js'),store=read('push-server/feedback-store.js');
 assert.match(builder,/'feedback\.css'/);assert.match(builder,/'admin-feedback\.css'/);
 assert.match(server,/\/api\/ticket\/reply/);
 assert.match(server,/feedback\.getStatus\(id,data\.token\)/);
 assert.match(store,/timingSafeEqual/);
 assert.match(store,/map\(\(\{accessHash,\.\.\.item\}\)=>item\)/);
 assert.match(store,/MAX_ITEMS=750/);
 assert.doesNotMatch(builder,/['"]feedback-store\.js['"]/);
});
