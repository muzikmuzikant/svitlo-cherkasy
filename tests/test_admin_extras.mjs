import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAdminExtras,validateHelp} from '../push-server/admin-extras.js';
test('help updates persisted in private volume; public help contains no secrets',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-help-'));
 try{
  const store=createAdminExtras({directory:tmp});assert.ok(store.getHelp().articles.length>3);
  const initial=store.getHelp().articles;
  store.updateHelp({articles:initial,banner:{enabled:true,title:'Оновлення графіків',message:'Дані перевіряються, зачекайте на підтвердження.'}});
  const newStore=createAdminExtras({directory:tmp});
  assert.equal(newStore.getHelp().banner.enabled,true);
  assert.equal(newStore.getAudit()[0].action,'help.updated');
  assert.equal(JSON.stringify(newStore.getHelp()).includes('PUSH_PRIVATE_KEY'),false);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('duplicate ID and oversize help entries rejected',()=>{
 const a={id:'faq-one',category:'Графіки',question:'Чому графік змінився?',answer:'Можуть бути зміни публікацій з боку оператора.'};
 assert.throws(()=>validateHelp({articles:[a,a]}),/ID/);
 assert.throws(()=>validateHelp({articles:[{...a,answer:'x'}]}),/довжину/);
});
