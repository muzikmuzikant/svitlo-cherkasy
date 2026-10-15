/* Optional owner two-factor authentication. ADMIN_TOTP_SECRET must be a private base32 secret on Railway. */
import crypto from 'node:crypto';
export function verifyTotp(secret,code,at=Date.now()){
 if(typeof secret!=='string'||!/^[A-Z2-7]+=*$/i.test(secret)||secret.replace(/=/g,'').length<16||
  !/^[0-9]{6}$/.test(String(code||''))||!Number.isFinite(at))return false;
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
 let bits=0,buffer=0;const data=[];
 for(const symbol of secret.toUpperCase().replace(/=+$/,'')){
  const part=alphabet.indexOf(symbol);if(part<0)return false;
  buffer=(buffer<<5)|part;bits+=5;
  if(bits>=8){bits-=8;data.push((buffer>>bits)&255)}
  buffer&=(1<<bits)-1;
 }
 const key=Buffer.from(data);if(key.length<10)return false;
 const window=Math.floor(at/30000);
 for(let delta=-1;delta<=1;delta++){
  const counter=window+delta;if(counter<0)continue;
  const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(counter));
  const digest=crypto.createHmac('sha1',key).update(msg).digest();
  const pos=digest.at(-1)&15;
  const value=(digest.readUInt32BE(pos)&0x7fffffff)%1000000;
  const expected=String(value).padStart(6,'0');
  if(crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(String(code))))return counter;
 }
 return false;
}
