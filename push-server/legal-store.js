/* Beta legal change notice metadata, not a substitute for published legal documents. */
import fs from 'node:fs';
import path from 'node:path';
const clean=(v,max)=>String(v??'').trim().slice(0,max);
const version=v=>/^[0-9A-Za-z][0-9A-Za-z._-]{0,40}$/.test(String(v||''))?String(v):'1';
export function createLegalStore({directory}){
 const file=path.join(directory,'beta-legal.json');
 let state={termsVersion:'1',privacyVersion:'1',summary:'Ознайомтеся з актуальними умовами користування та політикою конфіденційності.',publishedAt:'',requireAcknowledgement:false};
 try{state={...state,...JSON.parse(fs.readFileSync(file,'utf8'))}}catch(e){if(e.code!=='ENOENT')throw e}
 const publicState=()=>({...state,termsUrl:'./terms.html',privacyUrl:'./privacy.html'});
 const update=data=>{
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Некоректні дані');
  state={
   termsVersion:version(data.termsVersion),privacyVersion:version(data.privacyVersion),
   summary:clean(data.summary,1400),requireAcknowledgement:data.requireAcknowledgement===true,
   publishedAt:new Date().toISOString()
  };
  fs.mkdirSync(directory,{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});fs.renameSync(tmp,file);
  return publicState()
 };
 return {publicState,update}
}