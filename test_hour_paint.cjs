const assert=require('node:assert/strict');
const {paintHour}=require('../hour-paint.js');
function t(s,e){const a=new Int8Array(1440);a.fill(0);a.fill(1,s,e);return a}
const late=t(19*60+30,21*60); // light 19:00–19:30, off 19:30–20:00
const a=paintHour(late,19);
assert.equal(a.kind,'mixed');
assert.deepEqual(a.parts,[{start:0,end:30,state:0},{start:30,end:60,state:1}]);
assert.ok(a.background.indexOf('#f7fafc') < a.background.indexOf('#29384f'));
const early=t(18*60,19*60+30); // off 19:00–19:30, light after 19:30
const b=paintHour(early,19);
assert.deepEqual(b.parts,[{start:0,end:30,state:1},{start:30,end:60,state:0}]);
assert.ok(b.background.indexOf('#29384f') < b.background.indexOf('#f7fafc'));
const whole=paintHour(t(19*60,20*60),19);
assert.equal(whole.kind,'off');
assert.equal(paintHour(t(19*60+30,20*60),18).kind,'on');
const unknown=new Int8Array(1440);unknown.fill(-1);assert.equal(paintHour(unknown,19).kind,'unknown');
const offAtLastMinute=t(19*60+59,20*60);assert.deepEqual(paintHour(offAtLastMinute,19).parts,[{start:0,end:59,state:0},{start:59,end:60,state:1}]);
assert.ok(a.onMask.includes('transparent 50.0000%') || a.onMask.includes('transparent 100.0000%'));
assert.ok(a.offMask.includes('#000 50.0000%'));
assert.ok(b.onMask.includes('#000 50.0000%'));
assert.ok(b.offMask.includes('#000 0.0000%'));
console.log('Half-hour tests passed: colors, masks, two directions, whole hour, single minute and unknown');
