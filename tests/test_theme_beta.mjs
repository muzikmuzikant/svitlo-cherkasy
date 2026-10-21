import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function boot(saved=null,systemDark=false){
 const storage=new Map(saved?[['svitlo-appearance-v1',saved]]:[]);
 const root={dataset:{},style:{}};
 const input=['light','dark','system'].map(value=>({value,checked:false,listener:null,addEventListener(_name,cb){this.listener=cb}}));
 const meta={value:'#f6f8fc',setAttribute(_key,value){this.value=value}};
 const summary={textContent:''};
 const media={matches:systemDark,listener:null,addEventListener(_name,cb){this.listener=cb}};
 let ready;
 const doc={documentElement:root,querySelector:()=>meta,querySelectorAll:()=>input,getElementById:()=>summary,addEventListener(_name,cb){ready=cb}};
 const events=[];
 const win={matchMedia:()=>media,dispatchEvent:event=>events.push(event.detail)};
 runInNewContext(file('theme.js'),{window:win,document:doc,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail}}});
 ready();
 return {root,input,media,meta,summary,storage,events,api:win.SvitloTheme};
}
test('new installations follow the phone and change live',()=>{
 const x=boot(null,false);assert.equal(x.api.get(),'system');assert.equal(x.root.dataset.theme,'light');
 x.media.matches=true;x.media.listener();
 assert.equal(x.root.dataset.theme,'dark');assert.equal(x.meta.value,'#090b0f');
 assert.equal(x.events.at(-1).theme,'dark');
 x.media.matches=false;x.media.listener();
 assert.equal(x.root.dataset.theme,'light');
 assert.equal(x.events.at(-1).theme,'light');
});
test('explicit theme persists and ignores iOS appearance changes',()=>{
 const x=boot('dark',false);assert.equal(x.root.dataset.theme,'dark');
 x.media.matches=true;x.media.listener();assert.equal(x.root.dataset.theme,'dark');
 x.api.set('light');assert.equal(x.storage.get('svitlo-appearance-v1'),'light');assert.equal(x.root.dataset.theme,'light');
 x.media.matches=true;x.media.listener();assert.equal(x.root.dataset.theme,'light');
 x.input[2].checked=true;x.input[2].listener();assert.equal(x.api.get(),'system');assert.equal(x.root.dataset.theme,'dark');
});
test('invalid or unavailable preference falls back to system',()=>{
 const x=boot('unexpected',true);assert.equal(x.api.get(),'system');assert.equal(x.root.dataset.theme,'dark');
});
test('minute-accurate hour paint retains boundaries with new palette',()=>{
 const {paintHour}=require('../hour-paint.js');
 const timeline=new Array(1440).fill(0);
 for(let m=19*60+30;m<20*60;m++)timeline[m]=1;
 const light=paintHour(timeline,19),dark=paintHour(timeline,19,'dark');
 assert.equal(light.kind,'mixed');assert.deepEqual(dark.parts,light.parts);
 assert.match(dark.background,/50\.0000%/);
 assert.match(dark.background,/#295941/);
 assert.match(dark.background,/#172535/);
 assert.notEqual(dark.background,light.background);
});
test('settings, shared pages and offline shell ship appearance files',()=>{
 const html=file('index.html'),css=file('theme.css'),sw=file('sw.js'),build=file('scripts/build_pages.py');
 for(const f of ['theme.js','theme.css']){
  assert.ok(html.includes('./'+f));assert.ok(sw.includes('./'+f));assert.ok(build.includes("'"+f+"'"));
 }
 assert.ok(sw.includes("'./theme.js','./theme.css'"));
 assert.ok(html.indexOf('theme.js')<html.indexOf('style.css'));
 for(const value of ['light','dark','system'])assert.ok(html.includes('name="appearanceTheme" value="'+value+'"'));
 for(const page of ['help.html','feedback.html','privacy.html','terms.html','about.html','advertising.html','support-project.html','ad-detail.html']) {
  const p=file(page);assert.ok(p.includes('./theme.js')&&p.includes('./theme.css'),page);
 }
 for(const selector of ['.hour-ink-on','.bottom-nav','.inbox-detail','.support-card','.sheet'])assert.ok(css.includes(selector));
});
