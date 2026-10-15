import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createAdsStore} from '../push-server/ads.js';

const fresh=()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-beta-ads-'));
 let clock=Date.parse('2026-10-15T12:00:00Z');
 const store=createAdsStore({directory:dir,clock:()=>clock});
 return {store,dir,advance:n=>{clock+=n}};
};
const ad=(id='first')=>({id,title:'Тестова реклама',enabled:true,weight:2,seconds:9,link:'https://example.com',background:'#ffffff',start:'',end:'',price:1000});

test('no ads: promo appears without invented commercial campaigns',()=>{
 const {store,dir}=fresh();const pub=store.publicState();
 assert.equal(pub.campaigns.length,0);
 assert.equal(pub.showPromo,true);
 assert.equal(pub.promoTitle,'Тут може бути ваша реклама');
 assert.equal(store.dashboard().pwa.known,0);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('campaign settings, personalization, contacts, tariffs and support are isolated & validated',()=>{
 const {store,dir}=fresh();
 const original=store.dashboard().settings;
 const changed=store.update({...original,rotationSeconds:12,promoEvery:3,animation:'slide',
  contacts:[{label:'Telegram',url:'https://t.me/example',enabled:true},{label:'Пошта',url:'mailto:test@example.com',enabled:true}],
  packages:[{id:'pkg',title:'Тиждень',price:450,durationDays:7,visible:true}],
  support:{enabled:true,title:'Підтримати',description:'Для сервера',paymentUrl:'https://example.com/donate',button:'Донат'},
  campaigns:[ad()]});
 assert.equal(changed.settings.rotationSeconds,12);
 assert.equal(store.publicState().campaigns.length,1);
 assert.equal(store.publicState().support.enabled,true);
 assert.equal(store.publicState().contacts.length,2);
 assert.equal(store.publicState().packages[0].durationDays,7);
 assert.equal(store.event('first','impression'),true);
 assert.equal(store.event('first','click'),true);
 assert.equal(store.dashboard().stats.first.impressions,1);
 assert.equal(store.dashboard().stats.first.clicks,1);
 store.flush();const reopened=createAdsStore({directory:dir});
 assert.equal(reopened.dashboard().stats.first.impressions,1);
 assert.equal(reopened.dashboard().settings.campaigns.length,1);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('scheduled and capped campaigns are hidden from public carousel',()=>{
 const {store,dir}=fresh();const settings=store.dashboard().settings;
 settings.campaigns=[{...ad(),dailyCap:1},{...ad('future'),start:'2035-01-01T00:00:00Z'}];
 store.update(settings);
 assert.deepEqual(store.publicState().campaigns.map(c=>c.id),['first']);
 store.event('first','impression');
 assert.equal(store.publicState().campaigns.length,0);
 assert.equal(store.event('future','click'),false);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('donation button cannot activate without a verified HTTPS target',()=>{
 const {store,dir}=fresh();const s=store.dashboard().settings;
 s.support={enabled:true,paymentUrl:'javascript:alert(1)',title:'Donation'};
 store.update(s);assert.equal(store.publicState().support.enabled,false);
 assert.equal(store.publicState().support.paymentUrl,'');
 fs.rmSync(dir,{recursive:true,force:true});
});

test('PWA counters require explicit consent, only standalone, and are deletable',()=>{
 const {store,dir,advance}=fresh();
 const id='c92659db-d68e-4f58-9f90-bd6b677909eb';
 assert.equal(store.activity({id,mode:'browser',consent:true}),false);
 assert.equal(store.activity({id,mode:'standalone',consent:false}),false);
 assert.equal(store.dashboard().pwa.known,0);
 assert.equal(store.activity({id,mode:'standalone',consent:true,platform:'iPhone'}),true);
 assert.equal(store.dashboard().pwa.known,1);
 assert.equal(store.dashboard().pwa.online,1);
 assert.equal(store.dashboard().pwa.byPlatform.iPhone,1);
 store.flushVisitors();assert.ok(!fs.readFileSync(path.join(dir,'beta-pwa-installations.json'),'utf8').includes(id));
 advance(47000);assert.equal(store.dashboard().pwa.online,0);
 assert.equal(store.dashboard().pwa.active24h,1);
 assert.equal(store.optOut({id}),true);
 assert.equal(store.dashboard().pwa.known,0);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('malformed configuration and invalid ads are rejected',()=>{
 const {store,dir}=fresh();const s=store.dashboard().settings;
 assert.throws(()=>store.update({...s,campaigns:[{...ad(),start:'2026-10-18T00:00:00Z',end:'2026-10-16T00:00:00Z'}]}));
 assert.throws(()=>store.update({...s,campaigns:[ad(),ad()]}),/унікальними/);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('beta site only includes ad placement in home and PWA requires privacy opt-in',()=>{
 const root=new URL('../',import.meta.url);
 const html=fs.readFileSync(new URL('index.html',root),'utf8');
 const js=fs.readFileSync(new URL('beta-ads.js',root),'utf8');
 const build=fs.readFileSync(new URL('scripts/build_pages.py',root),'utf8');
 const start=html.indexOf('<section id="home"');
 const end=html.indexOf('<section id="detail"');
 const adpos=html.indexOf('id="betaAd"');
 assert.ok(start<adpos&&adpos<end,'ads must remain in home section only');
 assert.ok(js.includes("standalone()")&&js.includes("enabled()"));
 for(const filename of ['beta-ads.js','admin-ads.js','admin-ads.css','advertising.html','support-project.html']){
  assert.ok(build.includes("'"+filename+"'"),'beta build is missing '+filename);
 }
});


test('7.9.10: fullscreen ad uses independently customizable content and images',()=>{
 const {store,dir}=fresh();const s=store.dashboard().settings;
 s.campaigns=[{...ad('more'),detailEnabled:true,detailTitle:'Великий заголовок',
 detailSubtitle:'Окремий підзаголовок',detailDescription:'Абзац 1\n\nАбзац 2',
 detailBanner:'https://example.com/banner.webp',detailImage:'https://example.com/image.webp',
 cardBackgroundImage:'https://example.com/card.webp',cardStyle:'dark',
 detailBackground:'#eef2ff',detailForeground:'#102848',detailAccent:'#1456aa',
 detailButton:'На сайт партнера'}];
 store.update(s);const adPublic=store.publicState().campaigns[0];
 assert.equal(adPublic.detailEnabled,true);
 assert.equal(adPublic.detailTitle,'Великий заголовок');
 assert.equal(adPublic.detailBanner,'https://example.com/banner.webp');
 assert.equal(adPublic.detailImage,'https://example.com/image.webp');
 assert.equal(adPublic.cardBackgroundImage,'https://example.com/card.webp');
 assert.equal(adPublic.detailBackground,'#eef2ff');
 assert.equal(adPublic.detailDescription,'Абзац 1\n\nАбзац 2');
 assert.equal(store.event('more','detailOpen'),true);
 assert.equal(store.event('more','outbound'),true);
 assert.equal(store.dashboard().stats.more.detailOpens,1);
 assert.equal(store.dashboard().stats.more.outboundClicks,1);
 store.flush();
 const reopened=createAdsStore({directory:dir});
 assert.equal(reopened.dashboard().settings.campaigns[0].detailEnabled,true);
 assert.equal(reopened.dashboard().stats.more.outboundClicks,1);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('7.9.10: editable advertising and support designs survive restart',()=>{
 const {store,dir}=fresh();const s=store.dashboard().settings;
 s.pageBackground='#edf4ff';s.pageAccent='#2360c5';
 s.pageHeroImage='https://example.com/hero.webp';
 s.pageAbout='Переваги сервісу';
 s.pageBenefits=['Перша','Друга','Третя'];
 s.support={...s.support,background:'#f0f5fc',accent:'#336699',
 heroImage:'https://example.com/support.webp',goals:[{icon:'♡',title:'Підтримка',description:'Розвиток проєкту'}],
 showGoals:true,showThanks:false};
 store.update(s);store.flush();
 const reload=createAdsStore({directory:dir}).publicState();
 assert.equal(reload.pageAccent,'#2360c5');
 assert.equal(reload.pageBenefits.length,3);
 assert.equal(reload.support.goals[0].title,'Підтримка');
 assert.equal(reload.support.showThanks,false);
 assert.equal('amounts' in reload.support,false,'suggested donations must not be published');
 fs.rmSync(dir,{recursive:true,force:true});
});

test('7.9.10: full screen advertising page and first run consent have shipped assets',()=>{
 const root=new URL('../',import.meta.url);
 const index=fs.readFileSync(new URL('index.html',root),'utf8');
 const beta=fs.readFileSync(new URL('beta-ads.js',root),'utf8');
 const full=fs.readFileSync(new URL('ad-detail.html',root),'utf8');
 const adInfo=fs.readFileSync(new URL('advertising.html',root),'utf8');
 const support=fs.readFileSync(new URL('support-project.html',root),'utf8');
 const sw=fs.readFileSync(new URL('sw.js',root),'utf8');
 assert.ok(index.indexOf('id="emergencyBanner"')<index.indexOf('id="betaAd"'));
 assert.ok(index.indexOf('id="betaAd"')<index.indexOf('Графік на сьогодні',index.indexOf('id="betaAd"')));
 assert.ok(index.includes('id="betaConsentDialog"'));
 assert.ok(index.includes('id="betaConsentAccept"')&&index.includes('id="betaConsentDecline"'));
 assert.ok(beta.includes("consentDialog.showModal()")&&beta.includes("CHOICE"));
 assert.ok(beta.includes("item.detailEnabled?'./ad-detail.html"));
 assert.ok(full.includes('detailBanner')&&full.includes('detailImage')&&full.includes("type:'outbound'"));
 assert.ok(adInfo.includes('pageBenefits')&&adInfo.includes('pageHeroImage'));
 assert.ok(support.includes('showGoals')&&!support.includes('showAmounts'));
 assert.ok(!support.includes('amountBlock'));
 assert.ok(sw.includes('ad-detail.html'));
 const build=fs.readFileSync(new URL('scripts/build_pages.py',root),'utf8');
 assert.ok(build.includes("'ad-detail.html'"));
});


test('7.9.8: badges and supported donation methods expose only enabled configured values',()=>{
 const {store,dir}=fresh();const settings=store.dashboard().settings;
 settings.packages=[{title:'Доступний',price:420,durationDays:14,badge:'Вигідно',badgeBackground:'#e5f1ff',badgeForeground:'#1456b5',featured:true,features:['Основна картка','Сторінка реклами']}];
 settings.support={...settings.support,enabled:true,methods:[
 {kind:'monobank',title:'Банка',url:'https://example.com/jar',enabled:true},
 {kind:'iban',title:'Переказ',details:'UA000000000000000000000000000',enabled:true},
 {kind:'other',title:'Вимкнено',url:'https://example.com/private',enabled:false}
 ],expenses:[{title:'Сервер',amount:300,date:'2026-10-15',description:'Підписка',public:true},
 {title:'Особисте',amount:200,date:'2026-10-15',public:false}]};
 store.update(settings);
 const a=store.publicState();assert.equal(a.packages[0].badge,'Вигідно');
 assert.equal(a.packages[0].featured,true);assert.deepEqual(a.packages[0].features,['Основна картка','Сторінка реклами']);
 assert.equal(a.support.enabled,true);assert.equal(a.support.methods.length,2);assert.equal(a.support.expenses.length,1);
 assert.ok(!JSON.stringify(a).includes('https://example.com/private'));
 fs.rmSync(dir,{recursive:true,force:true});
});
