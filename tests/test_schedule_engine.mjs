import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timeline,dueTransition,latestOfficialEvent,freshEvent} from '../push-server/schedule-engine.js';
const source='https://www.cherkasyoblenergo.com/media/a';
const mk=(knownFrom,off)=>({date:'2026-10-10',verified:true,queues:{'2.1':{knownFrom,off}}});
test('known schedule is ON outside outage intervals; before publication is UNKNOWN',()=>{
 const v=timeline(mk('16:29',[['16:00','18:30'],['23:00','24:00']]),'2.1');
 assert.equal(v[12*60],-1); assert.equal(v[16*60+28],-1);
 assert.equal(v[16*60+29],1);assert.equal(v[18*60+29],1);
 assert.equal(v[18*60+30],0);assert.equal(v[22*60+59],0);assert.equal(v[23*60],1);
});
test('full-day zero outages is known ON, unknown queue never assumes electricity',()=>{
 assert.equal(timeline(mk('00:00',[]),'2.1')[1300],0);
 assert.equal(timeline(mk('24:00',[]),'2.1')[1300],-1);
 assert.equal(timeline(mk('00:00',[]),'6.1'),null);
 assert.equal(timeline({...mk('00:00',[]),verified:false},'2.1'),null);
});
test('bad intervals are rejected and do not yield misleading predictions',()=>{
 assert.equal(timeline(mk('00:00',[['12:00','11:00']]),'2.1'),null);
 assert.equal(timeline(mk('00:00',[['10:00','12:00'],['11:00','13:00']]),'2.1'),null);
 assert.equal(timeline(mk('00:00',[['12:xx','13:00']]),'2.1'),null);
});
test('reminder detects proper OFF/ON boundaries with delay tolerance and never UNKNOWN->ON',()=>{
 const v=timeline(mk('00:00',[['10:00','12:00']]),'2.1');
 assert.equal(dueTransition(v,9*60+30,30,1),10*60);
 assert.equal(dueTransition(v,9*60+33,30,1,4),10*60);
 assert.equal(dueTransition(v,11*60+45,15,0),12*60);
 assert.equal(dueTransition(v,11*60+50,15,0,4),null);
 const partial=timeline(mk('11:00',[]),'2.1');
 assert.equal(dueTransition(partial,10*60+45,15,0),null);
});
test('freshest official cancellation supersedes active notification',()=>{
 const now=Date.parse('2026-10-10T12:00:00Z');
 const events=[
  {id:'a',status:'active',publishedAt:'2026-10-10T11:10:00Z',source},
  {id:'b',status:'ended',publishedAt:'2026-10-10T11:30:00Z',source},
  {id:'c',status:'active',publishedAt:'2026-10-10T11:59:00Z',source:'https://evil.example/media/c'}
 ];
 const e=latestOfficialEvent(events,now);
 assert.equal(e.id,'b');assert.equal(e.status,'ended');assert.equal(freshEvent(e,now),true);
 assert.equal(freshEvent(e,now+70*60000),false);
});
test('omitted queue is on only for explicitly complete verified listing',()=>{
 const complete={date:'2026-10-10',verified:true,complete:true,queues:{'1.1':{knownFrom:'00:00',off:[['14:00','16:00']]}}};
 assert.equal(timeline(complete,'3.2')[700],0);
 assert.equal(timeline({...complete,complete:false},'3.2'),null);
 assert.equal(timeline({...complete,verified:false},'3.2'),null);
});
