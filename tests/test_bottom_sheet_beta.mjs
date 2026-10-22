import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const source=file('bottom-sheet.js');

function createHarness({reduced=false,selector='dialog.sheet',onDismiss=null,desktop=false}={}){
 const callbacks=new Map(),timers=[];
 class MockElement{
  constructor(name){this.name=name;this.scrollTop=name==='scrolled'?100:0;this.clientHeight=100;this.scrollHeight=name==='scrolled'?400:100;this.parentElement=null;}
  closest(query){
   if((this.name==='content'||this.name==='scrolled')&&query.includes('sheet-inner'))return this;
   if(this.name==='handle'&&query.includes('sheet-handle'))return this;
   if(this.name==='button'&&query.includes('button'))return this;
   return null;
  }
 }
 class Sheet{
  constructor(){
   this.open=true;this.clientHeight=500;this.listeners={};
   this.classes=new Set();this.props=new Map();this.css={};
   this.dataset={};
   this.classList={
    add:(...names)=>names.forEach(x=>this.classes.add(x)),
    remove:(...names)=>names.forEach(x=>this.classes.delete(x))
   };
   this.style={
    setProperty:(key,value)=>this.props.set(key,value),
    removeProperty:key=>this.props.delete(key),
    set transform(value){this._transform=value},
    get transform(){return this._transform}
   };
  }
  addEventListener(name,cb){(this.listeners[name]??=[]).push(cb)}
  dispatchEvent(event){
   if(!event.target)event.target=this;
   for(const cb of this.listeners[event.type]||[])cb(event);
   return true;
  }
  contains(){return true}
  matches(pattern){
   if(pattern.includes('.share-preview-dialog'))return selector==='dialog.share-preview-dialog';
   if(pattern.includes('.inbox-detail'))return selector==='dialog.inbox-detail';
   return selector==='dialog.sheet';
  }
  animate(){return {finished:Promise.resolve(),cancel(){}}}
  close(){this.open=false;this.dispatchEvent({type:'close'})}
  hasPointerCapture(){return false}
  setPointerCapture(){}
  releasePointerCapture(){}
 }
 const sheet=new Sheet();
 const document={readyState:'complete',querySelectorAll:()=>selector==='dialog.sheet'?[sheet]:[],documentElement:{classList:{contains:()=>false}}};
 const window={matchMedia:query=>({matches:query.includes('min-width')?desktop:reduced})};
 const context={document,window,Element:MockElement,Event:class{constructor(type){this.type=type;this.cancelable=true}preventDefault(){this.defaultPrevented=true}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout:()=>{},console};
 vm.runInNewContext(source,context,{filename:'bottom-sheet.js'});
 if(selector!=='dialog.sheet')window.SvitloSheetMotion.bind(sheet,onDismiss);
 return {sheet,window,timers,MockElement,pointer:(type,y,x=0,time=0,name='handle')=>{
  const event={type,target:new MockElement(name),isPrimary:true,button:0,pointerId:1,
   clientY:y,clientX:x,timeStamp:time,cancelable:true,pointerType:'mouse',preventDefault(){}};
  sheet.dispatchEvent(event);
 }};
}
test('close action and backdrop wait for matched exit animation',()=>{
 const h=createHarness();
 assert.equal(h.window.SvitloSheetMotion.dismiss(h.sheet),true);
 assert.equal(h.sheet.open,true);
 assert.equal(h.sheet.classes.has('svitlo-sheet-closing'),true);
 assert.equal(h.timers[0].ms,215);
 h.timers[0].fn();
 assert.equal(h.sheet.open,false);
});
test('touch drag below threshold springs back without dismissing',()=>{
 const h=createHarness();
 h.pointer('pointerdown',120,20,0);
 h.pointer('pointermove',175,20,100);
 h.pointer('pointerup',175,20,140);
 assert.equal(h.sheet.open,true);
 assert.equal(h.timers.length,0);
});
test('quick swipe from the handle dismisses the native sheet',()=>{
 const h=createHarness();
 h.pointer('pointerdown',90,20,0);
 h.pointer('pointermove',230,20,140);
 h.pointer('pointerup',230,20,170);
 assert.equal(h.sheet.classes.has('svitlo-sheet-closing'),true);
 h.timers[0].fn();
 assert.equal(h.sheet.open,false);
});
test('interactive buttons never start a drag',()=>{
 const h=createHarness();
 h.pointer('pointerdown',120,20,0,'button');
 h.pointer('pointermove',280,20,140,'button');
 h.pointer('pointerup',280,20,170,'button');
 assert.equal(h.sheet.open,true);
 assert.equal(h.timers.length,0);
});
test('external preview owns cleanup while the gesture delegates dismissal',()=>{
 let called=0;
 const h=createHarness({selector:'dialog.share-preview-dialog',onDismiss:()=>{called++}});
 h.pointer('pointerdown',90,20,0);
 h.pointer('pointermove',230,20,140);
 h.pointer('pointerup',230,20,180);
 assert.equal(called,1);
 assert.equal(h.sheet.props.get('--sheet-exit-from'),'140px');
});
test('reduced motion closes immediately',()=>{
 const h=createHarness({reduced:true});
 h.window.SvitloSheetMotion.dismiss(h.sheet);
 assert.equal(h.sheet.open,false);
 assert.equal(h.timers.length,0);
});
test('iPhone touch gesture follows finger and closes quickly',()=>{
 const h=createHarness(),target=new h.MockElement('handle');
 const evt=(type,y,time)=>({
  type,target,timeStamp:time,touches:type==='touchstart'?[{identifier:2,clientX:20,clientY:y}]:[],
  changedTouches:[{identifier:2,clientX:20,clientY:y}],
  cancelable:true,preventDefault(){this.prevented=true}
 });
 h.sheet.dispatchEvent(evt('touchstart',100,0));
 const move=evt('touchmove',190,90);
 h.sheet.dispatchEvent(move);
 assert.equal(move.prevented,true);
 assert.match(h.sheet.style.transform,/90px/);
 assert.equal(h.sheet.classes.has('svitlo-sheet-dragging'),true);
 h.sheet.dispatchEvent(evt('touchend',240,110));
 assert.equal(h.sheet.classes.has('svitlo-sheet-closing'),true);
 assert.equal(h.timers.length,1);
 h.timers[0].fn();assert.equal(h.sheet.open,false);
});
test('short iOS drag snaps back without restarting its entry animation',()=>{
 const h=createHarness(),target=new h.MockElement('handle');
 const ev=(type,y,time)=>({
  type,target,timeStamp:time,touches:type==='touchstart'?[{identifier:1,clientX:20,clientY:y}]:[],
  changedTouches:[{identifier:1,clientX:20,clientY:y}],
  cancelable:true,preventDefault(){}
 });
 h.sheet.dispatchEvent(ev('touchstart',100,0));
 h.sheet.dispatchEvent(ev('touchmove',131,180));
 h.sheet.dispatchEvent(ev('touchend',131,220));
 assert.equal(h.sheet.classes.has('svitlo-sheet-settled'),true);
 assert.equal(h.sheet.classes.has('svitlo-sheet-snapping'),true);
 assert.equal(h.sheet.open,true);
});
test('downward swipe works from ordinary sheet content at scroll top',()=>{
 const h=createHarness();
 h.pointer('pointerdown',75,14,0,'content');
 h.pointer('pointermove',189,14,110,'content');
 assert.match(h.sheet.style.transform,/114px/);
 h.pointer('pointerup',189,14,135,'content');
 assert.equal(h.sheet.classes.has('svitlo-sheet-closing'),true);
});
test('scrollable content does not drag when the reader is scrolled down',()=>{
 const h=createHarness();
 h.pointer('pointerdown',75,14,0,'scrolled');
 h.pointer('pointermove',240,14,160,'scrolled');
 h.pointer('pointerup',240,14,180,'scrolled');
 assert.equal(h.sheet.open,true);
 assert.equal(h.timers.length,0);
});
test('installed beta includes gesture assets and reader header',()=>{
 assert.match(file('index.html'),/src="\.\/bottom-sheet\.js"/);
 assert.match(file('scripts/build_pages.py'),/'bottom-sheet\.js'/);
 assert.match(file('sw.js'),/"\.\/bottom-sheet\.js"/);
 assert.match(file('app.js'),/SvitloSheetMotion\?\.dismiss\(dialog\)/);
 assert.match(file('inbox-ui.js'),/SvitloSheetMotion\?\.bind\(dialog,\(\)=>closeDetail\(\)\)/);
 assert.match(file('motion.css'),/svitloBottomSheetLeave/);
 assert.match(file('motion.css'),/prefers-reduced-motion:reduce/);
});
