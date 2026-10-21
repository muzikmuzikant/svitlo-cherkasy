import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createFeedbackStore} from '../push-server/feedback-store.js';
import {parseTicketMedia,MAX_MEDIA_BYTES} from '../push-server/ticket-media.js';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const jpg=Buffer.from('ffd8ffe000104a464946000101', 'hex');
const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex');
const webm=Buffer.from('1a45dfa3934282887765626d','hex');
const mp4=Buffer.from('000000186674797069736f6d00000000','hex');
const mov=Buffer.from('00000018667479707174202000000000','hex');
const heic=Buffer.from('00000018667479706865696300000000','hex');
const attachment=(mime,buffer=jpg)=>({mime,name:'світло '+(mime.includes('video')?'video':'photo'),data:buffer.toString('base64')});
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'svitlo-ticket-media-'));
 return {dir,store:createFeedbackStore({filePath:path.join(dir,'feedback.json')})};
}
const base=()=>({topic:'bug',message:'Графік показує неправильний інтервал відключень.'});
test('JPG PNG HEIC WebM MP4 MOV signatures and 9 MB cap validated server-side',()=>{
 for(const [type,bytes] of [['image/jpeg',jpg],['image/png',png],['image/heic',heic],['video/webm',webm],
  ['video/mp4',mp4],['video/quicktime',mov]]){
  const got=parseTicketMedia([attachment(type,bytes)]);
  assert.equal(got[0].mime,type);
  assert.equal(got[0].size,bytes.length);
 }
 assert.equal(MAX_MEDIA_BYTES,9*1024*1024);
 assert.equal(parseTicketMedia([attachment('image/heic',heic)])[0].mime,'image/heic');
 for(const mime of ['text/html','image/svg+xml','application/javascript','application/pdf']){
  assert.throws(()=>parseTicketMedia([attachment(mime)]));
 }
 assert.throws(()=>parseTicketMedia([attachment('image/jpeg',Buffer.from('not a jpeg'))]));
 assert.throws(()=>parseTicketMedia(Array.from({length:4},()=>attachment('image/jpeg'))));
});
test('private files stay off publicly served /api/media; token needed to retrieve',()=>{
 const {dir,store}=setup();
 const submitted=store.submit({...base(),attachments:[attachment('image/jpeg')]},'1.2.3.4');
 const details=store.getStatus(submitted.id,submitted.token);
 assert.equal(details.attachments.length,1);
 const meta=details.attachments[0];
 assert.ok(!('data' in meta));
 assert.equal(meta.mime,'image/jpeg');
 assert.equal(store.getAttachment(submitted.id,meta.id,submitted.token).data,jpg.toString('base64'));
 assert.throws(()=>store.getAttachment(submitted.id,meta.id,'wrong'),/код доступу/);
 assert.throws(()=>store.getAttachment(submitted.id,'f'.repeat(36),submitted.token),/не знайдено/);
 assert.deepEqual(store.getStatus(submitted.id).attachments,undefined);
 assert.equal(fs.existsSync(path.join(dir,'media',meta.id)),false);
 assert.equal(fs.existsSync(path.join(dir,'ticket-media',meta.id)),true);
 store.remove(submitted.id);
 assert.equal(fs.existsSync(path.join(dir,'ticket-media',meta.id)),false);
 assert.throws(()=>store.getAttachment(submitted.id,meta.id,submitted.token),/не знайдено/);
});
test('reply containing only video is allowed and operator can open attachment',()=>{
 const {store}=setup(),ticket=store.submit(base(),'4.3.2.1');
 store.reply(ticket.id,ticket.token,{message:'',attachments:[attachment('video/mp4',mp4)]},'4.3.2.1');
 const status=store.getStatus(ticket.id,ticket.token),message=status.messages[0];
 assert.equal(message.text,'');
 assert.equal(message.attachments[0].mime,'video/mp4');
 assert.equal(store.getAttachment(ticket.id,message.attachments[0].id,null,true).mime,'video/mp4');
 const record=store.list().items.find(x=>x.id===ticket.id);
 assert.equal(record.messages[0].attachments.length,1);
 assert.equal(JSON.stringify(record).includes(mp4.toString('base64')),false);
});
test('invalid files cannot be saved as support text or executable HTML',()=>{
 const {store}=setup(),ticket=store.submit(base(),'8.8.8.8');
 assert.throws(()=>store.reply(ticket.id,ticket.token,{message:'',attachments:[attachment('image/png',jpg)]},'8.8.8.8'));
 assert.throws(()=>store.submit({...base(),attachments:[attachment('text/html')]},'7.7.7.7'));
});
test('routing requires ticket token or admin session and not an unprotected media url',()=>{
 const server=read('push-server/server.js'),admin=read('push-server/admin.js');
 assert.match(server,/\/api\/ticket\/attachment/);
 assert.match(server,/capabilities:\{attachments:true/);
 assert.match(server,/feedback\.getAttachment\(id,data\.attachmentId,data\.token\)/);
 assert.match(admin,/feedback\.getAttachment\(tail\[0\],tail\[1\],null,true\)/);
 assert.match(admin,/api\/admin\/feedback\/attachment/);
 assert.doesNotMatch(server,/\/api\/media\/.*getAttachment/);
});
test('customer form and support operator show videos using same secure viewer',()=>{
 const user=read('feedback.js'),op=read('admin.js'),viewer=read('ticket-media-ui.js');
 assert.match(user,/initialFiles\.collect\(\)/);
 assert.match(user,/replyFiles\.collect\(\)/);
 assert.match(user,/enableMediaForms\(data\.capabilities\?\.attachments===true\)/);
 assert.match(user,/result\.attached!==payload\.attachments\.length/);
 assert.match(user,/\/api\/ticket\/attachment/);
 assert.match(op,/feedback\/attachment\//);
 assert.match(viewer,/document\.createElement\(isVideo\(payload\.mime\)\?'video':'img'\)/);
 assert.match(viewer,/URL\.revokeObjectURL/);
 assert.match(viewer,/const mimeFor=file=>/);
 assert.match(read('feedback.html'),/id="newTicketFiles"/);
 assert.match(read('feedback.html'),/id="replyTicketFiles"/);
 assert.match(read('ticket-media.css'),/\.ticket-attach\[hidden\]\{display:none!important\}/);
});
