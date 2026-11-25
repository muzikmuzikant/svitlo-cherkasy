import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('each new public feature has a persistent admin switch, a safe server default and real UI binding',()=>{
 const admin=read('admin-features.js'),config=read('push-server/app-config.js'),mode=read('site-mode.js'),index=read('index.html'),css=read('community-status.css'),community=read('community-status.js'),commercial=read('commercial-ui.js');
 const keys=['communityStatus','electricityStats','adSpecialPlacements','permanentPartner','partnerOffers','localAnnouncements'];
 for(const key of keys){
  assert.match(admin,new RegExp("\\['"+key+"',"),key+' missing in admin Features tab');
  assert.match(config,new RegExp(key+':true'),key+' missing safe default');
  assert.ok(mode.includes('"'+key+'"')||mode.includes("'"+key+"'"),key+' missing site-mode binding');
  if(key!=='localAnnouncements')assert.ok(css.includes('feature-off-'+key),key+' missing disable behavior');
 }
 for(const id of ['communityStatusCard','electricityStatsCard','betaSpecialPlacement','permanentPartnerCard','partnerOffers'])assert.ok(index.includes('id="'+id+'"'),id+' missing from public PWA');
 assert.ok(community.includes("featureEnabled('communityStatus')")&&community.includes("featureEnabled('electricityStats')"));
 assert.ok(commercial.includes("flag('adSpecialPlacements')")&&commercial.includes("flag('permanentPartner')")&&commercial.includes("flag('partnerOffers')"));
 const configLogic=read('push-server/app-config.js'),adminNotices=read('admin-control.js'),inbox=read('inbox-ui.js');
 assert.ok(configLogic.includes('localEnabled=state.site?.flags?.localAnnouncements!==false'));
 assert.ok(adminNotices.includes('opsNoticeScope')&&adminNotices.includes('opsNoticeVerified')&&adminNotices.includes('localNoticeReady')&&adminNotices.includes("id==='opsNoticeSettlement'"));
 assert.ok(inbox.includes('targeted(a)'),'local notices must use the saved settlement target');
 const server=read('push-server/server.js');for(const route of ['/api/community/status','/api/community/report','/api/community/stats'])assert.ok(server.includes(route),route+' missing from server');
});
test('new static assets are included in the PWA build and offline shell',()=>{
 const build=read('scripts/build_pages.py'),sw=read('sw.js'),css=read('community-status.css');
 for(const file of ['community-status.js','commercial-ui.js','community-status.css']){assert.ok(build.includes("'"+file+"'"),file+' missing from Pages build');assert.ok(sw.includes("'./"+file+"'")||sw.includes('"./'+file+'"'),file+' missing from SW cache')}
 assert.ok(css.includes(':root[data-theme="dark"]'));assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));assert.ok(css.includes('@media(max-width:520px)'));
});
