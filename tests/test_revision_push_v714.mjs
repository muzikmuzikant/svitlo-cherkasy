import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const frontend=readFileSync(join(root,'app.js'),'utf8');
const server=readFileSync(join(root,'push-server/server.js'),'utf8');
test('same-minute new revision is announced in the PWA',()=>{
 assert.match(frontend,/x\.revisionId\|\|x\.publishedAt/);
 assert.match(frontend,/c\.revisionId\|\|c\.publishedAt/);
});
test('push server uses detected time and a revision identity for repeated corrections',()=>{
 assert.match(server,/change\.detectedAt\|\|change\.publishedAt/);
 assert.match(server,/change\.revisionId\|\|change\.publishedAt/);
});
