import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAdminUserStore} from '../push-server/admin-users.js';
test('managed admins: password hashing, roles, revocation and persistence',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-users-'));
 try{
  const u=createAdminUserStore({directory:dir});
  assert.equal(u.list().length,0);
  assert.throws(()=>u.create({username:'staff',password:'weak',role:'editor'}),/12/);
  assert.throws(()=>u.create({username:'owner',password:'secret-secret-123',role:'editor'}),/Логін/);
  u.create({username:'staff',password:'strong-password-234',role:'editor',permissions:['view','feedback','ads']});
  const raw=fs.readFileSync(path.join(dir,'beta-admin-users.json'),'utf8');
  assert.ok(!raw.includes('strong-password-234'),'never store plaintext');
  assert.equal(u.login('staff','strong-password-234')?.username,'staff');
  assert.equal(u.login('staff','invalid-password'),null);
  assert.equal(u.login('missing','other password'),null);
  assert.deepEqual(u.list()[0].permissions,['view','feedback','ads']);
  const revision=u.get('staff').revision;
  u.patch('staff',{active:false});
  assert.ok(u.get('staff').revision>revision);
  assert.equal(u.login('staff','strong-password-234'),null,'paused account is denied');
  u.patch('staff',{active:true,password:'replacement-password-567',permissions:['view']});
  assert.equal(u.login('staff','strong-password-234'),null,'old password revoked');
  assert.equal(u.login('staff','replacement-password-567')?.role,'editor');
  const reopened=createAdminUserStore({directory:dir});
  assert.equal(reopened.login('staff','replacement-password-567')?.active,true);
  reopened.remove('staff');
  assert.equal(reopened.login('staff','replacement-password-567'),null);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
