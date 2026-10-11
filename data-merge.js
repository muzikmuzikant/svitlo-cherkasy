/* Source precedence: current official address list > bundled historical fallback.
 * Manual verified admin corrections are intentionally applied separately.
 * Never UNION queue hints from old and current official editions: doing so can
 * suggest queues that the operator has since removed from a street. */
(function(root, factory){
 const api=factory();
 if(typeof module==='object' && module.exports) module.exports=api;
 else root.SvitloDataMerge=api;
})(typeof globalThis!=='undefined'?globalThis:this, function(){
 'use strict';
 const obj=v=>v && typeof v==='object' && !Array.isArray(v)?v:{};
 const valid=v=>Array.isArray(v)?[...new Set(v.filter(q=>/^[1-6]\.[12]$/.test(q)))].sort((a,b)=>Number(a)-Number(b)):[];
 const hasContent=idx=>!!(Object.keys(obj(idx.keys)).length||Object.keys(obj(idx.streets)).length||Object.keys(obj(idx.streetQueues)).length);
 function mergeIndexes(current, historical, {manual=false}={}){
   const live=obj(current), backup=obj(historical);
   function combine(a,b){
     a=obj(a);b=obj(b);
     // An official source for a locality supersedes its archived hints. Missing
     // streets in a NEW list must not be silently re-added from the OLD list.
     if(!manual && hasContent(a))return {
       ...a,keys:{...obj(a.keys)},streets:{...obj(a.streets)},streetQueues:{...obj(a.streetQueues)}
     };
     if(!manual)return {...b,keys:{...obj(b.keys)},streets:{...obj(b.streets)},streetQueues:{...obj(b.streetQueues)}};
     // Admin corrections are explicit, not a fuzzy merge of conflicting queues.
     const queues={...obj(a.streetQueues)};
     for(const [street,values] of Object.entries(obj(b.streetQueues)))queues[street]=valid(values);
     return {...a,...b,keys:{...obj(a.keys),...obj(b.keys)},streets:{...obj(a.streets),...obj(b.streets)},streetQueues:queues};
   }
   const result=combine(live,backup);
   const places={...obj(backup.localities),...obj(live.localities)};
   for(const key of Object.keys(places))places[key]=combine(obj(live.localities)[key],obj(backup.localities)[key]);
   result.localities=places;
   result.updatedAt=live.updatedAt||backup.updatedAt||null;
   result.source=live.source||backup.source||null;
   return result;
 }
 return {mergeIndexes,hasContent};
});
