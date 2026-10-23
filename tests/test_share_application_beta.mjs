import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app.js'),html=read('index.html'),style=read('style.css');
const begin=app.indexOf("const APP_SHARE_URL='https://svitlo-cherkasy.pp.ua/';");
const end=app.indexOf('\nfunction shareDescription(date){',begin);
assert.ok(begin>=0&&end>begin,'Standalone app sharing action exists');
const shareCode=app.slice(begin,end);

function fixture({native,clipboard=true,legacy=false,prompt=true}={}){
 const shares=[],copies=[],messages=[],prompts=[];
 let field=null;
 const navigator={
  clipboard:clipboard?{writeText:async text=>{copies.push(text)}}:null
 };
 if(native)navigator.share=async payload=>{
  shares.push(JSON.parse(JSON.stringify(payload)));
  if(native instanceof Error)throw native;
 };
 const document={
  createElement:()=>field={
   value:'',style:{cssText:''},setAttribute(){},focus(){},select(){},remove(){}
  },
  body:{append(element){field=element}},
  execCommand:()=>legacy
 };
 const ctx={navigator,document,window:{prompt:(...args)=>{
  if(prompt)prompts.push(args)
 }},console:{warn(){}},flash:s=>messages.push(s)};
 vm.createContext(ctx);
 vm.runInContext(shareCode+'\nthis.shareApplication=shareApplication;',ctx);
 return {run:()=>ctx.shareApplication(),shares,copies,messages,prompts};
}

test('Options provides a dedicated action to share the whole application',()=>{
 assert.match(html,/id="shareApp" type="button"/);
 assert.match(html,/Поділитися застосунком/);
 assert.match(html,/id="shareAppHint"/);
 assert.match(app,/\$\('shareApp'\)\?\.addEventListener\('click',shareApplication\)/);
 assert.match(style,/\.share-app-action:focus-visible/);
 assert.match(style,/:root\[data-theme="dark"\]/);
});
test('native iOS share sheet receives public production URL, not a schedule or beta link',async()=>{
 const h=fixture({native:true});await h.run();
 assert.equal(h.shares.length,1);
 assert.equal(h.shares[0].title,'Світло Черкаси');
 assert.equal(h.shares[0].url,'https://svitlo-cherkasy.pp.ua/');
 assert.ok(!JSON.stringify(h.shares[0]).includes('queue'));
 assert.deepEqual(h.copies,[]);
});
test('lack of Web Share API copies the production PWA address',async()=>{
 const h=fixture();await h.run();
 assert.deepEqual(h.copies,['https://svitlo-cherkasy.pp.ua/']);
 assert.ok(h.messages.some(x=>x.includes('скопійовано')));
});
test('cancelled native share does not show another dialog or copy automatically',async()=>{
 const abort=Object.assign(new Error('Cancelled'),{name:'AbortError'});
 const h=fixture({native:abort});await h.run();
 assert.equal(h.shares.length,1);
 assert.deepEqual(h.copies,[]);
 assert.deepEqual(h.prompts,[]);
});
test('native share errors fall back to copying; older browsers support manual copy',async()=>{
 const native=fixture({native:new Error('Not supported')});await native.run();
 assert.deepEqual(native.copies,['https://svitlo-cherkasy.pp.ua/']);
 const legacy=fixture({clipboard:false,legacy:true});await legacy.run();
 assert.ok(legacy.messages.some(x=>x.includes('скопійовано')));
});
test('when clipboard is restricted, show the share URL without losing it',async()=>{
 const h=fixture({clipboard:false,legacy:false});await h.run();
 assert.equal(h.prompts[0]?.[1],'https://svitlo-cherkasy.pp.ua/');
});
