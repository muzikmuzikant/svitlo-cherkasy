import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('micro interactions are delegated and never force per-tap layout',()=>{
 const js=read('micro-motion.js');
 assert.match(js,/pointerdown/);
 assert.match(js,/pointercancel/);
 assert.match(js,/keydown/);
 assert.match(js,/keyup/);
 assert.match(js,/MutationObserver/);
 assert.match(js,/lastShown/);
 assert.match(js,/prefers-reduced-motion/);
 assert.doesNotMatch(js,/offsetWidth|offsetHeight|requestAnimationFrame\(.*offset/);
});
test('public and office microstates support dark and reduced-motion preferences',()=>{
 const css=read('micro-motion.css'),admin=read('admin-motion.css');
 for(const part of ['.micro-pressed','.micro-changed','.all-queues-lane','.nav-item','.inbox-item','.setting-line','.day-choice','input[type="checkbox"]'])
  assert.ok(css.includes(part),part);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/feature-off-animations/);
 assert.match(admin,/prefers-reduced-motion:reduce/);
 assert.match(admin,/data-workspace-panel/);
 assert.match(admin,/animation:none!important/);
 assert.match(admin,/office-work-entry/);
 assert.doesNotMatch(admin,/transition\s*:\s*all\b/);
});
test('all-queues expansion preserves original row nodes, and renders no per-minute duplicates',()=>{
 const js=read('all-queues.js');
 assert.match(js,/function toggleQueue\(queue\)/);
 assert.match(js,/lane\.onclick=\(\)=>toggleQueue\(queue\)/);
 assert.match(js,/signature===currentSignature/);
 assert.match(js,/root\.querySelectorAll\('\.all-queues-lane'\)\.length===12/);
 assert.match(js,/row\.after\(detail\)/);
 assert.match(js,/animateDetail/);
 assert.match(js,/src\(\)\.timeline\(selected,queue\)/);
 assert.doesNotMatch(js,/lane\.onclick=\(\)=>\{[^\n]*render\(\)/);
});
test('owned modal dialogs are not intercepted by the general Escape animator',()=>{
 const js=read('motion.js');
 assert.match(js,/not\(\.all-queues-dialog\)/);
 assert.match(js,/not\(\.inbox-actions-sheet\)/);
 assert.match(js,/dialog\.matches\('\.sheet,\.share-preview-dialog,\.all-queues-dialog,\.inbox-actions-sheet'\)/);
});
test('every user-facing page has the same microcontroller and reduced-motion CSS',()=>{
 const pages=['index.html','admin.html','feedback.html','help.html','about.html','privacy.html',
              'terms.html','advertising.html','ad-detail.html','support-project.html'];
 for(const page of pages){
  const html=read(page);
  assert.ok(html.includes('micro-motion.js'),page+' JS');
  assert.ok(html.includes('micro-motion.css'),page+' CSS');
 }
 const build=read('scripts/build_pages.py'),sw=read('sw.js'),workflow=read('.github/workflows/offline-cold-start.yml');
 for(const path of ['micro-motion.js','micro-motion.css','admin-motion.css']){
  assert.ok(build.includes("'"+path+"'"),'missing public asset '+path);
  assert.ok(sw.includes('"./'+path+'"'),'missing offline asset '+path);
 }
 assert.ok(workflow.includes('tests/visual_motion_audit_browser.py'));
});
