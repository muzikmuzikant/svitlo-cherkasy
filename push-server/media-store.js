/* Authenticated upload to persistent Railway volume. Never serve HTML or scripts. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const EXT={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'};
export function validateUpload(input){
 if(!input||!Object.hasOwn(EXT,input.mime)||typeof input.data!=='string'||input.data.length>4200000||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.data))throw Error('Дозволені PNG, JPG або WebP до 3 МБ');
 const bytes=Buffer.from(input.data,'base64');if(bytes.length<20||bytes.length>3000000)throw Error('Максимум 3 МБ');
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!(png&&input.mime==='image/png'||jpeg&&input.mime==='image/jpeg'||webp&&input.mime==='image/webp'))throw Error('Файл пошкоджений або має невірний тип');
 return {bytes,mime:input.mime,ext:EXT[input.mime]};
}
export function createMediaStore(directory){
 const folder=path.join(directory,'media');
 function save(input){const {bytes,mime,ext}=validateUpload(input);fs.mkdirSync(folder,{recursive:true});const id=crypto.randomBytes(15).toString('hex')+ext;fs.writeFileSync(path.join(folder,id),bytes,{flag:'wx',mode:0o600});return {id,mime,size:bytes.length}}
 function read(id){if(!/^[a-f0-9]{30}\.(png|jpg|webp)$/.test(id||''))return null;try{const data=fs.readFileSync(path.join(folder,id));return {data,mime:id.endsWith('.png')?'image/png':id.endsWith('.jpg')?'image/jpeg':'image/webp'}}catch{return null}}
 function list(){
  try{
   return fs.readdirSync(folder).filter(name=>/^[a-f0-9]{30}\.(?:png|jpg|webp)$/.test(name))
    .map(name=>{const stat=fs.statSync(path.join(folder,name));
      return {id:name,size:stat.size,uploadedAt:stat.birthtime.toISOString(),mime:name.endsWith('.png')?'image/png':name.endsWith('.jpg')?'image/jpeg':'image/webp'};})
    .sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt)).slice(0,400);
  }catch(e){if(e.code==='ENOENT')return [];throw e}
 }
 return {save,read,list};
}
