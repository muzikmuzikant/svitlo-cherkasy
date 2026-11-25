import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');

test('electricity statistics and partner offers are removed from the public Beta UI', () => {
  const html=read('index.html'), community=read('community-status.js'), commercial=read('commercial-ui.js');
  assert.doesNotMatch(html,/id="electricityStatsCard"|id="partnerOffers"/);
  assert.doesNotMatch(community,/electricityStats|statsHost|loadStats|Статистика електропостачання/);
  assert.doesNotMatch(commercial,/partnerOffers|partner-offer-card|Партнерська пропозиція/);
});

test('community reports and remaining commercial placements stay available', () => {
  const html=read('index.html'), community=read('community-status.js'), commercial=read('commercial-ui.js');
  assert.match(html,/id="communityStatusCard"/);
  assert.match(html,/id="betaSpecialPlacement"/);
  assert.doesNotMatch(html,/id="permanentPartnerCard"/);
  assert.match(community,/ЩО ЗІ СВІТЛОМ\?/);
  assert.match(community,/sendReport/);
  assert.match(commercial,/adSpecialPlacements/);
  assert.match(commercial,/partner-page-footer/);
  assert.match(commercial,/partner-mini-button/);
  assert.match(commercial,/permanentPartner/);
  assert.doesNotMatch(html,/Статистика електропостачання|Пропозиції партнерів/);
});

test('removed options are no longer exposed as admin or server feature flags', () => {
  const admin=read('admin-features.js');
  assert.equal(admin.includes("['electricityStats',"),false);
  assert.equal(admin.includes("['partnerOffers',"),false);
  for (const file of ['site-mode.js','push-server/app-config.js']) {
    const source=read(file);
    assert.equal(source.includes('electricityStats'),false);
    assert.equal(source.includes('partnerOffers'),false);
  }
  assert.equal(admin.includes('delete flags.electricityStats'),true);
  assert.equal(admin.includes('delete flags.partnerOffers'),true);
  assert.equal(read('sw.js').includes('beta-settings-community-polish'),true);
});
