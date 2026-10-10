import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const file = new URL('../version-check.js', import.meta.url);
const js = readFileSync(file,'utf8');
function fakeApp({ current='6.7.0', latest='6.8.0', online=true }={}) {
  const elements = new Map();
  const events = new Map();
  const storage = new Map();
  const session = new Map();
  let reloads=0, updates=0, workerMessages=[];
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {hidden:true,textContent:'',disabled:false,
        handlers:{},addEventListener(ev,cb){this.handlers[ev]=cb;},
        click(){return this.handlers.click?.();}});
    }
    return elements.get(id);
  }
  const document = {
    baseURI:'https://svitlo-cherkasy.pp.ua/',
    hidden:false,readyState:'complete',
    querySelector(){return {content:current}},
    getElementById:element,
    addEventListener(ev,cb){events.set('doc:'+ev,cb)}
  };
  const window = {
    setInterval(){},
    addEventListener(ev,cb){events.set('win:'+ev,cb)},
    location:{reload(){reloads++}}
  };
  const navigator={onLine:online, serviceWorker:{
    async getRegistration(){return {update:async()=>{updates++},waiting:{postMessage:m=>workerMessages.push(m)}}}
  }};
  const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
  const sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v)};
  let fetches=0;
  const fetch=async(url, options)=>{
    fetches++;
    assert.equal(options.cache,'no-store');
    assert.equal(new URL(url).pathname,'/release.json');
    return {ok:true,json:async()=>({version:latest,description:'Нові можливості'})};
  };
  vm.runInNewContext(js,{document,window,navigator,localStorage,sessionStorage,fetch,console,URL,Date,setTimeout,clearTimeout});
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {element,events,settle,storage,session,get reloads(){return reloads},get updates(){return updates},get messages(){return workerMessages},get fetches(){return fetches}};
}
test('new release is detected in opened PWA without forcing reload',async()=>{
  const app=fakeApp(); await app.settle();
  assert.equal(app.element('appUpdateBanner').hidden,false);
  assert.match(app.element('appUpdateTitle').textContent,/6\.8\.0/);
  assert.equal(app.reloads,0);
});
test('apply refreshes worker and reloads without deleting user storage',async()=>{
  const app=fakeApp(); await app.settle();
  await app.element('appUpdateAction').click();
  assert.equal(app.updates,1);
  assert.equal(app.messages[0].type,'SKIP_WAITING');
  assert.equal(app.reloads,1);
  assert.equal(app.storage.get('svitlo-last-app-release'),'6.7.0');
});
test('same version is quiet and manual check confirms up-to-date',async()=>{
  const app=fakeApp({latest:'6.7.0'}); await app.settle();
  assert.equal(app.element('appUpdateBanner').hidden,true);
  await app.element('checkAppUpdate').click();
  assert.match(app.element('toast').textContent,/остання версія/);
});
test('dismiss hides only until manual recheck',async()=>{
  const app=fakeApp(); await app.settle();
  await app.element('appUpdateDismiss').click();
  assert.equal(app.element('appUpdateBanner').hidden,true);
  await app.element('checkAppUpdate').click();
  assert.equal(app.element('appUpdateBanner').hidden,false);
});
test('no network does not imply a new version',async()=>{
  const app=fakeApp({online:false}); await app.settle();
  assert.equal(app.fetches,0);
  assert.equal(app.element('appUpdateBanner').hidden,true);
  await app.element('checkAppUpdate').click();
  assert.match(app.element('toast').textContent,/Немає інтернету/);
});
