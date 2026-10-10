import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createOriginPolicy} from '../push-server/origins.js';
const root=path.resolve(import.meta.dirname,'..');
test('allows only explicitly selected HTTPS domains',()=>{
 const origins=createOriginPolicy('https://muzikmuzikant.github.io','https://svitlo-cherkasy.pp.ua');
 assert.ok(origins.isAllowed('https://muzikmuzikant.github.io'));
 assert.ok(origins.isAllowed('https://svitlo-cherkasy.pp.ua'));
 assert.ok(!origins.isAllowed('https://example.net'));
 assert.ok(!origins.isAllowed('http://muzikmuzikant.github.io'));
 assert.throws(()=>createOriginPolicy('https://example.com/path'),/without paths/);
});
test('feedback and privacy always render a light theme',()=>{
 for(const page of ['feedback.html','privacy.html']){
  const text=fs.readFileSync(path.join(root,page),'utf8');
  assert.ok(!text.includes('prefers-color-scheme:dark'));
  assert.ok(text.includes('name="color-scheme" content="light"'));
 }
});
test('favicon links and favicon files exist',()=>{
 for(const page of ['index.html','admin.html','feedback.html','privacy.html','about.html']){
  assert.ok(fs.readFileSync(path.join(root,page),'utf8').includes('favicon-32.png?v=692'));
 }
 for(const file of ['favicon.ico','favicon-16.png','favicon-32.png','favicon-48.png'])assert.ok(fs.existsSync(path.join(root,file)));
});
