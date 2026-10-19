import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../beta-ads.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const inbox=fs.readFileSync(new URL('../inbox-ui.js',import.meta.url),'utf8');
const script=code.slice(code.indexOf(' const choice=()=>'),code.indexOf(' const key=()=>'));
assert.ok(script.startsWith(' const choice=()=>')&&script.includes('function persistChoice'), 'Consent tests must target the actual client implementation');

const choose=(data={})=>{
 const storage=new Map(Object.entries(data));
 const localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key)
 };
 const context={localStorage,window:{dispatchEvent:()=>{}},document:{getElementById:()=>null},Event:class Event{constructor(type){this.type=type}}};
 const prelude="const consent=null; const STATS_OPT='svitlo-beta-analytics-opt-in',CHOICE='svitlo-beta-analytics-choice',CHOICE_REV='svitlo-beta-analytics-consent-revision',NOTICE_SCOPE='notice-engagement-v1';";
 vm.runInNewContext(prelude+script+' globalThis.options={choice,enabled,noticeScopeAllowed,persistChoice};',context);
 return {storage,localStorage,...context.options};
};

test('brand-new installation has no analytics decision until it chooses',()=>{
 const state=choose();
 assert.equal(state.choice(),null);
 assert.equal(state.enabled(),false);
 assert.equal(state.noticeScopeAllowed(),false);
 state.persistChoice(true);
 assert.equal(state.choice(),'accepted');
 assert.equal(state.enabled(),true);
 assert.equal(state.noticeScopeAllowed(),true);
 const reopened=choose(Object.fromEntries(state.storage));
 assert.equal(reopened.choice(),'accepted');
 assert.equal(reopened.enabled(),true);
});

test('historical acceptance/decline persists across arbitrary app updates',()=>{
 for(const revision of ['7.9.8','7.9.9-audience','7.9.10','7.9.11-notices']){
  const yes=choose({'svitlo-beta-analytics-opt-in':'yes','svitlo-beta-analytics-choice':'accepted',
   'svitlo-beta-analytics-consent-revision':revision});
  assert.equal(yes.choice(),'accepted');
  assert.equal(yes.enabled(),true);
  const no=choose({'svitlo-beta-analytics-opt-in':'no','svitlo-beta-analytics-choice':'declined',
   'svitlo-beta-analytics-consent-revision':revision});
  assert.equal(no.choice(),'declined');
  assert.equal(no.enabled(),false);
 }
 assert.match(code,/if\(choice\(\)!==null\)return;/,'Prompt must use persistent decision, not release revision');
 assert.doesNotMatch(code,/if\(localStorage\.getItem\(CHOICE_REV\)===REVISION\)return/);
});

test('prior audience consent never silently opts into new message engagement',()=>{
 const accepted=choose({'svitlo-beta-analytics-opt-in':'yes','svitlo-beta-analytics-choice':'accepted',
  'svitlo-beta-analytics-consent-revision':'7.9.9-audience'});
 assert.equal(accepted.enabled(),true);
 assert.equal(accepted.noticeScopeAllowed(),false);
 assert.match(html,/id="betaAnalyticsEnableNotice"/,'New purpose requires confirmation in settings');
 assert.match(inbox,/notice-engagement-v1/,'Notice analytics require the new scope');
 accepted.localStorage.setItem('svitlo-beta-analytics-consent-revision','notice-engagement-v1');
 assert.equal(accepted.noticeScopeAllowed(),true);
});

test('revocation stays off after relaunch and analytics can be explicitly re-enabled',()=>{
 const state=choose({'svitlo-beta-analytics-opt-in':'yes','svitlo-beta-analytics-choice':'accepted',
   'svitlo-beta-analytics-consent-revision':'notice-engagement-v1'});
 state.persistChoice(false);
 assert.equal(state.choice(),'declined');
 assert.equal(state.enabled(),false);
 assert.equal(state.noticeScopeAllowed(),false);
 const fresh=choose(Object.fromEntries(state.storage));
 assert.equal(fresh.choice(),'declined');
 assert.equal(fresh.enabled(),false);
 fresh.persistChoice(true);
 assert.equal(fresh.enabled(),true);
 assert.equal(fresh.noticeScopeAllowed(),true);
});

test('legacy users with a saved yes/no setting but no choice key are not nagged',()=>{
 const yes=choose({'svitlo-beta-analytics-opt-in':'yes'});
 const no=choose({'svitlo-beta-analytics-opt-in':'no'});
 assert.equal(yes.choice(),'accepted');assert.equal(yes.enabled(),true);
 assert.equal(no.choice(),'declined');assert.equal(no.enabled(),false);
});

test('Settings has a functional switch, status and explicit new-purpose CTA',()=>{
 for(const id of ['betaAnalyticsConsent','betaAnalyticsState','betaAnalyticsScopeNotice','betaAnalyticsEnableNotice']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(code,/consent\.addEventListener\('change'/);
 assert.match(code,/persistChoice\(granted\)/);
 assert.match(code,/localStorage\.removeItem\(INSTALL_ID\)/);
 assert.match(code,/deletePending\(\)/);
 assert.match(code,/document\.getElementById\('betaAnalyticsEnableNotice'\)\?\.addEventListener/);
 assert.match(code,/window\.addEventListener\('pageshow',paintConsent\)/);
});
