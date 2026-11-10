import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeQuietHours,isQuietForRecord} from '../push-server/quiet-hours.js';
test('quiet hours normalize, sort and preserve two daily intervals',()=>{
 const value=normalizeQuietHours([{day:1,slot:1,start:'16:00',end:'18:00'},{day:1,slot:0,start:'08:00',end:'12:00'}]);
 assert.deepEqual(value.map(x=>x.start),['08:00','16:00']);
});
test('quiet hours reject invalid, duplicate and overnight ranges',()=>{
 for(const value of [[{day:7,slot:0,start:'08:00',end:'18:00'}],[{day:1,slot:0,start:'18:00',end:'08:00'}],[{day:1,slot:0,start:'08:00',end:'09:00'},{day:1,slot:0,start:'10:00',end:'11:00'}]])assert.throws(()=>normalizeQuietHours(value));
});
test('quiet period follows Kyiv weekday and excludes the end minute',()=>{
 const record={quietHours:[{day:1,start:'08:00',end:'18:00'}]};
 assert.equal(isQuietForRecord(record,'2026-11-09',480),true);
 assert.equal(isQuietForRecord(record,'2026-11-09',1079),true);
 assert.equal(isQuietForRecord(record,'2026-11-09',1080),false);
 assert.equal(isQuietForRecord(record,'2026-11-10',600),false);
});
test('all-day quiet periods include the final minute of the selected weekday',()=>{
 const rules=normalizeQuietHours([{day:0,slot:0,start:'00:00',end:'24:00'}]);
 assert.equal(isQuietForRecord({quietHours:rules},'2026-11-08',0),true);
 assert.equal(isQuietForRecord({quietHours:rules},'2026-11-08',1439),true);
 assert.equal(isQuietForRecord({quietHours:rules},'2026-11-09',600),false);
});
