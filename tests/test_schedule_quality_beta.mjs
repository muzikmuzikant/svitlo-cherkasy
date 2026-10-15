import test from 'node:test';import assert from 'node:assert/strict';
import {auditSchedule} from '../push-server/schedule-quality.js';
const base={lastChecked:'2026-10-15T12:00:00Z',days:[{date:'2026-10-15',verified:true,source:'https://www.cherkasyoblenergo.com/news',queues:{'1.1':{off:[['19:30','20:00']]}}}]};
test('schedule QA: accepts correct 30-minute intervals',()=>{const r=auditSchedule(base,Date.parse('2026-10-15T12:30:00Z'));assert.equal(r.ok,true);assert.equal(r.issues.length,0)});
test('schedule QA: rejects interval overlaps and unrecognized queues',()=>{const doc=structuredClone(base);doc.days[0].queues['1.1'].off.push(['19:00','20:30']);doc.days[0].queues['7.9']={off:[['01:00','02:00']]};const r=auditSchedule(doc,Date.parse('2026-10-15T12:30:00Z'));assert.equal(r.ok,false);assert.ok(r.issues.some(x=>x.message.includes('Перетин')));assert.ok(r.issues.some(x=>x.message.includes('Невідома')))});
