import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWorkRegistry} from '../push-server/work-registry.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('critical tasks are counted in a prominent dashboard and in sidebar',()=>{
 const office=read('admin-office.js');
 for(const key of ['officeWorkAttention','office-task-badge','is-overdue','is-urgent','svitlo:work-list'])
  assert.ok(office.includes(key),'missing task attention feature: '+key);
 assert.match(office,/x\.dueDate&&x\.dueDate<today/);
 assert.match(office,/x\.priority==='urgent'/);
 assert.match(office,/activate\('registry'\)/);
 assert.match(office,/summarizeWork\(items,!!tasks\)/);
});
test('the register allows task status actions, filters, and preserves unsaved text',()=>{
 const registry=read('admin-system.js');
 for(const key of ['work-quick-actions','work-quick-button','workDueFilter','workPriorityFilter',
  'isDirty()','editingRevision','registerRequestId','svitlo:open-linked-ticket']){
  assert.ok(registry.includes(key),key);
 }
 assert.match(registry,/expectedRevision:editingRevision,status/);
 assert.match(registry,/if\(requestId!==registerRequestId\|\|\$\('adminDashboard'\)\.hidden\)return/);
 assert.match(registry,/document\.dispatchEvent\(new CustomEvent\('svitlo:work-list'/);
});
test('task to support ticket navigation stays private and permission gated',()=>{
 const code=read('admin.js');
 assert.match(code,/svitlo:open-linked-ticket/);
 assert.match(code,/!remote\|\|\$\('adminDashboard'\)\.hidden/);
 assert.match(code,/supportTickets\.find\(item=>item\.id===id\)/);
 assert.match(code,/window\.SvitloMobileAdmin\?\.openTicket/);
});
test('new work visual styles are shipped with private admin only',()=>{
 const html=read('admin.html'),build=read('scripts/build_pages.py'),css=read('admin-work-focus.css');
 assert.match(html,/href="\.\/admin-work-focus\.css"/);
 assert.match(build,/'admin-work-focus\.css'/);
 assert.match(css,/office-attention/);
 assert.match(css,/registry-row\.is-overdue/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(read('index.html'),/admin-work-focus\.css/);
});
test('work registry rejects nonexistent dates and retains valid leap days',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'svitlo-work-validation-'));
 try{
  const work=createWorkRegistry({directory});
  for(const dueDate of ['2026-02-30','2026-02-29','2026-11-31','2026-13-01']){
   assert.throws(()=>work.create({title:'Перевірка дати',dueDate}),/Перевірте/,dueDate);
  }
  const item=work.create({title:'Перевірка дати',dueDate:'2028-02-29'});
  assert.equal(item.dueDate,'2028-02-29');
 }finally{rmSync(directory,{recursive:true,force:true})}
});
