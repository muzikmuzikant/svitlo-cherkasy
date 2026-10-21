import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=n=>fs.readFileSync(new URL('../'+n,import.meta.url),'utf8');
test('UI exposes draft + explicit approval controls, without public raw JSON editing',()=>{
 const html=read('admin.html'),code=read('admin-address.js');
 for(const id of ['corrTown','corrStreet','corrHouse','corrQueue','corrSource','corrPublish','corrProof','corrList'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(code,/confirmSourceReviewed=true/);
 assert.match(code,/address-corrections/);
 assert.match(code,/svitlo:admin-ready/);
});
test('PWA reads scoped Railway corrections and merges them AFTER official index',()=>{
 const app=read('app.js'),server=read('push-server/server.js'),api=read('push-server/admin.js');
 assert.match(app,/RAILWAY_ADDRESS_CACHE/);
 assert.match(app,/api\/address-corrections/);
 assert.match(app,/mergeIndexes\(index,railwayAddressCorrections,\{manual:true\}\)/);
 assert.match(server,/addressCorrections\.published\(\)/);
 assert.match(read('push-server/address-corrections.js'),/confirmSourceReviewed/);
 assert.match(api,/address-corrections/);
});
