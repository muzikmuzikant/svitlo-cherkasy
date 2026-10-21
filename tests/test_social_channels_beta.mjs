import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {validateAppConfig,createAppConfig} from '../push-server/app-config.js';
const file=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-social-'));
const store=createAppConfig({directory:folder,record:()=>{}});
const valid=()=>store.get();
const entry=(id,url='https://t.me/svitlo_cherkasy_of')=>({id,platform:'telegram',label:'Telegram',url,enabled:true});
test('server has one genuine official Telegram link, no invented social profiles',()=>{
 const social=valid().site.social;
 assert.equal(social.enabled,true);
 assert.equal(social.showInApp,true);
 assert.equal(social.showInFooter,true);
 assert.deepEqual(social.links.map(x=>x.url),['https://t.me/svitlo_cherkasy_of']);
 assert.deepEqual(social.links.map(x=>x.platform),['telegram']);
});
test('separate placement switches and reordering survive validation',()=>{
 const cfg=valid();
 cfg.site.social={enabled:true,showInApp:false,showInFooter:true,
  links:[entry('first'),{...entry('second','https://www.instagram.com/example/'),platform:'instagram',label:'Instagram',enabled:false}]};
 const saved=validateAppConfig(cfg);
 assert.equal(saved.site.social.showInApp,false);
 assert.equal(saved.site.social.showInFooter,true);
 assert.deepEqual(saved.site.social.links.map(x=>x.id),['first','second']);
 assert.equal(saved.site.social.links[1].enabled,false);
 assert.equal(saved.site.links.help,cfg.site.links.help);
 assert.deepEqual(saved.announcements,cfg.announcements);
});
test('unsafe addresses cannot be sent to the public renderer',()=>{
 for(const url of ['http://t.me/test','javascript:alert(1)','https://user:pass@example.com',
  'https://example.com/a b','https://localhost','./feedback.html']){
  const cfg=valid();cfg.site.social.links=[entry('bad',url)];
  assert.throws(()=>validateAppConfig(cfg),undefined,url);
 }
});
test('duplicate IDs, excess entries and invalid platforms fail securely',()=>{
 for(const list of [[entry('same'),entry('same')],
  Array.from({length:13},(_,n)=>entry('link_'+n)),
  [{...entry('wrong'),platform:'p0rn'}],
  [{...entry('wrong'),label:' '}]]){
  const cfg=valid();cfg.site.social.links=list;
  assert.throws(()=>validateAppConfig(cfg));
 }
});
test('owner editor uses latest server config; viewer does not publish',()=>{
 const admin=file('admin-social.js'),html=file('admin.html');
 assert.match(admin,/const owner=\(\)=>document\.body\.dataset\.adminRole==='owner'/);
 assert.match(admin,/apiCall\(\)\('app-config'\)/);
 assert.match(admin,/const latest=await apiCall\(\)\('app-config'\)/);
 assert.match(admin,/JSON\.stringify\(latestSocial\)!==baseline/);
 assert.match(admin,/method:'PUT',body:JSON\.stringify\(updated\)/);
 assert.match(admin,/REFRESH_APP_CONFIG/);
 for(const id of ['socialAdd','socialSave','socialReload','socialEnabled','socialShowInApp',
  'socialShowInFooter','socialEntries','socialPreview','socialStatus'])
  assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
 const panels=[...new Set([...html.matchAll(/data-admin-panel="([^"]+)"/g)].map(m=>m[1]))];
 assert.equal(panels.length,24);
 assert.match(file('admin-office-plus.js'),/social:\['КОМУНІКАЦІЇ'/);
});
test('all ordinary pages and PWA have an accessible, dark-mode-safe footer mount',()=>{
 const ordinary=['about.html','help.html','privacy.html','terms.html','advertising.html',
  'ad-detail.html','support-project.html','feedback.html'];
 for(const p of ordinary){
  assert.match(file(p),/href="\.\/social-links\.css"/,p+' style');
  assert.match(file(p),/src="\.\/social-links\.js"/,p+' script');
 }
 const index=file('index.html'),links=file('social-links.js');
 assert.match(index,/id="svitloSocialSettings"/);
 assert.match(index,/id="svitloSocialLanding"/);
 assert.match(links,/setAttribute\('aria-label'/); // link labels are set before insertion
 assert.match(links,/rel='noopener noreferrer'/);
 assert.match(links,/svitlo:public-config/);
 assert.match(file('social-links.css'),/:root\[data-theme="dark"\]/);
});
test('all assets are in production build and offline PWA shell',()=>{
 const build=file('scripts/build_pages.py'),sw=file('sw.js');
 for(const asset of ['social-links.js','social-links.css','admin-social.js','admin-social.css']){
  assert.ok(build.includes("'"+asset+"'"),asset+' build');
  assert.ok(sw.includes('"./'+asset+'"'),asset+' shell');
 }
 assert.ok(sw.includes("'./social-links.js'"));
 assert.ok(sw.includes("'./social-links.css'"));
});
