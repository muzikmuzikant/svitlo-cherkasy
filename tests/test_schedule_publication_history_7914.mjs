import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildScheduleHistory} from '../push-server/schedule-publication.js';

const before={date:'2026-11-10',verified:true,publishedAt:'2026-11-09T18:00:00+02:00',source:'https://www.cherkasyoblenergo.com/media/old',queues:{
 '1.1':{knownFrom:'00:00',off:[['10:00','12:00']]},
 '1.2':{knownFrom:'00:00',off:[['14:00','16:00']]}
}};
const after={...before,publishedAt:'2026-11-10T08:00:00+02:00',source:'https://www.cherkasyoblenergo.com/media/new',planFingerprint:'new-revision',queues:{
 '1.1':{knownFrom:'00:00',off:[['11:00','13:00']]},
 '1.2':{knownFrom:'00:00',off:[['14:00','16:00']]}
}};

test('history records exact before and after intervals only for changed subqueues',()=>{
 const result=buildScheduleHistory({days:[before],history:[]},{days:[after],lastChecked:'2026-11-10T08:05:00+02:00'},'2026-11-10T08:05:00+02:00');
 assert.equal(result.length,1);
 assert.deepEqual(result[0].queues,['1.1']);
 assert.deepEqual(result[0].changes['1.1'].before.off,[['10:00','12:00']]);
 assert.deepEqual(result[0].changes['1.1'].after.off,[['11:00','13:00']]);
 assert.equal(result[0].date,'2026-11-10');
});

test('unchanged publications do not create fake history entries and prior history is retained',()=>{
 const old={id:'previous',date:'2026-11-09',queues:['2.1'],changes:{}};
 const result=buildScheduleHistory({days:[before],history:[old]},{days:[{...before}]},'2026-11-10T08:05:00+02:00');
 assert.equal(result.length,1);
 assert.equal(result[0].id,'previous');
});

test('new schedule publication history is capped at forty entries',()=>{
 const history=Array.from({length:50},(_,i)=>({id:'h'+i,date:'2026-11-01',detectedAt:'2026-11-10T08:00:00Z'}));
 const result=buildScheduleHistory({days:[],history},{days:[]});
 assert.equal(result.length,40);
});
