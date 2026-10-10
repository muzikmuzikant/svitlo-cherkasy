import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('user support links, standalone page and form are present',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const contact=fs.readFileSync(path.join(root,'feedback.html'),'utf8');
 assert.match(html,/Опції/);assert.match(html,/href="\.\/feedback\.html"/);
 for(const key of ['id="topic"','id="message"','id="email"','id="send"'])assert.ok(contact.includes(key));
});
test('pages publish contains feedback assets but no feedback records or server code',()=>{
 const site=path.join(root,'_site');
 assert.ok(fs.existsSync(path.join(site,'feedback.html')));
 assert.ok(fs.existsSync(path.join(site,'feedback.js')));
 for(const key of ['push-server','feedback.json','subscribers.json'])assert.ok(!fs.existsSync(path.join(site,key)));
});
test('preflight permits admin status and deletion requests',()=>{
 const srv=fs.readFileSync(path.join(root,'push-server/server.js'),'utf8');
 assert.match(srv,/POST, OPTIONS, GET, PUT, PATCH, DELETE/);
});
