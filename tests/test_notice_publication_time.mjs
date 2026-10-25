import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAppConfig} from '../push-server/app-config.js';
const directory=mkdtempSync(path.join(tmpdir(),'notice-time-'));
try {
 const app=createAppConfig({directory});
 const config=app.get();
 config.announcements=[{id:'notice_time_test',title:'Перевірка часу',body:'Текст',
   content:'Текст',kind:'info',priority:'normal',queue:'all',delivery:'inbox',
   active:false,publishedAt:'2026-10-24T20:00:00.000Z'}];
 app.update(config);
 const draft=app.get();draft.announcements[0].active=true;
 const published=app.update(draft);
 assert.ok(Math.abs(Date.parse(published.announcements[0].publishedAt)-Date.now())<5000);
 const revised=app.get();revised.announcements[0].body='Інший текст';
 assert.equal(app.update(revised).announcements[0].publishedAt,published.announcements[0].publishedAt);
 const corrected=app.get();corrected.announcements[0].publishedAt='2026-10-25T08:00:00.000Z';
 assert.equal(app.update(corrected).announcements[0].publishedAt,'2026-10-25T08:00:00.000Z');
 const unpublished=app.get();unpublished.announcements[0].active=false;app.update(unpublished);
 const scheduled=app.get();scheduled.announcements[0].active=true;
 scheduled.announcements[0].scheduledAt='2030-10-25T08:00:00.000Z';
 assert.equal(app.update(scheduled).announcements[0].publishedAt,'2030-10-25T08:00:00.000Z');
 console.log('Notice publication timestamps OK');
} finally {rmSync(directory,{force:true,recursive:true})}
