import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('workstation is published only as beta assets and loads after older modules',()=>{
 const html=read('admin.html'),build=read('scripts/build_pages.py'),sw=read('sw.js');
 for(const file of ['admin-workstation-v3.js','admin-workstation-v3.css']){
  assert.ok(build.includes("'"+file+"'"),'build missed '+file);
  assert.ok(sw.includes('"./'+file+'"'),'PWA missed '+file);
  assert.ok(html.includes('./'+file),'HTML missed '+file);
 }
 assert.ok(html.indexOf('admin-mobile.js')<html.indexOf('admin-workstation-v3.js'));
 assert.ok(html.indexOf('admin-mobile.css')<html.indexOf('admin-workstation-v3.css'));
});
test('routine Railway actions are explicitly separate from repository publication',()=>{
 const js=read('admin-workstation-v3.js');
 const github=read('push-server/admin.js');
 for(const route of ['feedback','app-config','work-items','push/status'])
  assert.ok(js.includes("'"+route+"'"),'Missing token-free action: '+route);
 assert.ok(js.includes("api('feedback/'+encodeURIComponent"));
 assert.ok(!js.includes('GITHUB_TOKEN'),'UI must never read GitHub secret');
 assert.ok(!js.includes('localStorage.setItem('),'Ticket text may not be persisted in browser');
 assert.ok(github.includes("const ghReady=!!GH_TOKEN&&repoValid()"));
 assert.ok(github.indexOf("'/api/admin/feedback'")<github.indexOf("const ghReady=!!GH_TOKEN"));
});
test('support register has selection and non-destructive bulk processing',()=>{
 const js=read('admin-workstation-v3.js');
 assert.ok(js.includes('expectedRevision'));
 assert.ok(js.includes('role()!==\'viewer\''));
 assert.ok(js.includes("['new','in_progress','resolved']"));
 assert.ok(js.includes('document.createElement')||js.includes("mk('input')"));
 assert.ok(!js.includes('DELETE\''));
 assert.ok(js.includes("window.SvitloTicketEnhance=detailV3"));
 assert.ok(js.includes("window.SvitloMobileAdmin={...originalMobile,openTicket,closeTicket,decorateTicket(){}}"));
});
test('mobile detail is an accessible separate screen and keeps ticket data private',()=>{
 const css=read('admin-workstation-v3.css'),js=read('admin-workstation-v3.js');
 assert.match(css,/\.desk-ticket-open #ticketDetail\.desk-ticket/);
 assert.match(css,/z-index:16000!important/);
 assert.match(css,/padding:calc\(env\(safe-area-inset-top/);
 assert.match(js,/aria-modal/);
 assert.match(js,/closeTicket/);
 assert.match(js,/\['overview','Звернення'\]/);
});
