import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLegalStore} from '../push-server/legal-store.js';
test('legal documents: revision metadata persists and is versioned',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-legal-'));
 try{
  let s=createLegalStore({directory:dir});
  assert.equal(s.publicState().termsVersion,'1');
  s.update({termsVersion:'2',privacyVersion:'4',summary:'Пояснення оновлень',requireAcknowledgement:true});
  s=createLegalStore({directory:dir});
  assert.equal(s.publicState().termsVersion,'2');
  assert.equal(s.publicState().privacyVersion,'4');
  assert.equal(s.publicState().summary,'Пояснення оновлень');
  assert.equal(s.publicState().requireAcknowledgement,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});