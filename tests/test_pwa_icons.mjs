import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base=path.resolve(import.meta.dirname,'..');
test('all public HTML pages use exactly one canonical iPhone icon',()=>{
 for(const file of ['index.html','about.html','admin.html','privacy.html','feedback.html','help.html']){
  const html=fs.readFileSync(path.join(base,file),'utf8');
  assert.equal((html.match(/rel="apple-touch-icon"/g)||[]).length,1,file);
  assert.match(html,/href="\.\/apple-touch-icon-v692\.png"/);
 }
 assert.ok(fs.existsSync(path.join(base,'apple-touch-icon.png')));
 assert.ok(fs.existsSync(path.join(base,'apple-touch-icon-v692.png')));
});
test('manifest and service worker point to existing fixed logo assets',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.webmanifest'),'utf8'));
 for(const icon of manifest.icons){
  assert.match(icon.src,/v692\.png$/);
  assert.ok(fs.existsSync(path.join(base,icon.src)),icon.src);
 }
 const sw=fs.readFileSync(path.join(base,'sw.js'),'utf8');
 assert.match(sw,/apple-touch-icon-v692\.png/);
 const release=JSON.parse(fs.readFileSync(path.join(base,'release.json'),'utf8'));
 assert.ok(sw.includes('svitlo-cherkasy-shell-v'+release.version));
});
