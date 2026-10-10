/** Exact HTTPS origin allow-list; never reflect an unapproved Origin header. */
export function createOriginPolicy(primary, extra='') {
 const values=[String(primary||''),...String(extra||'').split(/[\s,;]+/)].filter(Boolean);
 const accepted=new Set();
 for(const value of values){
   const parsed=new URL(value);
   if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||(parsed.pathname!=='/'&&parsed.pathname!=='')){
     throw new Error('APP_ORIGIN / APP_ORIGINS must contain only HTTPS origins without paths');
   }
   accepted.add(parsed.origin);
 }
 if(!accepted.size)throw new Error('APP_ORIGIN must be configured');
 if(accepted.size>8)throw new Error('Too many allowed origins');
 return {isAllowed(origin){return typeof origin==='string'&&accepted.has(origin)},list:[...accepted]};
}
export const originPolicy=process.env.APP_ORIGIN ? createOriginPolicy(process.env.APP_ORIGIN,process.env.APP_ORIGINS||'') : {isAllowed:()=>false,list:[]};
