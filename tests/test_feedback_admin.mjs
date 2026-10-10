import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';


function mockRequest(method,url,body={},headers={}){
 const r=Readable.from([JSON.stringify(body)]);
 r.method=method;r.url=url;r.headers={origin:'https://svitlo.test',...headers};r.socket={remoteAddress:'203.0.113.1'};
 return r;
}
function mockResponse(){return {status:0,payload:null,writeHead(status){this.status=status},end(data){this.payload=JSON.parse(data)}}}
const inbox={list:()=>({count:1,items:[{id:'SC-AABBCCDD11',message:'test'}]}),change:(id,status)=>({ok:true,id,status}),remove:id=>({ok:true,id})};
const push={stats:()=>({subscribers:0})};
process.env.APP_ORIGIN='https://svitlo.test';
process.env.ADMIN_PASSWORD='strong-test-password';
const {adminRouter}=await import('../push-server/admin.js');

test('feedback admin endpoints require active bearer session',async()=>{
 const res=mockResponse();await adminRouter(mockRequest('GET','/api/admin/feedback'),res,push,inbox);
 assert.equal(res.status,401);
});
test('login allows feedback listing; logout revokes bearer session',async()=>{
 const login=mockResponse();await adminRouter(mockRequest('POST','/api/admin/login',{password:'strong-test-password'}),login,push,inbox);
 assert.equal(login.status,200);
 const token=login.payload.token;
 const hdr={authorization:'Bearer '+token};
 const res=mockResponse();await adminRouter(mockRequest('GET','/api/admin/feedback',{},hdr),res,push,inbox);
 assert.equal(res.status,200);assert.equal(res.payload.items.length,1);
 const edit=mockResponse();await adminRouter(mockRequest('PATCH','/api/admin/feedback/SC-AABBCCDD11',{status:'resolved'},hdr),edit,push,inbox);
 assert.equal(edit.status,200);assert.equal(edit.payload.status,'resolved');
 const remove=mockResponse();await adminRouter(mockRequest('DELETE','/api/admin/feedback/SC-AABBCCDD11',{},hdr),remove,push,inbox);
 assert.equal(remove.status,200);
 const logout=mockResponse();await adminRouter(mockRequest('POST','/api/admin/logout',{},hdr),logout,push,inbox);
 assert.equal(logout.status,200);
 const refused=mockResponse();await adminRouter(mockRequest('GET','/api/admin/feedback',{},hdr),refused,push,inbox);
 assert.equal(refused.status,401);
});
