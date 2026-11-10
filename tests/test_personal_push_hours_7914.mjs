import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAllowedHours,notificationAllowed} from '../push-server/schedule-engine.js';

const configured={
 enabled:true,
 weekdays:{enabled:true,from:'08:00',to:'18:00'},
 weekends:{enabled:false,from:'09:00',to:'13:00'}
};

test('disabled personal hours preserve the existing all-day Push behavior',()=>{
 assert.equal(notificationAllowed(null,'2026-11-10',0),true);
 assert.equal(notificationAllowed({...configured,enabled:false},'2026-11-10',1439),true);
});

test('weekday windows use Kyiv local minutes and include the start but exclude the end',()=>{
 assert.equal(notificationAllowed(configured,'2026-11-10',479),false);
 assert.equal(notificationAllowed(configured,'2026-11-10',480),true);
 assert.equal(notificationAllowed(configured,'2026-11-10',1079),true);
 assert.equal(notificationAllowed(configured,'2026-11-10',1080),false);
});

test('disabled weekend restriction leaves Saturday and Sunday available all day',()=>{
 assert.equal(notificationAllowed(configured,'2026-11-14',5),true);
 assert.equal(notificationAllowed(configured,'2026-11-15',1430),true);
});

test('overnight windows correctly span midnight',()=>{
 const hours={enabled:true,weekdays:{enabled:true,from:'22:00',to:'06:00'},weekends:{enabled:false,from:'08:00',to:'20:00'}};
 assert.equal(notificationAllowed(hours,'2026-11-10',1380),true);
 assert.equal(notificationAllowed(hours,'2026-11-10',300),true);
 assert.equal(notificationAllowed(hours,'2026-11-10',360),false);
 assert.equal(notificationAllowed(hours,'2026-11-10',720),false);
});

test('invalid and zero-length periods are rejected rather than silently widening delivery',()=>{
 assert.throws(()=>normalizeAllowedHours({enabled:true,weekdays:{enabled:true,from:'08:00',to:'08:00'},weekends:{enabled:false,from:'08:00',to:'20:00'}}));
 assert.throws(()=>normalizeAllowedHours({enabled:true,weekdays:{enabled:true,from:'25:00',to:'08:00'},weekends:{enabled:false,from:'08:00',to:'20:00'}}));
 assert.throws(()=>normalizeAllowedHours([]));
});

const perDay = {
 enabled:true,
 days:[
  {day:0,enabled:false,windows:[]},
  {day:1,enabled:true,windows:[{from:'08:00',to:'12:00'},{from:'14:00',to:'18:00'}]},
  {day:2,enabled:true,windows:[{from:'08:00',to:'18:00'}]},
  {day:3,enabled:true,windows:[{from:'08:00',to:'18:00'}]},
  {day:4,enabled:true,windows:[{from:'08:00',to:'18:00'}]},
  {day:5,enabled:true,windows:[{from:'08:00',to:'18:00'}]},
  {day:6,enabled:false,windows:[]}
 ]
};

test('per-day settings support split weekday windows and all-day weekends',()=>{
 assert.equal(notificationAllowed(perDay,'2026-11-09',479),false);
 assert.equal(notificationAllowed(perDay,'2026-11-09',480),true);
 assert.equal(notificationAllowed(perDay,'2026-11-09',719),true);
 assert.equal(notificationAllowed(perDay,'2026-11-09',720),false);
 assert.equal(notificationAllowed(perDay,'2026-11-09',840),true);
 assert.equal(notificationAllowed(perDay,'2026-11-09',1080),false);
 assert.equal(notificationAllowed(perDay,'2026-11-14',0),true);
 assert.equal(notificationAllowed(perDay,'2026-11-15',1439),true);
});

test('per-day settings reject duplicate days, empty restricted days and more than two windows',()=>{
 assert.throws(()=>normalizeAllowedHours({enabled:true,days:[
  {day:1,enabled:true,windows:[{from:'08:00',to:'18:00'}]},
  {day:1,enabled:false,windows:[]}
 ]}));
 assert.throws(()=>normalizeAllowedHours({enabled:true,days:[{day:1,enabled:true,windows:[]}]}));
 assert.throws(()=>normalizeAllowedHours({enabled:true,days:[{day:1,enabled:true,windows:[
  {from:'08:00',to:'10:00'},{from:'11:00',to:'13:00'},{from:'14:00',to:'18:00'}
 ]}]}));
});
