/* Private ticket media: binary files on the Railway volume, never public /api/media.
   Content is retrieved only after ticket token or authenticated operator session. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TYPES={
 'image/jpeg':{ext:'.jpg',max:4*1024*1024},
 'image/png':{ext:'.png',max:4*1024*1024},
 'image/webp':{ext:'.webp',max:4*1024*1024},
 'image/heic':{ext:'.heic',max:4*1024*1024},
 'image/heif':{ext:'.heif',max:4*1024*1024},
 'video/mp4':{ext:'.mp4',max:8*1024*1024},
 'video/quicktime':{ext:'.mov',max:8*1024*1024},
 'video/webm':{ext:'.webm',max:8*1024*1024}
};
export const MAX_MEDIA_BYTES=9*1024*1024;
export const MAX_MEDIA_FILES=3;
const validId=id=>typeof id==='string'&&/^[a-f0-9]{36}$/.test(id);
const fail=(message,statusCode=400)=>{const error=new Error(message);error.statusCode=statusCode;throw error};
const magic=(type,b)=>{
 if(type==='image/jpeg')return b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
 if(type==='image/png')return b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
 if(type==='image/webp')return b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 if(type==='image/heic'||type==='image/heif')
  return b.toString('ascii',4,8)==='ftyp'&&/^(heic|heix|hevc|mif1|msf1)$/.test(b.toString('ascii',8,12));
 if(type==='video/webm')return b.subarray(0,4).equals(Buffer.from('1a45dfa3','hex'));
 if(type==='video/mp4'||type==='video/quicktime'){
  const brand=b.toString('ascii',4,12);
  return b.toString('ascii',4,8)==='ftyp'&&
   (type==='video/quicktime'?brand.includes('qt  '):!brand.includes('qt  '));
 }
 return false;
};
export function parseTicketMedia(raw){
 if(raw===undefined||raw===null)return [];
 if(!Array.isArray(raw)||raw.length>MAX_MEDIA_FILES)fail('До трьох фото або відео на повідомлення');
 const files=raw.map(entry=>{
  if(!entry||typeof entry!=='object'||typeof entry.data!=='string')fail('Некоректне вкладення');
  const type=String(entry.mime||''),limits=TYPES[type];
  if(!limits)fail('Дозволені JPG, PNG, WebP, HEIC, HEIF, MP4, MOV або WebM');
  if(entry.data.length>Math.ceil(limits.max*4/3)+8||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.data))fail('Неприпустимі дані вкладення');
  const bytes=Buffer.from(entry.data,'base64');
  if(!bytes.length||bytes.length>limits.max||!magic(type,bytes))fail('Файл завеликий або його формат не підтверджено');
  const name=String(entry.name||'файл').replace(/[\\/\u0000-\u001f\u007f<>]/g,'').trim().slice(0,90)||'файл';
  return {bytes,mime:type,name,size:bytes.length};
 });
 if(files.reduce((sum,f)=>sum+f.size,0)>MAX_MEDIA_BYTES)fail('Вкладення мають важити до 9 МБ разом',413);
 return files;
}
export function createTicketMedia(folder){
 const directory=path.join(folder,'ticket-media');
 const location=id=>path.join(directory,id);
 function write(parsed){
  if(!parsed.length)return [];
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const saved=[];
  try{
   for(const entry of parsed){
    const id=crypto.randomBytes(18).toString('hex');
    fs.writeFileSync(location(id),entry.bytes,{flag:'wx',mode:0o600});
    saved.push({id,mime:entry.mime,size:entry.size,name:entry.name});
   }
  }catch(error){erase(saved);throw error}
  return saved;
 }
 function erase(list){
  for(const entry of list||[])if(validId(entry.id)){
   try{fs.unlinkSync(location(entry.id))}catch(error){if(error.code!=='ENOENT')console.warn('Ticket file deletion:',error.message)}
  }
 }
 function read(meta){
  if(!meta||!validId(meta.id)||!Object.hasOwn(TYPES,meta.mime))fail('Вкладення не знайдено',404);
  let bytes;try{bytes=fs.readFileSync(location(meta.id))}catch{fail('Вкладення не знайдено',404)}
  if(bytes.length!==meta.size||!magic(meta.mime,bytes))fail('Вкладення пошкоджено',500);
  return {mime:meta.mime,name:meta.name,size:meta.size,data:bytes.toString('base64')};
 }
 function prune(keepIds){
  try{
   for(const id of fs.readdirSync(directory)){
    if(!validId(id)||keepIds.has(id))continue;
    try{fs.unlinkSync(location(id))}catch{}
   }
  }catch(error){if(error.code!=='ENOENT')console.warn('Ticket file cleanup:',error.message)}
 }
 return {write,read,erase,prune};
}
