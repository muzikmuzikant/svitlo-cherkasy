const {test}=require('node:test');const assert=require('node:assert/strict');
const {slotsFromOff,intervals,tick,fullDay}=require('../schedule-planner.js');
test('30 minute grid reconstructs outages including 24:00',()=>{
 const source=[['01:30','03:00'],['23:00','24:00']];const cells=slotsFromOff(source);
 assert.equal(cells.length,48);assert.equal(cells.filter(Boolean).length,5);
 assert.deepEqual(intervals(cells),source);assert.equal(tick(48),'24:00');
});
test('empty grid indicates zero planned outages and not an electricity guarantee',()=>{
 assert.deepEqual(intervals(Array(48).fill(false)),[]);
});
test('reject impossible or overlapping intervals',()=>{
 assert.throws(()=>slotsFromOff([['12:00','11:30']]));
 assert.throws(()=>slotsFromOff([['10:00','11:30'],['11:00','12:00']]));
 assert.throws(()=>slotsFromOff([['13:15','14:00']]));
});
test('only fully verified day permits omitted queue inference',()=>{
 assert.equal(fullDay({verified:true,complete:true,queues:{'1.1':{off:[]}}}),true);
 assert.equal(fullDay({verified:true,queues:{'1.1':{off:[]}}}),false);
 assert.equal(fullDay({verified:false,complete:true}),false);
});
